/**
 * Match GHL call (customer_phone) to HCP job from job.appointment.booked / job.scheduled.
 * Used to set customer_city from the job's customer and link call to job for revenue tracking.
 */
import { getRecentJobsForPhoneMatch } from "@/lib/db/queries";

const PHONE_KEYS = ["mobile_number", "phone", "phone_number", "mobile", "mobile_phone", "cell", "cell_phone", "telephone"];

function normalizePhone(phone: unknown): string {
  if (phone == null) return "";
  let s = String(phone).replace(/\D/g, "");
  if (s.length >= 10) s = s.slice(-10);
  return s;
}

function getPhoneFromCustomer(customer: Record<string, unknown>): string {
  for (const key of PHONE_KEYS) {
    const val = customer[key];
    if (val != null && String(val).trim()) return String(val);
  }
  const addr = customer.address;
  if (addr && typeof addr === "object" && addr !== null) {
    const a = addr as Record<string, unknown>;
    const p = a.phone ?? a.mobile_number;
    if (p != null && String(p).trim()) return String(p);
  }
  return "";
}

function getCityFromCustomer(customer: Record<string, unknown>): string | null {
  const city = customer.city ?? customer.locality ?? customer.town;
  if (city != null && String(city).trim()) return String(city).trim();
  const addr = customer.address;
  if (addr && typeof addr === "object" && addr !== null) {
    const a = addr as Record<string, unknown>;
    const c = a.city ?? a.locality ?? a.town;
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return null;
}

/** Job-level address (service location) often has city when customer doesn't. */
function getCityFromJobAddress(job: Record<string, unknown>): string | null {
  const addr = job.address;
  if (!addr || typeof addr !== "object" || addr === null) return null;
  const a = addr as Record<string, unknown>;
  const city = a.city ?? a.locality ?? a.town;
  if (city != null && String(city).trim()) return String(city).trim();
  return null;
}

function getNameFromCustomer(customer: Record<string, unknown>): string | null {
  const first = String(customer.first_name ?? customer.firstName ?? "").trim();
  const last = String(customer.last_name ?? customer.lastName ?? customer.family_name ?? "").trim();
  if (first || last) return [first, last].filter(Boolean).join(" ").trim() || null;
  const name = String(customer.name ?? customer.display_name ?? customer.full_name ?? "").trim();
  return name || null;
}

export interface JobMatchResult {
  job_hcp_id: string;
  customer_city: string | null;
  customer_name: string | null;
}

/**
 * Find the most recent job (from job.appointment.booked / job.scheduled) whose customer
 * mobile_number matches the GHL customer_phone. Returns job_hcp_id and city for linking.
 */
export async function matchJobByCustomerPhone(
  companyId: string,
  customerPhone: string
): Promise<JobMatchResult | null> {
  const normalized = normalizePhone(customerPhone);
  if (!normalized) return null;

  const jobs = await getRecentJobsForPhoneMatch(companyId, 20);
  for (const { hcp_id, raw } of jobs) {
    const customer = raw.customer;
    if (!customer || typeof customer !== "object") continue;
    const cust = customer as Record<string, unknown>;
    const phone = getPhoneFromCustomer(cust);
    if (!phone) continue;
    const custNorm = normalizePhone(phone);
    if (custNorm && custNorm === normalized) {
      const city = getCityFromCustomer(cust) ?? getCityFromJobAddress(raw);
      return {
        job_hcp_id: hcp_id,
        customer_city: city,
        customer_name: getNameFromCustomer(cust),
      };
    }
  }
  return null;
}
