import { getHcpClient } from "../housecallpro";
import { getOrganizationById } from "../db/queries";
import { sql } from "@vercel/postgres";

export interface CsrKpiEntry {
  csrId: string;
  csrName: string;
  /** % of calls that turn into appointments. Placeholder for webhooks integration. */
  bookingRate: number | null;
  /** Average call duration in minutes. Placeholder for webhooks integration. */
  avgCallDurationMinutes: number | null;
  /** Lead response time. Placeholder for webhooks integration. */
  leadResponseTimeMinutes: number | null;
}

const OFFICE_STAFF_ROLES = ["office staff", "office_staff", "officestaff"];

function isOfficeStaff(role: unknown): boolean {
  const r = (role ?? "").toString().toLowerCase().replace(/\s+/g, " ");
  return OFFICE_STAFF_ROLES.some((o) => r === o || (r.includes("office") && r.includes("staff")));
}

function getName(raw: Record<string, unknown>): string {
  const first = String(raw.first_name ?? raw.firstName ?? "").trim();
  const last = String(raw.last_name ?? raw.lastName ?? raw.family_name ?? "").trim();
  if (first || last) return [first, last].filter(Boolean).join(" ").trim();
  const fallback = raw.name ?? raw.display_name ?? raw.email ?? raw.email_address ?? raw.id;
  return String(fallback ?? "Unknown").trim() || "Unknown";
}

/**
 * Get office staff (CSR) list for the organization.
 * Office staff are employees/pros with role "office staff" etc. in Housecall Pro.
 * KPI values are placeholders until webhooks integration provides call/appointment data.
 */
export async function getCsrKpiList(organizationId: string): Promise<CsrKpiEntry[]> {
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id ?? "default";

  const csrList: { id: string; name: string }[] = [];

  // Get employees with hcp_id and raw for role check
  const empResult = await sql`
    SELECT hcp_id, raw FROM employees
    WHERE company_id = ${companyId}
  `;
  for (const row of empResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const raw = r.raw ?? {};
    if (isOfficeStaff(raw.role ?? raw.employee_type ?? raw.type)) {
      csrList.push({ id: r.hcp_id, name: getName(raw) });
    }
  }

  // Get pros with hcp_id and raw (office staff can be in pros in some HCP setups)
  const prosResult = await sql`
    SELECT hcp_id, raw FROM pros
    WHERE company_id = ${companyId}
  `;
  for (const row of prosResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const raw = r.raw ?? {};
    if (isOfficeStaff(raw.role ?? raw.employee_type ?? raw.type)) {
      const existing = csrList.find((c) => c.id === r.hcp_id);
      if (!existing) {
        csrList.push({ id: r.hcp_id, name: getName(raw) });
      }
    }
  }

  // Fallback: if no office staff in DB, try HCP API
  if (csrList.length === 0) {
    try {
      const client = await getHcpClient(organizationId);
      const employeesList = await client.getEmployeesAllPages();
      const employees = Array.isArray(employeesList) ? employeesList : [];
      for (const emp of employees) {
        const r = emp as Record<string, unknown>;
        if (isOfficeStaff(r?.role ?? r?.employee_type ?? r?.type)) {
          const id = String(r?.id ?? r?.employee_id ?? r?.pro_id ?? "");
          if (id && !csrList.some((c) => c.id === id)) {
            csrList.push({ id, name: getName(r) });
          }
        }
      }
      const prosRes = await client.getPros();
      const prosList = Array.isArray(prosRes)
        ? prosRes
        : (prosRes as { pros?: unknown[] })?.pros ?? (prosRes as { data?: unknown[] })?.data ?? [];
      for (const p of prosList) {
        const r = p as Record<string, unknown>;
        if (isOfficeStaff(r?.role ?? r?.employee_type ?? r?.type)) {
          const id = String(r?.id ?? r?.pro_id ?? "");
          if (id && !csrList.some((c) => c.id === id)) {
            csrList.push({ id, name: getName(r) });
          }
        }
      }
    } catch {
      /* skip - return empty or what we have */
    }
  }

  // Sort by name
  csrList.sort((a, b) => a.name.localeCompare(b.name));

  return csrList.map((c) => ({
    csrId: c.id,
    csrName: c.name,
    bookingRate: null,
    avgCallDurationMinutes: null,
    leadResponseTimeMinutes: null,
  }));
}
