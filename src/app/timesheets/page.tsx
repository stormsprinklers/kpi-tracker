import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TimesheetsClient } from "./TimesheetsClient";

export default async function TimesheetsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    redirect("/login");
  }
  if (!session.user.hcpEmployeeId) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 flex-col gap-6 p-6">
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
            <h2 className="text-lg font-medium text-amber-800 dark:text-amber-400">
              Account not linked
            </h2>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              Your account is not linked to a Housecall Pro employee. Only linked employees can
              manage timesheets. Contact your admin to add you with an email that matches your HCP
              employee record.
            </p>
            <a
              href="/"
              className="mt-4 inline-block rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
            >
              Back to dashboard
            </a>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            My Timesheets
          </h2>
          <TimesheetsClient />
      </main>
    </div>
  );
}
