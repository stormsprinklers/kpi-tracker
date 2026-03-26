import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function InsightsProfitPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Profit</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          P&amp;L and Balance Sheet from QuickBooks. Estimated profit levels.
        </p>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Profit &amp; Loss</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Coming soon.</p>
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Balance Sheet</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Coming soon.</p>
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Estimated Profit</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Coming soon.</p>
        </section>
      </main>
    </div>
  );
}
