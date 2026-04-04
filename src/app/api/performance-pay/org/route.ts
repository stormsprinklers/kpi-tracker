import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { setPerformancePayOrgFiveStarBonus, upsertPerformancePayOrg } from "@/lib/db/queries";
import { isValidIanaTimeZone } from "@/lib/payPeriod";

/** PATCH /api/performance-pay/org — org-wide Performance Pay settings (admin only). */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: {
    bonus_per_five_star_review?: number | null;
    pay_period_start_weekday?: number;
    pay_period_timezone?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasBonus = Object.prototype.hasOwnProperty.call(body, "bonus_per_five_star_review");
  const hasWeekday =
    typeof body.pay_period_start_weekday === "number" && !Number.isNaN(body.pay_period_start_weekday);
  const hasTz = typeof body.pay_period_timezone === "string";

  if (!hasBonus && !hasWeekday && !hasTz) {
    return NextResponse.json(
      {
        error:
          "Provide bonus_per_five_star_review and/or pay_period_start_weekday and/or pay_period_timezone",
      },
      { status: 400 }
    );
  }

  if (hasWeekday) {
    const w = body.pay_period_start_weekday!;
    if (w < 0 || w > 6 || !Number.isInteger(w)) {
      return NextResponse.json(
        { error: "pay_period_start_weekday must be an integer 0 (Sunday) through 6 (Saturday)" },
        { status: 400 }
      );
    }
  }

  if (hasTz) {
    const tz = body.pay_period_timezone!.trim();
    if (!tz || !isValidIanaTimeZone(tz)) {
      return NextResponse.json({ error: "pay_period_timezone must be a valid IANA time zone" }, { status: 400 });
    }
  }

  await initSchema();
  const orgId = session.user.organizationId;

  if (hasBonus) {
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
    await setPerformancePayOrgFiveStarBonus(orgId, value);
  }

  if (hasWeekday || hasTz) {
    await upsertPerformancePayOrg(orgId, {
      pay_period_start_weekday: hasWeekday ? body.pay_period_start_weekday : undefined,
      pay_period_timezone: hasTz ? body.pay_period_timezone!.trim() : undefined,
    });
  }

  return NextResponse.json({ ok: true });
}
