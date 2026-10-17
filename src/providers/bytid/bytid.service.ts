import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosError, AxiosInstance } from "axios";
import { ApiException } from "../../common/errors/api.exception";
import { sha256 } from "../../common/utils/hash.util";
import {
  BvnVerificationResult,
  KycProvider,
  KycVerificationContext,
  LivenessSessionResult,
  NinVerificationResult,
  SelfieValidationResult
} from "../interfaces/kyc-provider.interface";

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

  async verifyNin(nin: string, _userId?: string, context?: KycVerificationContext): Promise<NinVerificationResult> {
    const raw = await this.post(
      this.config.get<string>("BYTID_NIN_PATH", "/identity/nin"),
      this.identityPayload(nin, context)
    );
    const result = this.mapBvnResult(raw, nin, "NIN");
    return {
      provider: result.provider,
      providerReference: result.providerReference,
      ninMasked: result.bvnMasked,
      ninVerified: result.bvnVerified,
      firstName: result.firstName,
      middleName: result.middleName,
      lastName: result.lastName,
      email: result.email,
      phoneNumber: result.phoneNumber,
      dateOfBirth: result.dateOfBirth,
      gender: result.gender,
      country: result.country,
      imageUrl: result.imageUrl,
      rawProviderResponse: result.rawProviderResponse
    };
  }

  async verifyBvnWithSelfie(bvn: string, selfieImageBase64: string, _userId?: string, context?: KycVerificationContext): Promise<SelfieValidationResult> {
    const raw = await this.post(this.config.get<string>("BYTID_BVN_FACE_MATCH_PATH", "/identity/bvn/face-match"), {
      ...this.identityPayload(bvn, context),
      selfie_image: selfieImageBase64
    });
    return this.mapFaceMatchResult(raw, bvn);
  }

  async createLivenessSession(redirectUrl: string, context?: KycVerificationContext): Promise<LivenessSessionResult> {
    const raw = await this.post(this.config.get<string>("BYTID_LIVENESS_PATH", "/liveness/sessions"), {
      reference: context?.reference,
      redirect_url: redirectUrl
    });
    return this.mapLivenessResult(raw, true);
  }

  async getLivenessSession(sessionId: string): Promise<LivenessSessionResult> {
    const raw = await this.get(`${this.config.get<string>("BYTID_LIVENESS_PATH", "/liveness/sessions")}/${encodeURIComponent(sessionId)}`);
    return this.mapLivenessResult(raw, false);
  }

  async verifyBvnWithLiveness(bvn: string, livenessSessionId: string, _userId?: string, context?: KycVerificationContext): Promise<SelfieValidationResult> {
    const raw = await this.post(this.config.get<string>("BYTID_BVN_FACE_MATCH_PATH", "/identity/bvn/face-match"), {
      ...this.identityPayload(bvn, context),
      liveness_session_id: livenessSessionId
    });
    return this.mapFaceMatchResult(raw, bvn);
  }

  private mapFaceMatchResult(raw: unknown, bvn: string): SelfieValidationResult {
    const base = this.mapBvnResult(raw, bvn);
    const data = objectOrEmpty(objectOrEmpty(raw).data);
    const faceMatch = objectOrEmpty(data.face_match);
    const score = firstNumber(faceMatch.score) ?? 0;
    const status = firstString(faceMatch.status)?.toLowerCase();
    const livenessStatus = firstString(faceMatch.liveness)?.toLowerCase();
    const threshold = this.faceMatchThreshold();
    const matched = base.bvnVerified && status === "matched" && score >= threshold;
    const faceMatchReason = matched
      ? undefined
      : publicFaceMatchReason(status, firstString(faceMatch.reason), score, threshold);
    return {
      ...base,
      provider: "bytid",
      faceMatch: matched,
      selfieVerified: matched,
      confidenceScore: score,
      faceMatchStatus: status,
      faceMatchReason,
      livenessStatus,
      profileImageUrl: base.imageUrl,
      rawProviderResponse: sanitize(raw)
    };
  }

  private mapLivenessResult(raw: unknown, requireUrl: boolean): LivenessSessionResult {
    const envelope = objectOrEmpty(raw);
    if (envelope.success === false) this.throwEnvelopeError(envelope, "BytID liveness request failed");
    const data = objectOrEmpty(envelope.data);
    const id = firstString(data.id);
    const status = firstString(data.status)?.toLowerCase();
    const url = firstString(data.url);
    if (!id || !status || (requireUrl && !url)) {
      throw new ApiException("BytID liveness response is incomplete", "BYTID_LIVENESS_RESPONSE_INCOMPLETE", HttpStatus.BAD_GATEWAY, {
        requestId: firstString(envelope.request_id)
      });
    }
    return {
      provider: "bytid",
      id,
      reference: firstString(data.reference),
      status,
      url,
      score: firstNumber(data.score),
      reasons: stringArray(data.reasons),
      usableForFaceMatch: data.usable_for_face_match === true,
      expiresAt: firstString(data.expires_at),
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

  private mapBvnResult(raw: unknown, bvn: string, identifierType: "BVN" | "NIN" = "BVN"): BvnVerificationResult {
    const envelope = objectOrEmpty(raw);
    if (envelope.success === false) {
      this.throwEnvelopeError(envelope, "BytID verification failed");
    }
    const verification = objectOrEmpty(envelope.data);
    const person = objectOrEmpty(verification.data);
    const status = firstString(verification.status)?.toLowerCase();
    if (status === "not_found") {
      throw new ApiException(`${identifierType} was not found`, `BYTID_${identifierType}_NOT_FOUND`, HttpStatus.UNPROCESSABLE_ENTITY, {
        requestId: firstString(envelope.request_id)
      });
    }
    if (status === "failed") {
      throw new ApiException(`BytID could not reach the ${identifierType} registry`, "BYTID_REGISTRY_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE, {
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
      email: firstString(person.email, person.email_address, person.emailAddress),
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
      throw new ApiException(`BytID ${identifierType} response is missing required identity fields`, `BYTID_${identifierType}_RESPONSE_INCOMPLETE`, HttpStatus.BAD_GATEWAY, {
        requestId: firstString(envelope.request_id)
      });
    }
    return result;
  }

  private throwEnvelopeError(envelope: JsonObject, fallbackMessage: string): never {
    const providerError = objectOrEmpty(envelope.error);
    throw new ApiException(
      firstString(providerError.message) || fallbackMessage,
      "BYTID_VERIFICATION_FAILED",
      providerHttpStatus(firstString(providerError.code)),
      stripUndefined({
        providerCode: firstString(providerError.code),
        requestId: firstString(envelope.request_id),
        providerDetails: sanitize(providerError.details)
      })
    );
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
      const providerFailure = providerApiException(error, url);
      if (providerFailure) throw providerFailure;
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

function publicFaceMatchReason(status: string | undefined, providerReason: string | undefined, score: number, threshold: number) {
  if (status === "unavailable") {
    return providerReason || "The face match could not run because the BVN photo or selfie face was unavailable.";
  }
  if (status === "not_matched") {
    return "The selfie did not match the photograph held against this BVN. Use bright, even lighting and keep your full face inside the frame.";
  }
  if (status === "matched" && score < threshold) {
    return `The face match confidence (${score}) was below the required threshold (${threshold}). Try again in better lighting without glasses or a face covering.`;
  }
  return providerReason || "BytID could not produce a successful face match from this selfie.";
}

function normalizeBytidBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/g, "");
  if (/^https?:\/\/(www\.)?bytid\.com$/i.test(trimmed)) return "https://api.bytid.com/v1";
  if (/^https?:\/\/api\.bytid\.com$/i.test(trimmed)) return `${trimmed}/v1`;
  return trimmed;
}

function providerHttpStatus(code?: string) {
  switch (code) {
    case "validation_error":
      return HttpStatus.BAD_REQUEST;
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
    case "duplicate_reference":
      return HttpStatus.CONFLICT;
    case "liveness_not_usable":
      return HttpStatus.UNPROCESSABLE_ENTITY;
    case "check_unavailable":
    case "internal_error":
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

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => firstString(item)).filter((item): item is string => Boolean(item));
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

function providerApiException(error: unknown, path: string) {
  if (!axios.isAxiosError(error) || !error.response) return undefined;
  const body = objectOrEmpty(error.response.data);
  const providerError = objectOrEmpty(body.error);
  const providerCode = firstString(providerError.code, body.code);
  if (!providerCode) return undefined;
  const requestId = firstString(body.request_id);
  return new ApiException(
    providerPublicMessage(providerCode, path),
    `BYTID_${providerCode.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
    providerHttpStatus(providerCode),
    stripUndefined({
      providerCode,
      requestId,
      providerDetails: sanitize(providerError.details)
    })
  );
}

function providerPublicMessage(code: string, path: string) {
  const faceMatch = path.includes("face-match");
  switch (code) {
    case "validation_error":
      return faceMatch
        ? "BytID rejected the selfie or BVN verification details"
        : "BytID rejected the BVN verification details";
    case "invalid_api_key":
      return "BytID live API key is invalid or revoked";
    case "insufficient_balance":
      return "BytID account balance is insufficient";
    case "live_not_enabled":
      return "BytID live verification is not enabled for this account";
    case "ip_not_allowed":
      return "This server IP address is not allowed by BytID";
    case "insufficient_scope":
      return faceMatch
        ? "BytID API key is not permitted to run BVN face matching"
        : "BytID API key is not permitted to run BVN verification";
    case "business_suspended":
      return "The BytID business account is suspended";
    case "duplicate_reference":
      return "BytID has already processed this verification attempt";
    case "rate_limited":
      return "BytID request limit reached; please try again shortly";
    case "check_unavailable":
    case "internal_error":
      return "BytID verification is temporarily unavailable";
    default:
      return "BytID rejected the verification request";
  }
}
