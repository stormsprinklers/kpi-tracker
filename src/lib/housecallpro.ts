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

export async function getJobsAllPages(params?: {
  per_page?: number;
  status?: string;
}) {
  const perPage = params?.per_page ?? 50;
  const allJobs: unknown[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await getJobs({
      per_page: perPage,
      page,
      status: params?.status,
    });
    const jobs = Array.isArray(data) ? data : (data as { jobs?: unknown[] }).jobs ?? [];
    allJobs.push(...jobs);
    hasMore = jobs.length === perPage;
    page++;
  }

  return allJobs;
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
  const pageSize = 50;
  const allEmployees: unknown[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await getEmployees({ page, page_size: pageSize });
    const list = Array.isArray(data) ? data : (data as { employees?: unknown[] }).employees ?? [];
    allEmployees.push(...list);
    const totalPages = (data as { total_pages?: number })?.total_pages ?? 1;
    hasMore = list.length === pageSize && page < totalPages;
    page++;
  }

  return allEmployees;
}

export function isConfigured(): boolean {
  return !!process.env.HOUSECALLPRO_ACCESS_TOKEN;
}
