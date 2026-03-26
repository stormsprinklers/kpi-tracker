import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getOrganizationById,
  getEmployeesForSelector,
  upsertImportedTimeEntry,
} from "@/lib/db/queries";

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function parseExportDate(raw: string): string | null {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** POST /api/timesheets/import - Admin CSV import from HCP time card export. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await initSchema();
  const org = await getOrganizationById(session.user.organizationId);
  if (!org?.hcp_company_id) {
    return NextResponse.json({ error: "HCP company not configured" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV appears empty" }, { status: 400 });
  }

  const header = parseCsvLine(lines[0]);
  if (header.length < 3 || normalizeName(header[0]) !== "date") {
    return NextResponse.json({ error: "Unexpected CSV format. First column must be Date." }, { status: 400 });
  }

  const employees = await getEmployeesForSelector(org.hcp_company_id);
  const employeeByName = new Map<string, string>();
  for (const e of employees) {
    employeeByName.set(normalizeName(e.name), e.id);
  }

  const importedAt = new Date().toISOString();
  let importedRows = 0;
  let skippedRows = 0;
  const unmatchedEmployees = new Set<string>();

  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const row = parseCsvLine(lines[rowIdx]);
    const dateIso = parseExportDate(row[0] ?? "");
    if (!dateIso) {
      skippedRows++;
      continue;
    }

    // HCP export: Date, EmpName, EmpName (hours), Emp2, Emp2 (hours), ...
    for (let col = 1; col < header.length; col += 2) {
      const nameHeader = header[col] ?? "";
      const hoursHeader = header[col + 1] ?? "";
      if (!nameHeader || !hoursHeader) continue;
      if (!/\(hours\)\s*$/i.test(hoursHeader)) continue;

      const employeeId = employeeByName.get(normalizeName(nameHeader));
      if (!employeeId) {
        if (nameHeader.trim()) unmatchedEmployees.add(nameHeader.trim());
        continue;
      }

      const decimalHoursRaw = row[col + 1] ?? "";
      if (!decimalHoursRaw || !decimalHoursRaw.trim()) continue;
      const parsed = parseFloat(decimalHoursRaw);
      if (Number.isNaN(parsed)) continue;

      await upsertImportedTimeEntry({
        organization_id: session.user.organizationId,
        hcp_employee_id: employeeId,
        entry_date: dateIso,
        hours: parsed,
        notes: `[Imported CSV] ${importedAt}`,
      });
      importedRows++;
    }
  }

  return NextResponse.json({
    ok: true,
    importedRows,
    skippedRows,
    unmatchedEmployees: Array.from(unmatchedEmployees),
  });
}

