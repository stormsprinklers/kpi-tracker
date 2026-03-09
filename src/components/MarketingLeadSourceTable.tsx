"use client";

const LEAD_SOURCES = [
  { id: "organic_search", label: "Organic Search", integratePlatform: "Organic Search" },
  { id: "google_business_profile", label: "Google Business Profile", integratePlatform: "Google Business Profile" },
  { id: "google_lsa", label: "Google LSA", integratePlatform: "Google LSA" },
  { id: "meta_ads", label: "Meta Ads", integratePlatform: "Meta Ads" },
  { id: "google_ads", label: "Google Ads", integratePlatform: "Google Ads" },
  { id: "referrals", label: "Referrals", integratePlatform: "Referrals" },
] as const;

export function MarketingLeadSourceTable() {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Performance by lead source
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Connect platforms in Settings to sync spend and attribution data.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Lead source</th>
              <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">Total spend</th>
              <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">Cost per lead</th>
              <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">Booking rate</th>
              <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">Conversion rate</th>
              <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">Avg revenue</th>
              <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300 text-right">Total revenue</th>
            </tr>
          </thead>
          <tbody>
            {LEAD_SOURCES.map((source) => (
              <tr
                key={source.id}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="py-2 text-zinc-900 dark:text-zinc-50">
                  <div className="flex items-center gap-2">
                    <span>{source.label}</span>
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Integrate with {source.integratePlatform}
                    </button>
                  </div>
                </td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">—</td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">—</td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">—</td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">—</td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">—</td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
