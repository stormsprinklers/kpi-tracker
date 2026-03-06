import { getJobsAllPages, getJobInvoices, getEmployees, getPros } from "../housecallpro";

export interface TechnicianRevenue {
  technicianId: string;
  technicianName: string;
  totalRevenue: number;
}

export interface TechnicianRevenueResult {
  technicians: TechnicianRevenue[];
  totalRevenue: number;
}

// Flexible field extraction - Jobs may use assigned_pro, pro_id, assigned_employee, employee_id, etc.
function getTechnicianId(job: Record<string, unknown>): string | null {
  const assigned =
    job.assigned_pro ??
    job.pro_id ??
    job.pro ??
    job.assigned_employee ??
    job.employee_id ??
    job.assigned_pro_id;
  if (typeof assigned === "string") return assigned;
  if (assigned && typeof assigned === "object" && "id" in assigned) {
    return String((assigned as { id: unknown }).id);
  }
  return null;
}

function getPaidAmountFromJob(job: Record<string, unknown>): number {
  const val =
    job.amount_paid ??
    job.total_paid ??
    job.total ??
    job.paid_amount ??
    job.revenue;
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}

function getPaidAmountFromInvoice(inv: Record<string, unknown>): number {
  const val =
    inv.paid_amount ??
    inv.amount_paid ??
    inv.total ??
    inv.paid_total;
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}

function isPaidOrCompleted(job: Record<string, unknown>): boolean {
  const status = (job.status ?? job.job_status ?? "").toString().toLowerCase();
  return (
    status === "paid" ||
    status === "completed" ||
    status === "complete" ||
    status === "closed"
  );
}

function buildNameMap(
  items: unknown[],
  idFields: string[],
  nameFields: string[][]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const r = item as Record<string, unknown>;
    const id = idFields.map((f) => r[f]).find(Boolean);
    if (!id) continue;
    const idStr = String(id);
    const part1 = nameFields.flatMap((fields) => fields.map((f) => r[f])).find(Boolean);
    const part2 = [r.first_name, r.last_name].filter(Boolean).join(" ");
    const name = (part1 ?? part2 ?? "Unknown") as string;
    map.set(idStr, String(name));
  }
  return map;
}

export async function getTechnicianRevenue(): Promise<TechnicianRevenueResult> {
  const nameMap = new Map<string, string>();

  try {
    const employeesRes = await getEmployees();
    const employeesList =
      Array.isArray(employeesRes) ? employeesRes : employeesRes?.employees ?? employeesRes?.data ?? [];
    const empMap = buildNameMap(
      employeesList,
      ["id", "employee_id", "pro_id"],
      [["name", "display_name"], ["first_name", "last_name"]]
    );
    empMap.forEach((v, k) => nameMap.set(k, v));
  } catch {
    // Employees endpoint may not exist
  }

  if (nameMap.size === 0) {
    try {
      const prosRes = await getPros();
      const prosList = Array.isArray(prosRes) ? prosRes : prosRes?.pros ?? prosRes?.data ?? [];
      const proMap = buildNameMap(
        prosList,
        ["id", "pro_id"],
        [["name", "display_name"], ["first_name", "last_name"]]
      );
      proMap.forEach((v, k) => nameMap.set(k, v));
    } catch {
      // Pros endpoint may not exist; we'll use IDs as fallback
    }
  }

  const revenueByTech = new Map<string, number>();

  const jobs = await getJobsAllPages();

  for (const job of jobs) {
    const j = job as Record<string, unknown>;
    // Include paid/completed jobs; also check invoices for jobs without job-level amount
    if (!isPaidOrCompleted(j)) continue;

    const techId = getTechnicianId(j);
    if (!techId) continue;

    let paidAmount = getPaidAmountFromJob(j);

    if (paidAmount <= 0 && j.id) {
      try {
        const invoices = await getJobInvoices(String(j.id));
        const invList = Array.isArray(invoices) ? invoices : invoices?.invoices ?? invoices?.data ?? [];
        for (const inv of invList) {
          paidAmount += getPaidAmountFromInvoice(inv as Record<string, unknown>);
        }
      } catch {
        // Skip if invoices fail
      }
    }

    if (paidAmount > 0) {
      const current = revenueByTech.get(techId) ?? 0;
      revenueByTech.set(techId, current + paidAmount);
    }
  }

  const technicians: TechnicianRevenue[] = Array.from(revenueByTech.entries())
    .map(([id, totalRevenue]) => ({
      technicianId: id,
      technicianName: nameMap.get(id) ?? `Technician ${id}`,
      totalRevenue,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totalRevenue = technicians.reduce((sum, t) => sum + t.totalRevenue, 0);

  return { technicians, totalRevenue };
}
