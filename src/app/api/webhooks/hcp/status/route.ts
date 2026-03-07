import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function getWebhookUrl(organizationId: string): string {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  return `${baseUrl}/api/webhooks/hcp/${organizationId}`;
}

export async function GET() {
  const session = await getServerSession(authOptions);
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
