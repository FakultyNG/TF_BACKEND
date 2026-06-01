export function normalizePhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}
