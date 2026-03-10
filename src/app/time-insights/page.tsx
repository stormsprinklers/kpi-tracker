import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TimeInsightsClient } from "@/components/TimeInsightsClient";
import { AIInsightsSection } from "@/components/AIInsightsSection";

export default async function TimeInsightsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <AIInsightsSection dashboard="time" />
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Time Insights
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Average jobs per day per technician, drive time, and job time per line item (single-line-item jobs only).
          </p>
          <TimeInsightsClient />
        </section>
      </main>
    </div>
  );
}
