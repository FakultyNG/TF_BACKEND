import { HttpStatus, Injectable } from "@nestjs/common";
import { KycStatus, Prisma, TransactionStatus, WalletStatus } from "@prisma/client";
import { IncomingHttpHeaders } from "http";
import { ApiException } from "../../common/errors/api.exception";
import { PrismaService } from "../../prisma/prisma.service";
import { WalletService } from "../../wallet/wallet.service";
import { CashDropService } from "../../cash-drop/cash-drop.service";
import { asRecord, eventKey, firstString, normalizeWebhookEvent, NormalizedWebhookEvent } from "../common/webhook-event-normalizer";
import { WebhookLogService } from "../common/webhook-log.service";
import { WebhookSignatureService } from "../common/webhook-signature.service";

@Injectable()
export class DojahWebhookService {
  private readonly provider = "dojah";

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly cashDropService: CashDropService,
    private readonly logs: WebhookLogService,
    private readonly signatures: WebhookSignatureService
  ) {}

  async receive(payload: unknown, headers: IncomingHttpHeaders) {
    const event = normalizeWebhookEvent(payload);
    const signatureValid = this.signatures.verify(payload, headers, this.signatures.secret("DOJAH_WEBHOOK_SECRET"));
    const log = await this.logs.createReceived(this.provider, event, payload, signatureValid);
    if (!signatureValid) {
      await this.logs.markFailed(log.id, "Invalid webhook signature");
      throw new ApiException("Invalid webhook signature", "INVALID_WEBHOOK_SIGNATURE", HttpStatus.UNAUTHORIZED);
    }
    return this.process(log.id, event, payload);
  }

  async retry(webhookLogId: string) {
    const log = await this.prisma.webhookLog.findUnique({ where: { id: webhookLogId } });
    if (!log) throw new ApiException("Webhook log not found", "WEBHOOK_LOG_NOT_FOUND", HttpStatus.NOT_FOUND);
    return this.process(log.id, normalizeWebhookEvent(log.rawPayload), log.rawPayload);
  }

  private async process(logId: string, event: NormalizedWebhookEvent, payload: unknown) {
    const key = eventKey(this.provider, event, logId);
    if (await this.logs.isProcessed(key)) {
      await this.logs.markDuplicate(logId);
      return { duplicate: true };
    }
    try {
      const outcome = await this.handleKyc(event, payload);
      if (outcome.ignored) {
        await this.logs.markIgnored(logId, outcome.message);
        return { duplicate: false };
      }
      const recorded = await this.logs.recordProcessedKey(key, this.provider, event.eventType);
      if (!recorded) {
        await this.logs.markDuplicate(logId);
        return { duplicate: true };
      }
      await this.logs.markProcessed(logId, this.provider, event, "KycRecord", outcome.entityId);
      return { duplicate: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      await this.logs.markFailed(logId, message);
      await this.prisma.auditLog.create({
        data: { actorType: "system", action: "WEBHOOK_PROCESSING_FAILED", entityType: "WebhookLog", entityId: logId, metadata: { provider: this.provider, eventType: event.eventType, message } }
      });
      throw error;
    }
  }

  private async handleKyc(event: NormalizedWebhookEvent, payload: unknown) {
    const body = asRecord(payload);
    const data = asRecord(body.data);
    const kycReference = firstString(body.kycReference, data.kycReference, event.providerReference, event.internalReference);
    if (!kycReference) return { ignored: true, message: "KYC reference missing" };

    const record = await this.prisma.kycRecord.findFirst({
      where: { OR: [{ kycReference }, { kycReference: event.providerReference ?? "" }] }
    });
    if (!record) return { ignored: true, message: "KYC record could not be matched" };

    const status = this.toKycStatus(event.status);
    const profileImageUrl = firstString(body.profileImageUrl, data.profileImageUrl, body.selfieImageUrl, data.selfieImageUrl);
    const updated = await this.prisma.kycRecord.update({
      where: { id: record.id },
      data: {
        status,
        bvnVerified: status === KycStatus.verified ? true : undefined,
        selfieVerified: status === KycStatus.verified ? true : undefined,
        faceMatch: status === KycStatus.verified ? true : undefined,
        metadata: this.logs.toJson(this.logs.sanitize(payload))
      }
    });

    if (status === KycStatus.verified) {
      await this.walletService.activateWallet(record.userId);
      if (profileImageUrl) {
        await this.prisma.profile.updateMany({ where: { userId: record.userId }, data: { profileImageUrl } });
      }
      await this.autoProvisionAfterKycVerified(record.userId);
      await this.logs.notifyUser({ userId: record.userId, title: "KYC verified", message: "Your identity verification is complete.", category: "security", type: "kyc_update" });
    } else if (status === KycStatus.rejected) {
      await this.prisma.user.update({ where: { id: record.userId }, data: { walletStatus: WalletStatus.inactive } });
      await this.logs.notifyUser({ userId: record.userId, title: "KYC update", message: "Your identity verification was rejected.", category: "security", type: "kyc_update", priority: "high" });
    }
    return { entityId: updated.id };
  }

  private toKycStatus(status?: NormalizedWebhookEvent["status"]) {
    if (status === TransactionStatus.successful) return KycStatus.verified;
    if (status === TransactionStatus.failed || status === "cancelled") return KycStatus.rejected;
    if (status === TransactionStatus.pending || status === TransactionStatus.processing) return KycStatus.pending;
    return KycStatus.pending;
  }

  private async autoProvisionAfterKycVerified(userId: string) {
    try {
      await this.walletService.createDva(userId, "auto");
      await this.cashDropService.register(userId);
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorType: "system",
          action: "KYC_WEBHOOK_AUTO_PROVISION_COMPLETED",
          entityType: "User",
          entityId: userId,
          metadata: {}
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "KYC webhook auto provisioning failed";
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorType: "system",
          action: "KYC_WEBHOOK_AUTO_PROVISION_FAILED",
          entityType: "User",
          entityId: userId,
          metadata: { message }
        }
      });
    }
  }
}
