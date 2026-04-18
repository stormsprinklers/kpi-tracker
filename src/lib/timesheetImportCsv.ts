/** Parse Housecall Pro / generic CSV including quoted fields with embedded newlines. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }

  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);

  return rows.map((r) => r.map((c) => c.trim()));
}

export function normalizeCsvPersonName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** MM/DD/YYYY → YYYY-MM-DD (calendar date, no TZ shift). */
export function parseUsDateToIso(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Legacy HCP export: first column date string (ISO or parseable by Date). */
export function parseLegacyExportDate(raw: string): string | null {
  const us = parseUsDateToIso(raw);
  if (us) return us;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export type TimesheetCsvFormat = "legacy_wide" | "hcp_time_tracking" | "unknown";

export function detectTimesheetCsvFormat(header: string[]): TimesheetCsvFormat {
  const h = header.map((x) => normalizeCsvPersonName(x));
  if (h[0] === "date" && header.length >= 3) return "legacy_wide";
  if (h[0] === "employee name" && h.includes("total hours")) return "hcp_time_tracking";
  if (h.includes("employee name") && h.includes("total hours")) return "hcp_time_tracking";
  return "unknown";
}

export function findHeaderColumn(header: string[], normalizedTarget: string): number {
  const h = header.map((x) => normalizeCsvPersonName(x));
  return h.indexOf(normalizedTarget);
}
