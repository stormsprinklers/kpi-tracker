import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MarketingExecutiveSummary } from "@/components/MarketingExecutiveSummary";
import { MarketingLeadSourceTable } from "@/components/MarketingLeadSourceTable";
import { MarketingSeoInsights } from "@/components/MarketingSeoInsights";
import { AIInsightsSection } from "@/components/AIInsightsSection";

export default async function InsightsMarketingPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Marketing</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Ad spend, leads, revenue by source. SEO and keyword rankings.
        </p>

        <MarketingExecutiveSummary />
        <MarketingLeadSourceTable />
        <MarketingSeoInsights />
        <AIInsightsSection dashboard="marketing" />
      </main>
    </div>
  );
}
