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
    const path = this.dvaPath(input.preferredBank);
    const payload = {
      public_key: this.publicKey(),
      email: this.customerEmail(input),
      account_name: accountName.trim().toUpperCase(),
      phone: toLocalPhone(input.phoneNumber),
      webhook_url: this.virtualAccountWebhookUrl(),
      mode: this.mode(),
      developer_code: this.config.get<string>("STROWALLET_DEVELOPER_CODE") || undefined
    };
    const raw = await this.post(path, payload);
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
      bankName: firstString(body.bankName, body.bank_name, body.bank, body.bank_name_slug) || (path.includes("sterling") ? "Sterling Bank" : "Nombank MFB"),
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
    const body = unwrap(raw);
    const rows = firstArray(
      raw,
      top.data,
      body.banks,
      body.bankList,
      body.bank_list,
      body.banklist,
      body.list,
      body.result,
      body.results
    );
    const banks = rows.map((item) => {
      const row = objectOrEmpty(item);
      return {
        code: firstString(row.code, row.bankCode, row.bank_code, row.BankCode, row.bankcode, row.id) || "",
        name: firstString(row.name, row.bankName, row.bank_name, row.BankName, row.bank) || ""
      };
    }).filter((bank) => bank.code && bank.name);
    if (!banks.length) {
      throw new ApiException(
        "Strowallet returned an empty bank list",
        "STROWALLET_BANK_LIST_EMPTY",
        HttpStatus.BAD_GATEWAY
      );
    }
    return banks;
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
    const providerReference = firstString(
      body.name_enquiry_reference,
      body.name_enquiry_ref,
      body.nameEnquiryReference,
      body.nameEnquiryRef,
      body.sessionId,
      body.sessionID,
      body.session_id,
      body.requestReference,
      body.request_reference,
      body.reference
    );
    if (!providerReference) {
      throw new ApiException(
        "Strowallet verified the account but did not return the transfer reference; please select the bank and verify again",
        "STROWALLET_NAME_ENQUIRY_REFERENCE_MISSING",
        HttpStatus.BAD_GATEWAY
      );
    }
    return {
      accountName,
      accountNumber,
      bankCode,
      bankName: firstString(body.bankName, body.bank_name, body.bank) || bankCode,
      providerReference
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
    if (!input.nameEnquiryReference?.trim()) {
      throw new ApiException(
        "Strowallet did not return the name-enquiry reference required to complete this transfer",
        "STROWALLET_NAME_ENQUIRY_REFERENCE_MISSING",
        HttpStatus.BAD_GATEWAY
      );
    }
    const raw = await this.post(this.transferPath(), undefined, {
      public_key: this.publicKey(),
      amount: String(input.amount),
      bank_code: input.bankCode,
      account_number: input.accountNumber,
      narration: input.narration || "Transfa transfer",
      name_enquiry_reference: input.nameEnquiryReference.trim(),
      SenderName: input.senderName || this.config.get<string>("STROWALLET_SENDER_NAME", "Transfa"),
      mode: this.mode()
    });
    const body = unwrap(raw);
    const responseMessage = responseProviderMessage(raw);
    if (transferResponseRejected(raw)) {
      throw new ApiException(
        publicTransferError(responseMessage),
        "STROWALLET_TRANSFER_REJECTED",
        HttpStatus.BAD_GATEWAY,
        providerResponseDiagnostics(raw)
      );
    }
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
      const isDvaRequest = url === this.config.get<string>("STROWALLET_DVA_PATH", "/api/virtual-bank/new-customer/") ||
        url === this.config.get<string>("STROWALLET_STERLING_DVA_PATH", "/api/virtual-bank/sterling");
      const isTransferRequest = samePath(url, this.transferPath());
      throw new ApiException(
        url === this.config.get<string>("STROWALLET_BVN_DETAILS_PATH", "/api/kyc_getbvn/")
          ? "Strowallet BVN details request failed"
          : isDvaRequest
          ? publicDvaError(message)
          : isTransferRequest
          ? publicTransferError(message)
          : "Strowallet provider request failed",
        isDvaRequest
          ? "STROWALLET_DVA_REQUEST_FAILED"
          : isTransferRequest
          ? "STROWALLET_TRANSFER_REQUEST_FAILED"
          : "STROWALLET_PROVIDER_ERROR",
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
    return this.config.get<string>("STROWALLET_MODE", "live").trim().toLowerCase();
  }

  private transferPath() {
    const path = this.config.get<string>("STROWALLET_BANK_TRANSFER_PATH", "/api/banks/request/").trim();
    return path.endsWith("/") ? path : `${path}/`;
  }

  private dvaPath(preferredBank?: string) {
    const bank = preferredBank?.trim().toLowerCase();
    if (bank === "sterling" || bank === "sterling bank") {
      return this.config.get<string>("STROWALLET_STERLING_DVA_PATH", "/api/virtual-bank/sterling");
    }
    return this.config.get<string>("STROWALLET_DVA_PATH", "/api/virtual-bank/new-customer/");
  }

  private customerEmail(input: CreateDvaInput) {
    const supplied = input.email?.trim().toLowerCase();
    if (supplied && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplied)) return supplied;
    const configuredDomain = this.config.get<string>("STROWALLET_CUSTOMER_EMAIL_DOMAIN", "customers.transfaintel.xyz")
      .trim()
      .toLowerCase();
    const domain = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(configuredDomain)
      ? configuredDomain
      : "customers.transfaintel.xyz";
    const customerId = input.userId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 48) || sha256(input.phoneNumber).slice(0, 24);
    return `transfa.${customerId}@${domain}`;
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

