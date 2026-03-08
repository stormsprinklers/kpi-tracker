import crypto from "crypto";
import { sql } from "@vercel/postgres";
import { matchCsrByFirstName } from "./csrMatcher";
import { matchCustomerByPhone } from "./customerMatcher";
import { matchJobByCustomerPhone } from "./jobMatcher";

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

/** Deterministic key to dedupe calls: same call → same key. */
function computeCallKey(
  organizationId: string,
  companyId: string,
  callDate: string,
  callTime: string | null,
  customerPhone: string,
  csrId: string | null,
  durationSeconds: number | null,
  transcript: string | null
): string {
  const norm = (s: string | null) => (s ?? "").replace(/\D/g, "").slice(-10);
  const phone = norm(customerPhone);
  const transcriptPreview = (transcript ?? "").slice(0, 500);
  const parts = [
    organizationId,
    companyId,
    callDate,
    callTime ?? "",
    phone,
    csrId ?? "",
    String(durationSeconds ?? 0),
    transcriptPreview,
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

/** Extract customer name from GHL webhook raw payload (first_name, last_name, full_name, etc.). */
function getNameFromPayload(payload: Record<string, unknown>): string | null {
  const first = String(payload.first_name ?? payload.firstName ?? "").trim();
  const last = String(payload.last_name ?? payload.lastName ?? payload.family_name ?? "").trim();
  if (first || last) return [first, last].filter(Boolean).join(" ").trim() || null;
  const full = String(payload.full_name ?? payload.name ?? payload.display_name ?? "").trim();
  return full || null;
}

export async function persistGhlCallRecord(
  organizationId: string,
  companyId: string,
  payload: GhlCallPayload,
  rawPayload: Record<string, unknown>,
  options?: { fallbackCity?: string | null; callHeaders?: Record<string, string> | null }
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

  const customerPhone = (payload.customer_phone ?? "").toString().trim();

  // Prefer city + job link + name from recent job.appointment.booked / job.scheduled (mobile_number match)
  let job_hcp_id: string | null = null;
  let customer_city: string | null = null;
  let customer_name_from_job: string | null = null;
  const jobMatch = await matchJobByCustomerPhone(companyId, customerPhone);
  if (jobMatch) {
    job_hcp_id = jobMatch.job_hcp_id;
    customer_city = jobMatch.customer_city;
    customer_name_from_job = jobMatch.customer_name;
  }

  const { customer_hcp_id, customer_name: customer_name_from_hcp, customer_city: custCity } = await matchCustomerByPhone(
    companyId,
    customerPhone,
    jobMatch ? undefined : fallbackCity
  );
  // Use job city when available; else customer table city; else fallback
  const finalCity = customer_city ?? custCity ?? fallbackCity ?? null;

  // Customer name: prefer job customer, then HCP customers table, then GHL raw payload
  const nameFromPayload = getNameFromPayload(rawPayload);
  const finalCustomerName = customer_name_from_job ?? customer_name_from_hcp ?? nameFromPayload ?? null;
  const transcriptVal = (payload.transcript ?? "").toString().trim() || null;
  const callDateStr = callDate.toISOString().slice(0, 10);

  const callKey = computeCallKey(
    organizationId,
    companyId,
    callDateStr,
    callTime,
    customerPhone,
    hcp_employee_id,
    durationSeconds,
    transcriptVal
  );

  console.log("[GHL] Upserting call_record", { organizationId, call_date: callDateStr, csr: payload.csr, booking_value: bookingValue, job_hcp_id });
  await sql`
    INSERT INTO call_records (
      call_key,
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
      job_hcp_id,
      raw_payload,
      call_headers,
      created_at
    )
    VALUES (
      ${callKey},
      ${organizationId}::uuid,
      ${companyId},
      ${hcp_employee_id},
      ${csr_first_name_raw || null},
      ${bookingValue},
      ${callDateStr},
      ${callTime},
      ${durationSeconds},
      ${transcriptVal},
      ${customerPhone || null},
      ${finalCustomerName},
      ${finalCity},
      ${customer_hcp_id},
      ${job_hcp_id},
      ${JSON.stringify(rawPayload)}::jsonb,
      ${options?.callHeaders ? JSON.stringify(options.callHeaders) : null}::jsonb,
      NOW()
    )
    ON CONFLICT (call_key) DO UPDATE SET
      hcp_employee_id = EXCLUDED.hcp_employee_id,
      csr_first_name_raw = EXCLUDED.csr_first_name_raw,
      booking_value = EXCLUDED.booking_value,
      customer_name = EXCLUDED.customer_name,
      customer_city = EXCLUDED.customer_city,
      customer_hcp_id = EXCLUDED.customer_hcp_id,
      job_hcp_id = COALESCE(EXCLUDED.job_hcp_id, call_records.job_hcp_id),
      raw_payload = EXCLUDED.raw_payload,
      call_headers = COALESCE(EXCLUDED.call_headers, call_records.call_headers)
  `;
  console.log("[GHL] call_record upserted successfully");
  return { ok: true };
}
