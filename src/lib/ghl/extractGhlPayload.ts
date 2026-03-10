/**
 * Shared GHL webhook payload extraction.
 * Used by both the live webhook route and syncWebhookLogToCallRecords.
 * Handles headers, body key variants (bookingValue, customerPhone, etc.), and nested structures.
 */

export const GHL_KEYS = [
  "csr",
  "booking_value",
  "date",
  "time",
  "duration",
  "transcript",
  "customer_phone",
] as const;

export function getHeader(headers: Record<string, string>, key: string): string {
  const variants = [
    key,
    key.replace(/_/g, "-"),
    `x-${key}`,
    `x-${key.replace(/_/g, "-")}`,
  ];
  const seen = new Set<string>();
  for (const v of variants) {
    const vLo = v.toLowerCase();
    if (seen.has(vLo)) continue;
    seen.add(vLo);
    for (const [k, val] of Object.entries(headers)) {
      const kLo = k.toLowerCase();
      const kNorm = kLo.replace(/-/g, "_");
      const vNorm = vLo.replace(/-/g, "_");
      if ((kLo === vLo || kNorm === vNorm) && val != null && val !== "") return val;
    }
  }
  return "";
}

const BODY_KEY_VARIANTS: Record<string, string[]> = {
  csr: ["csr", "CSR", "Csr"],
  booking_value: ["booking_value", "bookingValue", "booking-value", "bookingvalue", "outcome", "status"],
  date: ["date", "Date", "call_date", "callDate"],
  time: ["time", "Time", "call_time", "callTime"],
  duration: ["duration", "Duration"],
  transcript: ["transcript", "Transcript"],
  customer_phone: ["customer_phone", "customerPhone", "customer-phone", "phone", "Phone", "caller_phone"],
};

function getFromObject(obj: Record<string, unknown>, keyVariants: string[]): string {
  const keys = Object.keys(obj);
  for (const variant of keyVariants) {
    const vLo = variant.toLowerCase().replace(/-/g, "_");
    for (const k of keys) {
      const kLo = k.toLowerCase().replace(/-/g, "_");
      if (kLo === vLo || kLo.replace(/_/g, "") === vLo.replace(/_/g, "")) {
        const val = obj[k];
        if (val != null && val !== "") return String(val);
      }
    }
  }
  return "";
}

export function parseBody(raw: string | null): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  try {
    const params = new URLSearchParams(raw);
    const obj: Record<string, unknown> = {};
    params.forEach((v, k) => {
      obj[k] = v;
    });
    return obj;
  } catch {
    /* ignore */
  }
  return {};
}

function getGhlValue(headers: Record<string, string>, rawBody: string | null, key: string): string {
  const fromHeader = getHeader(headers, key);
  if (fromHeader) return fromHeader;
  const parsed = parseBody(rawBody);
  const variants = BODY_KEY_VARIANTS[key] ?? [key];
  let val = getFromObject(parsed, variants);
  if (val) return val;
  const nested = (parsed.data ?? parsed.payload ?? parsed.body ?? parsed.call) as Record<string, unknown> | undefined;
  if (nested && typeof nested === "object") {
    val = getFromObject(nested, variants);
  }
  return val ?? "";
}

export interface GhlExtractedPayload {
  csr: string;
  booking_value: string;
  date: string;
  time: string;
  duration: string;
  transcript: string;
  customer_phone: string;
}

/**
 * Extract GHL call payload from webhook request (headers + raw body).
 * Supports header variants, body key variants (camelCase, kebab-case), and nested data/payload/body.
 */
export function extractGhlPayload(
  headers: Record<string, string>,
  rawBody: string | null
): GhlExtractedPayload {
  const h = headers ?? {};
  return {
    csr: getGhlValue(h, rawBody, "csr"),
    booking_value: getGhlValue(h, rawBody, "booking_value"),
    date: getGhlValue(h, rawBody, "date"),
    time: getGhlValue(h, rawBody, "time"),
    duration: getGhlValue(h, rawBody, "duration"),
    transcript: getGhlValue(h, rawBody, "transcript"),
    customer_phone: getGhlValue(h, rawBody, "customer_phone"),
  };
}
