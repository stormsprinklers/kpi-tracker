import { sql } from "@vercel/postgres";

const PHONE_KEYS = ["phone", "phone_number", "mobile", "mobile_phone", "cell", "cell_phone", "telephone"];

function normalizePhone(phone: unknown): string {
  if (phone == null) return "";
  let s = String(phone).replace(/\D/g, "");
  if (s.length >= 10) {
    s = s.slice(-10);
  }
  return s;
}

function getName(raw: Record<string, unknown>): string {
  const first = String(raw.first_name ?? raw.firstName ?? "").trim();
  const last = String(raw.last_name ?? raw.lastName ?? raw.family_name ?? "").trim();
  if (first || last) return [first, last].filter(Boolean).join(" ").trim();
  return String(raw.name ?? raw.display_name ?? "").trim() || "";
}

function getCity(raw: Record<string, unknown>): string | null {
  const city = raw.city ?? raw.locality ?? raw.town;
  if (city != null && String(city).trim()) return String(city).trim();
  return null;
}

export interface CustomerMatchResult {
  customer_hcp_id: string | null;
  customer_name: string | null;
  customer_city: string | null;
}

/**
 * Match customer phone from GHL to HCP customers.
 */
export async function matchCustomerByPhone(
  companyId: string,
  customerPhone: string
): Promise<CustomerMatchResult> {
  const normalized = normalizePhone(customerPhone);
  if (!normalized) {
    return { customer_hcp_id: null, customer_name: null, customer_city: null };
  }

  const result = await sql`
    SELECT hcp_id, raw FROM customers
    WHERE company_id = ${companyId}
  `;

  for (const row of result.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const raw = r.raw ?? {};
    for (const key of PHONE_KEYS) {
      const val = raw[key];
      if (val == null) continue;
      const custNorm = normalizePhone(val);
      if (custNorm && custNorm === normalized) {
        return {
          customer_hcp_id: r.hcp_id,
          customer_name: getName(raw) || null,
          customer_city: getCity(raw),
        };
      }
    }
  }

  return { customer_hcp_id: null, customer_name: null, customer_city: null };
}
