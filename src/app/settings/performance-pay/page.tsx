import { PerformancePayPageClient } from "@/app/team/performance-pay/PerformancePayPageClient";

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
      <PerformancePayPageClient />
    </div>
  );
}
