import type { DailyPulseAi, WeeklyPulseAi } from "@/lib/ai/openaiPulse";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatPct(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

const BRAND_BG = "#0B1F33";
const BRAND_MUTED = "#F8FAFC";

export type PulseEmailVariant = "daily" | "weekly";

export type PulseEmailTemplateInput = {
  variant: PulseEmailVariant;
  orgName: string;
  periodLabel: string;
  appBaseUrl: string;
  metricsRows: { label: string; value: string }[];
  dataGaps: string[];
  dailyAi?: DailyPulseAi;
  weeklyAi?: WeeklyPulseAi;
};

function bulletListHtml(items: string[]): string {
  if (!items.length) return "<p style=\"margin:0;color:#64748b;font-size:14px;\">—</p>";
  return `<ul style="margin:8px 0 0 0;padding-left:20px;color:#334155;font-size:14px;line-height:1.5;">${items.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
}

export function buildPulseEmailHtml(input: PulseEmailTemplateInput): string {
  const logoUrl = input.appBaseUrl.replace(/\/$/, "") + "/logo.png";
  const settingsUrl = input.appBaseUrl.replace(/\/$/, "") + "/settings/notifications";

  const metricsTable = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px;">
      ${input.metricsRows
        .map(
          (r) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;">${escapeHtml(r.label)}</td>
          <td align="right" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:600;">${escapeHtml(r.value)}</td>
        </tr>`
        )
        .join("")}
    </table>`;

  let aiBlock = "";
  if (input.variant === "daily" && input.dailyAi) {
    aiBlock = `
      <h2 style="margin:24px 0 8px 0;font-size:16px;color:${BRAND_BG};">Summary</h2>
      <p style="margin:0;color:#334155;font-size:15px;line-height:1.55;">${escapeHtml(input.dailyAi.summary)}</p>
      <h2 style="margin:20px 0 8px 0;font-size:16px;color:${BRAND_BG};">Focus areas</h2>
      ${bulletListHtml(input.dailyAi.focusBullets)}`;
  } else if (input.variant === "weekly" && input.weeklyAi) {
    aiBlock = `
      <h2 style="margin:24px 0 8px 0;font-size:16px;color:${BRAND_BG};">This week</h2>
      <p style="margin:0;color:#334155;font-size:15px;line-height:1.55;">${escapeHtml(input.weeklyAi.narrative)}</p>
      <h3 style="margin:20px 0 6px 0;font-size:15px;color:${BRAND_BG};">Revenue &amp; operations</h3>
      ${bulletListHtml(input.weeklyAi.sections.revenueOps)}
      <h3 style="margin:20px 0 6px 0;font-size:15px;color:${BRAND_BG};">Calls &amp; CSR</h3>
      ${bulletListHtml(input.weeklyAi.sections.callsCsr)}
      <h3 style="margin:20px 0 6px 0;font-size:15px;color:${BRAND_BG};">Marketing</h3>
      ${bulletListHtml(input.weeklyAi.sections.marketing)}
      <h3 style="margin:20px 0 6px 0;font-size:15px;color:${BRAND_BG};">Risks &amp; follow-ups</h3>
      ${bulletListHtml(input.weeklyAi.sections.risks)}`;
  }

  const gapsBlock =
    input.dataGaps.length > 0
      ? `
    <div style="margin-top:20px;padding:12px 14px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
      <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#92400e;">Data notes</p>
      <ul style="margin:0;padding-left:18px;color:#78350f;font-size:13px;line-height:1.45;">${input.dataGaps.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul>
    </div>`
      : "";

  const title = input.variant === "daily" ? "Daily business pulse" : "Weekly business pulse";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${BRAND_MUTED};font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_MUTED};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:${BRAND_BG};padding:20px 24px;">
              <table role="presentation" width="100%"><tr>
                <td><img src="${escapeHtml(logoUrl)}" alt="" width="40" height="40" style="display:block;border-radius:8px;vertical-align:middle;" onerror="this.style.display='none'"/></td>
                <td align="right" style="color:#e2e8f0;font-size:13px;">${escapeHtml(input.orgName)}</td>
              </tr></table>
              <h1 style="margin:12px 0 0 0;font-size:20px;font-weight:600;color:#f8fafc;">${escapeHtml(title)}</h1>
              <p style="margin:6px 0 0 0;font-size:14px;color:#94a3b8;">${escapeHtml(input.periodLabel)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:${BRAND_BG};text-transform:uppercase;letter-spacing:0.04em;">Key metrics</p>
              ${metricsTable}
              ${gapsBlock}
              ${aiBlock}
              <p style="margin:28px 0 0 0;font-size:13px;color:#64748b;line-height:1.5;">
                Manage pulse emails in <a href="${escapeHtml(settingsUrl)}" style="color:#0B1F33;">Settings → Notifications</a>.
                Questions? Reply is not monitored; contact your account admin or support from the app.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f1f5f9;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
              <a href="${escapeHtml(input.appBaseUrl.replace(/\/$/, ""))}" style="color:#0B1F33;">Open Home Services Analytics</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildPulseEmailPlainText(input: PulseEmailTemplateInput): string {
  const lines: string[] = [
    input.variant === "daily" ? "Daily business pulse" : "Weekly business pulse",
    input.periodLabel,
    "",
    "Key metrics:",
    ...input.metricsRows.map((r) => `  ${r.label}: ${r.value}`),
  ];
  if (input.dataGaps.length) {
    lines.push("", "Data notes:", ...input.dataGaps.map((g) => `  - ${g}`));
  }
  if (input.variant === "daily" && input.dailyAi) {
    lines.push("", input.dailyAi.summary, "", "Focus:", ...input.dailyAi.focusBullets.map((b) => `  - ${b}`));
  }
  if (input.variant === "weekly" && input.weeklyAi) {
    lines.push("", input.weeklyAi.narrative);
    const s = input.weeklyAi.sections;
    const add = (h: string, arr: string[]) => {
      if (arr.length) {
        lines.push("", h);
        arr.forEach((b) => lines.push(`  - ${b}`));
      }
    };
    add("Revenue & ops", s.revenueOps);
    add("Calls & CSR", s.callsCsr);
    add("Marketing", s.marketing);
    add("Risks", s.risks);
  }
  lines.push("", `Manage in app: ${input.appBaseUrl.replace(/\/$/, "")}/settings/notifications`);
  return lines.join("\n");
}

export function metricsRowsFromDaily(snapshot: import("@/lib/email/pulseSnapshots").PulseDailySnapshot): { label: string; value: string }[] {
  const km = snapshot.keyMetrics;
  const c = snapshot.callSummary;
  return [
    { label: "Revenue", value: formatMoney(km.revenue) },
    { label: "Jobs (paid)", value: String(km.jobCount) },
    { label: "Avg job value", value: km.avgJobValue != null ? formatMoney(km.avgJobValue) : "—" },
    { label: "Estimate conversion", value: formatPct(km.conversionRate) },
    { label: "Opportunity calls", value: String(c.opportunityCalls) },
    { label: "Booking rate (won / won+lost)", value: formatPct(c.bookingRatePercent) },
  ];
}

export function metricsRowsFromWeekly(snapshot: import("@/lib/email/pulseSnapshots").PulseWeeklySnapshot): { label: string; value: string }[] {
  const km = snapshot.keyMetrics;
  const c = snapshot.callSummary;
  const t = snapshot.timeSummary;
  return [
    { label: "Revenue (period)", value: formatMoney(km.revenue) },
    { label: "Jobs (paid)", value: String(km.jobCount) },
    { label: "Avg job value", value: km.avgJobValue != null ? formatMoney(km.avgJobValue) : "—" },
    { label: "Estimate conversion", value: formatPct(km.conversionRate) },
    { label: "Opportunity calls", value: String(c.opportunityCalls) },
    { label: "Booking rate", value: formatPct(c.bookingRatePercent) },
    {
      label: "Avg drive / labor (min)",
      value:
        t != null
          ? `${t.avgDriveTimeMinutes != null ? Math.round(t.avgDriveTimeMinutes) : "—"} / ${t.avgLaborTimeMinutes != null ? Math.round(t.avgLaborTimeMinutes) : "—"}`
          : "—",
    },
    { label: "Labor % of revenue", value: t?.laborPercentOfRevenue != null ? formatPct(t.laborPercentOfRevenue) : "—" },
  ];
}
