import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWebhookUrl } from "@/lib/webhook";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = getWebhookUrl(session.user.organizationId);

  let webhookReachable = false;
  try {
    const res = await fetch(webhookUrl, { method: "GET" });
    webhookReachable = res.ok;
  } catch {
    // Ignore fetch errors
  }

  return NextResponse.json({
    webhookUrl,
    organizationId: session.user.organizationId,
    webhookReachable,
    ok: true,
  });
}
