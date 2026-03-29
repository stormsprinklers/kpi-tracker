import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getOrganizationById } from "@/lib/db/queries";
import {
  getWebAttributionInstall,
  upsertWebAttributionInstall,
  updateWebAttributionAllowedOrigins,
  updateWebAttributionCallTrackingSettings,
} from "@/lib/db/webAttributionQueries";
import {
  createPublishableKey,
  hashPublishableKey,
  normalizeOrigin,
  normalizeOriginList,
} from "@/lib/webAttribution";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initSchema();
  const orgId = session.user.organizationId;
  const org = await getOrganizationById(orgId);
  let install = await getWebAttributionInstall(orgId);

  if (!install) {
    const firstKey = createPublishableKey();
    const defaultOrigins: string[] = [];
    if (org?.website) {
      const normalized = normalizeOrigin(org.website);
      if (normalized) defaultOrigins.push(normalized);
    }
    await upsertWebAttributionInstall({
      organizationId: orgId,
      publishableKeyHash: hashPublishableKey(firstKey),
      allowedOrigins: normalizeOriginList(defaultOrigins),
    });
    install = await getWebAttributionInstall(orgId);
    return NextResponse.json({
      publishableKey: firstKey,
      allowedOrigins: install?.allowed_origins ?? [],
      verifiedAt: install?.verified_at ?? null,
      lastEventAt: install?.last_event_at ?? null,
      website: org?.website ?? "",
      defaultForwardE164: install?.default_forward_e164 ?? null,
      twilioIntelligenceServiceSid: install?.twilio_intelligence_service_sid ?? null,
      twilioSubaccountSid: install?.twilio_subaccount_sid ?? null,
      twilioSubaccountCreatedAt: install?.twilio_subaccount_created_at ?? null,
    });
  }

  return NextResponse.json({
    publishableKey: null,
    allowedOrigins: install.allowed_origins,
    verifiedAt: install.verified_at,
    lastEventAt: install.last_event_at,
    website: org?.website ?? "",
    defaultForwardE164: install.default_forward_e164 ?? null,
    twilioIntelligenceServiceSid: install.twilio_intelligence_service_sid ?? null,
    twilioSubaccountSid: install.twilio_subaccount_sid ?? null,
    twilioSubaccountCreatedAt: install.twilio_subaccount_created_at ?? null,
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
  const orgId = session.user.organizationId;
  const body = (await request.json()) as {
    allowedOrigins?: string[];
    rotateKey?: boolean;
    defaultForwardE164?: string | null;
    twilioIntelligenceServiceSid?: string | null;
  };
  const install = await getWebAttributionInstall(orgId);
  if (!install) {
    return NextResponse.json({ error: "Attribution install missing. Refresh and try again." }, { status: 400 });
  }

  if (Array.isArray(body.allowedOrigins)) {
    await updateWebAttributionAllowedOrigins({
      organizationId: orgId,
      allowedOrigins: normalizeOriginList(body.allowedOrigins),
    });
  }

  if (body.defaultForwardE164 !== undefined || body.twilioIntelligenceServiceSid !== undefined) {
    await updateWebAttributionCallTrackingSettings({
      organizationId: orgId,
      defaultForwardE164: body.defaultForwardE164,
      twilioIntelligenceServiceSid: body.twilioIntelligenceServiceSid,
    });
  }

  if (body.rotateKey) {
    const nextKey = createPublishableKey();
    await upsertWebAttributionInstall({
      organizationId: orgId,
      publishableKeyHash: hashPublishableKey(nextKey),
      allowedOrigins: Array.isArray(body.allowedOrigins) ? normalizeOriginList(body.allowedOrigins) : install.allowed_origins,
    });
    const updated = await getWebAttributionInstall(orgId);
    return NextResponse.json({
      publishableKey: nextKey,
      allowedOrigins: updated?.allowed_origins ?? [],
      verifiedAt: updated?.verified_at ?? null,
      lastEventAt: updated?.last_event_at ?? null,
      defaultForwardE164: updated?.default_forward_e164 ?? null,
      twilioIntelligenceServiceSid: updated?.twilio_intelligence_service_sid ?? null,
      twilioSubaccountSid: updated?.twilio_subaccount_sid ?? null,
      twilioSubaccountCreatedAt: updated?.twilio_subaccount_created_at ?? null,
    });
  }

  const updated = await getWebAttributionInstall(orgId);
  return NextResponse.json({
    publishableKey: null,
    allowedOrigins: updated?.allowed_origins ?? [],
    verifiedAt: updated?.verified_at ?? null,
    lastEventAt: updated?.last_event_at ?? null,
    defaultForwardE164: updated?.default_forward_e164 ?? null,
    twilioIntelligenceServiceSid: updated?.twilio_intelligence_service_sid ?? null,
    twilioSubaccountSid: updated?.twilio_subaccount_sid ?? null,
    twilioSubaccountCreatedAt: updated?.twilio_subaccount_created_at ?? null,
  });
}

