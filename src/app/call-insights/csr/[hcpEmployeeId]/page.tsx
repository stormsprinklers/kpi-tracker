import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOrganizationById, getEmployeesAndProsForCsrSelector } from "@/lib/db/queries";
import { CsrCallDetailClient } from "@/components/CsrCallDetailClient";

export default async function CsrCallDetailPage({
  params,
}: {
  params: Promise<{ hcpEmployeeId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }

  const { hcpEmployeeId } = await params;
  const org = await getOrganizationById(session.user.organizationId);
  const companyId = org?.hcp_company_id ?? "default";

  const candidates = await getEmployeesAndProsForCsrSelector(companyId);
  const csr = candidates.find((c) => c.id === hcpEmployeeId);
  const csrName = csr?.name ?? hcpEmployeeId;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center gap-4">
          <Link
            href="/insights/attribution#call-tracking"
            className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Back to Attribution
          </Link>
        </div>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            CSR Call Detail
          </h2>
          <CsrCallDetailClient hcpEmployeeId={hcpEmployeeId} csrName={csrName} />
        </section>
      </main>
    </div>
  );
}
