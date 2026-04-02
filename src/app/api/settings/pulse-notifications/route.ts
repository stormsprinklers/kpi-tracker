import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getOrganizationById, updateOrganizationPulseSettings } from "@/lib/db/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  await initSchema();
  const org = await getOrganizationById(session.user.organizationId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const parseRecipientListField = (raw: string | null): string[] => {
    if (!raw?.trim()) return [];
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      // fall through to split parsing
    }
    return raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  };

  const splitConfigured = org.pulse_daily_recipient_emails != null || org.pulse_weekly_recipient_emails != null;

  const legacyFallback = parseRecipientListField(org.pulse_recipient_emails);
  const dailyRecipientList = parseRecipientListField(org.pulse_daily_recipient_emails);
  const weeklyRecipientList = parseRecipientListField(org.pulse_weekly_recipient_emails);

  // Backward compat:
  // - If split fields are entirely unconfigured, use legacy override.
  // - Once split fields are in use, treat empty lists as "send to admins" (i.e. no override), not legacy.
  const effectiveDaily = splitConfigured ? dailyRecipientList : legacyFallback;
  const effectiveWeekly = splitConfigured ? weeklyRecipientList : legacyFallback;

  return NextResponse.json({
    pulse_email_enabled: org.pulse_email_enabled,
    pulse_daily_enabled: org.pulse_daily_enabled,
    pulse_weekly_enabled: org.pulse_weekly_enabled,
    pulse_timezone: org.pulse_timezone || "America/Denver",
    pulse_daily_recipient_emails: effectiveDaily,
    pulse_weekly_recipient_emails: effectiveWeekly,
    daily_content_note:
      "Daily email covers the prior calendar day in your org time zone: key revenue/job metrics, call summary, and a short AI summary with focus bullets.",
    weekly_content_note:
      "Weekly email covers the last 7 calendar days ending yesterday (org time zone), with a fuller metric set and sectioned AI narrative.",
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await initSchema();

  const body = (await request.json()) as {
    pulse_email_enabled?: boolean;
    pulse_daily_enabled?: boolean;
    pulse_weekly_enabled?: boolean;
    pulse_timezone?: string | null;
    pulse_recipient_emails?: string[] | null; // legacy
    pulse_daily_recipient_emails?: string[] | null;
    pulse_weekly_recipient_emails?: string[] | null;
  };

  const orgId = session.user.organizationId;

  if (body.pulse_email_enabled !== undefined) {
    await updateOrganizationPulseSettings(orgId, { pulse_email_enabled: body.pulse_email_enabled });
  }
  if (body.pulse_daily_enabled !== undefined) {
    await updateOrganizationPulseSettings(orgId, { pulse_daily_enabled: body.pulse_daily_enabled });
  }
  if (body.pulse_weekly_enabled !== undefined) {
    await updateOrganizationPulseSettings(orgId, { pulse_weekly_enabled: body.pulse_weekly_enabled });
  }
  if (body.pulse_timezone !== undefined) {
    await updateOrganizationPulseSettings(orgId, { pulse_timezone: body.pulse_timezone });
  }

  const normalizeListToStoredJson = (list: unknown): string | null => {
    if (!Array.isArray(list)) return null;
    const cleaned = list.map((x) => String(x).trim()).filter(Boolean);
    // Preserve "configured empty" as a non-null marker ("[]") so we don't fall back to the legacy list.
    return JSON.stringify(cleaned);
  };

  const dailyProvided = body.pulse_daily_recipient_emails !== undefined;
  const weeklyProvided = body.pulse_weekly_recipient_emails !== undefined;
  const legacyProvided = body.pulse_recipient_emails !== undefined;

  if (dailyProvided) {
    const stored = normalizeListToStoredJson(body.pulse_daily_recipient_emails);
    await updateOrganizationPulseSettings(orgId, { pulse_daily_recipient_emails: stored });
  }
  if (weeklyProvided) {
    const stored = normalizeListToStoredJson(body.pulse_weekly_recipient_emails);
    await updateOrganizationPulseSettings(orgId, { pulse_weekly_recipient_emails: stored });
  }
  if (legacyProvided && !dailyProvided && !weeklyProvided) {
    // If the request only includes the legacy field, apply it to both daily+weekly.
    const stored = normalizeListToStoredJson(body.pulse_recipient_emails);
    await updateOrganizationPulseSettings(orgId, {
      pulse_recipient_emails: stored,
      pulse_daily_recipient_emails: stored,
      pulse_weekly_recipient_emails: stored,
    });
  } else if (legacyProvided) {
    // Preserve legacy column if explicitly included, but don't override split fields.
    const stored = normalizeListToStoredJson(body.pulse_recipient_emails);
    await updateOrganizationPulseSettings(orgId, { pulse_recipient_emails: stored });
  }

  return NextResponse.json({ success: true });
}
