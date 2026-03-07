import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/queries";
import { TechnicianRevenueSection } from "@/components/TechnicianRevenueSection";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    redirect("/login");
  }
  const org = await getOrganizationById(session.user.organizationId);
  const connected = !!org?.hcp_access_token;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        {connected && <TechnicianRevenueSection />}

        <section>
          <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Key Metrics
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Jobs This Week
              </h3>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                —
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Connect Housecall Pro to sync
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Revenue
              </h3>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                —
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Connect Housecall Pro to sync
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Avg. Job Value
              </h3>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                —
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Connect Housecall Pro to sync
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
