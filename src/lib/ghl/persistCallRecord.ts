import { sql } from "@vercel/postgres";
import { matchCsrByFirstName } from "./csrMatcher";
import { matchCustomerByPhone } from "./customerMatcher";

const VALID_BOOKING_VALUES = new Set(["won", "lost", "non-opportunity"]);

export interface GhlCallPayload {
  csr: string;
  booking_value: string;
  date: string;
  time: string;
  duration: string;
  transcript: string;
  customer_phone: string;
}

function parseDate(s: string): Date | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  // Try HTTP date / ISO 8601 first (e.g. "Sun, 08 Mar 2026 16:06:44 GMT")
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  // Fallback: MM/DD/YYYY or similar
  const parts = trimmed.split(/[\/\-\.]/);
  if (parts.length !== 3) return null;
  const [a, b, c] = parts.map((p) => parseInt(p, 10));
  let month: number;
  let day: number;
  let year: number;
  if (a > 12) {
    year = a;
    month = b;
    day = c;
  } else if (c > 31) {
    month = a;
    day = b;
    year = c;
  } else {
    month = a;
    day = b;
    year = c;
  }
  if (year < 100) year += 2000;
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseTime(s: string): string | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const sec = m[3] ? parseInt(m[3], 10) : 0;
  if (h < 0 || h > 23 || min < 0 || min > 59 || sec < 0 || sec > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function parseDuration(s: string): number | null {
  if (s == null) return null;
  if (typeof s === "number" && !Number.isNaN(s)) return Math.round(s);
  const str = String(s).trim();
  const secOnly = parseInt(str, 10);
  if (!Number.isNaN(secOnly)) return secOnly;
  const m = str.match(/(\d+)\s*m/i);
  const sec = str.match(/(\d+)\s*s/i);
  if (m || sec) {
    const mins = m ? parseInt(m[1], 10) : 0;
    const secs = sec ? parseInt(sec[1], 10) : 0;
    return mins * 60 + secs;
  }
  return null;
}

export async function persistGhlCallRecord(
  organizationId: string,
  companyId: string,
  payload: GhlCallPayload,
  rawPayload: Record<string, unknown>,
  options?: { fallbackCity?: string | null }
): Promise<{ ok: boolean; skipped?: string }> {
  const bookingValue = (payload.booking_value ?? "").toString().toLowerCase().trim();
  if (!VALID_BOOKING_VALUES.has(bookingValue)) {
    console.warn("[GHL] Skipped: booking_value_not_valid", { booking_value: payload.booking_value });
    return { ok: true, skipped: "booking_value_not_valid" };
  }

  const callDate = parseDate(payload.date);
  if (!callDate) {
    console.warn("[GHL] Skipped: invalid_date", { date: payload.date });
    return { ok: true, skipped: "invalid_date" };
  }

  const callTime = parseTime(payload.time);
  const durationSeconds = parseDuration(payload.duration);

  const { hcp_employee_id, csr_first_name_raw } = await matchCsrByFirstName(
    companyId,
    (payload.csr ?? "").toString().trim()
  );

  let fallbackCity: string | undefined;
  if (options?.fallbackCity) {
    try {
      fallbackCity = decodeURIComponent(String(options.fallbackCity).replace(/\+/g, " "));
    } catch {
      fallbackCity = String(options.fallbackCity).replace(/\+/g, " ");
    }
  }
  const { customer_hcp_id, customer_name, customer_city } = await matchCustomerByPhone(
    companyId,
    (payload.customer_phone ?? "").toString(),
    fallbackCity
  );

  console.log("[GHL] Inserting call_record", { organizationId, call_date: callDate.toISOString().slice(0, 10), csr: payload.csr, booking_value: bookingValue });
  await sql`
    INSERT INTO call_records (
      organization_id,
      company_id,
      hcp_employee_id,
      csr_first_name_raw,
      booking_value,
      call_date,
      call_time,
      duration_seconds,
      transcript,
      customer_phone,
      customer_name,
      customer_city,
      customer_hcp_id,
      raw_payload,
      created_at
    )
    VALUES (
      ${organizationId}::uuid,
      ${companyId},
      ${hcp_employee_id},
      ${csr_first_name_raw || null},
      ${bookingValue},
      ${callDate.toISOString().slice(0, 10)},
      ${callTime},
      ${durationSeconds},
      ${(payload.transcript ?? "").toString().trim() || null},
      ${(payload.customer_phone ?? "").toString().trim() || null},
      ${customer_name},
      ${customer_city},
      ${customer_hcp_id},
      ${JSON.stringify(rawPayload)}::jsonb,
      NOW()
    )
  `;
  console.log("[GHL] call_record inserted successfully");
  return { ok: true };
}
