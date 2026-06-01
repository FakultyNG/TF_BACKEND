import { TransactionStatus } from "@prisma/client";

export type TfWebhookStatus = TransactionStatus | "cancelled";

export interface NormalizedWebhookEvent {
  eventType: string;
  providerReference?: string;
  internalReference?: string;
  status?: TfWebhookStatus;
  amount?: number;
  currency?: string;
  accountNumber?: string;
  userId?: string;
}

type WebhookPayload = Record<string, unknown>;

export function normalizeWebhookEvent(payload: unknown): NormalizedWebhookEvent {
  const body = asRecord(payload);
  const data = asRecord(body.data);
  const eventType = firstString(body.eventType, body.event, body.type, data.eventType, data.event, data.type) ?? "unknown";
  const rawStatus = firstString(body.status, data.status, body.eventStatus, data.eventStatus);

  return {
    eventType,
    providerReference: firstString(
      body.providerReference,
      body.provider_reference,
      body.reference,
      data.providerReference,
      data.provider_reference,
      data.reference
    ),
    internalReference: firstString(
      body.internalReference,
      body.internal_reference,
      body.transactionReference,
      body.transaction_reference,
      data.internalReference,
      data.transactionReference,
      data.transaction_reference
    ),
    status: rawStatus ? normalizeProviderStatus(rawStatus) : undefined,
    amount: firstNumber(body.amount, data.amount, body.amountNgn, data.amountNgn),
    currency: firstString(body.currency, data.currency),
    accountNumber: firstString(body.accountNumber, body.account_number, data.accountNumber, data.account_number),
    userId: firstString(body.userId, body.user_id, data.userId, data.user_id)
  };
}

export function normalizeProviderStatus(status: string): TfWebhookStatus {
  const value = status.toLowerCase().trim();
  if (["success", "successful", "completed", "complete", "delivered"].includes(value)) return TransactionStatus.successful;
  if (["failed", "failure", "rejected", "declined"].includes(value)) return TransactionStatus.failed;
  if (["pending"].includes(value)) return TransactionStatus.pending;
  if (["processing", "in_progress", "submitted"].includes(value)) return TransactionStatus.processing;
  if (["reversed", "refunded", "refund"].includes(value)) return TransactionStatus.reversed;
  if (["cancelled", "canceled"].includes(value)) return "cancelled";
  return TransactionStatus.processing;
}

export function eventKey(provider: string, event: NormalizedWebhookEvent, fallback: string) {
  return `${provider}:${event.eventType}:${event.providerReference ?? event.internalReference ?? fallback}`;
}

export function payloadHasAnyEvent(eventType: string, candidates: string[]) {
  const value = eventType.toLowerCase();
  return candidates.some((candidate) => value.includes(candidate));
}

export function asRecord(value: unknown): WebhookPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as WebhookPayload) : {};
}

export function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

export function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Math.round(Number(value));
  }
  return undefined;
}
