"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MetricTooltip } from "./MetricTooltip";

interface SeoData {
  configured: boolean;
  message?: string;
  error?: string;
  cachedAt?: string;
  fromCache?: boolean;
  locations?: { value: string; name: string }[];
  serviceAreas?: { id: string; name: string; locationCount: number }[];
  organic?: Array<{
    keyword: string;
    locationKey: string;
    locationValue: string;
    rank: number | null;
    url: string | null;
    title: string | null;
  }>;
  local?: Array<{
    keyword: string;
    locationKey: string;
    locationValue: string;
    rank: number | null;
    title: string | null;
  }>;
  ai?: Array<{
    keyword: string;
    locationKey: string;
    locationValue: string;
    mentioned: boolean;
    snippet: string | null;
  }>;
  serviceAreaLocal?: Array<{
    serviceAreaName: string;
    keyword: string;
    avgRank: number | null;
    locationCount: number;
  }>;
  serviceAreaOrganic?: Array<{
    serviceAreaName: string;
    keyword: string;
    avgRank: number | null;
    locationCount: number;
  }>;
}

function rankColor(rank: number | null): string {
  if (rank == null) return "text-zinc-400 dark:text-zinc-500";
  if (rank <= 3) return "text-emerald-600 dark:text-emerald-400 font-medium";
  if (rank <= 10) return "text-amber-600 dark:text-amber-400";
  return "text-zinc-600 dark:text-zinc-400";
}

