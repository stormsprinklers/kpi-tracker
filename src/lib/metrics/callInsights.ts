import { sql } from "@/lib/db";
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
  /** Average booked call revenue (from jobs with total_amount > 0). */
  avgBookedCallRevenue: number | null;
}

export interface CallInsightsResult {
  /** Average days between call date and appointment date for calls with linked jobs. */
  avgWaitingWindowDays: number | null;
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

  const waitingResult = await sql`
    SELECT AVG(
      (COALESCE(
        (j.raw->'schedule'->>'scheduled_start'),
        (j.raw->'schedule'->>'scheduledStart'),
        j.raw->>'scheduled_start'
      )::date - c.call_date)
    )::double precision AS avg_waiting_days
    FROM call_records c
    INNER JOIN jobs j ON j.hcp_id = c.job_hcp_id AND j.company_id = c.company_id
    WHERE c.organization_id = ${organizationId}::uuid
      AND c.call_date >= ${start}
      AND c.call_date <= ${end}
      AND c.job_hcp_id IS NOT NULL
      AND (
        (j.raw->'schedule'->>'scheduled_start') IS NOT NULL
        OR (j.raw->'schedule'->>'scheduledStart') IS NOT NULL
        OR (j.raw->>'scheduled_start') IS NOT NULL
      )
  `;
  const waitingRow = waitingResult.rows?.[0] as { avg_waiting_days: number | string | null } | undefined;
  const avgWaitingWindowDays =
    waitingRow?.avg_waiting_days != null && !Number.isNaN(Number(waitingRow.avg_waiting_days))
      ? Number(waitingRow.avg_waiting_days)
      : null;

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
    if (val != null && !Number.isNaN(val)) revenueMap.set(r.hcp_employee_id, val);
  }

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

    const avgRev = r.hcp_employee_id ? revenueMap.get(r.hcp_employee_id) ?? null : null;
    byEmployee.push({
      hcpEmployeeId: r.hcp_employee_id,
      employeeName,
      totalOpportunityCalls: oppCalls,
      won,
      lost,
      bookingRatePercent,
      avgDurationSeconds: avgDur,
      avgBookedCallRevenue: avgRev ?? null,
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
    return { avgWaitingWindowDays, byEmployee: filtered };
  }

  return { avgWaitingWindowDays, byEmployee };
}
