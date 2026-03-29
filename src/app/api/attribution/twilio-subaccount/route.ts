import twilio from "twilio";
import { NextResponse } from "next/server";
import { encryptSubaccountSecret } from "@/lib/crypto/subaccountSecrets";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getWebAttributionInstall,
  saveTwilioSubaccountCredentials,
} from "@/lib/db/webAttributionQueries";
import { getTwilioMasterClient } from "@/lib/twilio/client";

export const dynamic = "force-dynamic";

/** Twilio returns message "Authenticate" with 401 when Account SID / key / secret don’t match. */
function friendlyTwilioProvisionError(e: unknown): string {
  if (!(e && typeof e === "object")) {
    return e instanceof Error ? e.message : "Provisioning failed";
  }
  const err = e as { message?: string; status?: number; code?: number };
  const msg = (err.message ?? "").trim();
  const status = err.status;
  const code = err.code;
  if (
    msg === "Authenticate" ||
    status === 401 ||
    code === 20003 ||
    /authentication/i.test(msg) ||
    /authenticat/i.test(msg)
  ) {
    return (
      "Twilio rejected the server credentials (not your browser login). " +
      "In Vercel, set the parent Account SID as TWILIO_MASTER_ACCOUNT_SID or TWILIO_ACCOUNT_SID — it must start with AC. " +
      "Pair it with TWILIO_MASTER_API_KEY_SID + TWILIO_MASTER_API_KEY_SECRET (or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET). " +
      "The SID starting with SK is the API key, not the account. You can use TWILIO_MASTER_AUTH_TOKEN + Account SID instead of an API key."
    );
  }
  return msg || "Provisioning failed";
}

function requireAdmin(session: { user?: { organizationId?: string | null; role?: string } } | null) {
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return null;
}

/** GET — whether this org has a dedicated Twilio subaccount (billing segment). */
export async function GET() {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  await initSchema();
  const install = await getWebAttributionInstall(session!.user!.organizationId!);
  return NextResponse.json({
    configured: !!install?.twilio_subaccount_sid,
    twilioSubaccountSid: install?.twilio_subaccount_sid ?? null,
    twilioSubaccountCreatedAt: install?.twilio_subaccount_created_at ?? null,
  });
}

/**
 * POST — create a Twilio subaccount + API key; store encrypted credentials on web_attribution_install.
 * Requires master Twilio credentials in env and TWILIO_SUBACCOUNT_CREDENTIALS_ENCRYPTION_KEY.
 */
export async function POST() {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  const orgId = session!.user!.organizationId!;
  await initSchema();
  const install = await getWebAttributionInstall(orgId);
  if (!install) {
    return NextResponse.json({ error: "Attribution install missing. Open Attribution and try again." }, { status: 400 });
  }
  if (install.twilio_subaccount_sid) {
    return NextResponse.json(
      { error: "A Twilio workspace is already linked to this organization." },
      { status: 409 }
    );
  }

  try {
    encryptSubaccountSecret("__probe__");

    const master = getTwilioMasterClient();
    const friendlyName = `HSA Attribution ${orgId.slice(0, 8)}`;
    const sub = await master.api.accounts.create({ friendlyName });

    const subAuthToken = sub.authToken;
    if (!subAuthToken) {
      return NextResponse.json(
        { error: "Twilio did not return a subaccount auth token; check API permissions." },
        { status: 502 }
      );
    }

    const subClient = twilio(sub.sid, subAuthToken);
    const newKey = await subClient.newKeys.create({
      friendlyName: `hsa-attribution-${orgId.slice(0, 8)}`,
    });
    const keySecret = newKey.secret;
    if (!keySecret) {
      return NextResponse.json(
        { error: "Twilio did not return the new API key secret; try again." },
        { status: 502 }
      );
    }

    await saveTwilioSubaccountCredentials({
      organizationId: orgId,
      subaccountSid: sub.sid,
      plainAuthToken: subAuthToken,
      apiKeySid: newKey.sid,
      plainApiKeySecret: keySecret,
    });

    const updated = await getWebAttributionInstall(orgId);
    return NextResponse.json({
      ok: true,
      twilioSubaccountSid: updated?.twilio_subaccount_sid ?? sub.sid,
      twilioSubaccountCreatedAt: updated?.twilio_subaccount_created_at ?? null,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Provisioning failed";
    const msg = friendlyTwilioProvisionError(e);
    console.error("[attribution/twilio-subaccount POST]", e);
    if (raw.includes("TWILIO_SUBACCOUNT_CREDENTIALS_ENCRYPTION_KEY") || msg.includes("TWILIO_SUBACCOUNT_CREDENTIALS_ENCRYPTION_KEY")) {
      return NextResponse.json(
        {
          error:
            "Server misconfiguration: set TWILIO_SUBACCOUNT_CREDENTIALS_ENCRYPTION_KEY (32-byte secret, e.g. openssl rand -base64 32).",
        },
        { status: 503 }
      );
    }
    const status =
      e && typeof e === "object" && (e as { status?: number }).status === 401 ? 502 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
