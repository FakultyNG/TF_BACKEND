import { sha256 } from "../../common/utils/hash.util";
import { BvnVerificationResult, SelfieValidationResult } from "../interfaces/kyc-provider.interface";

type JsonObject = Record<string, unknown>;

export function mapPremblyBvnResponse(response: unknown, bvn: string): BvnVerificationResult {
  const payload = objectOrEmpty(response);
  const data = objectOrEmpty(payload.data);
  const providerReference = stringValue(objectOrEmpty(payload.verification).reference);
  const bvnVerified = booleanValue(payload.status) && stringValue(payload.response_code) === "00";
  const nin = stringValue(data.nin);

  return {
    provider: "prembly",
    providerReference,
    bvnMasked: maskIdentifier(bvn),
    bvnVerified,
    firstName: stringValue(data.firstName),
    middleName: stringValue(data.middleName),
    lastName: stringValue(data.lastName),
    email: stringValue(data.email),
    phoneNumber: stringValue(data.phoneNumber1) || stringValue(data.phoneNumber),
    dateOfBirth: stringValue(data.dateOfBirth),
    gender: stringValue(data.gender),
    country: stringValue(data.nationality) || stringValue(data.country),
    ninMasked: nin ? maskIdentifier(nin) : undefined,
    ninHash: nin ? sha256(nin) : undefined,
    imageUrl: stringValue(data.imageUrl),
    rawProviderResponse: sanitizePremblyPayload(payload)
  };
}

export function mapPremblyBvnWithFaceResponse(response: unknown, bvn: string, faceMatchThreshold: number): SelfieValidationResult {
  const payload = objectOrEmpty(response);
  const data = objectOrEmpty(payload.data);
  const faceData = objectOrEmpty(data.face_data);
  const base = mapPremblyBvnResponse(response, bvn);
  const confidenceScore = numberValue(faceData.confidence) ?? 0;
  const providerFaceMatch = booleanValue(faceData.status);
  const faceMatch = providerFaceMatch && confidenceScore >= faceMatchThreshold;

  return {
    ...base,
    faceMatch,
    selfieVerified: faceMatch,
    confidenceScore,
    profileImageUrl: base.imageUrl,
    rawProviderResponse: sanitizePremblyPayload(payload)
  };
}

export function mapPremblyStatusResponse(response: unknown, providerReference: string): BvnVerificationResult {
  const payload = objectOrEmpty(response);
  const data = objectOrEmpty(payload.data);
  const status = stringValue(data.verification_status);
  return {
    provider: "prembly",
    providerReference: stringValue(data.reference) || providerReference,
    bvnVerified: status === "VERIFIED",
    rawProviderResponse: sanitizePremblyPayload(payload)
  };
}

function objectOrEmpty(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "yes", "1", "verified"].includes(value.toLowerCase());
  return false;
}

function maskIdentifier(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function sanitizePremblyPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizePremblyPayload(item));
  if (!value || typeof value !== "object") return value;
  const output: JsonObject = {};
  for (const [key, child] of Object.entries(value as JsonObject)) {
    output[key] = isSensitiveKey(key) ? maskSensitiveValue(child) : sanitizePremblyPayload(child);
  }
  return output;
}

function isSensitiveKey(key: string) {
  const lower = key.toLowerCase();
  return ["bvn", "nin", "number", "base64image", "image"].some((part) => lower.includes(part));
}

function maskSensitiveValue(value: unknown) {
  if (typeof value === "string") return value.length > 4 ? maskIdentifier(value) : "***MASKED***";
  return "***MASKED***";
}
