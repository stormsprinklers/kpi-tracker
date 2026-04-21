export type ParsedLsaLeadRow = {
  customer: string;
  leadType: string;
  chargeStatus: string;
  leadReceivedRaw: string;
  leadReceivedYmd: string | null;
};

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cur += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseLeadReceivedToYmd(v: string): string | null {
  const raw = v.trim();
  if (!raw) return null;
  // Google export often uses "Apr 20 2026".
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Parse Google LSA export (.csv/.tsv) rows and normalize needed fields. */
export function parseGoogleLsaLeadsCsv(content: string): ParsedLsaLeadRow[] {
  const text = content.replace(/^\uFEFF/, "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const header = splitDelimitedLine(lines[0], delimiter).map((h) => h.trim().toLowerCase());
  const idxCustomer = header.indexOf("customer");
  const idxLeadType = header.indexOf("lead type");
  const idxChargeStatus = header.indexOf("charge status");
  const idxLeadReceived = header.indexOf("lead received");
  if (idxLeadReceived < 0) {
    throw new Error("CSV is missing required column: Lead received");
  }

  const rows: ParsedLsaLeadRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitDelimitedLine(lines[i], delimiter);
    const leadReceivedRaw = cols[idxLeadReceived] ?? "";
    rows.push({
      customer: idxCustomer >= 0 ? (cols[idxCustomer] ?? "") : "",
      leadType: idxLeadType >= 0 ? (cols[idxLeadType] ?? "") : "",
      chargeStatus: idxChargeStatus >= 0 ? (cols[idxChargeStatus] ?? "") : "",
      leadReceivedRaw,
      leadReceivedYmd: parseLeadReceivedToYmd(leadReceivedRaw),
    });
  }
  return rows;
}
