import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CsrCallDetailClient } from "@/components/CsrCallDetailClient";

export default async function AwaitingAssignmentPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <a
            href="/call-insights"
            className="inline-flex gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Back to Call Insights
          </a>
        </div>
        <section className="rounded-lg border border-amber-200 bg-white p-4 dark:border-amber-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Awaiting Assignment
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Calls where the CSR was not clear (N/A). Assign these in GHL or update your workflow to capture the CSR.
          </p>
          <CsrCallDetailClient
            hcpEmployeeId="awaiting-assignment"
            csrName="Awaiting Assignment"
          />
        </section>
      </main>
    </div>
  );
}
