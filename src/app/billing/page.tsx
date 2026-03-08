import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";

export default async function BillingPage() {
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

        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Billing</h1>

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
