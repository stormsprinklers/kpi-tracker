import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { sendDailyPulseTestForOrganization, sendWeeklyPulseTestForOrganization } from "@/lib/email/pulseCron";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await initSchema();

  let body: { variant?: "daily" | "weekly" };
  try {
    body = (await request.json()) as { variant?: "daily" | "weekly" };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const variant = body.variant;
  if (variant !== "daily" && variant !== "weekly") {
    return NextResponse.json({ error: "variant must be 'daily' or 'weekly'" }, { status: 400 });
  }

  const organizationId = session.user.organizationId;
  const result =
    variant === "daily"
      ? await sendDailyPulseTestForOrganization(organizationId)
      : await sendWeeklyPulseTestForOrganization(organizationId);

  if (result.status === "error") {
    return NextResponse.json(
      { ok: false, error: result.detail ?? "Test email failed", result },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, result });
}

