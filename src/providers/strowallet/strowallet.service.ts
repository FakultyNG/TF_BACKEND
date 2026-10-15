import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosError, AxiosInstance } from "axios";
import { ApiException } from "../../common/errors/api.exception";
import { sha256 } from "../../common/utils/hash.util";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateDvaInput, CreateDvaResult, DvaProviderService, VerifyFundingResult } from "../dva/dva-provider.interface";
import { BvnVerificationResult, KycProvider, KycVerificationContext, SelfieValidationResult } from "../interfaces/kyc-provider.interface";
import { Bank, BankAccountSuggestion, NgnTransferProviderService, NgnTransferResult, ResolvedAccount } from "../transfers/ngn-transfer-provider.interface";

type JsonObject = Record<string, unknown>;
type StrowalletBvnIdentity = {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  phoneNumber?: string;
};

@Injectable()
export class StrowalletService implements DvaProviderService, NgnTransferProviderService, KycProvider {
  private readonly logger = new Logger(StrowalletService.name);
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {
    this.http = axios.create({
      baseURL: this.config.get<string>("STROWALLET_BASE_URL", "https://strowallet.com"),
      timeout: Number(this.config.get<string>("STROWALLET_TIMEOUT_MS", "15000")),
      headers: { accept: "application/json", "Content-Type": "application/json" }
    });
  }

  async createDedicatedVirtualAccount(input: CreateDvaInput): Promise<CreateDvaResult> {
    const firstName = input.firstName || "TRANSFA";
    const lastName = input.lastName || "USER";
    const accountName = this.config.get<string>("STROWALLET_ACCOUNT_NAME_PREFIX", "Transfa")
      ? `${this.config.get<string>("STROWALLET_ACCOUNT_NAME_PREFIX", "Transfa")} ${firstName} ${lastName}`
      : `${firstName} ${lastName}`;
    const payload = {
      public_key: this.publicKey(),
      email: input.email || this.config.get<string>("STROWALLET_FALLBACK_EMAIL", "notifications@transfa.local"),
      account_name: accountName.trim().toUpperCase(),
      phone: input.phoneNumber,
      webhook_url: this.virtualAccountWebhookUrl(),
      mode: this.mode(),
      developer_code: this.config.get<string>("STROWALLET_DEVELOPER_CODE") || undefined
    };
    const raw = await this.post(this.config.get<string>("STROWALLET_STERLING_DVA_PATH", "/api/virtual-bank/sterling"), payload);
    const body = unwrap(raw);
    const accountNumber = firstString(
      body.accountNumber,
      body.account_number,
      body.nuban,
      body.accountNo,
      body.account_no,
      nestedString(raw, ["data", "account", "account_number"])
    );
    if (!accountNumber) {
      throw new ApiException("Strowallet virtual account response did not include an account number", "STROWALLET_DVA_RESPONSE_INVALID", HttpStatus.BAD_GATEWAY);
    }
    return {
      bankName: firstString(body.bankName, body.bank_name, body.bank, body.bank_name_slug) || "Sterling Bank",
      accountNumber,
      accountName: firstString(body.accountName, body.account_name, body.name) || payload.account_name,
      provider: "strowallet",
      providerReference: firstString(body.customerId, body.customer_id, body.reference, body.id, body.account_reference) || accountNumber,
      status: normalizeDvaStatus(firstString(body.status, body.account_status)) ?? "active",
      raw: sanitize(raw)
    };
  }

  async verifyFunding(reference: string): Promise<VerifyFundingResult> {
    const raw = await this.get(this.config.get<string>("STROWALLET_VERIFY_SESSION_PATH", "/api/verifysessionid/"), {
      amount: this.config.get<string>("STROWALLET_VERIFY_FUNDING_AMOUNT", "0"),
      sessionID: reference
    });
    const body = unwrap(raw);
    return {
      reference,
      amount: firstNumber(body.transactionAmount, body.amount, body.settledAmount) ?? 0,
      currency: "NGN",
      status: truthySuccess(raw) ? "successful" : "pending",
      provider: "strowallet",
      providerReference: firstString(body.sessionId, body.sessionID, body.reference) || reference,
      raw: sanitize(raw)
    };
  }

  async getBanks(): Promise<Bank[]> {
    const raw = await this.get(this.config.get<string>("STROWALLET_BANK_LIST_PATH", "/api/banks/lists/"));
    const top = objectOrEmpty(raw);
    const rows = firstArray(raw, top.data, unwrap(raw).banks, unwrap(raw).bankList, unwrap(raw).list);
    return rows.map((item) => {
      const row = objectOrEmpty(item);
      return {
        code: firstString(row.code, row.bankCode, row.bank_code, row.id) || "",
        name: firstString(row.name, row.bankName, row.bank_name) || ""
      };
    }).filter((bank) => bank.code && bank.name);
  }

