import { NextResponse } from "next/server";
import { runTwilioTranscriptPoll } from "@/lib/cron/twilioTranscriptPoll";

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export const dynamic = "force-dynamic";

/**
 * On-demand transcript poll (same logic as scheduled `/api/sync` cron runs).
 * Use with `Authorization: Bearer CRON_SECRET` if you add an external scheduler.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { processed, updated } = await runTwilioTranscriptPoll();
  return NextResponse.json({ ok: true, processed, updated });
}
