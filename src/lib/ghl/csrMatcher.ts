import { sql } from "@/lib/db";

const OFFICE_STAFF_ROLES = ["office staff", "office_staff", "officestaff"];

function isOfficeStaff(role: unknown): boolean {
  const r = (role ?? "").toString().toLowerCase().replace(/\s+/g, " ");
  return OFFICE_STAFF_ROLES.some((o) => r === o || (r.includes("office") && r.includes("staff")));
}

export interface CsrMatchResult {
  hcp_employee_id: string | null;
  csr_first_name_raw: string;
}

/**
 * Match CSR first name (lowercase from GHL) to employees and pros.
 * Prefers office staff when multiple matches exist.
 */
export async function matchCsrByFirstName(
  companyId: string,
  csrFirstnameLower: string
): Promise<CsrMatchResult> {
  const normalized = csrFirstnameLower?.toString().toLowerCase().trim() || "";

  type Row = { hcp_id: string; raw: Record<string, unknown>; source: "employee" | "pro" };
  const candidates: Row[] = [];

  const empResult = await sql`
    SELECT hcp_id, raw FROM employees
    WHERE company_id = ${companyId}
  `;
  for (const row of empResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const first = String(r.raw?.first_name ?? r.raw?.firstName ?? "").toLowerCase().trim();
    if (first === normalized) {
      candidates.push({ ...r, source: "employee" });
    }
  }

  const prosResult = await sql`
    SELECT hcp_id, raw FROM pros
    WHERE company_id = ${companyId}
  `;
  for (const row of prosResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const first = String(r.raw?.first_name ?? r.raw?.firstName ?? "").toLowerCase().trim();
    if (first === normalized) {
      candidates.push({ ...r, source: "pro" });
    }
  }

  if (candidates.length === 0) {
    return { hcp_employee_id: null, csr_first_name_raw: normalized || csrFirstnameLower };
  }

  if (candidates.length === 1) {
    return { hcp_employee_id: candidates[0].hcp_id, csr_first_name_raw: normalized || csrFirstnameLower };
  }

  const officeStaff = candidates.filter((c) =>
    isOfficeStaff(c.raw?.role ?? c.raw?.employee_type ?? c.raw?.type)
  );
  if (officeStaff.length === 1) {
    return { hcp_employee_id: officeStaff[0].hcp_id, csr_first_name_raw: normalized || csrFirstnameLower };
  }
  if (officeStaff.length > 1) {
    console.warn("[GHL] Multiple office staff match for CSR:", normalized, "using first");
    return { hcp_employee_id: officeStaff[0].hcp_id, csr_first_name_raw: normalized || csrFirstnameLower };
  }

  return { hcp_employee_id: candidates[0].hcp_id, csr_first_name_raw: normalized || csrFirstnameLower };
}
