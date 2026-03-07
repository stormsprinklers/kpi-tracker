import { NextResponse } from "next/server";

/**
 * Simple ping endpoint for webhook isolation testing.
 * Returns 200 for any request. Use this URL in HCP to verify your deployment
 * is reachable. If you get 401 here, the issue is Vercel Deployment Protection
 * (Project Settings → Deployment Protection → disable for webhooks).
 */
export async function GET() {
  return NextResponse.json({ ok: true, message: "Webhook ping OK" });
}

export async function POST() {
  return NextResponse.json({ ok: true, message: "Webhook ping OK" });
}
