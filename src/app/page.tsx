import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOrganizationById } from "@/lib/db/queries";
import { DashboardHomeClient } from "@/components/DashboardHomeClient";
import { EmployeeDashboardBanner } from "@/components/EmployeeDashboardBanner";
import { DashboardAutoSync } from "@/components/DashboardAutoSync";
import { LandingPage } from "@/components/LandingPage";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    return <LandingPage />;
  }
  if (!session.user.organizationId) {
    redirect("/setup");
  }
  const org = await getOrganizationById(session.user.organizationId);
  const connected = !!org?.hcp_access_token;
  const isEmployeeWithLink =
    session.user.role === "employee" && !!session.user.hcpEmployeeId;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <DashboardAutoSync enabled={connected} />
        {isEmployeeWithLink && (
          <EmployeeDashboardBanner hcpEmployeeId={session.user.hcpEmployeeId!} />
        )}
        <DashboardHomeClient connected={connected} />
      </main>
    </div>
  );
}