function transferResponseRejected(value: unknown) {
  const root = objectOrEmpty(value);
  const body = unwrap(value);
  if (root.success === false || body.success === false) return true;
  const status = firstString(body.status, body.transferStatus, body.responseCode, body.response_code);
  if (failureStatus(status)) return true;
  if (status && /^4\d\d$|^5\d\d$/.test(status)) return true;
  return failureStatus(responseProviderMessage(value));
}

function stripUndefined(value?: Record<string, string | number | undefined>) {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, child]) => child !== undefined));
}

function providerMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : "Strowallet request failed";
  const axiosError = error as AxiosError<unknown>;
  return axiosError.response?.data === undefined
    ? axiosError.message
    : responseProviderMessage(axiosError.response.data);
}

function providerDiagnostics(error: unknown) {
  if (!axios.isAxiosError(error)) return undefined;
  const body = objectOrEmpty(error.response?.data);
  const providerReason = safeProviderReason(providerMessage(error));
  return stripUndefined({
    providerStatus: error.response?.status,
    providerCode: firstString(body.code, body.responseCode, body.response_code),
    requestId: firstString(body.requestId, body.request_id, body.reference),
    providerReason
  });
}

function providerResponseDiagnostics(value: unknown) {
  const body = unwrap(value);
  return stripUndefined({
    providerCode: firstString(body.code, body.responseCode, body.response_code),
    requestId: firstString(body.requestId, body.request_id, body.reference, body.merchantTxRef, body.merchant_tx_ref),
    providerReason: safeProviderReason(responseProviderMessage(value))
  });
}

function responseProviderMessage(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const root = objectOrEmpty(value);
  const body = unwrap(value);
  const error = objectOrEmpty(root.error);
  const errors = Array.isArray(root.errors) ? root.errors : [];
  return firstString(
    body.message,
    body.detail,
    body.description,
    body.responseMessage,
    body.response_message,
    error.message,
    error.detail,
    errors[0],
    objectOrEmpty(errors[0]).message
  ) || "Strowallet rejected the transfer request";
}

function publicTransferError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("balance") || normalized.includes("insufficient fund")) {
    return "Strowallet payout balance is insufficient; fund the live Strowallet account and try again";
  }
  if (normalized.includes("name") && (normalized.includes("enquiry") || normalized.includes("reference"))) {
    return "The beneficiary verification expired or was rejected; verify the account again and retry";
  }
  if (normalized.includes("unauthor") || normalized.includes("forbidden") || normalized.includes("permission") || normalized.includes("not allowed")) {
    return `Strowallet has not authorized live bank transfers for this account: ${safeProviderReason(message)}`;
  }
  if (normalized.includes("public key") || normalized.includes("api key") || normalized.includes("credential")) {
    return `Strowallet rejected STROWALLET_PUBLIC_KEY: ${safeProviderReason(message)}`;
  }
  if (normalized.includes("mode") || normalized.includes("sandbox") || normalized.includes("live")) {
    return "Strowallet rejected the configured live transfer mode";
  }
  if (normalized.includes("account") && (normalized.includes("invalid") || normalized.includes("not found"))) {
    return "Strowallet rejected the beneficiary account; verify the account and bank again";
  }
  if (normalized.includes("amount") || normalized.includes("minimum") || normalized.includes("limit")) {
    return "Strowallet rejected the transfer amount or provider limit";
  }
  if (normalized.includes("timeout") || normalized.includes("network") || normalized.includes("temporar") || normalized.includes("unavailable")) {
    return "Strowallet transfer service is temporarily unavailable; please try again";
  }
  return "Strowallet rejected the live transfer; check payout access and provider account status";
}

function safeProviderReason(message: string) {
  const compact = message.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
  if (!compact) return "No reason was returned by the provider";
  return compact
    .replace(/(public[_ -]?key|api[_ -]?key|secret|token)(\s*[:=]\s*)([^\s,;]+)/gi, "$1$2[redacted]")
    .replace(/\b(?:pk|sk)_(?:live|test)_[A-Za-z0-9_-]+\b/g, "[redacted]");
}

function samePath(left: string, right: string) {
  return left.replace(/\/+$/g, "") === right.replace(/\/+$/g, "");
}

function publicDvaError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("public key") || normalized.includes("api key") || normalized.includes("unauthor")) {
    return "Strowallet rejected the live account credentials";
  }
  if (normalized.includes("developer") && normalized.includes("code")) {
    return "Strowallet requires a valid developer code for this account type";
  }
  if (normalized.includes("email")) return "Strowallet rejected the customer email for this account";
  if (normalized.includes("phone")) return "Strowallet rejected the customer phone number for this account";
  if (normalized.includes("webhook")) return "Strowallet rejected the virtual-account webhook URL";
  if (normalized.includes("mode") || normalized.includes("sandbox")) return "Strowallet rejected the configured live account mode";
  return "Strowallet could not create the dedicated virtual account";
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
