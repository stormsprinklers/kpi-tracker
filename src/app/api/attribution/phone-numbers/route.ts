import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getOrganizationById } from "@/lib/db/queries";
import { getWebAttributionInstall } from "@/lib/db/webAttributionQueries";
import {
  findActivePhoneNumberByE164,
  findPhoneNumberByTwilioSidForOrg,
  getActivePhoneForSource,
  insertWebAttributionPhoneNumber,
  listActivePhoneNumbersForOrg,
  reactivateWebAttributionPhoneNumber,
  releaseWebAttributionPhoneNumber,
} from "@/lib/db/twilioAttributionQueries";
import { getTwilioClientForOrganization, getTwilioVoiceWebhookUrl } from "@/lib/twilio/client";
import { twilioFriendlyNameFromOrg } from "@/lib/twilio/orgFriendlyName";

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

/** GET ?country=US&areaCode=415&inLocality=&inRegion=CA&inPostalCode=&voiceEnabled=true */
export async function GET(request: Request) {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  await initSchema();
  const orgId = session!.user!.organizationId!;
  const install = await getWebAttributionInstall(orgId);
  if (!install?.twilio_subaccount_sid && !hasLegacyTwilioEnv()) {
    return NextResponse.json(
      {
        error:
          "Twilio is not ready: create a company Twilio workspace in Attribution (admin), or set legacy TWILIO_ACCOUNT_SID on the server.",
      },
      { status: 503 }
    );
  }
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get("country") || "US").toUpperCase();
  const areaCode = searchParams.get("areaCode");
  const inLocality = searchParams.get("inLocality");
  const inRegion = searchParams.get("inRegion");
  const inPostalCode = searchParams.get("inPostalCode");
  const nearLatLong = searchParams.get("nearLatLong");
  const nearNumber = searchParams.get("nearNumber");
  const distance = searchParams.get("distance");
  const voiceEnabled = searchParams.get("voiceEnabled") !== "false";

  try {
    const client = await getTwilioClientForOrganization(orgId);
    const opts: Record<string, string | number | boolean> = { voiceEnabled, limit: 20 };
    if (areaCode) {
      const ac = parseInt(areaCode, 10);
      if (!Number.isNaN(ac)) opts.areaCode = ac;
    }
    if (inLocality) opts.inLocality = inLocality;
    if (inRegion) opts.inRegion = inRegion;
    if (inPostalCode) opts.inPostalCode = inPostalCode;
    if (nearLatLong) opts.nearLatLong = nearLatLong;
    if (nearNumber) opts.nearNumber = nearNumber;
    if (distance) opts.distance = parseInt(distance, 10);

    const locals = await client.availablePhoneNumbers(country).local.list(opts);
    const numbers = locals.map((n) => ({
      phone_number: n.phoneNumber,
      friendly_name: n.friendlyName,
      locality: n.locality,
      region: n.region,
      postal_code: n.postalCode,
    }));
    const existing = await listActivePhoneNumbersForOrg(orgId);
    return NextResponse.json({ numbers, active: existing });
  } catch (e) {
    console.error("[attribution/phone-numbers GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed" },
      { status: 400 }
    );
  }
}

