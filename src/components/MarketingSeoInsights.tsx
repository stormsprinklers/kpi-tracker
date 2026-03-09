"use client";

import { MetricTooltip } from "./MetricTooltip";

export function MarketingSeoInsights() {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">SEO insights</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Local search and keyword rankings. Connect SERP API to populate.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            Google Business Profile rankings
          </h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Connect SERP API to view local search rankings.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <MetricTooltip
              label="Keyword rankings"
              tooltip="Search engine position for tracked keywords. Shows ranking position over time when SERP API is connected."
            />
          </h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Connect SERP API to view keyword rankings.
          </p>
        </div>
      </div>
    </section>
  );
}
