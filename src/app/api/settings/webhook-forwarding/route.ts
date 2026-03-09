import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWebhookForwarding, upsertWebhookForwarding } from "@/lib/db/queries";
import { getWebhookUrl, getGhlWebhookUrl } from "@/lib/webhook";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const orgId = session.user.organizationId;
  const configs = await getWebhookForwarding(orgId);
  const bySource = Object.fromEntries(configs.map((c) => [c.source, c]));

  return NextResponse.json({
    hcp: {
      webhookUrl: getWebhookUrl(orgId),
      forwardEnabled: bySource.hcp?.enabled ?? false,
      forwardUrl: bySource.hcp?.forward_url ?? "",
    },
    ghl: {
      webhookUrl: getGhlWebhookUrl(orgId),
      forwardEnabled: bySource.ghl?.enabled ?? false,
      forwardUrl: bySource.ghl?.forward_url ?? "",
    },
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

  const body = (await request.json()) as {
    hcp?: { forwardEnabled?: boolean; forwardUrl?: string };
    ghl?: { forwardEnabled?: boolean; forwardUrl?: string };
  };
  const orgId = session.user.organizationId;

  if (body.hcp) {
    await upsertWebhookForwarding(orgId, "hcp", {
      enabled: body.hcp.forwardEnabled ?? false,
      forward_url: (body.hcp.forwardUrl?.trim() || null) as string | null,
    });
  }
  if (body.ghl) {
    await upsertWebhookForwarding(orgId, "ghl", {
      enabled: body.ghl.forwardEnabled ?? false,
      forward_url: (body.ghl.forwardUrl?.trim() || null) as string | null,
    });
  }

  return NextResponse.json({ ok: true });
}
