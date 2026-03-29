import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AttributionInsightsClient } from "@/components/AttributionInsightsClient";

export default async function InsightsAttributionPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Attribution</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Track which channels drive site visits and contact attempts through first-party links and on-site events.
        </p>
        <AttributionInsightsClient />
      </main>
    </div>
  );
}

