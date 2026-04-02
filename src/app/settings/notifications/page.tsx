import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PulseNotificationsClient } from "./PulseNotificationsClient";

export default async function PulseNotificationsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Notifications</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Business pulse emails: AI-assisted summaries of your metrics, delivered on a schedule. Recipients can be
          customized; otherwise all organization admins receive the emails.
        </p>
      </div>

      <PulseNotificationsClient />
    </div>
  );
}
