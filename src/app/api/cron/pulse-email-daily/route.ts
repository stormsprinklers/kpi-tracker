import { NextResponse } from "next/server";
import { initSchema } from "@/lib/db";
import { getOrganizationIdsForPulseDaily } from "@/lib/db/queries";
import { sendDailyPulseForOrganization } from "@/lib/email/pulseCron";

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initSchema();
  const orgIds = await getOrganizationIdsForPulseDaily();
  const results = await Promise.all(orgIds.map((id) => sendDailyPulseForOrganization(id)));

  return NextResponse.json({
    ok: true,
    organizations: orgIds.length,
    results,
  });
}
