import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getWebAttributionInstall } from "@/lib/db/webAttributionQueries";
import { listActivePhoneNumbersForOrg } from "@/lib/db/twilioAttributionQueries";
import { getTwilioClientForOrganization } from "@/lib/twilio/client";

export const dynamic = "force-dynamic";

function requireAdmin(session: { user?: { organizationId?: string | null; role?: string } } | null) {
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return null;
}

function hasLegacyTwilioEnv(): boolean {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!sid) return false;
  return !!(
    process.env.TWILIO_AUTH_TOKEN?.trim() ||
    (process.env.TWILIO_API_KEY_SID?.trim() && process.env.TWILIO_API_KEY_SECRET?.trim())
  );
}

/**
 * GET — Incoming numbers on this org’s Twilio account that are not linked to an active attribution row.
 */
export async function GET() {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  const orgId = session!.user!.organizationId!;
  await initSchema();
  const install = await getWebAttributionInstall(orgId);
  if (!install?.twilio_subaccount_sid && !hasLegacyTwilioEnv()) {
    return NextResponse.json(
      {
        error:
          "Twilio is not ready: create a company Twilio workspace in Attribution, or set legacy TWILIO_ACCOUNT_SID.",
      },
      { status: 503 }
    );
  }

  try {
    const client = await getTwilioClientForOrganization(orgId);
    const list = await client.incomingPhoneNumbers.list({ limit: 1000 });
    const active = await listActivePhoneNumbersForOrg(orgId);
    const assignedSids = new Set(active.map((r) => r.twilio_phone_number_sid));
    const unassigned = list
      .filter((n) => !assignedSids.has(n.sid))
      .map((n) => ({
        sid: n.sid,
        phone_number: n.phoneNumber,
        friendly_name: n.friendlyName ?? null,
      }));
    return NextResponse.json({ unassigned });
  } catch (e) {
    console.error("[attribution/phone-numbers/unassigned GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list numbers" },
      { status: 400 }
    );
  }
}
