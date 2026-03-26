import { NextResponse } from "next/server";

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** POST /api/cron/ai-insights - Weekly refresh of AI insights for all orgs. Protected by CRON_SECRET. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ status: "disabled", message: "AI insights disabled" });
}
