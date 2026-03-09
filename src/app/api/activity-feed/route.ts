import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrganizationById, getActivityFeed } from "@/lib/db/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await getOrganizationById(session.user.organizationId);
  if (!org?.hcp_company_id) {
    return NextResponse.json([]);
  }

  const events = await getActivityFeed(session.user.organizationId, 5);
  return NextResponse.json(events);
}
