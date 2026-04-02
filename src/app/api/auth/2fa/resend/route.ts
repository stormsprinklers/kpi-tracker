import { NextResponse } from "next/server";
import { initSchema } from "@/lib/db";
import { verifyTwoFactorPendingToken } from "@/lib/auth/twoFactorPendingToken";
import { startVerify } from "@/lib/twilio/verify";

export async function POST(request: Request) {
  await initSchema();
  let body: { pendingToken?: string };
  try {
    body = (await request.json()) as { pendingToken?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const pendingToken = body.pendingToken?.trim();
  if (!pendingToken) {
    return NextResponse.json({ error: "pendingToken required" }, { status: 400 });
  }

  const payload = await verifyTwoFactorPendingToken(pendingToken);
  if (!payload) {
    return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });
  }

  const started = await startVerify(payload.verifyTo, payload.channel);
  if (!started.ok) {
    return NextResponse.json({ error: started.error }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
