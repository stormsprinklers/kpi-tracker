const HCP_API_BASE = "https://api.housecallpro.com";

// #region agent log
const _log = (loc: string, msg: string, data: Record<string, unknown>) => {
  fetch('http://127.0.0.1:7243/ingest/ec73c2c4-960e-421d-9c0c-e5e744669b90', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: loc, message: msg, data, timestamp: Date.now() }) }).catch(() => {});
};
// #endregion

function getHeaders(): HeadersInit {
  const token = process.env.HOUSECALLPRO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HOUSECALLPRO_ACCESS_TOKEN is not set");
  }
  // #region agent log
  _log('housecallpro.ts:getHeaders', 'Auth config', { tokenLength: token.length, authFormat: 'raw', headerNames: ['Accept', 'Authorization', 'Content-Type'] });
  // #endregion
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function hcpFetch(url: string): Promise<Response> {
  const res = await fetch(url, { headers: getHeaders() });
  // #region agent log
  const body = await res.text();
  if (!res.ok) {
    _log('housecallpro.ts:hcpFetch', 'HCP API error response', { url, status: res.status, statusText: res.statusText, bodyPreview: body.slice(0, 500), hypothesisId: 'H1_H3_H4' });
  }
  // #endregion
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

export async function getCompany() {
  const url = `${HCP_API_BASE}/company`;
  // #region agent log
  _log('housecallpro.ts:getCompany', 'Request', { url, hypothesisId: 'H5' });
  // #endregion
  const res = await hcpFetch(url);
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

export async function getEmployees() {
  const res = await hcpFetch(`${HCP_API_BASE}/employees`);
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function isConfigured(): boolean {
  return !!process.env.HOUSECALLPRO_ACCESS_TOKEN;
}