  async suggestBanksByAccountNumber(accountNumber: string): Promise<BankAccountSuggestion[]> {
    const banks = await this.getBanks();
    const suggestions: BankAccountSuggestion[] = [];
    for (const bank of banks.slice(0, 12)) {
      try {
        const resolved = await this.resolveAccount(bank.code, accountNumber);
        suggestions.push({ ...resolved, confidence: suggestions.length === 0 ? 95 : 80 });
        if (suggestions.length >= 3) break;
      } catch {
        // Continue probing likely banks; Strowallet does not expose a dedicated suggestion endpoint.
      }
    }
    return suggestions;
  }

  async resolveAccount(bankCode: string, accountNumber: string): Promise<ResolvedAccount> {
    const raw = await this.get(this.config.get<string>("STROWALLET_ACCOUNT_NAME_PATH", "/api/banks/get-customer-name/"), {
      bank_code: bankCode,
      account_number: accountNumber
    });
    const body = unwrap(raw);
    const accountName = firstString(body.accountName, body.account_name, body.name, body.customer_name, body.accountNameEnquiry);
    if (!accountName) {
      throw new ApiException("Account could not be resolved", "ACCOUNT_RESOLVE_FAILED", HttpStatus.BAD_REQUEST);
    }
    return {
      accountName,
      accountNumber,
      bankCode,
      bankName: firstString(body.bankName, body.bank_name, body.bank) || bankCode,
      providerReference: firstString(body.name_enquiry_reference, body.nameEnquiryReference, body.sessionId, body.sessionID, body.reference)
    };
  }

  async submitTransfer(input: {
    amount: number;
    accountNumber: string;
    bankCode: string;
    narration?: string;
    reference: string;
    nameEnquiryReference?: string;
    senderName?: string;
  }): Promise<NgnTransferResult> {
    const raw = await this.post(this.config.get<string>("STROWALLET_BANK_TRANSFER_PATH", "/api/banks/request/"), undefined, {
      public_key: this.publicKey(),
      amount: String(input.amount),
      bank_code: input.bankCode,
      account_number: input.accountNumber,
      narration: input.narration || "Transfa transfer",
      name_enquiry_reference: input.nameEnquiryReference || input.reference,
      SenderName: input.senderName || this.config.get<string>("STROWALLET_SENDER_NAME", "Transfa"),
      mode: this.mode()
    });
    const body = unwrap(raw);
    return {
      status: normalizeTransferStatus(firstString(body.status, body.transferStatus)) ?? "processing",
      provider: "strowallet",
      providerReference: firstString(body.merchantTxRef, body.merchant_tx_ref, body.sessionId, body.sessionID, body.reference, body.txRef) || input.reference,
      raw: sanitize(raw)
    };
  }

  async verifyBvn(bvn: string, userId?: string, context?: KycVerificationContext): Promise<BvnVerificationResult> {
    void userId;
    void context;
    const raw = await this.get(
      this.config.get<string>("STROWALLET_BVN_DETAILS_PATH", "/api/kyc_getbvn/"),
      { number: bvn }
    );
    const body = unwrapBvnDetails(raw);
    const message = firstString(body.message, objectOrEmpty(raw).message);
    if (!truthySuccess(raw) || failureStatus(firstString(body.status, body.verification_status, message))) {
      throw new ApiException(
        message || "Strowallet could not verify this BVN",
        "STROWALLET_BVN_LOOKUP_FAILED",
        HttpStatus.BAD_GATEWAY
      );
    }
    const identity = this.requireIdentity({
      firstName: firstString(body.firstName, body.first_name, body.firstname),
      lastName: firstString(body.lastName, body.last_name, body.lastname, body.surname),
      dateOfBirth: firstString(body.dateOfBirth, body.date_of_birth, body.dob, body.birthDate, body.birth_date),
      phoneNumber: firstString(body.phoneNumber, body.phone_number, body.phoneNumber1, body.phone_number1, body.phone, body.mobile)
    });
    const nin = firstString(body.nin, body.ninNumber, body.nin_number);
    return {
      provider: "strowallet",
      providerReference: firstString(body.reference, body.verification_reference, body.sessionId, body.id),
      bvnMasked: maskIdentifier(bvn),
      bvnVerified: true,
      firstName: identity.firstName,
      middleName: firstString(body.middleName, body.middle_name),
      lastName: identity.lastName,
      email: firstString(body.email),
      phoneNumber: identity.phoneNumber,
      dateOfBirth: identity.dateOfBirth,
      gender: firstString(body.gender),
      country: firstString(body.country, body.nationality),
      ninMasked: nin ? maskIdentifier(nin) : undefined,
      ninHash: nin ? sha256(nin) : undefined,
      imageUrl: firstString(body.imageUrl, body.image_url),
      rawProviderResponse: sanitize(raw)
    };
  }

