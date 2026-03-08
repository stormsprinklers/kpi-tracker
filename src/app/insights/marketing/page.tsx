import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";

export default async function InsightsMarketingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to Dashboard
        </Link>

        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Marketing</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          SEO, Google Business Profile, Meta Ads, Google Ads, Google Local Services Ads.
        </p>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">SEO</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Coming soon.</p>
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Google Business Profile</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Coming soon.</p>
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Meta Ads</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Coming soon.</p>
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Google Ads</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Coming soon.</p>
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Google Local Services Ads</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Coming soon.</p>
        </section>
      </main>
    </div>
  );
}
