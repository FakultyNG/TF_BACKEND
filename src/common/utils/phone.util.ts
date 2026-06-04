import { HttpStatus } from "@nestjs/common";
import { ApiException } from "../errors/api.exception";

export function normalizePhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    throw new ApiException("Invalid phone number", "INVALID_PHONE_NUMBER", HttpStatus.BAD_REQUEST);
  }

  const digits = phoneNumber.replace(/\D/g, "");
  let normalized = digits;
  if (digits.startsWith("0")) normalized = `234${digits.slice(1)}`;
  if (digits.startsWith("2340")) normalized = `234${digits.slice(4)}`;

  if (!/^234[789][01]\d{8}$/.test(normalized)) {
    throw new ApiException("Invalid phone number", "INVALID_PHONE_NUMBER", HttpStatus.BAD_REQUEST);
  }

  return normalized;
}
