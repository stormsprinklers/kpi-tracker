const HCP_API_BASE = "https://api.housecallpro.com/v1";

function getHeaders(): HeadersInit {
  const token = process.env.HOUSECALLPRO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HOUSECALLPRO_ACCESS_TOKEN is not set");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function getCompany() {
  const res = await fetch(`${HCP_API_BASE}/company`, {
    headers: getHeaders(),
  });
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
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getJobInvoices(jobId: string) {
  const res = await fetch(`${HCP_API_BASE}/jobs/${jobId}/invoices`, {
    headers: getHeaders(),
  });
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
  const res = await fetch(`${HCP_API_BASE}/pros`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getEmployees() {
  const res = await fetch(`${HCP_API_BASE}/employees`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function isConfigured(): boolean {
  return !!process.env.HOUSECALLPRO_ACCESS_TOKEN;
}
