import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOrganizationById } from "@/lib/db/queries";
import { CompanyLogoSection } from "@/components/CompanyLogoSection";
import { SettingsSidebar } from "@/components/SettingsSidebar";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  const org = await getOrganizationById(session.user.organizationId);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <div className="flex min-h-screen flex-1">
        <SettingsSidebar />
        <main className="flex flex-1 flex-col p-6 pl-4 pt-14 lg:pt-6">
          <CompanyLogoSection
            organizationId={session.user.organizationId}
            initialLogoUrl={org?.logo_url ?? null}
          />
          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