  async verifyBvnWithSelfie(bvn: string, _selfieImageBase64: string, userId?: string, context?: KycVerificationContext): Promise<SelfieValidationResult> {
    void bvn;
    void userId;
    void context;
    throw new ApiException(
      "Strowallet does not provide selfie face matching; configure BytID or Prembly as SELFIE_KYC_PROVIDER",
      "STROWALLET_SELFIE_NOT_SUPPORTED",
      HttpStatus.NOT_IMPLEMENTED
    );
  }

  async getVerificationStatus(providerReference: string): Promise<BvnVerificationResult> {
    return {
      provider: "strowallet",
      providerReference,
      bvnVerified: false,
      rawProviderResponse: { providerReference, message: "Strowallet status lookup is not available in the provided docs" }
    };
  }

  async verifyVirtualAccountWebhook(payload: unknown) {
    if (!this.webhookVerificationEnabled()) return true;
    const body = objectOrEmpty(payload);
    const sessionID = firstString(body.sessionId, body.sessionID);
    const amount = firstNumber(body.transactionAmount, body.amount, body.settledAmount);
    if (!sessionID || !amount) return false;
    const raw = await this.get(this.config.get<string>("STROWALLET_VERIFY_SESSION_PATH", "/api/verifysessionid/"), {
      amount: String(amount),
      sessionID
    });
    return truthySuccess(raw);
  }

  async verifyTransferWebhook(payload: unknown) {
    if (!this.webhookVerificationEnabled()) return true;
    const body = objectOrEmpty(payload);
    const merchantTxRef = firstString(body.merchantTxRef, body.merchant_tx_ref);
    if (!merchantTxRef) return false;
    const raw = await this.get(this.config.get<string>("STROWALLET_VERIFY_TRANSFER_WEBHOOK_PATH", "/api/VerifyWebHookTranfer"), {
      merchantTxRef
    });
    return truthySuccess(raw);
  }

  private async get(path: string, query?: Record<string, string | number | undefined>) {
    return this.request("get", path, undefined, { public_key: this.publicKey(), ...query });
  }

  private async post(path: string, body?: unknown, query?: Record<string, string | number | undefined>) {
    return this.request("post", path, body, query);
  }

  private async request(method: "get" | "post", url: string, data?: unknown, params?: Record<string, string | number | undefined>) {
    try {
      const response = await this.http.request({ method, url, data, params: stripUndefined(params) });
      return response.data;
    } catch (error) {
      const message = providerMessage(error);
      const diagnostics = providerDiagnostics(error);
      this.logger.warn({ provider: "strowallet", method, url, message, ...diagnostics });
      throw new ApiException(
        url === this.config.get<string>("STROWALLET_BVN_DETAILS_PATH", "/api/kyc_getbvn/")
          ? "Strowallet BVN details request failed"
          : "Strowallet provider request failed",
        "STROWALLET_PROVIDER_ERROR",
        HttpStatus.BAD_GATEWAY,
        diagnostics
      );
    }
  }

  private publicKey() {
    const key = this.config.get<string>("STROWALLET_PUBLIC_KEY")?.trim();
    if (!key) throw new ApiException("Strowallet public key is not configured", "STROWALLET_CONFIG_MISSING", HttpStatus.INTERNAL_SERVER_ERROR);
    return key;
  }

  private mode() {
    return this.config.get<string>("STROWALLET_MODE", "sandbox").trim();
  }

  private virtualAccountWebhookUrl() {
    const explicit = this.config.get<string>("STROWALLET_VIRTUAL_ACCOUNT_WEBHOOK_URL");
    if (explicit) return explicit;
    const baseUrl = this.config.get<string>("PUBLIC_API_BASE_URL");
    if (!baseUrl) throw new ApiException("PUBLIC_API_BASE_URL or STROWALLET_VIRTUAL_ACCOUNT_WEBHOOK_URL is required for Strowallet DVA creation", "STROWALLET_WEBHOOK_URL_MISSING", HttpStatus.INTERNAL_SERVER_ERROR);
    const apiPrefix = this.config.get<string>("API_PREFIX", "api/v1").replace(/^\/|\/$/g, "");
    return `${baseUrl.replace(/\/$/g, "")}/${apiPrefix}/webhooks/strowallet/virtual-account`;
  }

