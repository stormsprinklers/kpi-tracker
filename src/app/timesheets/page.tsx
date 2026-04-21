import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TimesheetsClient } from "./TimesheetsClient";

export default async function TimesheetsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "admin";
  if (!isAdmin) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Timesheets
          </h2>
          <TimesheetsClient
            isAdmin={isAdmin}
            hcpEmployeeId={undefined}
          />
        </section>
      </main>
    </div>
  );
}