export function MarketingSeoInsights() {
  const [data, setData] = useState<SeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const url = isRefresh ? "/api/marketing/seo?force_refresh=1" : "/api/marketing/seo";
      const res = await fetch(url);
      const json = (await res.json()) as SeoData;
      setData(json);
    } catch {
      setData({ configured: false, message: "Failed to load SEO data." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !data) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          SEO insights
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </section>
    );
  }

  if (!data?.configured) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          SEO insights
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {data?.message ??
            "Local search and keyword rankings. Configure to view."}
        </p>
        <Link
          href="/settings/seo"
          className="mt-3 inline-block text-sm font-medium text-zinc-900 underline hover:no-underline dark:text-zinc-100"
        >
          Configure Marketing & SEO in Settings →
        </Link>
      </section>
    );
  }

  if (data.error) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          SEO insights
        </h2>
        <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
          {data.error}
        </p>
        <Link
          href="/settings/seo"
          className="mt-2 inline-block text-sm font-medium text-zinc-900 underline hover:no-underline dark:text-zinc-100"
        >
          Configure SEO →
        </Link>
      </section>
    );
  }

  const locations = data.locations ?? [];
  const localData = data.local ?? [];
  const organicData = data.organic ?? [];
  const aiData = data.ai ?? [];
  const serviceAreaLocal = data.serviceAreaLocal ?? [];
  const serviceAreaOrganic = data.serviceAreaOrganic ?? [];

  const keywords = [...new Set(localData.map((r) => r.keyword))];

  const getLocalRank = (keyword: string, locValue: string) => {
    const r = localData.find((x) => x.keyword === keyword && x.locationValue === locValue);
    return r?.rank ?? null;
  };

  const getServiceAreaLocalRank = (keyword: string, areaName: string) => {
    const r = serviceAreaLocal.find(
      (x) => x.keyword === keyword && x.serviceAreaName === areaName
    );
    return r?.avgRank ?? null;
  };

  const getServiceAreaOrganicRank = (keyword: string, areaName: string) => {
    const r = serviceAreaOrganic.find(
      (x) => x.keyword === keyword && x.serviceAreaName === areaName
    );
    return r?.avgRank ?? null;
  };

  const serviceAreaNames = [...new Set(serviceAreaLocal.map((x) => x.serviceAreaName))];

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          SEO insights
        </h2>
        <button
          type="button"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="rounded bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        Google Organic, Local Finder (GBP), and AI Mode rankings via DataForSEO.
        {data.cachedAt && (
          <span className="ml-1">
            Data as of {new Date(data.cachedAt).toLocaleDateString()}.
            {data.fromCache && " Cached to limit API costs; refresh for fresh data."}
          </span>
        )}
      </p>

      {serviceAreaNames.length > 0 && keywords.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <MetricTooltip
              label="Service area averages"
              tooltip="Average ranking across all cities/zips in each service area."
            />
          </h3>
          <div className="mt-2 space-y-4">
            {serviceAreaNames.map((areaName) => (
              <div key={areaName}>
                <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {areaName}
                </h4>
                <div className="mt-1 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="border border-zinc-200 px-2 py-1.5 text-left text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                          Keyword
                        </th>
                        <th className="border border-zinc-200 px-2 py-1.5 text-center text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                          Local avg
                        </th>
                        <th className="border border-zinc-200 px-2 py-1.5 text-center text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                          Organic avg
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {keywords.map((kw) => (
                        <tr key={kw}>
                          <td className="border border-zinc-200 px-2 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
                            {kw}
                          </td>
                          <td
                            className={`border border-zinc-200 px-2 py-1.5 text-center dark:border-zinc-700 ${rankColor(getServiceAreaLocalRank(kw, areaName))}`}
                          >
                            {getServiceAreaLocalRank(kw, areaName) ?? "—"}
                          </td>
                          <td
                            className={`border border-zinc-200 px-2 py-1.5 text-center dark:border-zinc-700 ${rankColor(getServiceAreaOrganicRank(kw, areaName))}`}
                          >
                            {getServiceAreaOrganicRank(kw, areaName) ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {keywords.length > 0 && locations.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <MetricTooltip
              label="Google Business Profile rankings"
              tooltip="Local pack rankings for your business. Rows = keywords, columns = locations."
            />
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-zinc-200 px-2 py-1.5 text-left text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    Keyword
                  </th>
                  {locations.map((loc) => (
                    <th
                      key={loc.value}
                      className="border border-zinc-200 px-2 py-1.5 text-center text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                    >
                      {loc.name.length > 20 ? loc.name.slice(0, 18) + "…" : loc.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keywords.map((kw) => (
                  <tr key={kw}>
                    <td className="border border-zinc-200 px-2 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
                      {kw}
                    </td>
                    {locations.map((loc) => {
                      const rank = getLocalRank(kw, loc.value);
                      return (
                        <td
                          key={loc.value}
                          className={`border border-zinc-200 px-2 py-1.5 text-center dark:border-zinc-700 ${rankColor(rank)}`}
                        >
                          {rank != null ? rank : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {organicData.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <MetricTooltip
              label="Keyword rankings (Organic)"
              tooltip="Where your website ranks in organic search for each keyword and location."
            />
          </h3>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-white dark:bg-zinc-950">
                <tr>
                  <th className="border border-zinc-200 px-2 py-1.5 text-left text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    Keyword
                  </th>
                  <th className="border border-zinc-200 px-2 py-1.5 text-left text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    Location
                  </th>
                  <th className="border border-zinc-200 px-2 py-1.5 text-center text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    Rank
                  </th>
                  <th className="border border-zinc-200 px-2 py-1.5 text-left text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    URL
                  </th>
                </tr>
              </thead>
              <tbody>
                {organicData
                  .filter((o) => o.rank != null)
                  .slice(0, 30)
                  .map((o, i) => (
                    <tr key={i}>
                      <td className="border border-zinc-200 px-2 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
                        {o.keyword}
                      </td>
                      <td className="border border-zinc-200 px-2 py-1.5 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                        {o.locationKey}
                      </td>
                      <td
                        className={`border border-zinc-200 px-2 py-1.5 text-center dark:border-zinc-700 ${rankColor(o.rank)}`}
                      >
                        {o.rank}
                      </td>
                      <td className="max-w-[200px] truncate border border-zinc-200 px-2 py-1.5 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                        {o.url ? (
                          <a
                            href={o.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {o.url}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {organicData.filter((o) => o.rank != null).length === 0 && (
              <p className="py-4 text-sm text-zinc-500 dark:text-zinc-400">
                No organic rankings found in top results.
              </p>
            )}
          </div>
        </div>
      )}

      {aiData.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <MetricTooltip
              label="Google AI Mode mentions"
              tooltip="Whether your business or domain appears in Google AI Overview results."
            />
          </h3>
          <div className="mt-2 space-y-1">
            {aiData
              .filter((a) => a.mentioned)
              .slice(0, 10)
              .map((a, i) => (
                <div
                  key={i}
                  className="rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {a.keyword}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {" "}
                    in {a.locationKey}
                  </span>
                  {a.snippet && (
                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {a.snippet}…
                    </p>
                  )}
                </div>
              ))}
            {aiData.filter((a) => a.mentioned).length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No AI Mode mentions found.
              </p>
            )}
          </div>
        </div>
      )}

      {keywords.length === 0 && organicData.length === 0 && aiData.length === 0 && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Add keywords and locations in Settings → Marketing & SEO to see rankings.
        </p>
      )}
    </section>
  );
}