  private webhookVerificationEnabled() {
    return ["1", "true", "yes", "on"].includes(this.config.get<string>("STROWALLET_WEBHOOK_VERIFY_ENABLED", "true").toLowerCase());
  }

  private requireIdentity(identity: { firstName?: string; lastName?: string; dateOfBirth?: string; phoneNumber?: string }) {
    if (!identity.firstName || !identity.lastName || !identity.dateOfBirth) {
      throw new ApiException("Strowallet BVN details response is missing required identity fields", "STROWALLET_BVN_DETAILS_INCOMPLETE", HttpStatus.BAD_GATEWAY);
    }
    return identity as { firstName: string; lastName: string; dateOfBirth: string; phoneNumber?: string };
  }
}

function unwrap(value: unknown): JsonObject {
  const body = objectOrEmpty(value);
  const data = objectOrEmpty(body.data);
  const response = objectOrEmpty(body.response);
  const account = objectOrEmpty(data.account);
  return { ...body, ...data, ...response, ...account };
}

function unwrapBvnDetails(value: unknown): JsonObject {
  const envelope = unwrap(value);
  const raw = objectOrEmpty(value);
  return {
    ...envelope,
    ...objectOrEmpty(raw.bvn_data),
    ...objectOrEmpty(raw.bvnData),
    ...objectOrEmpty(raw.details),
    ...objectOrEmpty(objectOrEmpty(raw.data).bvn_data),
    ...objectOrEmpty(objectOrEmpty(raw.data).details)
  };
}

function objectOrEmpty(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Math.round(Number(value));
  }
  return undefined;
}

function firstArray(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function nestedString(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) current = objectOrEmpty(current)[key];
  return firstString(current);
}

function normalizeDvaStatus(value?: string): "active" | "inactive" | "failed" | undefined {
  if (!value) return undefined;
  const status = value.toLowerCase();
  if (["active", "success", "successful"].includes(status)) return "active";
  if (["inactive", "pending"].includes(status)) return "inactive";
  if (["failed", "failure", "error"].includes(status)) return "failed";
  return undefined;
}

function normalizeTransferStatus(value?: string): "processing" | "successful" | "failed" | undefined {
  if (!value) return undefined;
  const status = value.toLowerCase();
  if (["success", "successful", "completed"].includes(status)) return "successful";
  if (["failed", "failure", "reversed", "refunded"].includes(status)) return "failed";
  if (["pending", "processing", "submitted"].includes(status)) return "processing";
  return undefined;
}

function truthySuccess(value: unknown) {
  const body = unwrap(value);
  const status = firstString(body.status, body.responseCode, body.response_code, body.message);
  if (!status) return true;
  const normalized = status.toLowerCase();
  return ["true", "success", "successful", "verified", "00", "ok"].some((item) => normalized.includes(item));
}

function failureStatus(value?: string) {
  if (!value) return false;
  return ["fail", "invalid", "error", "declined"].some((item) => value.toLowerCase().includes(item));
}

function stripUndefined(value?: Record<string, string | number | undefined>) {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, child]) => child !== undefined));
}

function providerMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : "Strowallet request failed";
  const axiosError = error as AxiosError<{ message?: string; detail?: string; error?: string }>;
  return axiosError.response?.data?.message || axiosError.response?.data?.detail || axiosError.response?.data?.error || axiosError.message;
}

function providerDiagnostics(error: unknown) {
  if (!axios.isAxiosError(error)) return undefined;
  const body = objectOrEmpty(error.response?.data);
  return stripUndefined({
    providerStatus: error.response?.status,
    providerCode: firstString(body.code, body.responseCode, body.response_code),
    requestId: firstString(body.requestId, body.request_id, body.reference)
  });
}

function maskIdentifier(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (!value || typeof value !== "object") return value;
  const output: JsonObject = {};
  for (const [key, child] of Object.entries(value as JsonObject)) {
    output[key] = isSensitiveKey(key) ? "***MASKED***" : sanitize(child);
  }
  return output;
}

function isSensitiveKey(key: string) {
  const lower = key.toLowerCase();
  return ["public_key", "bvn", "nin", "otp", "token", "secret", "authorization", "password", "passcode"].some((part) => lower.includes(part));
}

function formatStrowalletDate(value?: Date | null) {
  if (!value) return undefined;
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${value.getUTCFullYear()}`;
}

function normalizeStrowalletDateString(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  const iso = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(trimmed);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const local = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (local) return `${local[1]}-${local[2]}-${local[3]}`;
  return trimmed;
}

function toLocalPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) return `0${digits.slice(3)}`;
  return digits;
}

function splitFullName(value?: string) {
  if (!value) return {};
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}
