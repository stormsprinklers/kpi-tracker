import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { setPerformancePayOrgFiveStarBonus } from "@/lib/db/queries";

/** PATCH /api/performance-pay/org — org-wide Performance Pay settings (admin only). */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: { bonus_per_five_star_review?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Object.prototype.hasOwnProperty.call(body, "bonus_per_five_star_review")) {
    return NextResponse.json(
      { error: "bonus_per_five_star_review is required (number or null)" },
      { status: 400 }
    );
  }

  const raw = body.bonus_per_five_star_review;
  let value: number | null = null;
  if (raw === null) {
    value = null;
  } else if (typeof raw === "number" && Number.isFinite(raw)) {
    value = raw < 0 ? null : Math.round(raw * 10000) / 10000;
  } else {
    return NextResponse.json(
      { error: "bonus_per_five_star_review must be a number or null" },
      { status: 400 }
    );
  }

  await initSchema();
  await setPerformancePayOrgFiveStarBonus(session.user.organizationId, value);

  return NextResponse.json({ ok: true, bonus_per_five_star_review: value });
}
