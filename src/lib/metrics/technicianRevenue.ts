import { getJobsAllPages, getJobInvoices, getEmployeesAllPages, getPros, getCompany } from "../housecallpro";
import { getJobsFromDb, getEmployeesFromDb, getInvoicesFromDb, getProsFromDb } from "../db/queries";

export interface TechnicianRevenue {
  technicianId: string;
  technicianName: string;
  totalRevenue: number;
}

export interface TechnicianRevenueResult {
  technicians: TechnicianRevenue[];
  totalRevenue: number;
}

// HCP API uses assigned_employees (array). Fallback to assigned_pro, pro_id, etc.
function getTechnicianIds(job: Record<string, unknown>): string[] {
  const assigned = job.assigned_employees ?? job.assigned_pro ?? job.pro_id ?? job.pro ?? job.assigned_employee ?? job.employee_id ?? job.assigned_pro_id;
  if (Array.isArray(assigned) && assigned.length > 0) {
    return assigned
      .map((a) => (typeof a === "object" && a && "id" in a ? String((a as { id: unknown }).id) : typeof a === "string" ? a : null))
      .filter((id): id is string => !!id);
  }
  if (typeof assigned === "string") return [assigned];
  if (assigned && typeof assigned === "object" && "id" in assigned) {
    return [String((assigned as { id: unknown }).id)];
  }
  return [];
}

function getPaidAmountFromJob(job: Record<string, unknown>): number {
  // HCP may use various field names; also check nested totals/financial
  const totals = job.totals as Record<string, unknown> | undefined;
  const financial = job.financial as Record<string, unknown> | undefined;
  const total =
    job.total_amount ??
    job.amount_paid ??
    job.total_paid ??
    job.total ??
    job.paid_amount ??
    job.revenue ??
    totals?.total_amount ??
    totals?.total ??
    financial?.total_amount ??
    financial?.paid_amount;
  const outstanding =
    job.outstanding_balance ??
    job.balance_due ??
    job.amount_due ??
    totals?.outstanding_balance ??
    financial?.outstanding_balance ??
    0;
  let totalNum = typeof total === "number" && !Number.isNaN(total) ? total : typeof total === "string" ? parseFloat(total) || 0 : 0;
  if (totalNum <= 0) {
    const cents = job.amount_cents ?? job.total_cents ?? totals?.amount_cents;
    if (typeof cents === "number" && cents > 0) totalNum = cents / 100;
  }
  const outNum = typeof outstanding === "number" && !Number.isNaN(outstanding) ? outstanding : typeof outstanding === "string" ? parseFloat(outstanding) || 0 : 0;
  return Math.max(0, totalNum - outNum) || totalNum;
}

function getPaidAmountFromInvoice(inv: Record<string, unknown>): number {
  const val =
    inv.paid_amount ??
    inv.amount_paid ??
    inv.total ??
    inv.paid_total ??
    inv.amount ??
    (inv as Record<string, unknown>).total_amount;
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  const cents = (inv as Record<string, unknown>).amount_cents ?? (inv as Record<string, unknown>).paid_cents;
  if (typeof cents === "number" && cents > 0) return cents / 100;
  return 0;
}

function isPaidOrCompleted(job: Record<string, unknown>): boolean {
  const status = (job.status ?? job.job_status ?? job.work_status ?? job.state ?? "").toString().toLowerCase();
  return (
    status === "paid" ||
    status === "completed" ||
    status === "complete" ||
    status === "closed" ||
    status === "done" ||
    status === "paid_in_full" ||
    status === "invoiced" ||
    status === "finished"
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
  let companyId = "default";

  try {
    const company = (await getCompany()) as { id?: string };
    companyId = company?.id ?? "default";
  } catch {
    // Fall through to API
  }

  // Build employee name map (from DB first, then API)
  try {
    const employeesList = await getEmployeesFromDb(companyId);
    const empMap = buildNameMap(
      employeesList,
      ["id", "employee_id", "pro_id"],
      [["name", "display_name"], ["first_name", "last_name"]]
    );
    empMap.forEach((v, k) => nameMap.set(k, v));
  } catch {
    /* skip */
  }

  if (nameMap.size === 0) {
    try {
      const employeesList = await getEmployeesAllPages();
      const empMap = buildNameMap(
        employeesList,
        ["id", "employee_id", "pro_id"],
        [["name", "display_name"], ["first_name", "last_name"]]
      );
      empMap.forEach((v, k) => nameMap.set(k, v));
    } catch {
      /* skip */
    }
  }

  // Always merge pros into name map (jobs use assigned_pro with pro_xxx IDs; former pros may not be in employees)
  try {
    const prosList = await getProsFromDb(companyId);
    const proMap = buildNameMap(
      prosList,
      ["id", "pro_id"],
      [["name", "display_name"], ["first_name", "last_name"]]
    );
    proMap.forEach((v, k) => nameMap.set(k, v));
  } catch {
    /* skip */
  }
  try {
    const prosRes = await getPros();
    const prosList = Array.isArray(prosRes) ? prosRes : (prosRes as { pros?: unknown[] })?.pros ?? (prosRes as { data?: unknown[] })?.data ?? [];
    const proMap = buildNameMap(
      prosList,
      ["id", "pro_id"],
      [["name", "display_name"], ["first_name", "last_name"]]
    );
    proMap.forEach((v, k) => nameMap.set(k, v));
  } catch {
    /* skip */
  }

  const revenueByTech = new Map<string, number>();

  // Prefer DB for jobs; fall back to API if empty
  let jobs: unknown[] = [];
  try {
    jobs = await getJobsFromDb(companyId);
  } catch {
    /* skip */
  }
  if (jobs.length === 0) {
    try {
      jobs = await getJobsAllPages();
    } catch {
      /* skip */
    }
  }

  for (const job of jobs) {
    const j = job as Record<string, unknown>;
    const techIds = getTechnicianIds(j);
    if (techIds.length === 0) continue;

    const isPaid = isPaidOrCompleted(j);
    let paidAmount = isPaid ? getPaidAmountFromJob(j) : 0;
    // Fall back to invoices when job amount is 0 (HCP may use different status/amount fields)
    if (paidAmount <= 0 && j.id) {
      try {
        const invoices = await getInvoicesFromDb(companyId, String(j.id));
        for (const inv of invoices) {
          paidAmount += getPaidAmountFromInvoice(inv as Record<string, unknown>);
        }
      } catch {
        /* skip */
      }
      if (paidAmount <= 0) {
        try {
          const invoices = await getJobInvoices(String(j.id));
          const invList = Array.isArray(invoices) ? invoices : (invoices as { invoices?: unknown[] })?.invoices ?? (invoices as { data?: unknown[] })?.data ?? [];
          for (const inv of invList) {
            paidAmount += getPaidAmountFromInvoice(inv as Record<string, unknown>);
          }
        } catch {
          /* skip */
        }
      }
    }

    const amountPerTech = paidAmount / techIds.length;
    for (const techId of techIds) {
      const current = revenueByTech.get(techId) ?? 0;
      revenueByTech.set(techId, current + amountPerTech);
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
