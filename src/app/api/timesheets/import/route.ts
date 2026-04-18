import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getOrganizationById,
  getEmployeesForSelector,
  getTimesheetImportNameMappings,
  upsertImportedTimeEntry,
} from "@/lib/db/queries";
import {
  detectTimesheetCsvFormat,
  findHeaderColumn,
  normalizeCsvPersonName,
  parseCsv,
  parseLegacyExportDate,
  parseUsDateToIso,
} from "@/lib/timesheetImportCsv";

function normalizeName(s: string): string {
  return normalizeCsvPersonName(s);
}

/** POST /api/timesheets/import - Admin CSV import from HCP time card export (legacy wide) or time tracking export (row-based). */
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
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return NextResponse.json({ error: "CSV appears empty" }, { status: 400 });
  }

  const header = rows[0] ?? [];
  const fmt = detectTimesheetCsvFormat(header);
  if (fmt === "unknown") {
    return NextResponse.json(
      {
        error:
          "Unexpected CSV format. Use the Housecall Pro time tracking export (Employee Name, Date, Total Hours, …) or the legacy export whose first column is Date.",
      },
      { status: 400 }
    );
  }

  const employees = await getEmployeesForSelector(org.hcp_company_id);
  const employeeByName = new Map<string, string>();
  for (const e of employees) {
    employeeByName.set(normalizeName(e.name), e.id);
  }
  const mappings = await getTimesheetImportNameMappings(session.user.organizationId);
  const mappedEmployeeByCsvName = new Map<string, string>();
  for (const m of mappings) {
    mappedEmployeeByCsvName.set(normalizeName(m.csv_name), m.hcp_employee_id);
  }

  const importedAt = new Date().toISOString();
  let importedRows = 0;
  let skippedRows = 0;
  const unmatchedEmployees = new Set<string>();

  const resolveEmployeeId = (displayName: string): string | null => {
    const key = normalizeName(displayName);
    return mappedEmployeeByCsvName.get(key) ?? employeeByName.get(key) ?? null;
  };

  if (fmt === "hcp_time_tracking") {
    const idxEmp = findHeaderColumn(header, "employee name");
    const idxDate = findHeaderColumn(header, "date");
    const idxTotal = findHeaderColumn(header, "total hours");
    if (idxDate < 0 || idxTotal < 0) {
      return NextResponse.json(
        { error: "CSV is missing required columns Date and/or Total Hours." },
        { status: 400 }
      );
    }
    const idxName = idxEmp >= 0 ? idxEmp : 0;

    let currentEmployeeName: string | null = null;

    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx] ?? [];
      const nameCell = (row[idxName] ?? "").trim();
      const t0 = normalizeName(nameCell);
      if (t0 === "employee total" || t0 === "grand total") {
        continue;
      }
      if (nameCell) {
        currentEmployeeName = nameCell;
      }
      if (!currentEmployeeName) {
        skippedRows++;
        continue;
      }

      const dateRaw = row[idxDate] ?? "";
      const dateIso = parseUsDateToIso(dateRaw) ?? parseLegacyExportDate(dateRaw);
      if (!dateIso) {
        skippedRows++;
        continue;
      }

      const hoursRaw = (row[idxTotal] ?? "").trim();
      if (!hoursRaw) continue;

      const parsed = parseFloat(hoursRaw.replace(/,/g, ""));
      if (Number.isNaN(parsed)) continue;

      const employeeId = resolveEmployeeId(currentEmployeeName);
      if (!employeeId) {
        unmatchedEmployees.add(currentEmployeeName);
        continue;
      }

      await upsertImportedTimeEntry({
        organization_id: session.user.organizationId,
        hcp_employee_id: employeeId,
        entry_date: dateIso,
        hours: parsed,
        notes: `[Imported CSV] ${importedAt}`,
      });
      importedRows++;
    }
  } else {
    // legacy_wide: Date, EmpName, EmpName (hours), ...
    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const dateIso = parseLegacyExportDate(row[0] ?? "");
      if (!dateIso) {
        skippedRows++;
        continue;
      }

      for (let col = 1; col < header.length; col += 2) {
        const nameHeader = header[col] ?? "";
        const hoursHeader = header[col + 1] ?? "";
        if (!nameHeader || !hoursHeader) continue;
        if (!/\(hours\)\s*$/i.test(hoursHeader)) continue;

        const normalizedHeader = normalizeName(nameHeader);
        const employeeId =
          mappedEmployeeByCsvName.get(normalizedHeader) ?? employeeByName.get(normalizedHeader);
        if (!employeeId) {
          if (nameHeader.trim()) unmatchedEmployees.add(nameHeader.trim());
          continue;
        }

        const decimalHoursRaw = row[col + 1] ?? "";
        if (!decimalHoursRaw || !decimalHoursRaw.trim()) continue;
        const parsed = parseFloat(decimalHoursRaw.replace(/,/g, ""));
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
  }

  return NextResponse.json({
    ok: true,
    importedRows,
    skippedRows,
    unmatchedEmployees: Array.from(unmatchedEmployees),
    format: fmt,
  });
}
