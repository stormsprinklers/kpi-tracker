"use client";

import Link from "next/link";
import { MetricTooltip } from "@/components/MetricTooltip";
import {
  DEMO_COMPANY_NAME,
  DEMO_CREWS,
  DEMO_CSR,
  DEMO_KEY_METRICS,
  DEMO_PERIOD_LABEL,
  DEMO_TECHNICIANS,
  DEMO_TECH_TOTAL_REVENUE,
  demoAvatar,
} from "@/lib/demo/dashboardDemoData";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyPrecise(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

type MetricDeltaTone = "positive" | "negative" | "neutral";

function formatDelta(delta: number | null): { text: string; tone: MetricDeltaTone } | null {
  if (delta == null || Number.isNaN(delta)) return null;
  if (delta > 0) return { text: `▲ ${delta.toFixed(2)}%`, tone: "positive" };
  if (delta < 0) return { text: `▼ ${Math.abs(delta).toFixed(2)}%`, tone: "negative" };
  return { text: "0.00%", tone: "neutral" };
}

function deltaToneClass(tone: MetricDeltaTone): string {
  if (tone === "positive") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "negative") return "text-red-600 dark:text-red-400";
  return "text-zinc-500 dark:text-zinc-400";
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function MetricCard({
  label,
  tooltip,
  value,
  previous,
  formatValue,
}: {
  label: string;
  tooltip: string;
  value: number;
  previous: number;
  formatValue: (n: number) => string;
}) {
  const delta = formatDelta(percentChange(value, previous));
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        <MetricTooltip label={label} tooltip={tooltip} />
      </h3>
      <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{formatValue(value)}</p>
      {delta && <p className={`mt-0.5 text-[11px] ${deltaToneClass(delta.tone)}`}>{delta.text}</p>}
    </div>
  );
}

export function DemoDashboardClient() {
  const m = DEMO_KEY_METRICS;

  return (
    <div className="flex flex-col gap-6">
      <div
        className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-900/60 dark:bg-sky-950/40"
        role="status"
      >
        <p className="text-sm font-medium text-sky-950 dark:text-sky-100">
          Live demo — sample dashboard for {DEMO_COMPANY_NAME}
        </p>
        <p className="mt-1 text-xs text-sky-900/90 dark:text-sky-200/90">
          All names, numbers, and photos are fictional. Connect your Housecall Pro account for real
          metrics.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/login"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Log in
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Back to home
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Time period</h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{DEMO_COMPANY_NAME}</p>
          </div>
          <select
            value="thisPayPeriod"
            disabled
            className="cursor-not-allowed rounded border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
            aria-label="Dashboard time period (demo)"
          >
            <option>This pay period</option>
          </select>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{DEMO_PERIOD_LABEL}</p>
      </div>

      <section>
        <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">Key Metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Jobs"
            tooltip="Number of paid or completed jobs in the period."
            value={m.jobCount}
            previous={m.previousJobCount}
            formatValue={(n) => String(n)}
          />
          <MetricCard
            label="Revenue"
            tooltip="Cash collected on jobs in the period."
            value={m.revenue}
            previous={m.previousRevenue}
            formatValue={formatCurrency}
          />
          <MetricCard
            label="Avg. Job Value"
            tooltip="Average revenue per job in the period."
            value={m.avgJobValue}
            previous={m.previousAvgJobValue}
            formatValue={formatCurrencyPrecise}
          />
          <MetricCard
            label="Conversion Rate"
            tooltip="Share of estimates that become approved jobs."
            value={m.conversionRate}
            previous={m.previousConversionRate}
            formatValue={(n) => `${n.toFixed(1)}%`}
          />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Technician KPIs</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Sample field team performance</p>

        {DEMO_CREWS.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
              Crews
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {DEMO_CREWS.map((crew) => (
                <div
                  key={crew.id}
                  className="flex flex-col rounded-xl border-2 border-amber-200/90 bg-amber-50/40 p-4 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={demoAvatar(crew.foremanSeed)}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-amber-200 dark:ring-amber-800"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-amber-900/80 dark:text-amber-300/90">
                        Crew
                      </p>
                      <h3 className="truncate font-medium text-zinc-900 dark:text-zinc-50">{crew.name}</h3>
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        Foreman: {crew.foremanLabel}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-zinc-500 dark:text-zinc-400">Total Revenue</dt>
                      <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                        {formatCurrency(crew.totalRevenue)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500 dark:text-zinc-400">Total Man Hours</dt>
                      <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                        {crew.totalManHours.toFixed(1)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500 dark:text-zinc-400">Jobs Completed</dt>
                      <dd className="font-medium text-zinc-900 dark:text-zinc-50">{crew.jobsCompleted}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500 dark:text-zinc-400">Avg Ticket</dt>
                      <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                        {formatCurrency(crew.avgTicket)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {DEMO_TECHNICIANS.map((tech) => (
            <div
              key={tech.id}
              className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50"
            >
              <div className="flex items-center gap-3">
                <img
                  src={demoAvatar(tech.avatarSeed)}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-zinc-200 dark:ring-zinc-600"
                />
                <h3 className="truncate font-medium text-zinc-900 dark:text-zinc-50">{tech.name}</h3>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Total Revenue</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {formatCurrency(tech.totalRevenue)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Conversion Rate</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {tech.conversionRate != null ? `${tech.conversionRate.toFixed(1)}%` : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Rev/Hr</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {tech.revenuePerHour != null ? formatCurrencyPrecise(tech.revenuePerHour) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Avg Ticket</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {tech.avgTicket != null ? formatCurrency(tech.avgTicket) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">5★ Reviews</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">{tech.fiveStarReviews}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-700">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Technician total: </span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">
            {formatCurrency(DEMO_TECH_TOTAL_REVENUE)}
          </span>
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">CSR KPIs</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Sample office / booking team</p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_CSR.map((csr) => (
            <div
              key={csr.id}
              className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-300 dark:bg-zinc-600">
                  <img
                    src={demoAvatar(csr.avatarSeed)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <h3 className="truncate font-medium text-zinc-900 dark:text-zinc-50">{csr.name}</h3>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    <MetricTooltip label="Booking Rate" tooltip="Sample booking rate for demo." />
                  </dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {csr.bookingRate != null ? `${csr.bookingRate.toFixed(1)}%` : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Avg Call Duration</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {csr.avgCallDurationMinutes != null
                      ? formatDuration(csr.avgCallDurationMinutes)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Lead Response Time</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {csr.leadResponseTimeMinutes != null
                      ? formatDuration(csr.leadResponseTimeMinutes)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Avg Booked Call Revenue</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                    {csr.avgBookedCallRevenue != null ? formatCurrency(csr.avgBookedCallRevenue) : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
