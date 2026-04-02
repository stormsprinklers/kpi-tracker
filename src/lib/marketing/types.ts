export type MarketingChannelSlug =
  | "unassigned"
  | "google_lsa"
  | "google_business_profile"
  | "organic_search"
  | "google_ads"
  | "meta_ads";

export interface MarketingChannelRow {
  slug: string;
  display_name: string;
  kind: string;
  spend_applicable: boolean;
  sort_order: number;
}

export interface MarketingOverviewChannelRow {
  slug: string;
  label: string;
  kind: string;
  spendApplicable: boolean;
  /** When false, spend/CPL/ROAS are not meaningful */
  spend: number | null;
  costPerLead: number | null;
  roas: number | null;
  platformLeads: number | null;
  attributedJobs: number;
  bookedJobs: number;
  paidJobs: number;
  bookingRate: number | null;
  conversionRate: number | null;
  avgRevenue: number | null;
  totalRevenue: number;
  /** Free-channel or supplemental metrics */
  substituteMetrics: {
    gbpCallClicks?: number;
    gbpDirectionRequests?: number;
    gbpWebsiteClicks?: number;
    gbpImpressionsSum?: number;
    searchConsoleClicks?: number;
    searchConsoleImpressions?: number;
    reviewCount?: number;
  };
}

export interface MarketingOverviewResponse {
  startDate: string;
  endDate: string;
  executive: {
    totalSpend: number | null;
    totalPlatformLeads: number | null;
    totalJobsInPeriod: number;
    totalPaidRevenueInPeriod: number;
    attributedPaidRevenue: number;
    unassignedJobCount: number;
    unassignedShare: number;
  };
  channels: MarketingOverviewChannelRow[];
  integrations: {
    hcpConnected: boolean;
    lsa: { connected: boolean; lastSyncAt: string | null; lastError: string | null };
    gbp: { connected: boolean; lastSyncAt: string | null; lastError: string | null };
    gbpPerformance: { connected: boolean; lastSyncAt: string | null; lastError: string | null };
    searchConsole: { configured: boolean; siteUrl: string | null; lastSyncAt: string | null; lastError: string | null };
  };
  metricDefinitions: Record<string, string>;
  attributionRefreshedAt: string;
}

export interface MarketingAiContext {
  generatedAt: string;
  period: { startDate: string; endDate: string };
  metricDefinitions: Record<string, string>;
  executive: MarketingOverviewResponse["executive"];
  channels: Array<{
    slug: string;
    label: string;
    spendApplicable: boolean;
    spend: number | null;
    platformLeads: number | null;
    costPerLead: number | null;
    attributedJobs: number;
    paidJobs: number;
    totalRevenue: number;
    roas: number | null;
    bookingRate: number | null;
    conversionRate: number | null;
    substituteMetrics: MarketingOverviewChannelRow["substituteMetrics"];
  }>;
  integrations: MarketingOverviewResponse["integrations"];
  dataGaps: string[];
}
