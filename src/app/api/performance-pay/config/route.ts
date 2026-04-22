import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getPerformancePayOrg,
  upsertPerformancePayConfig,
  upsertPerformancePayOrg,
  deletePerformancePayConfig,
  upsertPerformancePayAssignment,
} from "@/lib/db/queries";
import { isValidIanaTimeZone, normalizePayPeriodAnchorYmd } from "@/lib/payPeriod";

/** POST /api/performance-pay/config - Create/update config for role or employee (admin only). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await initSchema();
  const body = (await request.json()) as {
    scope_type?: "role" | "employee";
    scope_id?: string;
    scope_ids?: string[];
    structure_type?: string;
    config_json?: Record<string, unknown>;
    bonuses_json?: Record<string, unknown>[];
    setup_completed?: boolean;
    pay_period_start_weekday?: number;
    pay_period_timezone?: string;
    pay_period_anchor_date?: string | null;
  };

  const scopeType = body.scope_type;
  const scopeId = body.scope_id?.trim();
  const scopeIds =
    Array.isArray(body.scope_ids) && body.scope_ids.length > 0
      ? Array.from(
          new Set(
            body.scope_ids
              .map((v) => (typeof v === "string" ? v.trim() : ""))
              .filter(Boolean)
          )
        )
      : [];
  const structureType = body.structure_type?.trim();

  if (body.pay_period_timezone != null) {
    const tz = String(body.pay_period_timezone).trim();
    if (!tz || !isValidIanaTimeZone(tz)) {
      return NextResponse.json({ error: "Invalid pay_period_timezone" }, { status: 400 });
    }
    body.pay_period_timezone = tz;
  }

  if (!scopeType || !structureType) {
    return NextResponse.json(
      { error: "scope_type and structure_type are required" },
      { status: 400 }
    );
  }
  if (scopeType !== "role" && scopeType !== "employee") {
    return NextResponse.json({ error: "scope_type must be 'role' or 'employee'" }, { status: 400 });
  }
  if (scopeType === "role" && !scopeId) {
    return NextResponse.json({ error: "scope_id is required for role scope" }, { status: 400 });
  }
  if (scopeType === "employee" && !scopeId && scopeIds.length === 0) {
    return NextResponse.json({ error: "scope_id or scope_ids is required for employee scope" }, { status: 400 });
  }

  const configJson = typeof body.config_json === "object" ? body.config_json ?? {} : {};
  const bonusesJson = Array.isArray(body.bonuses_json) ? body.bonuses_json : [];

  const scopeTargets =
    scopeType === "employee"
      ? scopeIds.length > 0
        ? scopeIds
        : scopeId
          ? [scopeId]
          : []
      : scopeId
        ? [scopeId]
        : [];

  for (const targetScopeId of scopeTargets) {
    if (scopeType === "employee") {
      await upsertPerformancePayAssignment(session.user.organizationId, targetScopeId, {
        role_id: null,
        overridden: true,
      });
    }

    await upsertPerformancePayConfig(session.user.organizationId, {
      scope_type: scopeType,
      scope_id: targetScopeId,
      structure_type: structureType,
      config_json: configJson,
      bonuses_json: bonusesJson,
    });
  }

  const hasAnchorKey = Object.prototype.hasOwnProperty.call(body, "pay_period_anchor_date");
  let anchorForOrg: string | null | undefined = undefined;
  if (hasAnchorKey) {
    const raw = body.pay_period_anchor_date;
    if (raw === null || raw === "") {
      anchorForOrg = null;
    } else if (typeof raw === "string") {
      const w =
        typeof body.pay_period_start_weekday === "number" && !Number.isNaN(body.pay_period_start_weekday)
          ? body.pay_period_start_weekday
          : (await getPerformancePayOrg(session.user.organizationId))?.pay_period_start_weekday ?? 1;
      const n = normalizePayPeriodAnchorYmd(raw, w);
      if (!n) {
        return NextResponse.json({ error: "Invalid pay_period_anchor_date" }, { status: 400 });
      }
      anchorForOrg = n;
    } else {
      return NextResponse.json({ error: "pay_period_anchor_date must be string or null" }, { status: 400 });
    }
  }

  if (
    body.setup_completed === true ||
    body.pay_period_start_weekday != null ||
    body.pay_period_timezone != null ||
    hasAnchorKey
  ) {
    await upsertPerformancePayOrg(session.user.organizationId, {
      setup_completed: body.setup_completed,
      pay_period_start_weekday: body.pay_period_start_weekday,
      pay_period_timezone: body.pay_period_timezone,
      pay_period_anchor_date: hasAnchorKey ? anchorForOrg : undefined,
    });
  } else {
    await upsertPerformancePayOrg(session.user.organizationId, {
      setup_completed: true,
    });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE /api/performance-pay/config - Remove config (admin only). */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const scopeType = searchParams.get("scope_type");
  const scopeId = searchParams.get("scope_id")?.trim();

  if (!scopeType || !scopeId) {
    return NextResponse.json(
      { error: "scope_type and scope_id query params are required" },
      { status: 400 }
    );
  }
  if (scopeType !== "role" && scopeType !== "employee") {
    return NextResponse.json({ error: "scope_type must be 'role' or 'employee'" }, { status: 400 });
  }

  await deletePerformancePayConfig(
    session.user.organizationId,
    scopeType as "role" | "employee",
    scopeId
  );
  return NextResponse.json({ ok: true });
}
