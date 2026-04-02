import { getOrganizationById, markPulseDailySent, markPulseWeeklySent } from "@/lib/db/queries";
import { rolling7DaysEnding, yesterdayYmdInOrgZone } from "@/lib/email/pulseDateRange";
import { resolvePulseRecipientEmails } from "@/lib/email/pulseRecipients";
import { buildPulseDailySnapshot, buildPulseWeeklySnapshot } from "@/lib/email/pulseSnapshots";
import { generateDailyPulseAi, generateWeeklyPulseAi } from "@/lib/ai/openaiPulse";
import {
  buildPulseEmailHtml,
  buildPulseEmailPlainText,
  metricsRowsFromDaily,
  metricsRowsFromWeekly,
} from "@/lib/email/pulseEmailTemplate";
import { sendTransactionalEmail } from "@/lib/email/sendGrid";

function appBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (u) return u.replace(/\/$/, "");
  return "https://homeservicesanalytics.com";
}

function formatYmdLong(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(dt);
}

export type PulseCronItemResult = {
  organizationId: string;
  status: "sent" | "skipped" | "error";
  detail?: string;
};

export async function sendDailyPulseForOrganization(
  organizationId: string,
  now: Date = new Date()
): Promise<PulseCronItemResult> {
  const org = await getOrganizationById(organizationId);
  if (!org) return { organizationId, status: "error", detail: "Organization not found" };

  const tz = org.pulse_timezone || "America/Denver";
  const ymd = yesterdayYmdInOrgZone(now, tz);
  if (org.pulse_last_daily_ymd === ymd) {
    return { organizationId, status: "skipped", detail: `Already sent for ${ymd}` };
  }

  const recipients = await resolvePulseRecipientEmails(organizationId, org);
  if (recipients.length === 0) {
    return { organizationId, status: "skipped", detail: "No recipients" };
  }

  try {
    const snapshot = await buildPulseDailySnapshot(organizationId, ymd);
    const ai = await generateDailyPulseAi(snapshot);
    const periodLabel = `${formatYmdLong(ymd)} (org calendar day)`;
    const base = appBaseUrl();
    const input = {
      variant: "daily" as const,
      orgName: org.name,
      periodLabel,
      appBaseUrl: base,
      metricsRows: metricsRowsFromDaily(snapshot),
      dataGaps: snapshot.dataGaps,
      dailyAi: ai,
    };
    const html = buildPulseEmailHtml(input);
    const text = buildPulseEmailPlainText(input);
    const subject = `${org.name} — Daily pulse (${formatYmdLong(ymd)})`;

    const send = await sendTransactionalEmail({ to: recipients, subject, html, text });
    if (!send.ok) {
      return { organizationId, status: "error", detail: send.error };
    }
    await markPulseDailySent(organizationId, ymd);
    return { organizationId, status: "sent" };
  } catch (e) {
    return {
      organizationId,
      status: "error",
      detail: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export async function sendWeeklyPulseForOrganization(
  organizationId: string,
  now: Date = new Date()
): Promise<PulseCronItemResult> {
  const org = await getOrganizationById(organizationId);
  if (!org) return { organizationId, status: "error", detail: "Organization not found" };

  const tz = org.pulse_timezone || "America/Denver";
  const endYmd = yesterdayYmdInOrgZone(now, tz);
  if (org.pulse_last_weekly_end_ymd === endYmd) {
    return { organizationId, status: "skipped", detail: `Already sent for week ending ${endYmd}` };
  }

  const recipients = await resolvePulseRecipientEmails(organizationId, org);
  if (recipients.length === 0) {
    return { organizationId, status: "skipped", detail: "No recipients" };
  }

  const { startDate, endDate } = rolling7DaysEnding(endYmd);

  try {
    const snapshot = await buildPulseWeeklySnapshot(organizationId, startDate, endDate);
    const ai = await generateWeeklyPulseAi(snapshot);
    const periodLabel = `${formatYmdLong(startDate)} – ${formatYmdLong(endDate)} (rolling 7 days, org time zone calendar)`;
    const base = appBaseUrl();
    const input = {
      variant: "weekly" as const,
      orgName: org.name,
      periodLabel,
      appBaseUrl: base,
      metricsRows: metricsRowsFromWeekly(snapshot),
      dataGaps: snapshot.dataGaps,
      weeklyAi: ai,
    };
    const html = buildPulseEmailHtml(input);
    const text = buildPulseEmailPlainText(input);
    const subject = `${org.name} — Weekly pulse (${formatYmdLong(startDate)} – ${formatYmdLong(endDate)})`;

    const send = await sendTransactionalEmail({ to: recipients, subject, html, text });
    if (!send.ok) {
      return { organizationId, status: "error", detail: send.error };
    }
    await markPulseWeeklySent(organizationId, endYmd);
    return { organizationId, status: "sent" };
  } catch (e) {
    return {
      organizationId,
      status: "error",
      detail: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
