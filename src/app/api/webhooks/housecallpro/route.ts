import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Webhook endpoint is live",
  });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      Allow: "GET, HEAD, POST, OPTIONS",
    },
  });
}

function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-housecall-signature");
  const secret = process.env.HOUSECALLPRO_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[HCP Webhook] HOUSECALLPRO_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();

  if (!verifySignature(body, signature, secret)) {
    console.warn("[HCP Webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Log event for now (replace with persistence later)
  console.log("[HCP Webhook] Received event:", payload);

  return NextResponse.json({ received: true }, { status: 200 });
}
