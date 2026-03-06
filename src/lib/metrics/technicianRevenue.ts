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

/** HCP sends amounts in cents. Convert to dollars when value looks like cents (defensive for bad data). */
function toDollars(value: unknown): number {
  const n = typeof value === "number" && !Number.isNaN(value) ? value : typeof value === "string" ? parseFloat(value) || 0 : 0;
  if (n <= 0) return 0;
  // Defensive: integers > 3k are likely cents (HCP format; $30+ as integer = cents)
  if (Number.isInteger(n) && n > 3000) return n / 100;
  return n;
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
  let totalNum = toDollars(total);
  if (totalNum <= 0) {
    const cents = job.amount_cents ?? job.total_cents ?? totals?.amount_cents;
    if (typeof cents === "number" && cents > 0) totalNum = cents / 100;
  }
  // Last-resort: HCP amounts are cents; values > 10000 are almost certainly cents (no single job is $10k+ in raw units)
  if (Number.isInteger(totalNum) && totalNum > 3000) totalNum = totalNum / 100;
  const outNum = toDollars(outstanding);
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
  // HCP invoices: prefer amount_cents when present (explicit cents)
  const cents = (inv as Record<string, unknown>).amount_cents ?? (inv as Record<string, unknown>).paid_cents;
  if (typeof cents === "number" && cents > 0) return cents / 100;
  const n = typeof val === "number" && !Number.isNaN(val) ? val : typeof val === "string" ? parseFloat(val) || 0 : 0;
  if (n <= 0) return 0;
  // Defensive: large integers likely cents (HCP format)
  if (Number.isInteger(n) && n > 3000) return n / 100;
  return n;
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

/** Extract name from assigned employee/pro object. HCP embeds first_name, last_name, name, etc. */
function getNameFromAssigned(r: Record<string, unknown>): string | null {
  const name = r.name ?? r.display_name;
  if (name && typeof name === "string") return name.trim() || null;
  const first = r.first_name ?? r.given_name;
  const last = r.last_name ?? r.family_name;
  const full = [first, last].filter(Boolean).map(String).join(" ").trim();
  return full || null;
}

/** Merge names from job's assigned_employees/assigned_pro into nameMap (for former employees not in pros/employees). */
function mergeNamesFromJob(nameMap: Map<string, string>, job: Record<string, unknown>): void {
  const assigned = job.assigned_employees ?? job.assigned_pro ?? job.assigned_employee;
  const items = Array.isArray(assigned) ? assigned : assigned && typeof assigned === "object" ? [assigned] : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = r.id ?? r.pro_id ?? r.employee_id;
    if (!id) continue;
    const idStr = String(id);
    if (nameMap.has(idStr)) continue;
    const name = getNameFromAssigned(r);
    if (name) nameMap.set(idStr, name);
  }
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
  let jobsFromApi = false;
  try {
    jobs = await getJobsFromDb(companyId);
  } catch {
    /* skip */
  }
  if (jobs.length === 0) {
    try {
      jobs = await getJobsAllPages();
      jobsFromApi = true;
    } catch {
      /* skip */
    }
  }

  // HCP API returns amounts in cents; normalize to dollars when using API data
  if (jobsFromApi) {
    jobs = (jobs as Record<string, unknown>[]).map((j) => {
      const copy = { ...j };
      const totalCents = j.total_amount ?? j.subtotal ?? j.total;
      const outCents = j.outstanding_balance ?? j.balance_due ?? j.amount_due ?? 0;
      if (typeof totalCents === "number" && !Number.isNaN(totalCents)) copy.total_amount = totalCents / 100;
      if (typeof outCents === "number" && !Number.isNaN(outCents)) copy.outstanding_balance = outCents / 100;
      else copy.outstanding_balance = 0;
      return copy;
    });
  }

  for (const job of jobs) {
    const j = job as Record<string, unknown>;
    mergeNamesFromJob(nameMap, j);
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
      technicianName: nameMap.get(id) ?? (id.startsWith("pro_") || id.startsWith("emp_") ? "Former technician" : `Technician ${id}`),
      totalRevenue,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totalRevenue = technicians.reduce((sum, t) => sum + t.totalRevenue, 0);

  return { technicians, totalRevenue };
}
