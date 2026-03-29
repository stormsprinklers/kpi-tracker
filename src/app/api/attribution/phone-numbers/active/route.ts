import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { listActivePhoneNumbersForOrg } from "@/lib/db/twilioAttributionQueries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initSchema();
  const active = await listActivePhoneNumbersForOrg(session.user.organizationId);
  return NextResponse.json({ active });
}
