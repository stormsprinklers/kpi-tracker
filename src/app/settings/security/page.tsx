import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SecuritySettingsClient } from "./SecuritySettingsClient";

export default async function SecuritySettingsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Security</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Two-factor authentication (2FA) applies when you sign in with email and password. Codes are sent via{" "}
          <strong>Twilio Verify</strong> (SMS or email). Google and Apple sign-in are unchanged.
        </p>
      </div>
      <SecuritySettingsClient />
    </div>
  );
}
