import { getGoogleBusinessOAuthConfig, refreshAccessToken } from "@/lib/googleBusinessOAuth";
import {
  getMarketingOAuthRefreshToken,
  upsertMarketingSpendSnapshot,
  setMarketingSyncSuccess,
  setMarketingSyncError,
} from "@/lib/db/marketingQueries";

function stripMccId(id: string): string {
  return id.replace(/-/g, "").trim();
}

/**
 * Fetches Local Services account reports for the manager (MCC) customer and stores
 * one aggregated snapshot for channel `google_lsa` for [periodStart, periodEnd].
 *
 * Requires:
 * - `marketing_oauth_credentials` refresh token for integration `lsa` (OAuth with AdWords / LSA scope).
 * - `GOOGLE_LSA_MANAGER_CUSTOMER_ID` env (10-digit MCC id, dashes optional).
 */
export async function syncLsaAccountReportsForOrganization(
  organizationId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ ok: boolean; error?: string }> {
  const managerRaw = process.env.GOOGLE_LSA_MANAGER_CUSTOMER_ID?.trim();
  if (!managerRaw) {
    await setMarketingSyncError({
      organizationId,
      integration: "lsa",
      message: "GOOGLE_LSA_MANAGER_CUSTOMER_ID is not set",
    });
    return { ok: false, error: "GOOGLE_LSA_MANAGER_CUSTOMER_ID is not set" };
  }

  const refresh = await getMarketingOAuthRefreshToken(organizationId, "lsa");
  if (!refresh) {
    await setMarketingSyncError({
      organizationId,
      integration: "lsa",
      message: "LSA OAuth not connected for this organization",
    });
    return { ok: false, error: "LSA OAuth not connected" };
  }

  const { clientId, clientSecret } = getGoogleBusinessOAuthConfig();
  if (!clientId || !clientSecret) {
    await setMarketingSyncError({
      organizationId,
      integration: "lsa",
      message: "Google OAuth client not configured",
    });
    return { ok: false, error: "Google OAuth client not configured" };
  }

  try {
    const { access_token } = await refreshAccessToken({
      refreshToken: refresh,
      clientId,
      clientSecret,
    });

    const ps = periodStart.slice(0, 10);
    const pe = periodEnd.slice(0, 10);
    const [ys, ms, ds] = ps.split("-").map(Number);
    const [ye, me, de] = pe.split("-").map(Number);

    const managerId = stripMccId(managerRaw);
    const query = `manager_customer_id:${managerId}`;
    const u = new URL("https://localservices.googleapis.com/v1/accountReports:search");
    u.searchParams.set("query", query);
    u.searchParams.set("startDate.year", String(ys));
    u.searchParams.set("startDate.month", String(ms));
    u.searchParams.set("startDate.day", String(ds));
    u.searchParams.set("endDate.year", String(ye));
    u.searchParams.set("endDate.month", String(me));
    u.searchParams.set("endDate.day", String(de));
    u.searchParams.set("pageSize", "10000");

    const res = await fetch(u.toString(), {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json",
      },
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        (body.error as { message?: string } | undefined)?.message ??
        (body.message as string | undefined) ??
        `LSA API ${res.status}`;
      await setMarketingSyncError({ organizationId, integration: "lsa", message: msg });
      return { ok: false, error: msg };
    }

    const reports = (body.accountReports ?? body.account_reports) as unknown[] | undefined;
    const list = Array.isArray(reports) ? reports : [];

    let totalCost = 0;
    let chargedLeads = 0;
    let phoneCalls = 0;
    let currency = "USD";

    for (const r of list) {
      const row = r as Record<string, unknown>;
      const cost = Number(row.currentPeriodTotalCost ?? row.current_period_total_cost ?? 0);
      if (!Number.isNaN(cost)) totalCost += cost;
      const leads = Number(row.currentPeriodChargedLeads ?? row.current_period_charged_leads ?? 0);
      if (!Number.isNaN(leads)) chargedLeads += leads;
      const calls = Number(row.currentPeriodPhoneCalls ?? row.current_period_phone_calls ?? 0);
      if (!Number.isNaN(calls)) phoneCalls += calls;
      const cur = row.currencyCode ?? row.currency_code;
      if (typeof cur === "string" && cur.length === 3) currency = cur;
    }

    await upsertMarketingSpendSnapshot({
      organizationId,
      periodStart: ps,
      periodEnd: pe,
      channelSlug: "google_lsa",
      spendAmount: Math.round(totalCost * 100) / 100,
      currencyCode: currency,
      platformLeads: chargedLeads || null,
      phoneCalls: phoneCalls || null,
      sourceSystem: "lsa_account_report",
      raw: body,
    });

    await setMarketingSyncSuccess({
      organizationId,
      integration: "lsa",
      cursorJson: { periodStart: ps, periodEnd: pe, accounts: list.length },
    });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setMarketingSyncError({ organizationId, integration: "lsa", message: msg });
    return { ok: false, error: msg };
  }
}
