import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KycStatus, TransactionStatus, WalletStatus } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { ApiException } from "../../common/errors/api.exception";
import { CashDropService } from "../../cash-drop/cash-drop.service";
import { PrismaService } from "../../prisma/prisma.service";
import { WalletService } from "../../wallet/wallet.service";
import { asRecord, eventKey, firstString, NormalizedWebhookEvent } from "../common/webhook-event-normalizer";
import { WebhookLogService } from "../common/webhook-log.service";

@Injectable()
export class BytidWebhookService {
  private readonly provider = "bytid";

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly cashDropService: CashDropService,
    private readonly logs: WebhookLogService,
    private readonly config: ConfigService
  ) {}

  async receive(payload: unknown, headers: Record<string, string | string[] | undefined>, rawBody?: Buffer) {
    const event = this.normalize(payload, headers);
    const signatureValid = this.verifySignature(rawBody, firstHeader(headers["bytid-signature"]));
    const log = await this.logs.createReceived(this.provider, event, payload, signatureValid);
    if (!signatureValid) {
      await this.logs.markFailed(log.id, "Invalid BytID webhook signature");
      throw new ApiException("Invalid BytID webhook signature", "INVALID_BYTID_WEBHOOK_SIGNATURE", HttpStatus.UNAUTHORIZED);
    }
    return this.process(log.id, event, payload);
  }

  async retry(webhookLogId: string) {
    const log = await this.prisma.webhookLog.findUnique({ where: { id: webhookLogId } });
    if (!log) throw new ApiException("Webhook log not found", "WEBHOOK_LOG_NOT_FOUND", HttpStatus.NOT_FOUND);
    return this.process(log.id, this.normalize(log.rawPayload, {}), log.rawPayload);
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
      const message = error instanceof Error ? error.message : "BytID webhook processing failed";
      await this.logs.markFailed(logId, message);
      await this.prisma.auditLog.create({
        data: {
          actorType: "system",
          action: "BYTID_WEBHOOK_PROCESSING_FAILED",
          entityType: "WebhookLog",
          entityId: logId,
          metadata: { provider: this.provider, eventType: event.eventType, message }
        }
      });
      throw error;
    }
  }

  private async handleKyc(event: NormalizedWebhookEvent, payload: unknown) {
    if (event.eventType === "webhook.test") return { ignored: true, message: "BytID test webhook" };
    if (event.eventType !== "verification.completed" && event.eventType !== "kyc.completed") {
      return { ignored: true, message: "BytID event type is not handled" };
    }

    const body = asRecord(payload);
    const data = asRecord(body.data);
    const providerReference = firstString(data.id, body.verification_id, body.providerReference, event.providerReference);
    const kycReference = firstString(data.reference, body.reference, body.kycReference, event.internalReference);
    if (!providerReference && !kycReference) return { ignored: true, message: "KYC reference missing" };

    const record = await this.prisma.kycRecord.findFirst({
      where: {
        OR: [
          providerReference ? { providerReference } : undefined,
          kycReference ? { kycReference } : undefined
        ].filter(Boolean) as Array<{ providerReference?: string; kycReference?: string }>
      }
    });
    if (!record) return { ignored: true, message: "KYC record could not be matched" };

    const status = this.toKycStatus(firstString(data.status, data.outcome, body.status, body.outcome));
    const verified = status === KycStatus.verified;
    const rejected = status === KycStatus.rejected;
    const updated = await this.prisma.kycRecord.update({
      where: { id: record.id },
      data: {
        provider: this.provider,
        providerReference: providerReference ?? record.providerReference,
        status,
        bvnVerified: verified ? true : undefined,
        selfieVerified: verified ? true : rejected ? false : undefined,
        faceMatch: verified ? true : rejected ? false : undefined,
        verifiedAt: verified ? new Date() : undefined,
        metadata: this.logs.toJson({
          ...asRecord(record.metadata),
          bytidWebhook: this.logs.sanitize(payload)
        })
      }
    });

    if (verified) {
      await this.walletService.activateWallet(record.userId);
      await this.autoProvisionAfterKycVerified(record.userId);
      await this.logs.notifyUser({
        userId: record.userId,
        title: "KYC verified",
        message: "Your identity verification is complete.",
        category: "security",
        type: "kyc_update"
      });
    } else if (rejected) {
      await this.prisma.user.update({ where: { id: record.userId }, data: { walletStatus: WalletStatus.inactive } });
      await this.logs.notifyUser({
        userId: record.userId,
        title: "KYC update",
        message: "Your selfie verification was not successful.",
        category: "security",
        type: "kyc_update",
        priority: "high"
      });
    }
    return { entityId: updated.id };
  }

  private normalize(payload: unknown, headers: Record<string, string | string[] | undefined>): NormalizedWebhookEvent {
    const body = asRecord(payload);
    const data = asRecord(body.data);
    return {
      eventType: firstString(body.type, headers["bytid-event"]) || "bytid.unknown",
      providerReference: firstString(headers["bytid-event-id"], body.id, data.id),
      internalReference: firstString(data.reference, body.reference),
      status: this.toTransactionStatus(firstString(data.status, data.outcome, body.status, body.outcome))
    };
  }

  private verifySignature(rawBody: Buffer | undefined, signatureHeader?: string) {
    if (!this.webhookVerificationEnabled()) return true;
    const secret = this.config.get<string>("BYTID_WEBHOOK_SECRET", "").trim();
    if (!secret || !rawBody || !signatureHeader) return false;
    const parts = Object.fromEntries(signatureHeader.split(",").map((part) => {
      const [key, ...value] = part.split("=");
      return [key, value.join("=")];
    }));
    const timestamp = Number(parts.t);
    const signature = parts.v1;
    if (!Number.isFinite(timestamp) || !signature) return false;
    const tolerance = Number(this.config.get<string>("WEBHOOK_SIGNATURE_TOLERANCE_SECONDS", "300"));
    if (Math.abs(Date.now() / 1000 - timestamp) > tolerance) return false;
    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
    return safeEqual(expected, signature);
  }

  private webhookVerificationEnabled() {
    return ["1", "true", "yes", "on"].includes(this.config.get<string>("BYTID_WEBHOOK_VERIFY_ENABLED", "true").toLowerCase());
  }

  private toKycStatus(status?: string) {
    const normalized = status?.toLowerCase() ?? "";
    if (["verified", "success", "successful", "completed"].includes(normalized)) return KycStatus.verified;
    if (["rejected", "failed", "fail", "not_found", "face_mismatch", "face_unavailable", "liveness_failed", "error"].includes(normalized)) return KycStatus.rejected;
    return KycStatus.pending;
  }

  private toTransactionStatus(status?: string): NormalizedWebhookEvent["status"] {
    const kycStatus = this.toKycStatus(status);
    if (kycStatus === KycStatus.verified) return TransactionStatus.successful;
    if (kycStatus === KycStatus.rejected) return TransactionStatus.failed;
    return TransactionStatus.processing;
  }

  private async autoProvisionAfterKycVerified(userId: string) {
    try {
      await this.walletService.createDva(userId, "auto");
      if (this.cashDropService.isEnabled()) {
        await this.cashDropService.register(userId);
      }
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorType: "system",
          action: "BYTID_KYC_WEBHOOK_AUTO_PROVISION_COMPLETED",
          entityType: "User",
          entityId: userId,
          metadata: { cashDropEnabled: this.cashDropService.isEnabled() }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "BytID KYC webhook auto provisioning failed";
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorType: "system",
          action: "BYTID_KYC_WEBHOOK_AUTO_PROVISION_FAILED",
          entityType: "User",
          entityId: userId,
          metadata: { message }
        }
      });
    }
  }
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
