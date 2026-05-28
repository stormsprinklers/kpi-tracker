/** Static sample data for the public /demo dashboard (fictional company and people). */

export const DEMO_COMPANY_NAME = "Summit Comfort HVAC";

export const DEMO_PERIOD_LABEL = "Mar 10, 2026 → Mar 23, 2026 (sample pay period)";

export function demoAvatar(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(seed)}&size=128`;
}

export const DEMO_KEY_METRICS = {
  jobCount: 187,
  previousJobCount: 164,
  revenue: 284_650,
  previousRevenue: 251_200,
  avgJobValue: 1522.19,
  previousAvgJobValue: 1530.49,
  conversionRate: 62.4,
  previousConversionRate: 58.1,
};

export type DemoTechnician = {
  id: string;
  name: string;
  totalRevenue: number;
  conversionRate: number | null;
  revenuePerHour: number | null;
  avgTicket: number | null;
  fiveStarReviews: number;
  avatarSeed: string;
};

export const DEMO_TECHNICIANS: DemoTechnician[] = [
  {
    id: "demo-tech-1",
    name: "Marcus R.",
    totalRevenue: 48_920,
    conversionRate: 71.2,
    revenuePerHour: 142.5,
    avgTicket: 1_634,
    fiveStarReviews: 12,
    avatarSeed: "MarcusRivera",
  },
  {
    id: "demo-tech-2",
    name: "Jordan K.",
    totalRevenue: 41_280,
    conversionRate: 65.0,
    revenuePerHour: 128.4,
    avgTicket: 1_488,
    fiveStarReviews: 9,
    avatarSeed: "JordanKim",
  },
  {
    id: "demo-tech-3",
    name: "Alex T.",
    totalRevenue: 36_450,
    conversionRate: 58.3,
    revenuePerHour: 119.2,
    avgTicket: 1_412,
    fiveStarReviews: 7,
    avatarSeed: "AlexTorres",
  },
  {
    id: "demo-tech-4",
    name: "Sam P.",
    totalRevenue: 29_100,
    conversionRate: 54.1,
    revenuePerHour: 108.6,
    avgTicket: 1_295,
    fiveStarReviews: 5,
    avatarSeed: "SamPatel",
  },
];

export type DemoCrew = {
  id: string;
  name: string;
  foremanLabel: string;
  foremanSeed: string;
  totalRevenue: number;
  totalManHours: number;
  jobsCompleted: number;
  avgTicket: number;
};

export const DEMO_CREWS: DemoCrew[] = [
  {
    id: "demo-crew-1",
    name: "North Install Crew",
    foremanLabel: "Marcus R.",
    foremanSeed: "MarcusRivera",
    totalRevenue: 92_400,
    totalManHours: 312.5,
    jobsCompleted: 48,
    avgTicket: 1_925,
  },
];

export const DEMO_TECH_TOTAL_REVENUE = DEMO_TECHNICIANS.reduce((s, t) => s + t.totalRevenue, 0);

export type DemoCsr = {
  id: string;
  name: string;
  bookingRate: number | null;
  avgCallDurationMinutes: number | null;
  leadResponseTimeMinutes: number | null;
  avgBookedCallRevenue: number | null;
  avatarSeed: string;
};

export const DEMO_CSR: DemoCsr[] = [
  {
    id: "demo-csr-1",
    name: "Taylor M.",
    bookingRate: 78.5,
    avgCallDurationMinutes: 4.2,
    leadResponseTimeMinutes: 3.1,
    avgBookedCallRevenue: 1_420,
    avatarSeed: "TaylorMorgan",
  },
  {
    id: "demo-csr-2",
    name: "Casey L.",
    bookingRate: 72.0,
    avgCallDurationMinutes: 5.1,
    leadResponseTimeMinutes: 4.8,
    avgBookedCallRevenue: 1_285,
    avatarSeed: "CaseyLee",
  },
  {
    id: "demo-csr-3",
    name: "Riley N.",
    bookingRate: 81.2,
    avgCallDurationMinutes: 3.8,
    leadResponseTimeMinutes: 2.4,
    avgBookedCallRevenue: 1_560,
    avatarSeed: "RileyNguyen",
  },
];
