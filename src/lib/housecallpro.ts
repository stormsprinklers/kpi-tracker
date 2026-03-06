const HCP_API_BASE = "https://api.housecallpro.com";

function getHeaders(): HeadersInit {
  const token = process.env.HOUSECALLPRO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HOUSECALLPRO_ACCESS_TOKEN is not set");
  }
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function hcpFetch(url: string): Promise<Response> {
  const res = await fetch(url, { headers: getHeaders() });
  const body = await res.text();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** Fetch all pages by following next_page_url (HCP API pagination). */
async function fetchAllPages(
  initialUrl: string,
  itemsKey: string,
  extraParams?: Record<string, string>
): Promise<unknown[]> {
  const all: unknown[] = [];
  let url: string | null = initialUrl;
  if (extraParams && Object.keys(extraParams).length > 0) {
    const params = new URLSearchParams(extraParams);
    url = `${initialUrl}${initialUrl.includes("?") ? "&" : "?"}${params.toString()}`;
  }
  while (url) {
    const res = await hcpFetch(url);
    if (!res.ok) {
      throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const list = (Array.isArray(data) ? data : (data[itemsKey] as unknown[])) ?? [];
    all.push(...list);
    const next = data.next_page_url;
    url = next && typeof next === "string" ? next : null;
  }
  return all;
}

export async function getCompany() {
  const res = await hcpFetch(`${HCP_API_BASE}/company`);
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getJobs(params?: {
  per_page?: number;
  page?: number;
  status?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.per_page) searchParams.set("per_page", String(params.per_page));
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.status) searchParams.set("status", params.status);
  const query = searchParams.toString();
  const url = `${HCP_API_BASE}/jobs${query ? `?${query}` : ""}`;
  const res = await hcpFetch(url);
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getJobInvoices(jobId: string) {
  const res = await hcpFetch(`${HCP_API_BASE}/jobs/${jobId}/invoices`);
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getJobsAllPages(params?: { status?: string }) {
  const extra = params?.status ? { status: params.status } : undefined;
  return fetchAllPages(`${HCP_API_BASE}/jobs`, "jobs", extra);
}

export async function getPros() {
  const res = await hcpFetch(`${HCP_API_BASE}/pros`);
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getEmployees(params?: {
  page?: number;
  page_size?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.page_size) searchParams.set("page_size", String(params.page_size));
  const query = searchParams.toString();
  const url = `${HCP_API_BASE}/employees${query ? `?${query}` : ""}`;
  const res = await hcpFetch(url);
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getEmployeesAllPages() {
  return fetchAllPages(`${HCP_API_BASE}/employees`, "employees");
}

export async function getCustomers(params?: { per_page?: number; page?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.per_page) searchParams.set("per_page", String(params.per_page));
  if (params?.page) searchParams.set("page", String(params.page));
  const query = searchParams.toString();
  const url = `${HCP_API_BASE}/customers${query ? `?${query}` : ""}`;
  const res = await hcpFetch(url);
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getCustomersAllPages() {
  return fetchAllPages(`${HCP_API_BASE}/customers`, "customers");
}

export async function getInvoices(params?: { per_page?: number; page?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.per_page) searchParams.set("per_page", String(params.per_page));
  if (params?.page) searchParams.set("page", String(params.page));
  const query = searchParams.toString();
  const url = `${HCP_API_BASE}/invoices${query ? `?${query}` : ""}`;
  const res = await hcpFetch(url);
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getInvoicesAllPages() {
  return fetchAllPages(`${HCP_API_BASE}/invoices`, "invoices");
}

export async function getEstimates(params?: { per_page?: number; page?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.per_page) searchParams.set("per_page", String(params.per_page));
  if (params?.page) searchParams.set("page", String(params.page));
  const query = searchParams.toString();
  const url = `${HCP_API_BASE}/estimates${query ? `?${query}` : ""}`;
  const res = await hcpFetch(url);
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getEstimatesAllPages() {
  return fetchAllPages(`${HCP_API_BASE}/estimates`, "estimates");
}

export async function getAppointments(params?: { per_page?: number; page?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.per_page) searchParams.set("per_page", String(params.per_page));
  if (params?.page) searchParams.set("page", String(params.page));
  const query = searchParams.toString();
  const url = `${HCP_API_BASE}/appointments${query ? `?${query}` : ""}`;
  const res = await hcpFetch(url);
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getAppointmentsAllPages() {
  return fetchAllPages(`${HCP_API_BASE}/appointments`, "appointments");
}

export function isConfigured(): boolean {
  return !!process.env.HOUSECALLPRO_ACCESS_TOKEN;
}
