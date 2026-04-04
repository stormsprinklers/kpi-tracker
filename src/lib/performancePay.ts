import {
  getPerformancePayOrg,
  getPerformancePayConfigs,
  getPerformancePayAssignments,
  getPerformancePayRoles,
  getTimeEntriesByOrganization,
  getEmployeesAndProsForCsrSelector,
  getAssignedGoogleReviewCountsForPeriod,
  getAssignedFiveStarGoogleReviewCountsForPeriod,
  type TimeEntry,
} from "./db/queries";
import { getTechnicianRevenue } from "./metrics/technicianRevenue";
import { getCsrKpiList } from "./metrics/csrKpis";
import { getOrganizationById } from "./db/queries";
import { DEFAULT_PAY_PERIOD_TIMEZONE, getBiweeklyPeriodBounds } from "./payPeriod";

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
  totalRevenue: number;
  reviews: number;
  expectedPay: number;
  breakdown?: Record<string, number>;
  /** Total hours from timesheets in the period. */
  hoursWorked: number;
  /** Human-readable pay structure (hourly vs commission, etc.). */
  payTypeLabel: string;
  /** expectedPay / hoursWorked when hours are logged; otherwise null. */
  effectiveHourlyRate: number | null;
  /** Used to exclude office/CSR pay from labor % of revenue while still listing rows in the expected pay table. */
  structureType: StructureType;
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

/** Compute biweekly period from a date, start weekday, and IANA time zone. Returns [startDate, endDate] in YYYY-MM-DD. */
export function getBiweeklyPeriod(
  fromDate: Date,
  payPeriodStartWeekday: number = 1,
  timeZone: string = DEFAULT_PAY_PERIOD_TIMEZONE
): [string, string] {
  const { startDate, endDate } = getBiweeklyPeriodBounds(
    fromDate,
    payPeriodStartWeekday,
    timeZone
  );
  return [startDate, endDate];
}

const WEEKLY_OT_THRESHOLD_HOURS = 40;
const OT_PREMIUM_MULTIPLIER = 1.5;

function hoursFromTimeEntry(e: TimeEntry): number {
  const fromCol =
    typeof e.hours === "number" && !Number.isNaN(e.hours)
      ? e.hours
      : typeof e.hours === "string"
        ? parseFloat(e.hours) || 0
        : 0;
  if (fromCol > 0) return fromCol;
  if (!e.start_time || !e.end_time || !e.entry_date) return 0;
  const [y, mo, d] = e.entry_date.split("-").map(Number);
  const [sh, sm] = e.start_time.split(":").map(Number);
  const [eh, em] = e.end_time.split(":").map(Number);
  const start = new Date(y, (mo || 1) - 1, d || 1, sh || 0, sm || 0, 0, 0);
  const end = new Date(y, (mo || 1) - 1, d || 1, eh || 0, em || 0, 0, 0);
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
}

/** Monday YYYY-MM-DD of the workweek containing this entry date (local calendar). */
function mondayWeekKeyFromEntryDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((v) => Number(v));
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - daysFromMonday);
  const yy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Straight time up to 40h per week, then 1.5× base for additional hours in that week. */
function hourlyPayWithWeeklyOvertime(
  hoursByWeek: Map<string, number>,
  baseRatePerHour: number
): number {
  let total = 0;
  for (const weekHours of hoursByWeek.values()) {
    const regular = Math.min(weekHours, WEEKLY_OT_THRESHOLD_HOURS);
    const overtime = Math.max(0, weekHours - WEEKLY_OT_THRESHOLD_HOURS);
    total += regular * baseRatePerHour + overtime * baseRatePerHour * OT_PREMIUM_MULTIPLIER;
  }
  return Math.round(total * 100) / 100;
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

  const [ppOrg, configs, assignments, roles] = await Promise.all([
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
  /** empId -> (week Monday YMD -> hours in that week) */
  const hoursByEmployeeWeek = new Map<string, Map<string, number>>();
  for (const e of timeEntries) {
    const h = hoursFromTimeEntry(e);
    if (h <= 0) continue;
    const empId = e.hcp_employee_id;
    hoursByEmployee.set(empId, (hoursByEmployee.get(empId) ?? 0) + h);
    const weekKey = mondayWeekKeyFromEntryDate(e.entry_date);
    let byWeek = hoursByEmployeeWeek.get(empId);
    if (!byWeek) {
      byWeek = new Map<string, number>();
      hoursByEmployeeWeek.set(empId, byWeek);
    }
    byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + h);
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

  const reviewCounts = await getAssignedGoogleReviewCountsForPeriod(
    organizationId,
    targetIds,
    startDate,
    endDate
  ).catch(() => ({} as Record<string, number>));

  const bonusPerFiveStarRaw = ppOrg?.bonus_per_five_star_review;
  const bonusPerFiveStar =
    typeof bonusPerFiveStarRaw === "number" && !Number.isNaN(bonusPerFiveStarRaw) && bonusPerFiveStarRaw > 0
      ? bonusPerFiveStarRaw
      : typeof bonusPerFiveStarRaw === "string" && parseFloat(bonusPerFiveStarRaw) > 0
        ? parseFloat(bonusPerFiveStarRaw)
        : 0;

  const fiveStarReviewCounts =
    bonusPerFiveStar > 0
      ? await getAssignedFiveStarGoogleReviewCountsForPeriod(
          organizationId,
          targetIds,
          startDate,
          endDate
        ).catch(() => ({} as Record<string, number>))
      : {};

  const results: ExpectedPayResult[] = [];

  for (const empId of targetIds) {
    const config = getEffectiveConfig(empId);
    if (!config) continue;

    const hours = hoursByEmployee.get(empId) ?? 0;
    const tech = techByEmployee.get(empId);
    const csr = csrByEmployee.get(empId);
    const revenue = tech?.totalRevenue ?? 0;
    const reviews = reviewCounts[empId.trim()] ?? reviewCounts[empId] ?? 0;
    const fiveStarReviews =
      fiveStarReviewCounts[empId.trim()] ?? fiveStarReviewCounts[empId] ?? 0;
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
        const byWeek = hoursByEmployeeWeek.get(empId) ?? new Map<string, number>();
        const hourlyPay = hourlyPayWithWeeklyOvertime(byWeek, rate);
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

    const fiveStarBonus =
      bonusPerFiveStar > 0
        ? Math.round(fiveStarReviews * bonusPerFiveStar * 100) / 100
        : 0;
    if (fiveStarBonus > 0) {
      breakdown.five_star_review_bonus = fiveStarBonus;
    }

    let bonusTotal = fiveStarBonus;
    for (const b of bonuses) {
      const amt =
        b.type === "5_star_review"
          ? 0
          : b.amount ?? getBonusAmount(b.type, empId, startDate, endDate);
      bonusTotal += amt;
    }
    if (bonusTotal > 0) breakdown.bonuses = bonusTotal;

    const expectedPayTotal = basePay + bonusTotal;
    const effectiveHourlyRate =
      hours > 0 ? Math.round((expectedPayTotal / hours) * 100) / 100 : null;

    results.push({
      hcpEmployeeId: empId,
      employeeName: employeeNames.get(empId),
      totalRevenue: Math.round(revenue * 100) / 100,
      reviews,
      expectedPay: expectedPayTotal,
      breakdown,
      hoursWorked: Math.round(hours * 100) / 100,
      payTypeLabel,
      effectiveHourlyRate,
      structureType: config.structure_type as StructureType,
    });
  }

  return results;
}
