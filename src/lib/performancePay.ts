import {
  getPerformancePayOrg,
  getPerformancePayConfigs,
  getPerformancePayAssignments,
  getPerformancePayRoles,
  getTimeEntriesByOrganization,
  getEmployeesAndProsForCsrSelector,
} from "./db/queries";
import { getTechnicianRevenue } from "./metrics/technicianRevenue";
import { getCsrKpiList } from "./metrics/csrKpis";
import { getOrganizationById } from "./db/queries";

export type StructureType =
  | "pure_hourly"
  | "hourly_commission_tiers"
  | "hourly_to_commission"
  | "pure_commission"
  | "hourly_metrics"
  | "csr_hourly_booking_rate";

export type BonusType =
  | "5_star_review"
  | "memberships_sold"
  | "booking_rate"
  | "attendance"
  | "revenue_per_hour"
  | "avg_billable_hours";

export interface ExpectedPayResult {
  hcpEmployeeId: string;
  employeeName?: string;
  expectedPay: number;
  breakdown?: Record<string, number>;
  /** Total hours from timesheets in the period. */
  hoursWorked: number;
  /** Human-readable pay structure (hourly vs commission, etc.). */
  payTypeLabel: string;
  /** expectedPay / hoursWorked when hours are logged; otherwise null. */
  effectiveHourlyRate: number | null;
}

function payTypeLabelForStructure(structureType: StructureType): string {
  switch (structureType) {
    case "pure_hourly":
      return "Hourly";
    case "hourly_commission_tiers":
      return "Hourly + commission";
    case "hourly_to_commission":
      return "Hourly or commission";
    case "pure_commission":
      return "Commission";
    case "hourly_metrics":
      return "Hourly (metric tiers)";
    case "csr_hourly_booking_rate":
      return "Hourly (booking rate)";
    default:
      return "Performance pay";
  }
}

/** Display-only: which side of hourly_to_commission wins (Math.max). Does not affect pay math. */
function payTypeLabelHourlyVsCommission(
  hourlyPay: number,
  commissionPay: number
): string {
  const eps = 0.005;
  if (Math.abs(hourlyPay - commissionPay) < eps) {
    return "Hourly / commission (equal)";
  }
  if (hourlyPay > commissionPay) {
    return "Hourly";
  }
  return "Commission";
}

export interface CalculateExpectedPayOptions {
  organizationId: string;
  startDate: string;
  endDate: string;
  hcpEmployeeId?: string;
}

/** Compute biweekly period from a date and start weekday. Returns [startDate, endDate] in YYYY-MM-DD. */
export function getBiweeklyPeriod(
  fromDate: Date,
  payPeriodStartWeekday: number = 1
): [string, string] {
  const d = new Date(fromDate);
  const day = d.getDay();
  let daysBack = (day - payPeriodStartWeekday + 7) % 7;
  if (day < payPeriodStartWeekday) daysBack += 7;
  d.setDate(d.getDate() - daysBack);
  const start = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() + 13);
  const end = d.toISOString().slice(0, 10);
  return [start, end];
}

/** Stub bonus amount for bonus types that don't have data yet. Returns 0. */
function getBonusAmount(
  _bonusType: BonusType,
  _employeeId: string,
  _startDate: string,
  _endDate: string
): number {
  return 0;
}

