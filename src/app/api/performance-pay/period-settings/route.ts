import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getPerformancePayOrg } from "@/lib/db/queries";
import { listIanaTimeZones, payPeriodSettingsFromOrg } from "@/lib/payPeriod";

export const dynamic = "force-dynamic";

/** GET — pay period weekday, timezone, and IANA zone list (any org member). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initSchema();
  const ppOrg = await getPerformancePayOrg(session.user.organizationId);
  const settings = payPeriodSettingsFromOrg(ppOrg);

  return NextResponse.json({
    pay_period_start_weekday: settings.payPeriodStartWeekday,
    pay_period_timezone: settings.payPeriodTimezone,
    timeZones: listIanaTimeZones(),
  });
}
