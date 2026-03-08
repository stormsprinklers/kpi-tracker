import { sql } from "@vercel/postgres";
import { getOrganizationById, getCsrSelections } from "../db/queries";

export interface CallInsightsFilters {
  startDate?: string;
  endDate?: string;
  officeStaffOnly?: boolean;
}

export interface EmployeeCallStats {
  hcpEmployeeId: string | null;
  employeeName: string;
  totalOpportunityCalls: number;
  won: number;
  lost: number;
  bookingRatePercent: number | null;
  avgDurationSeconds: number | null;
}

export interface CallInsightsResult {
  byEmployee: EmployeeCallStats[];
}

function getName(raw: Record<string, unknown>): string {
  const first = String(raw.first_name ?? raw.firstName ?? "").trim();
  const last = String(raw.last_name ?? raw.lastName ?? raw.family_name ?? "").trim();
  if (first || last) return [first, last].filter(Boolean).join(" ").trim();
  return String(raw.email ?? raw.email_address ?? raw.name ?? raw.display_name ?? "").trim() || "Unknown";
}

export async function getCallInsights(
  organizationId: string,
  filters?: CallInsightsFilters
): Promise<CallInsightsResult> {
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id ?? "default";

  const { startDate, endDate } = filters ?? {};
  const start = startDate ?? "2000-01-01";
  const end = endDate ?? "2100-12-31";

  const result = await sql`
    SELECT
      hcp_employee_id,
      csr_first_name_raw,
      COUNT(*) FILTER (WHERE booking_value IN ('won','lost'))::int AS opportunity_calls,
      COUNT(*) FILTER (WHERE booking_value = 'won')::int AS won,
      COUNT(*) FILTER (WHERE booking_value = 'lost')::int AS lost,
      AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) AS avg_duration
    FROM call_records
    WHERE organization_id = ${organizationId}::uuid
      AND call_date >= ${start}
      AND call_date <= ${end}
    GROUP BY hcp_employee_id, csr_first_name_raw
  `;

  const nameMap = new Map<string, string>();

  const empResult = await sql`SELECT hcp_id, raw FROM employees WHERE company_id = ${companyId}`;
  for (const row of empResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    nameMap.set(r.hcp_id, getName(r.raw ?? {}));
  }
  const prosResult = await sql`SELECT hcp_id, raw FROM pros WHERE company_id = ${companyId}`;
  for (const row of prosResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    if (!nameMap.has(r.hcp_id)) nameMap.set(r.hcp_id, getName(r.raw ?? {}));
  }

  const byEmployee: EmployeeCallStats[] = [];

  for (const row of result.rows ?? []) {
    const r = row as {
      hcp_employee_id: string | null;
      csr_first_name_raw: string | null;
      opportunity_calls: number;
      won: number;
      lost: number;
      avg_duration: string | null;
    };
    const oppCalls = Number(r.opportunity_calls) || 0;
    const won = Number(r.won) || 0;
    const lost = Number(r.lost) || 0;
    const avgDur = r.avg_duration != null ? parseFloat(r.avg_duration) : null;

    let employeeName = r.hcp_employee_id ? nameMap.get(r.hcp_employee_id) : null;
    if (!employeeName && r.csr_first_name_raw) {
      employeeName = `${r.csr_first_name_raw} (unmatched)`;
    }
    if (!employeeName) {
      employeeName = "Unknown";
    }

    let bookingRatePercent: number | null = null;
    if (oppCalls > 0) {
      bookingRatePercent = (won / oppCalls) * 100;
    }

    byEmployee.push({
      hcpEmployeeId: r.hcp_employee_id,
      employeeName,
      totalOpportunityCalls: oppCalls,
      won,
      lost,
      bookingRatePercent,
      avgDurationSeconds: avgDur,
    });
  }

  byEmployee.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  // Filter to CSR list when admin has selections
  const selections = await getCsrSelections(organizationId);
  if (selections.length > 0) {
    const selectionSet = new Set(selections);
    const filtered = byEmployee.filter(
      (e) => e.hcpEmployeeId && selectionSet.has(e.hcpEmployeeId)
    );
    return { byEmployee: filtered };
  }

  return { byEmployee };
}
