import { getEstimatesFromDb, getOrganizationById } from "@/lib/db/queries";

export interface SalesmanMetrics {
  totalSales: number;
  conversionRate: number | null;
  averageTicket: number | null;
  estimatesGiven: number;
}

function toDollars(value: unknown): number {
  const n =
    typeof value === "number" && !Number.isNaN(value)
      ? value
      : typeof value === "string"
        ? parseFloat(value) || 0
        : 0;
  if (n <= 0) return 0;
  if (Number.isInteger(n) && n > 3000) return n / 100;
  return n;
}

function estimateDate(estimate: Record<string, unknown>): Date | null {
  const wt = estimate.work_timestamps as Record<string, unknown> | undefined;
  const sched = estimate.schedule as Record<string, unknown> | undefined;
  const completed = wt?.completed_at ?? wt?.completed;
  const scheduled = sched?.scheduled_start ?? sched?.scheduledStart ?? estimate.scheduled_start;
  const created = estimate.created_at ?? estimate.createdAt;
  const updated = estimate.updated_at ?? estimate.updatedAt;
  const dateStr = (completed ?? scheduled ?? created ?? updated) as string | undefined;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function estimateInRange(
  estimate: Record<string, unknown>,
  startDate: string | null,
  endDate: string | null
): boolean {
  if (!startDate || !endDate) return true;
  const d = estimateDate(estimate);
  if (!d) return true;
  const ymd = d.toISOString().slice(0, 10);
  return ymd >= startDate && ymd <= endDate;
}

function normalizedId(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function addMaybeId(set: Set<string>, value: unknown): void {
  const id = normalizedId(value);
  if (id) set.add(id);
}

function addMaybeIds(set: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      addMaybeId(set, rec.id ?? rec.hcp_id ?? rec.employee_id ?? rec.pro_id);
    } else {
      addMaybeId(set, item);
    }
  }
}

function estimateSalespersonIds(estimate: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  addMaybeId(ids, estimate.employee_id);
  addMaybeId(ids, estimate.hcp_employee_id);
  addMaybeId(ids, estimate.pro_id);
  addMaybeId(ids, estimate.salesperson_id);
  addMaybeId(ids, estimate.sales_rep_id);
  addMaybeId(ids, estimate.sold_by_id);
  addMaybeId(ids, estimate.technician_id);

  addMaybeIds(ids, estimate.employee_ids);
  addMaybeIds(ids, estimate.hcp_employee_ids);
  addMaybeIds(ids, estimate.pro_ids);
  addMaybeIds(ids, estimate.assigned_employee_ids);
  addMaybeIds(ids, estimate.technician_ids);
  addMaybeIds(ids, estimate.employees);
  addMaybeIds(ids, estimate.pros);

  const createdBy = estimate.created_by as Record<string, unknown> | undefined;
  addMaybeId(ids, createdBy?.id ?? createdBy?.employee_id ?? createdBy?.hcp_employee_id);

  const soldBy = estimate.sold_by as Record<string, unknown> | undefined;
  addMaybeId(ids, soldBy?.id ?? soldBy?.employee_id ?? soldBy?.hcp_employee_id);

  const salesRep = estimate.sales_rep as Record<string, unknown> | undefined;
  addMaybeId(ids, salesRep?.id ?? salesRep?.employee_id ?? salesRep?.hcp_employee_id);

  const employee = estimate.employee as Record<string, unknown> | undefined;
  addMaybeId(ids, employee?.id ?? employee?.employee_id ?? employee?.hcp_employee_id);

  const pro = estimate.pro as Record<string, unknown> | undefined;
  addMaybeId(ids, pro?.id ?? pro?.pro_id ?? pro?.hcp_employee_id);

  const assignedEmployee = estimate.assigned_employee as Record<string, unknown> | undefined;
  addMaybeId(
    ids,
    assignedEmployee?.id ?? assignedEmployee?.employee_id ?? assignedEmployee?.hcp_employee_id
  );

  return ids;
}

function isApprovedStatus(value: unknown): boolean {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "approved" || s === "pro approved" || s === "won";
}

function approvedEstimateAmount(estimate: Record<string, unknown>): number {
  const options = estimate.options as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(options) && options.length > 0) {
    let sum = 0;
    for (const opt of options) {
      if (!isApprovedStatus(opt.approval_status)) continue;
      const amount =
        opt.total_amount ??
        opt.amount ??
        opt.price ??
        opt.subtotal ??
        opt.total ??
        opt.option_total;
      sum += toDollars(amount);
    }
    if (sum > 0) return sum;
  }

  if (isApprovedStatus(estimate.approval_status ?? estimate.status)) {
    return toDollars(
      estimate.total_amount ??
        estimate.amount ??
        estimate.price ??
        estimate.subtotal ??
        estimate.total
    );
  }

  return 0;
}

export async function getSalesmanMetrics(
  organizationId: string,
  hcpEmployeeId: string,
  range: { startDate: string | null; endDate: string | null }
): Promise<SalesmanMetrics> {
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id?.trim() || "";
  if (!companyId) {
    return { totalSales: 0, conversionRate: null, averageTicket: null, estimatesGiven: 0 };
  }

  const estimates = await getEstimatesFromDb(companyId);
  let estimatesGiven = 0;
  let approvedCount = 0;
  let totalSales = 0;

  for (const estimate of estimates) {
    if (!estimateInRange(estimate, range.startDate, range.endDate)) continue;
    const salespersonIds = estimateSalespersonIds(estimate);
    if (!salespersonIds.has(hcpEmployeeId)) continue;

    estimatesGiven += 1;
    const approvedAmount = approvedEstimateAmount(estimate);
    if (approvedAmount > 0) {
      approvedCount += 1;
      totalSales += approvedAmount;
    }
  }

  const conversionRate = estimatesGiven > 0 ? (approvedCount / estimatesGiven) * 100 : null;
  const averageTicket = approvedCount > 0 ? totalSales / approvedCount : null;

  return {
    totalSales: Math.round(totalSales * 100) / 100,
    conversionRate,
    averageTicket: averageTicket == null ? null : Math.round(averageTicket * 100) / 100,
    estimatesGiven,
  };
}
