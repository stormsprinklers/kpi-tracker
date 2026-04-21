import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  setMarketingSyncError,
  setMarketingSyncSuccess,
  upsertMarketingSpendSnapshot,
} from "@/lib/db/marketingQueries";
import { parseGoogleLsaLeadsCsv } from "@/lib/marketing/lsaManualImport";

function isYmd(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export const dynamic = "force-dynamic";

/** Admin temporary fallback: manually upload LSA leads CSV + total spend for selected period. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const startDate = String(form.get("startDate") ?? "").slice(0, 10);
    const endDate = String(form.get("endDate") ?? "").slice(0, 10);
    const spendRaw = String(form.get("totalSpend") ?? "").trim();
    const file = form.get("leadsCsv");

    if (!isYmd(startDate) || !isYmd(endDate)) {
      return NextResponse.json({ error: "startDate and endDate are required (YYYY-MM-DD)." }, { status: 400 });
    }
    const totalSpend = Number(spendRaw);
    if (!Number.isFinite(totalSpend) || totalSpend < 0) {
      return NextResponse.json({ error: "totalSpend must be a non-negative number." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "leadsCsv file is required." }, { status: 400 });
    }

    const csvText = await file.text();
    const rows = parseGoogleLsaLeadsCsv(csvText);
    const inRange = rows.filter((r) => r.leadReceivedYmd && r.leadReceivedYmd >= startDate && r.leadReceivedYmd <= endDate);
    const phoneCalls = inRange.filter((r) => r.leadType.toLowerCase().includes("phone")).length;

    await initSchema();
    await upsertMarketingSpendSnapshot({
      organizationId: session.user.organizationId,
      periodStart: startDate,
      periodEnd: endDate,
      channelSlug: "google_lsa",
      spendAmount: Math.round(totalSpend * 100) / 100,
      currencyCode: "USD",
      platformLeads: inRange.length,
      phoneCalls,
      sourceSystem: "lsa_manual_csv",
      raw: {
        source: "manual_lsa_csv_upload",
        filename: file.name,
        uploadedAt: new Date().toISOString(),
        totalRows: rows.length,
        rowsInRange: inRange.length,
        phoneCallsInRange: phoneCalls,
      },
    });

    await setMarketingSyncSuccess({
      organizationId: session.user.organizationId,
      integration: "lsa",
      cursorJson: {
        source: "manual_lsa_csv",
        startDate,
        endDate,
        totalRows: rows.length,
        rowsInRange: inRange.length,
      },
    });

    return NextResponse.json({
      ok: true,
      message: `Manual LSA data saved (${inRange.length} leads in range).`,
      stats: { totalRows: rows.length, leadsInRange: inRange.length, phoneCallsInRange: phoneCalls },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Manual LSA upload failed";
    try {
      if (session?.user?.organizationId) {
        await setMarketingSyncError({
          organizationId: session.user.organizationId,
          integration: "lsa",
          message: msg,
        });
      }
    } catch {
      /* noop */
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
