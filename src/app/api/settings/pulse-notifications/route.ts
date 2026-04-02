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

  let recipientList: string[] = [];
  if (org.pulse_recipient_emails?.trim()) {
    try {
      const j = JSON.parse(org.pulse_recipient_emails) as unknown;
      if (Array.isArray(j)) recipientList = j.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      recipientList = org.pulse_recipient_emails.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    }
  }

  return NextResponse.json({
    pulse_email_enabled: org.pulse_email_enabled,
    pulse_daily_enabled: org.pulse_daily_enabled,
    pulse_weekly_enabled: org.pulse_weekly_enabled,
    pulse_timezone: org.pulse_timezone || "America/Denver",
    pulse_recipient_emails: recipientList,
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
    pulse_recipient_emails?: string[] | null;
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
  if (body.pulse_recipient_emails !== undefined) {
    let stored: string | null = null;
    if (Array.isArray(body.pulse_recipient_emails) && body.pulse_recipient_emails.length > 0) {
      stored = JSON.stringify(
        body.pulse_recipient_emails.map((x) => String(x).trim()).filter(Boolean)
      );
    }
    await updateOrganizationPulseSettings(orgId, { pulse_recipient_emails: stored });
  }

  return NextResponse.json({ success: true });
}
