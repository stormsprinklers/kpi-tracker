export const CONTACT_INBOX_EMAIL = "contact@homeservicesanalytics.com";

export const SMS_BRAND_NAME = "Home Services Analytics";

/** Normalize to 10-digit US number, or null if invalid. */
export function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return null;
}

export function formatUsPhone(digits10: string): string {
  return `(${digits10.slice(0, 3)}) ${digits10.slice(3, 6)}-${digits10.slice(6)}`;
}

export function isValidUsPhone(raw: string): boolean {
  return normalizeUsPhone(raw) !== null;
}
