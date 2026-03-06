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

function verifyHcpSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const signedPayload = `${timestamp}.${body}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("api-signature");
  const timestamp = request.headers.get("api-timestamp");
  const secret = process.env.HOUSECALLPRO_WEBHOOK_SECRET;

  // Initial HCP setup/test: no signing secret yet, so accept unsigned requests
  if (!signature || !timestamp) {
    console.log("[HCP Webhook] Unsigned setup/test request accepted");
    if (rawBody) {
      try {
        const body = JSON.parse(rawBody);
        console.log("[HCP Webhook] Setup payload:", body?.event ?? body);
      } catch {
        console.log("[HCP Webhook] Raw body:", rawBody);
      }
    }
    return NextResponse.json({ ok: true, setup: true });
  }

  if (!secret) {
    console.error("[HCP Webhook] HOUSECALLPRO_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  if (!verifyHcpSignature(rawBody, timestamp, signature, secret)) {
    console.warn("[HCP Webhook] Invalid signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[HCP Webhook] Verified event:", (payload as { event?: string })?.event ?? payload);

  return NextResponse.json({ ok: true });
}
