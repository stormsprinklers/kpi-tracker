import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AttributionSetupWizardClient } from "@/components/AttributionSetupWizardClient";

export default async function AttributionSetupPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Attribution setup</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Install the snippet, tracking links, and Twilio numbers. Reporting lives on the main Attribution page.
            </p>
          </div>
          <Link
            href="/insights/attribution"
            className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300"
          >
            Back to attribution insights
          </Link>
        </div>
        <AttributionSetupWizardClient />
      </main>
    </div>
  );
}
