import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getOrganizationById,
  getPerformancePayOrg,
  getPerformancePayRoles,
  getPerformancePayAssignments,
  getPerformancePayConfigs,
  ensureHcpPerformancePayRoles,
  upsertPerformancePayAssignment,
} from "@/lib/db/queries";
import { sql } from "@/lib/db";

const OFFICE_STAFF_ROLES = ["office staff", "office_staff", "officestaff"];

function isOfficeStaff(role: unknown): boolean {
  const r = (role ?? "").toString().toLowerCase().replace(/\s+/g, " ");
  return OFFICE_STAFF_ROLES.some((o) => r === o || (r.includes("office") && r.includes("staff")));
}

/** GET /api/performance-pay/setup - Setup state, roles, assignments, configs (admin only). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await initSchema();
  const orgId = session.user.organizationId;
  const org = await getOrganizationById(orgId);
  const companyId = org?.hcp_company_id ?? "default";

  const roles = await ensureHcpPerformancePayRoles(orgId);
  const ppOrg = await getPerformancePayOrg(orgId);
  const [assignments, configs, empRows, proRows] = await Promise.all([
    getPerformancePayAssignments(orgId),
    getPerformancePayConfigs(orgId),
    sql`SELECT hcp_id, raw FROM employees WHERE company_id = ${companyId}`,
    sql`SELECT hcp_id, raw FROM pros WHERE company_id = ${companyId}`,
  ]);

  const employeesWithHcpRole: { id: string; name: string; hcpRole: "technician" | "office_staff" }[] = [];
  const seen = new Set<string>();

  const addEmployee = (
    hcpId: string,
    raw: Record<string, unknown>,
    hcpRole: "technician" | "office_staff"
  ) => {
    if (seen.has(hcpId)) return;
    seen.add(hcpId);
    const first = String(raw.first_name ?? raw.firstName ?? "").trim();
    const last = String(raw.last_name ?? raw.lastName ?? "").trim();
    const name =
      [first, last].filter(Boolean).join(" ").trim() ||
      String(raw.email ?? raw.email_address ?? hcpId);
    employeesWithHcpRole.push({ id: hcpId, name, hcpRole });
  };

  for (const row of empRows.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const raw = r.raw ?? {};
    const hcpRole = isOfficeStaff(raw.role ?? raw.employee_type ?? raw.type)
      ? "office_staff"
      : "technician";
    addEmployee(r.hcp_id, raw, hcpRole);
  }
  for (const row of proRows.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const raw = r.raw ?? {};
    const hcpRole = isOfficeStaff(raw.role ?? raw.employee_type ?? raw.type)
      ? "office_staff"
      : "technician";
    addEmployee(r.hcp_id, raw, hcpRole);
  }

  const technicianRole = roles.find(
    (r) => r.source === "hcp" && r.name.toLowerCase() === "technician"
  );
  const officeStaffRole = roles.find(
    (r) => r.source === "hcp" && r.name.toLowerCase() === "office staff"
  );

  for (const emp of employeesWithHcpRole) {
    const existing = assignments.find((a) => a.hcp_employee_id === emp.id);
    if (existing?.overridden) continue;
    const roleId = emp.hcpRole === "technician" ? technicianRole?.id ?? null : officeStaffRole?.id ?? null;
    await upsertPerformancePayAssignment(orgId, emp.id, {
      role_id: roleId,
      overridden: false,
    });
  }

  const assignmentsUpdated = await getPerformancePayAssignments(orgId);

  return NextResponse.json({
    org: ppOrg ?? {
      organization_id: orgId,
      setup_completed: false,
      pay_period_start_weekday: 1,
      updated_at: new Date().toISOString(),
    },
    roles,
    assignments: assignmentsUpdated,
    configs,
    employees: employeesWithHcpRole.sort((a, b) => a.name.localeCompare(b.name)),
    hcpRoleIds: {
      technician: technicianRole?.id ?? null,
      officeStaff: officeStaffRole?.id ?? null,
    },
  });
}
