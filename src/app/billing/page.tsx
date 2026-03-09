import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrganizationById } from "@/lib/db/queries";

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }

  const org = await getOrganizationById(session.user.organizationId);
  const trialEndsAt = org?.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const isOnTrial = trialEndsAt && trialEndsAt > new Date();
  const trialDaysRemaining = isOnTrial
    ? Math.ceil((trialEndsAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to Dashboard
        </Link>

        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Billing</h1>

        {isOnTrial && (
          <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
            <h2 className="text-sm font-medium text-blue-800 dark:text-blue-200">14-day free trial</h2>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              {trialDaysRemaining} day{trialDaysRemaining !== 1 ? "s" : ""} remaining
            </p>
          </section>
        )}

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Plan</h2>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">Pro</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">$29.99 per month</p>
            </div>
            <button
              type="button"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Manage
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Payment method</h2>
          <p className="mt-2 font-mono text-sm text-zinc-900 dark:text-zinc-50">
            **** **** **** 0000
          </p>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Billing cadence</h2>
          <p className="mt-2 text-sm text-zinc-900 dark:text-zinc-50">Monthly</p>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Recent transactions</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No transactions yet.</p>
        </section>
      </main>
    </div>
  );
}
