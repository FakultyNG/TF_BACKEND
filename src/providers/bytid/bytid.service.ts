import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosError, AxiosInstance } from "axios";
import { ApiException } from "../../common/errors/api.exception";
import { sha256 } from "../../common/utils/hash.util";
import { BvnVerificationResult, KycProvider, KycVerificationContext, SelfieValidationResult } from "../interfaces/kyc-provider.interface";

type JsonObject = Record<string, unknown>;

@Injectable()
export class BytidKycProvider implements KycProvider {
  private readonly logger = new Logger(BytidKycProvider.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: normalizeBytidBaseUrl(this.config.get<string>("BYTID_BASE_URL", "https://api.bytid.com/v1")),
      timeout: Number(this.config.get<string>("BYTID_TIMEOUT_MS", "15000")),
      headers: {
        accept: "application/json",
        "Content-Type": "application/json"
      }
    });
  }

  async verifyBvn(bvn: string, _userId?: string, context?: KycVerificationContext): Promise<BvnVerificationResult> {
    const raw = await this.post(
      this.config.get<string>("BYTID_BVN_PATH", "/identity/bvn"),
      this.identityPayload(bvn, context)
    );
    return this.mapBvnResult(raw, bvn);
  }

  async verifyBvnWithSelfie(bvn: string, selfieImageBase64: string, _userId?: string, context?: KycVerificationContext): Promise<SelfieValidationResult> {
    const raw = await this.post(this.config.get<string>("BYTID_BVN_FACE_MATCH_PATH", "/identity/bvn/face-match"), {
      ...this.identityPayload(bvn, context),
      selfie_image: selfieImageBase64
    });
    const base = this.mapBvnResult(raw, bvn);
    const data = objectOrEmpty(objectOrEmpty(raw).data);
    const faceMatch = objectOrEmpty(data.face_match);
    const score = firstNumber(faceMatch.score) ?? 0;
    const status = firstString(faceMatch.status)?.toLowerCase();
    const matched = base.bvnVerified && status === "matched" && score >= this.faceMatchThreshold();
    return {
      ...base,
      provider: "bytid",
      faceMatch: matched,
      selfieVerified: matched,
      confidenceScore: score,
      profileImageUrl: base.imageUrl,
      rawProviderResponse: sanitize(raw)
    };
  }

  async getVerificationStatus(providerReference: string): Promise<BvnVerificationResult> {
    const raw = await this.get(`/verifications/${providerReference}`);
    return this.mapBvnResult(raw, "");
  }

  private identityPayload(bvn: string, context?: KycVerificationContext) {
    return stripUndefined({
      id_number: bvn,
      first_name: context?.firstName,
      last_name: context?.lastName,
      dob: normalizeBytidDob(context?.dateOfBirth),
      reference: context?.reference
    });
  }

  private mapBvnResult(raw: unknown, bvn: string): BvnVerificationResult {
    const envelope = objectOrEmpty(raw);
    if (envelope.success === false) {
      const providerError = objectOrEmpty(envelope.error);
      throw new ApiException(
        firstString(providerError.message) || "BytID verification failed",
        "BYTID_VERIFICATION_FAILED",
        providerHttpStatus(firstString(providerError.code)),
        stripUndefined({
          providerCode: firstString(providerError.code),
          requestId: firstString(envelope.request_id),
          providerDetails: sanitize(providerError.details)
        })
      );
    }
    const verification = objectOrEmpty(envelope.data);
    const person = objectOrEmpty(verification.data);
    const status = firstString(verification.status)?.toLowerCase();
    if (status === "not_found") {
      throw new ApiException("BVN was not found", "BYTID_BVN_NOT_FOUND", HttpStatus.UNPROCESSABLE_ENTITY, {
        requestId: firstString(envelope.request_id)
      });
    }
    if (status === "failed") {
      throw new ApiException("BytID could not reach the BVN registry", "BYTID_REGISTRY_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE, {
        requestId: firstString(envelope.request_id)
      });
    }
    const verified = envelope.success === true && status === "verified";
    const nin = firstString(person.nin, person.nin_number);
    const rawDob = firstString(person.date_of_birth, person.dateOfBirth, person.dob);
    const result = {
      provider: "bytid",
      providerReference: firstString(verification.id, verification.reference, envelope.request_id),
      bvnMasked: firstString(verification.id_number) || (bvn ? maskIdentifier(bvn) : undefined),
      bvnVerified: verified,
      firstName: firstString(person.first_name, person.firstName),
      middleName: firstString(person.middle_name, person.middleName),
      lastName: firstString(person.last_name, person.lastName),
      phoneNumber: firstString(person.phone_number, person.phoneNumber),
      dateOfBirth: normalizeBytidDob(rawDob) || rawDob,
      gender: firstString(person.gender),
      country: firstString(person.nationality, person.country),
      ninMasked: nin ? maskIdentifier(nin) : undefined,
      ninHash: nin ? sha256(nin) : undefined,
      imageUrl: firstString(person.photo, person.image_url, person.imageUrl),
      rawProviderResponse: sanitize(raw)
    };
    if (verified && (!result.firstName || !result.lastName || !result.dateOfBirth)) {
      throw new ApiException("BytID BVN response is missing required identity fields", "BYTID_BVN_RESPONSE_INCOMPLETE", HttpStatus.BAD_GATEWAY, {
        requestId: firstString(envelope.request_id)
      });
    }
    return result;
  }

  private async get(path: string) {
    return this.request("get", path);
  }

  private async post(path: string, data: unknown) {
    return this.request("post", path, data);
  }

  private async request(method: "get" | "post", url: string, data?: unknown) {
    try {
      const response = await this.http.request({
        method,
        url,
        data,
        headers: { Authorization: `Bearer ${this.apiKey()}` }
      });
      return response.data;
    } catch (error) {
      if (error instanceof ApiException) throw error;
      const message = providerMessage(error);
      const diagnostics = providerDiagnostics(error);
      this.logger.warn({ provider: "bytid", method, url, message, ...diagnostics });
      throw new ApiException("BytID BVN verification request failed", "BYTID_PROVIDER_ERROR", HttpStatus.BAD_GATEWAY, diagnostics);
    }
  }

  private apiKey() {
    const key = this.config.get<string>("BYTID_API_KEY")?.trim();
    if (!key) throw new ApiException("BytID API key is not configured", "BYTID_CONFIG_MISSING", HttpStatus.INTERNAL_SERVER_ERROR);
    return key;
  }

  private faceMatchThreshold() {
    return Number(this.config.get<string>("BYTID_FACE_MATCH_THRESHOLD", "80"));
  }
}

function normalizeBytidBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/g, "");
  if (/^https?:\/\/(www\.)?bytid\.com$/i.test(trimmed)) return "https://api.bytid.com/v1";
  if (/^https?:\/\/api\.bytid\.com$/i.test(trimmed)) return `${trimmed}/v1`;
  return trimmed;
}

function providerHttpStatus(code?: string) {
  switch (code) {
    case "invalid_api_key":
      return HttpStatus.UNAUTHORIZED;
    case "insufficient_balance":
      return HttpStatus.PAYMENT_REQUIRED;
    case "live_not_enabled":
    case "ip_not_allowed":
    case "insufficient_scope":
    case "business_suspended":
      return HttpStatus.FORBIDDEN;
    case "rate_limited":
      return HttpStatus.TOO_MANY_REQUESTS;
    case "check_unavailable":
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.BAD_GATEWAY;
  }
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
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function stripUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined));
}

function normalizeBytidDob(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  const iso = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (local) return `${local[3]}-${local[2]}-${local[1]}`;
  const named = /^(\d{1,2})-([A-Za-z]{3,})-(\d{4})$/.exec(trimmed);
  if (named) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return `${named[3]}-${String(month).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  return trimmed;
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
  return ["authorization", "api_key", "token", "secret", "id_number", "selfie_image", "photo", "bvn", "nin"].some((part) => lower.includes(part));
}

function providerMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : "BytID request failed";
  const axiosError = error as AxiosError<{ error?: { message?: string }; message?: string }>;
  return axiosError.response?.data?.error?.message || axiosError.response?.data?.message || axiosError.message;
}

function providerDiagnostics(error: unknown) {
  if (!axios.isAxiosError(error)) return undefined;
  const body = objectOrEmpty(error.response?.data);
  const providerError = objectOrEmpty(body.error);
  return stripUndefined({
    providerStatus: error.response?.status,
    providerCode: firstString(providerError.code, body.code),
    requestId: firstString(body.request_id)
  });
}