export async function calculateExpectedPay(
  options: CalculateExpectedPayOptions
): Promise<ExpectedPayResult[]> {
  const { organizationId, startDate, endDate, hcpEmployeeId: filterEmployeeId } =
    options;

  const [org, configs, assignments, roles] = await Promise.all([
    getPerformancePayOrg(organizationId),
    getPerformancePayConfigs(organizationId),
    getPerformancePayAssignments(organizationId),
    getPerformancePayRoles(organizationId),
  ]);

  const roleMap = new Map(roles.map((r) => [r.id, r]));

  const assignmentByEmployee = new Map(
    assignments.map((a) => [a.hcp_employee_id, a])
  );

  const configByRole = new Map(
    configs.filter((c) => c.scope_type === "role").map((c) => [c.scope_id, c])
  );
  const configByEmployee = new Map(
    configs
      .filter((c) => c.scope_type === "employee")
      .map((c) => [c.scope_id, c])
  );

  function getEffectiveConfig(empId: string) {
    const config = configByEmployee.get(empId);
    if (config) return config;
    const assign = assignmentByEmployee.get(empId);
    if (assign?.role_id) {
      return configByRole.get(assign.role_id) ?? null;
    }
    return null;
  }

  const employeeIdsWithConfig = new Set<string>();
  for (const a of assignments) {
    const config = getEffectiveConfig(a.hcp_employee_id);
    if (config) employeeIdsWithConfig.add(a.hcp_employee_id);
  }
  for (const [empId] of configByEmployee) {
    employeeIdsWithConfig.add(empId);
  }

  let targetIds = Array.from(employeeIdsWithConfig);
  if (filterEmployeeId) {
    if (!employeeIdsWithConfig.has(filterEmployeeId)) return [];
    targetIds = [filterEmployeeId];
  }

  const orgEntity = await getOrganizationById(organizationId);
  const companyId = orgEntity?.hcp_company_id ?? "default";

  const [timeEntries, techResult, csrKpis, employeesAndPros] = await Promise.all([
    getTimeEntriesByOrganization(organizationId, startDate, endDate),
    getTechnicianRevenue(organizationId, {
      startDate,
      endDate,
      activeInCurrentYearOnly: false,
    }),
    getCsrKpiList(organizationId, { startDate, endDate }),
    getEmployeesAndProsForCsrSelector(companyId),
  ]);

  const employeeNames = new Map<string, string>();
  for (const e of employeesAndPros) {
    employeeNames.set(e.id, e.name);
  }

  const hoursByEmployee = new Map<string, number>();
  for (const e of timeEntries) {
    const h =
      typeof e.hours === "number" && !Number.isNaN(e.hours)
        ? e.hours
        : typeof e.hours === "string"
          ? parseFloat(e.hours) || 0
          : 0;
    hoursByEmployee.set(
      e.hcp_employee_id,
      (hoursByEmployee.get(e.hcp_employee_id) ?? 0) + h
    );
  }

  const techByEmployee = new Map(
    techResult.technicians.map((t) => [
      t.technicianId,
      {
        totalRevenue: t.totalRevenue,
        revenuePerHour: t.revenuePerHour ?? 0,
      },
    ])
  );

  const csrByEmployee = new Map(
    csrKpis.map((c) => [
      c.csrId,
      {
        bookingRate: c.bookingRate ?? 0,
        avgBookedCallRevenue: c.avgBookedCallRevenue ?? 0,
      },
    ])
  );

  const results: ExpectedPayResult[] = [];

  for (const empId of targetIds) {
    const config = getEffectiveConfig(empId);
    if (!config) continue;

    const hours = hoursByEmployee.get(empId) ?? 0;
    const tech = techByEmployee.get(empId);
    const csr = csrByEmployee.get(empId);
    const revenue = tech?.totalRevenue ?? 0;
    const revenuePerHour = tech?.revenuePerHour ?? 0;
    const bookingRate = csr?.bookingRate ?? 0;
    const avgBookedRevenue = csr?.avgBookedCallRevenue ?? 0;

    const cfg = config.config_json as Record<string, unknown>;
    const bonuses = (config.bonuses_json ?? []) as Array<{
      type: BonusType;
      amount?: number;
      rate_pct?: number;
      threshold?: number;
    }>;

    let basePay = 0;
    const breakdown: Record<string, number> = {};

    switch (config.structure_type as StructureType) {
      case "pure_hourly": {
        const rate = (cfg.hourly_rate as number) ?? 0;
        basePay = hours * rate;
        breakdown.base = basePay;
        break;
      }
      case "hourly_commission_tiers": {
        const rate = (cfg.hourly_rate as number) ?? 0;
        const tiers = (cfg.tiers as Array<{ min_revenue: number; max_revenue?: number; rate_pct: number }>) ?? [];
        const base = hours * rate;
        let commission = 0;
        for (const t of tiers) {
          const minRev = t.min_revenue ?? 0;
          const maxRev = t.max_revenue ?? Infinity;
          if (revenue >= minRev && revenue < maxRev) {
            commission = revenue * ((t.rate_pct ?? 0) / 100);
            break;
          }
        }
        basePay = base + commission;
        breakdown.base = base;
        breakdown.commission = commission;
        break;
      }
      case "hourly_to_commission": {
        const rate = (cfg.hourly_rate as number) ?? 0;
        const commissionRate = (cfg.commission_rate_pct as number) ?? 0;
        const hourlyPay = hours * rate;
        const commissionPay = revenue * (commissionRate / 100);
        basePay = Math.max(hourlyPay, commissionPay);
        breakdown.hourly = hourlyPay;
        breakdown.commission = commissionPay;
        break;
      }
      case "pure_commission": {
        const commissionRate = (cfg.commission_rate_pct as number) ?? 0;
        basePay = revenue * (commissionRate / 100);
        breakdown.commission = basePay;
        break;
      }
      case "hourly_metrics": {
        const metric = (cfg.metric as "booking_rate" | "revenue_per_hour") ?? "revenue_per_hour";
        const tiers = (cfg.tiers as Array<{ min_value: number; hourly_rate: number }>) ?? [];
        const value = metric === "booking_rate" ? bookingRate : revenuePerHour;
        let rate = 0;
        for (const t of tiers) {
          if (value >= (t.min_value ?? 0)) {
            rate = t.hourly_rate ?? 0;
          }
        }
        basePay = hours * rate;
        breakdown.base = basePay;
        break;
      }
      case "csr_hourly_booking_rate": {
        const baseHourly = (cfg.base_hourly as number) ?? 0;
        const thresholdPct = (cfg.threshold_pct as number) ?? 50;
        const incrementPer10Pct = (cfg.increment_per_10_pct as number) ?? 2;
        const pctAboveThreshold = Math.max(0, (bookingRate ?? 0) - thresholdPct);
        const increasePerHr = pctAboveThreshold * (incrementPer10Pct / 10);
        const effectiveHourly = baseHourly + increasePerHr;
        basePay = hours * effectiveHourly;
        breakdown.base = hours * baseHourly;
        if (increasePerHr > 0) {
          breakdown.booking_rate_bump = hours * increasePerHr;
        }
        break;
      }
      default:
        breakdown.base = 0;
    }

    let payTypeLabel = payTypeLabelForStructure(
      config.structure_type as StructureType
    );
    if (config.structure_type === "hourly_to_commission") {
      const hourlyPay = breakdown.hourly ?? 0;
      const commissionPay = breakdown.commission ?? 0;
      payTypeLabel = payTypeLabelHourlyVsCommission(hourlyPay, commissionPay);
    }

    let bonusTotal = 0;
    for (const b of bonuses) {
      const amt =
        b.amount ??
        getBonusAmount(b.type, empId, startDate, endDate);
      bonusTotal += amt;
    }
    if (bonusTotal > 0) breakdown.bonuses = bonusTotal;

    const expectedPayTotal = basePay + bonusTotal;
    const effectiveHourlyRate =
      hours > 0 ? Math.round((expectedPayTotal / hours) * 100) / 100 : null;

    results.push({
      hcpEmployeeId: empId,
      employeeName: employeeNames.get(empId),
      expectedPay: expectedPayTotal,
      breakdown,
      hoursWorked: Math.round(hours * 100) / 100,
      payTypeLabel,
      effectiveHourlyRate,
    });
  }

  return results;
}
