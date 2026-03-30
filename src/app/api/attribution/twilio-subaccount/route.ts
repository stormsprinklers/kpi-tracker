import { NextResponse } from "next/server";
import { encryptSubaccountSecret } from "@/lib/crypto/subaccountSecrets";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getOrganizationById } from "@/lib/db/queries";
import {
  getWebAttributionInstall,
  saveTwilioSubaccountCredentials,
  updateTwilioSubaccountAuthToken,
} from "@/lib/db/webAttributionQueries";
import {
  getTwilioMasterClient,
  getTwilioMasterClientForSubaccount,
  tryTwilioParentAuthTokenClientForSubaccount,
  verifySubaccountAuthToken,
} from "@/lib/twilio/client";
import { TWILIO_FRIENDLY_NAME_MAX, twilioFriendlyNameFromOrg } from "@/lib/twilio/orgFriendlyName";

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
export async function POST(request: Request) {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  const orgId = session!.user!.organizationId!;
  const body = await request.json().catch(() => ({})) as { manualAuthToken?: string };
  const manualAuthToken =
    typeof body.manualAuthToken === "string" ? body.manualAuthToken.trim() : "";

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

    const orgRow = await getOrganizationById(orgId);
    const friendlyName = twilioFriendlyNameFromOrg(orgRow?.name ?? null, orgId);

    const master = getTwilioMasterClient();
    const sub = await master.api.accounts.create({ friendlyName });

    /**
     * Twilio often omits `auth_token` on create when the parent uses an API key (SK…) instead of an Auth Token.
     * Webhook validation still needs a token; we try fetch, then IAM secondary token creation on the subaccount.
     */
    let subAuthToken = (sub.authToken ?? "").trim();
    if (!subAuthToken) {
      try {
        const fetched = await master.api.accounts(sub.sid).fetch();
        subAuthToken = (fetched.authToken ?? "").trim();
      } catch (fetchErr) {
        console.warn("[twilio-subaccount] fetch subaccount after create", fetchErr);
      }
    }

    const scopedMaster = getTwilioMasterClientForSubaccount(sub.sid);
    const keyFriendly =
      friendlyName.length <= 48 ? `${friendlyName} — attribution` : friendlyName.slice(0, TWILIO_FRIENDLY_NAME_MAX);
    const newKey = await scopedMaster.newKeys.create({
      friendlyName: keyFriendly.slice(0, TWILIO_FRIENDLY_NAME_MAX),
    });

    /** IAM secondary token: prefer parent Auth Token (Twilio often rejects API-key-only for this endpoint). */
    if (!subAuthToken) {
      const tokenOnlyClient = tryTwilioParentAuthTokenClientForSubaccount(sub.sid);
      if (tokenOnlyClient) {
        try {
          const secondary = await tokenOnlyClient.accounts.v1.secondaryAuthToken().create();
          subAuthToken = (secondary.secondaryAuthToken ?? "").trim();
        } catch (secErr) {
          console.warn("[twilio-subaccount] secondaryAuthToken (parent auth token)", secErr);
        }
      }
    }
    if (!subAuthToken) {
      try {
        const secondary = await scopedMaster.accounts.v1.secondaryAuthToken().create();
        subAuthToken = (secondary.secondaryAuthToken ?? "").trim();
      } catch (secErr) {
        console.warn("[twilio-subaccount] secondaryAuthToken (API key scoped)", secErr);
      }
    }

    if (!subAuthToken && manualAuthToken) {
      const valid = await verifySubaccountAuthToken(sub.sid, manualAuthToken);
      if (!valid) {
        return NextResponse.json(
          {
            error:
              "The Auth Token you entered is not valid for the new subaccount. In Twilio Console, open the subaccount that was just created (check name above), reveal the Auth Token, and paste it exactly.",
          },
          { status: 400 }
        );
      }
      subAuthToken = manualAuthToken;
    }

    if (!subAuthToken) {
      return NextResponse.json(
        {
          error:
            "Twilio created the subaccount but we could not obtain an Auth Token for webhook signatures. " +
            "Fix one of: (1) Add TWILIO_MASTER_AUTH_TOKEN or TWILIO_AUTH_TOKEN in Vercel (parent account Auth Token) alongside your API key so we can create a secondary token. " +
            "(2) Paste the subaccount Auth Token from Twilio Console (field below the button) and click Create again. " +
            "If you see duplicate subaccounts in Twilio, close the extras and use the token for the correct AC… sid.",
        },
        { status: 502 }
      );
    }
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

/**
 * PATCH — temporary maintenance endpoint to refresh subaccount webhook Auth Token only.
 * Body: { manualAuthToken: string }
 */
export async function PATCH(request: Request) {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  const orgId = session!.user!.organizationId!;
  const body = (await request.json().catch(() => ({}))) as { manualAuthToken?: string };
  const manualAuthToken = typeof body.manualAuthToken === "string" ? body.manualAuthToken.trim() : "";
  if (!manualAuthToken) {
    return NextResponse.json({ error: "manualAuthToken is required." }, { status: 400 });
  }

  await initSchema();
  const install = await getWebAttributionInstall(orgId);
  const subSid = install?.twilio_subaccount_sid?.trim();
  if (!subSid) {
    return NextResponse.json({ error: "No Twilio subaccount is linked for this organization." }, { status: 400 });
  }

  const valid = await verifySubaccountAuthToken(subSid, manualAuthToken);
  if (!valid) {
    return NextResponse.json(
      { error: "The Auth Token does not match the linked subaccount. Open that subaccount in Twilio and copy its current Auth Token." },
      { status: 400 }
    );
  }

  await updateTwilioSubaccountAuthToken({
    organizationId: orgId,
    subaccountSid: subSid,
    plainAuthToken: manualAuthToken,
  });

  return NextResponse.json({ ok: true, twilioSubaccountSid: subSid });
}