/** POST { sourceId, phoneNumber, forwardToE164? } */
export async function POST(request: Request) {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  const orgId = session!.user!.organizationId!;
  await initSchema();
  const installCheck = await getWebAttributionInstall(orgId);
  if (!installCheck?.twilio_subaccount_sid && !hasLegacyTwilioEnv()) {
    return NextResponse.json(
      {
        error:
          "Create a company Twilio workspace in Attribution first, or configure legacy TWILIO_ACCOUNT_SID.",
      },
      { status: 503 }
    );
  }
  const body = (await request.json()) as {
    sourceId?: string;
    phoneNumber?: string;
    twilioPhoneNumberSid?: string;
    forwardToE164?: string | null;
    searchSnapshot?: Record<string, unknown>;
  };
  const sourceId = body.sourceId?.trim();
  const phoneNumber = body.phoneNumber?.trim();
  const twilioPhoneNumberSid = body.twilioPhoneNumberSid?.trim();

  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required." }, { status: 400 });
  }

  const existing = await getActivePhoneForSource({ organizationId: orgId, sourceId });
  if (existing) {
    return NextResponse.json(
      { error: "This source already has an active tracking number. Release it before assigning another." },
      { status: 400 }
    );
  }

  const install = await getWebAttributionInstall(orgId);
  const forward =
    body.forwardToE164?.trim() ||
    install?.default_forward_e164?.trim() ||
    "";
  if (!forward) {
    return NextResponse.json(
      { error: "Set a default forwarding number in Attribution (call tracking settings) or pass forwardToE164." },
      { status: 400 }
    );
  }

  const voiceUrl = getTwilioVoiceWebhookUrl();
  if (!voiceUrl.startsWith("https://")) {
    return NextResponse.json(
      { error: "TWILIO_WEBHOOK_BASE_URL or NEXT_PUBLIC_APP_URL must be a public https URL for Twilio Voice." },
      { status: 400 }
    );
  }

  try {
    const client = await getTwilioClientForOrganization(orgId);

    /** Link an existing Twilio incoming number (e.g. bought in Console) to this source. */
    if (twilioPhoneNumberSid) {
      const prior = await findPhoneNumberByTwilioSidForOrg(orgId, twilioPhoneNumberSid);
      if (prior && !prior.released_at) {
        return NextResponse.json(
          { error: "That Twilio number is already linked to a channel. Release it first to move it." },
          { status: 409 }
        );
      }

      const pn = await client.incomingPhoneNumbers(twilioPhoneNumberSid).fetch();
      const e164 = pn.phoneNumber?.toString()?.trim() ?? "";
      if (!e164) {
        return NextResponse.json({ error: "Could not read phone number from Twilio." }, { status: 400 });
      }
      const taken = await findActivePhoneNumberByE164(e164);
      if (taken && taken.twilio_phone_number_sid !== twilioPhoneNumberSid) {
        return NextResponse.json(
          { error: "That number is already linked to another active channel in this app." },
          { status: 409 }
        );
      }

      await client.incomingPhoneNumbers(twilioPhoneNumberSid).update({
        voiceUrl,
        voiceMethod: "POST",
      });

      const snap = { attachedExisting: true, ...(body.searchSnapshot ?? {}) };
      if (prior?.released_at) {
        const reactivated = await reactivateWebAttributionPhoneNumber({
          organizationId: orgId,
          twilioPhoneNumberSid: pn.sid,
          sourceId,
          forwardToE164: forward,
          searchSnapshot: snap,
        });
        if (!reactivated) {
          return NextResponse.json({ error: "Could not restore released phone record." }, { status: 500 });
        }
        return NextResponse.json(reactivated);
      }

      const row = await insertWebAttributionPhoneNumber({
        organizationId: orgId,
        sourceId,
        twilioPhoneNumberSid: pn.sid,
        phoneE164: e164,
        forwardToE164: forward,
        searchSnapshot: snap,
      });
      return NextResponse.json(row);
    }

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Provide phoneNumber to buy a new number, or twilioPhoneNumberSid to assign an existing one." },
        { status: 400 }
      );
    }

    const orgRow = await getOrganizationById(orgId);
    const numberFriendlyName = twilioFriendlyNameFromOrg(orgRow?.name ?? null, orgId);

    const created = await client.incomingPhoneNumbers.create({
      phoneNumber,
      voiceUrl,
      voiceMethod: "POST",
      friendlyName: numberFriendlyName,
    });

    const row = await insertWebAttributionPhoneNumber({
      organizationId: orgId,
      sourceId,
      twilioPhoneNumberSid: created.sid,
      phoneE164: created.phoneNumber?.toString() ?? phoneNumber,
      forwardToE164: forward,
      searchSnapshot: body.searchSnapshot ?? {},
    });

    return NextResponse.json(row);
  } catch (e) {
    console.error("[attribution/phone-numbers POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Provisioning failed" },
      { status: 400 }
    );
  }
}

/** DELETE ?phoneNumberId=uuid */
export async function DELETE(request: Request) {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  const orgId = session!.user!.organizationId!;
  await initSchema();
  const installDel = await getWebAttributionInstall(orgId);
  if (!installDel?.twilio_subaccount_sid && !hasLegacyTwilioEnv()) {
    return NextResponse.json({ error: "Twilio is not configured for this organization." }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const phoneNumberId = searchParams.get("phoneNumberId");
  if (!phoneNumberId) {
    return NextResponse.json({ error: "phoneNumberId is required" }, { status: 400 });
  }

  const rows = await listActivePhoneNumbersForOrg(orgId);
  const match = rows.find((r) => r.id === phoneNumberId);
  if (!match) {
    return NextResponse.json({ error: "Number not found" }, { status: 404 });
  }

  try {
    const client = await getTwilioClientForOrganization(orgId);
    await client.incomingPhoneNumbers(match.twilio_phone_number_sid).remove();
  } catch (e) {
    console.error("[attribution/phone-numbers DELETE twilio]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Twilio release failed" },
      { status: 400 }
    );
  }

  await releaseWebAttributionPhoneNumber({ organizationId: orgId, phoneNumberId });
  return NextResponse.json({ success: true });
}
