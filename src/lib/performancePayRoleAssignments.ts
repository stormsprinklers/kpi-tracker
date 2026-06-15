import {
  ensureHcpPerformancePayRoles,
  getPerformancePayAssignments,
  upsertPerformancePayAssignment,
  getOrganizationById,
} from "@/lib/db/queries";
import { sql } from "@/lib/db";

const OFFICE_STAFF_ROLES = ["office staff", "office_staff", "officestaff"];

function isOfficeStaff(role: unknown): boolean {
  const r = (role ?? "").toString().toLowerCase().replace(/\s+/g, " ");
  return OFFICE_STAFF_ROLES.some((o) => r === o || (r.includes("office") && r.includes("staff")));
}

/**
 * Map synced HCP employees/pros to performance pay roles (Technician, Office Staff, Salesperson).
 * Skips rows with overridden assignments. Safe to call after employee sync or before pay calc.
 */
export async function ensurePerformancePayRoleAssignments(organizationId: string): Promise<void> {
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id?.trim();
  if (!companyId) return;

  const roles = await ensureHcpPerformancePayRoles(organizationId);
  const [assignments, empRows, proRows, salesmanRows] = await Promise.all([
    getPerformancePayAssignments(organizationId),
    sql`SELECT hcp_id, raw FROM employees WHERE company_id = ${companyId}`,
    sql`SELECT hcp_id, raw FROM pros WHERE company_id = ${companyId}`,
    sql`
      SELECT hcp_employee_id
      FROM users
      WHERE organization_id = ${organizationId}::uuid
        AND role = 'salesman'
        AND hcp_employee_id IS NOT NULL
        AND TRIM(hcp_employee_id) <> ''
    `,
  ]);

  type HcpRosterEntry = { id: string; hcpRole: "technician" | "office_staff" };
  const roster: HcpRosterEntry[] = [];
  const seen = new Set<string>();

  function addEntry(hcpIdRaw: string, raw: Record<string, unknown>) {
    const hcpId = String(hcpIdRaw ?? "").trim();
    if (!hcpId || seen.has(hcpId)) return;
    seen.add(hcpId);
    const hcpRole = isOfficeStaff(raw.role ?? raw.employee_type ?? raw.type)
      ? "office_staff"
      : "technician";
    roster.push({ id: hcpId, hcpRole });
  }

  for (const row of empRows.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    addEntry(r.hcp_id, r.raw ?? {});
  }
  for (const row of proRows.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    addEntry(r.hcp_id, r.raw ?? {});
  }

  const technicianRole = roles.find(
    (r) => r.source === "hcp" && r.name.toLowerCase() === "technician"
  );
  const officeStaffRole = roles.find(
    (r) => r.source === "hcp" && r.name.toLowerCase() === "office staff"
  );
  const salespersonRole = roles.find((r) => r.name.toLowerCase() === "salesperson");

  const salesmanIdSet = new Set(
    (salesmanRows.rows ?? [])
      .map((r) => String((r as { hcp_employee_id: string }).hcp_employee_id ?? "").trim())
      .filter(Boolean)
  );

  for (const emp of roster) {
    const existing = assignments.find((a) => a.hcp_employee_id.trim() === emp.id);
    if (existing?.overridden) continue;

    if (salesmanIdSet.has(emp.id)) {
      await upsertPerformancePayAssignment(organizationId, emp.id, {
        role_id: salespersonRole?.id ?? null,
        overridden: false,
      });
      continue;
    }

    const roleId =
      emp.hcpRole === "technician" ? technicianRole?.id ?? null : officeStaffRole?.id ?? null;
    await upsertPerformancePayAssignment(organizationId, emp.id, {
      role_id: roleId,
      overridden: false,
    });
  }
}
