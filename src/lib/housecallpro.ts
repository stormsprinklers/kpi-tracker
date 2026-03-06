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

/** Get next page URL from response - HCP may use different keys. */
function getNextPageUrl(data: Record<string, unknown>): string | null {
  const keys = ["next_page_url", "nextPageUrl", "next_page", "next"];
  for (const k of keys) {
    const v = data[k];
    if (v && typeof v === "string") return v;
  }
  const meta = data.meta as Record<string, unknown> | undefined;
  if (meta) {
    for (const k of keys) {
      const v = meta[k];
      if (v && typeof v === "string") return v;
    }
  }
  return null;
}

/** Fetch all pages by following next_page_url, with page-based fallback. */
async function fetchAllPages(
  initialUrl: string,
  itemsKey: string,
  extraParams?: Record<string, string>,
  options?: { pageSizeParam?: string }
): Promise<unknown[]> {
  const all: unknown[] = [];
  const perPage = 100;
  let page = 1;
  const pageSizeKey = options?.pageSizeParam ?? "per_page";
  const baseParams = new URLSearchParams(extraParams ?? {});
  baseParams.set(pageSizeKey, String(perPage));
  baseParams.set("page", "1");
  const [basePath] = initialUrl.split("?");
  const sep = initialUrl.includes("?") ? "&" : "?";
  let url: string | null = `${basePath}${sep}${baseParams.toString()}`;

  while (url) {
    const res = await hcpFetch(url);
    if (!res.ok) {
      throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const list = (Array.isArray(data) ? data : (data[itemsKey] as unknown[])) ?? [];
    all.push(...list);

    let next = getNextPageUrl(data);
    if (!next && list.length > 0) {
      page++;
      baseParams.set("page", String(page));
      const sep = initialUrl.includes("?") ? "&" : "?";
      next = `${initialUrl.split("?")[0]}${sep}${baseParams.toString()}`;
    } else if (!next) {
      next = null;
    }
    url = next;
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
  return fetchAllPages(
    `${HCP_API_BASE}/employees`,
    "employees",
    undefined,
    { pageSizeParam: "page_size" }
  );
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
