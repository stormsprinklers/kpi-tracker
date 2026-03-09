import { getHcpClient } from "../housecallpro";
import { getOrganizationById, getCsrSelections, getEmployeesAndProsForCsrSelector } from "../db/queries";
import { sql } from "@vercel/postgres";

export interface CsrKpiEntry {
  csrId: string;
  csrName: string;
  /** % of calls that turn into appointments. */
  bookingRate: number | null;
  /** Average call duration in minutes. */
  avgCallDurationMinutes: number | null;
  /** Lead response time. */
  leadResponseTimeMinutes: number | null;
  /** Average booked call revenue (from jobs with total_amount > 0). */
  avgBookedCallRevenue: number | null;
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

export interface CsrKpiFilters {
  startDate?: string;
  endDate?: string;
}

/**
 * Get CSR list for the organization with KPIs from call_records.
 * Uses admin-selected csr_selections when non-empty; else office staff role.
 */
export async function getCsrKpiList(
  organizationId: string,
  filters?: CsrKpiFilters
): Promise<CsrKpiEntry[]> {
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id ?? "default";

  const selections = await getCsrSelections(organizationId);
  let csrList: { id: string; name: string }[] = [];

  if (selections.length > 0) {
    const candidates = await getEmployeesAndProsForCsrSelector(companyId);
    const selectionSet = new Set(selections);
    csrList = candidates.filter((c) => selectionSet.has(c.id));
  }

  if (csrList.length === 0) {
    // Fallback: office staff role
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
  }

  csrList.sort((a, b) => a.name.localeCompare(b.name));

  const officeStaffIds = new Set(csrList.map((c) => c.id));
  if (officeStaffIds.size === 0) {
    return csrList.map((c) => ({
      csrId: c.id,
      csrName: c.name,
      bookingRate: null,
      avgCallDurationMinutes: null,
      leadResponseTimeMinutes: null,
      avgBookedCallRevenue: null,
    }));
  }

  const { startDate, endDate } = filters ?? {};
  const start = startDate ?? "2000-01-01";
  const end = endDate ?? "2100-12-31";

  const callResult = await sql`
    SELECT
      hcp_employee_id,
      COUNT(*) FILTER (WHERE booking_value IN ('won','lost'))::int AS opportunity_calls,
      COUNT(*) FILTER (WHERE booking_value = 'won')::int AS won,
      AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) AS avg_duration
    FROM call_records
    WHERE organization_id = ${organizationId}::uuid
      AND call_date >= ${start}
      AND call_date <= ${end}
      AND hcp_employee_id IS NOT NULL
    GROUP BY hcp_employee_id
  `;

  // Average booked call revenue: jobs with total_amount > 0, linked via job_hcp_id
  const revenueResult = await sql`
    SELECT c.hcp_employee_id, AVG(j.total_amount)::double precision AS avg_revenue
    FROM call_records c
    INNER JOIN jobs j ON j.hcp_id = c.job_hcp_id AND j.company_id = c.company_id
    WHERE c.organization_id = ${organizationId}::uuid
      AND c.call_date >= ${start}
      AND c.call_date <= ${end}
      AND c.booking_value = 'won'
      AND c.job_hcp_id IS NOT NULL
      AND c.hcp_employee_id IS NOT NULL
      AND j.total_amount IS NOT NULL
      AND j.total_amount > 0
    GROUP BY c.hcp_employee_id
  `;
  const revenueMap = new Map<string, number>();
  for (const row of revenueResult.rows ?? []) {
    const r = row as { hcp_employee_id: string; avg_revenue: number | string | null };
    const val = r.avg_revenue != null ? (typeof r.avg_revenue === "string" ? parseFloat(r.avg_revenue) : r.avg_revenue) : null;
    if (val != null && !Number.isNaN(val) && officeStaffIds.has(r.hcp_employee_id)) {
      revenueMap.set(r.hcp_employee_id, val);
    }
  }

  const callStats = new Map<string, { bookingRate: number | null; avgDurationMinutes: number | null; avgBookedCallRevenue: number | null }>();
  for (const row of callResult.rows ?? []) {
    const r = row as {
      hcp_employee_id: string;
      opportunity_calls: number;
      won: number;
      avg_duration: string | null;
    };
    if (!officeStaffIds.has(r.hcp_employee_id)) continue;
    const oppCalls = Number(r.opportunity_calls) || 0;
    const won = Number(r.won) || 0;
    let bookingRate: number | null = null;
    if (oppCalls > 0) bookingRate = (won / oppCalls) * 100;
    const avgSec = r.avg_duration != null ? parseFloat(r.avg_duration) : null;
    const avgMinutes = avgSec != null ? avgSec / 60 : null;
    const avgRev = revenueMap.get(r.hcp_employee_id) ?? null;
    callStats.set(r.hcp_employee_id, { bookingRate, avgDurationMinutes: avgMinutes, avgBookedCallRevenue: avgRev });
  }

  return csrList.map((c) => {
    const stats = callStats.get(c.id);
    return {
      csrId: c.id,
      csrName: c.name,
      bookingRate: stats?.bookingRate ?? null,
      avgCallDurationMinutes: stats?.avgDurationMinutes ?? null,
      leadResponseTimeMinutes: null,
      avgBookedCallRevenue: stats?.avgBookedCallRevenue ?? revenueMap.get(c.id) ?? null,
    };
  });
}
