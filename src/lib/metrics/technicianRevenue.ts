import { getJobsAllPages, getJobInvoices, getPros } from "../housecallpro";

export interface TechnicianRevenue {
  technicianId: string;
  technicianName: string;
  totalRevenue: number;
}

export interface TechnicianRevenueResult {
  technicians: TechnicianRevenue[];
  totalRevenue: number;
}

// Flexible field extraction for API response discovery
function getTechnicianId(job: Record<string, unknown>): string | null {
  const pro = job.assigned_pro ?? job.pro_id ?? job.pro;
  if (typeof pro === "string") return pro;
  if (pro && typeof pro === "object" && "id" in pro) {
    return String((pro as { id: unknown }).id);
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

export async function getTechnicianRevenue(): Promise<TechnicianRevenueResult> {
  const prosMap = new Map<string, string>();

  try {
    const prosRes = await getPros();
    const prosList = Array.isArray(prosRes) ? prosRes : prosRes?.pros ?? prosRes?.data ?? [];
    for (const p of prosList) {
      const pro = p as Record<string, unknown>;
      const id = String(pro.id ?? pro.pro_id ?? "");
      const part1 = [pro.name, pro.display_name].filter(Boolean)[0];
      const part2 = [pro.first_name, pro.last_name].filter(Boolean).join(" ");
      const name = (part1 ?? part2 ?? "Unknown") as string;
      if (id) prosMap.set(id, String(name));
    }
  } catch {
    // Pros endpoint may not exist; we'll use IDs as fallback
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
      technicianName: prosMap.get(id) ?? `Technician ${id}`,
      totalRevenue,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totalRevenue = technicians.reduce((sum, t) => sum + t.totalRevenue, 0);

  return { technicians, totalRevenue };
}
