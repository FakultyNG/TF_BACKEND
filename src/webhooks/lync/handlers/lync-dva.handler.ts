import { Injectable } from "@nestjs/common";
import { DvaStatus, Prisma, TransactionStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { asRecord, NormalizedWebhookEvent } from "../../common/webhook-event-normalizer";

@Injectable()
export class LyncDvaHandler {
  constructor(private readonly prisma: PrismaService) {}

  async handle(event: NormalizedWebhookEvent, payload: unknown) {
    const body = asRecord(payload);
    const data = asRecord(body.data);
    const status = this.toDvaStatus(event.status);
    const accountNumber = event.accountNumber;
    const providerReference = event.providerReference;
    if (!providerReference && !accountNumber) return { ignored: true, message: "DVA reference missing" };

    const updated = await this.prisma.dedicatedVirtualAccount.updateMany({
      where: {
        OR: [
          providerReference ? { providerReference } : undefined,
          accountNumber ? { accountNumber } : undefined
        ].filter(Boolean) as Prisma.DedicatedVirtualAccountWhereInput[]
      },
      data: {
        status,
        providerReference,
        bankName: typeof data.bankName === "string" ? data.bankName : undefined,
        accountName: typeof data.accountName === "string" ? data.accountName : undefined
      }
    });
    if (!updated.count) return { ignored: true, message: "DVA could not be matched" };
    return { entityType: "DedicatedVirtualAccount", entityId: providerReference ?? accountNumber };
  }

  private toDvaStatus(status?: NormalizedWebhookEvent["status"]) {
    if (status === TransactionStatus.failed || status === "cancelled") return DvaStatus.failed;
    if (status === TransactionStatus.reversed) return DvaStatus.inactive;
    return DvaStatus.active;
  }
}
