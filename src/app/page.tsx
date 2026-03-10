import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOrganizationById } from "@/lib/db/queries";
import { KeyMetricsSection } from "@/components/KeyMetricsSection";
import { TechnicianRevenueSection } from "@/components/TechnicianRevenueSection";
import { CsrKpisSection } from "@/components/CsrKpisSection";
import { EmployeeDashboardBanner } from "@/components/EmployeeDashboardBanner";
import { ActivityFeed } from "@/components/ActivityFeed";
import { AIInsightsSection } from "@/components/AIInsightsSection";
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
        {isEmployeeWithLink && (
          <EmployeeDashboardBanner hcpEmployeeId={session.user.hcpEmployeeId!} />
        )}
        {connected && <AIInsightsSection dashboard="main" />}
        <KeyMetricsSection connected={connected} />
        {connected && <ActivityFeed connected={connected} />}
        {connected && <TechnicianRevenueSection />}
        {connected && <CsrKpisSection />}
      </main>
    </div>
  );
}
