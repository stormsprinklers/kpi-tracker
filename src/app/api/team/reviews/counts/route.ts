import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getAssignedGoogleReviewCounts,
  getAssignedGoogleReviewCountsForPeriod,
} from "@/lib/db/queries";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids") ?? "";
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await initSchema();
  const counts =
    startDate && endDate
      ? await getAssignedGoogleReviewCountsForPeriod(
          session.user.organizationId,
          ids,
          startDate,
          endDate
        )
      : await getAssignedGoogleReviewCounts(session.user.organizationId, ids);
  return NextResponse.json({ counts });
}
