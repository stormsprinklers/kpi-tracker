import Link from "next/link";

export default function PerformancePaySettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Performance Pay
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Configure pay structures for roles and employees. Expected pay is calculated from timesheets and metrics.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Set up pay rules, bonuses, and expected pay calculations for your team.
        </p>
        <Link
          href="/team/performance-pay"
          className="mt-3 inline-block text-sm font-medium text-zinc-900 underline hover:no-underline dark:text-zinc-100"
        >
          Edit Performance Pay →
        </Link>
      </section>
    </div>
  );
}
