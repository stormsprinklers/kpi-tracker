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

export async function getJobs(params?: { per_page?: number; page?: number; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.per_page) searchParams.set("per_page", String(params.per_page));
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.status) searchParams.set("status", params.status);
  const query = searchParams.toString();
  const res = await hcpFetch(`${HCP_API_BASE}/jobs${query ? `?${query}` : ""}`);
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Fetch company info using a specific token (for setup/multi-tenant). */
export async function getCompanyWithToken(token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${HCP_API_BASE}/company`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/** HCP API client scoped to a token. Use getHcpClient(organizationId) for org-scoped access. */
export interface HcpClient {
  getCompany: () => Promise<Record<string, unknown>>;
  getJobs: (params?: { per_page?: number; page?: number; status?: string }) => Promise<unknown>;
  getJobInvoices: (jobId: string) => Promise<unknown>;
  getJobsAllPages: (params?: { status?: string }) => Promise<unknown[]>;
  getPros: () => Promise<unknown>;
  getEmployees: (params?: { page?: number; page_size?: number }) => Promise<unknown>;
  getEmployeesAllPages: () => Promise<unknown[]>;
  getCustomers: (params?: { per_page?: number; page?: number }) => Promise<unknown>;
  getCustomersAllPages: () => Promise<unknown[]>;
  getInvoices: (params?: { per_page?: number; page?: number }) => Promise<unknown>;
  getInvoicesAllPages: () => Promise<unknown[]>;
  getEstimates: (params?: { per_page?: number; page?: number }) => Promise<unknown>;
  getEstimatesAllPages: () => Promise<unknown[]>;
  getAppointments: (params?: { per_page?: number; page?: number }) => Promise<unknown>;
  getAppointmentsAllPages: () => Promise<unknown[]>;
}

function createHcpClient(token: string): HcpClient {
  const headers: HeadersInit = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const clientFetch = async (url: string): Promise<Response> => {
    const res = await fetch(url, { headers });
    const body = await res.text();
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };

  const clientFetchAllPages = async (
    initialUrl: string,
    itemsKey: string,
    extraParams?: Record<string, string>,
    options?: { pageSizeParam?: string }
  ): Promise<unknown[]> => {
    const all: unknown[] = [];
    const perPage = 100;
    const pageSizeKey = options?.pageSizeParam ?? "per_page";
    const baseParams = new URLSearchParams(extraParams ?? {});
    baseParams.set(pageSizeKey, String(perPage));
    baseParams.set("page", "1");
    const [basePath] = initialUrl.split("?");
    const sep = initialUrl.includes("?") ? "&" : "?";
    let url: string | null = `${basePath}${sep}${baseParams.toString()}`;
    let page = 1;

    while (url) {
      const res = await clientFetch(url);
      if (!res.ok) throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
      const data = (await res.json()) as Record<string, unknown>;
      const list = (Array.isArray(data) ? data : (data[itemsKey] as unknown[])) ?? [];
      all.push(...list);
      let next = getNextPageUrl(data);
      if (!next && list.length > 0) {
        page++;
        baseParams.set("page", String(page));
        next = `${initialUrl.split("?")[0]}${sep}${baseParams.toString()}`;
      } else if (!next) next = null;
      url = next;
    }
    return all;
  };

  return {
    getCompany: async () => {
      const res = await clientFetch(`${HCP_API_BASE}/company`);
      if (!res.ok) throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
      return res.json() as Promise<Record<string, unknown>>;
    },
    getJobs: async (params) => {
      const searchParams = new URLSearchParams();
      if (params?.per_page) searchParams.set("per_page", String(params.per_page));
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.status) searchParams.set("status", params.status);
      const query = searchParams.toString();
      const res = await clientFetch(`${HCP_API_BASE}/jobs${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
      return res.json();
    },
    getJobInvoices: async (jobId) => {
      const res = await clientFetch(`${HCP_API_BASE}/jobs/${jobId}/invoices`);
      if (!res.ok) throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
      return res.json();
    },
    getJobsAllPages: async (params) => {
      const extra = params?.status ? { status: params.status } : undefined;
      return clientFetchAllPages(`${HCP_API_BASE}/jobs`, "jobs", extra);
    },
    getPros: async () => {
      const res = await clientFetch(`${HCP_API_BASE}/pros`);
      if (!res.ok) throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
      return res.json();
    },
    getEmployees: async (params) => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.page_size) searchParams.set("page_size", String(params.page_size));
      const query = searchParams.toString();
      const res = await clientFetch(`${HCP_API_BASE}/employees${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
      return res.json();
    },
    getEmployeesAllPages: async () =>
      clientFetchAllPages(`${HCP_API_BASE}/employees`, "employees", undefined, { pageSizeParam: "page_size" }),
    getCustomers: async (params) => {
      const searchParams = new URLSearchParams();
      if (params?.per_page) searchParams.set("per_page", String(params.per_page));
      if (params?.page) searchParams.set("page", String(params.page));
      const query = searchParams.toString();
      const res = await clientFetch(`${HCP_API_BASE}/customers${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
      return res.json();
    },
    getCustomersAllPages: async () => clientFetchAllPages(`${HCP_API_BASE}/customers`, "customers"),
    getInvoices: async (params) => {
      const searchParams = new URLSearchParams();
      if (params?.per_page) searchParams.set("per_page", String(params.per_page));
      if (params?.page) searchParams.set("page", String(params.page));
      const query = searchParams.toString();
      const res = await clientFetch(`${HCP_API_BASE}/invoices${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
      return res.json();
    },
    getInvoicesAllPages: async () => clientFetchAllPages(`${HCP_API_BASE}/invoices`, "invoices"),
    getEstimates: async (params) => {
      const searchParams = new URLSearchParams();
      if (params?.per_page) searchParams.set("per_page", String(params.per_page));
      if (params?.page) searchParams.set("page", String(params.page));
      const query = searchParams.toString();
      const res = await clientFetch(`${HCP_API_BASE}/estimates${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
      return res.json();
    },
    getEstimatesAllPages: async () => clientFetchAllPages(`${HCP_API_BASE}/estimates`, "estimates"),
    getAppointments: async (params) => {
      const searchParams = new URLSearchParams();
      if (params?.per_page) searchParams.set("per_page", String(params.per_page));
      if (params?.page) searchParams.set("page", String(params.page));
      const query = searchParams.toString();
      const res = await clientFetch(`${HCP_API_BASE}/appointments${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
      return res.json();
    },
    getAppointmentsAllPages: async () => clientFetchAllPages(`${HCP_API_BASE}/appointments`, "appointments"),
  };
}

/** Get org-scoped HCP client. Fetches token from organizations table. */
export async function getHcpClient(organizationId: string): Promise<HcpClient> {
  const { getOrganizationById } = await import("./db/queries");
  const org = await getOrganizationById(organizationId);
  if (!org?.hcp_access_token) {
    throw new Error("Housecall Pro not configured for this organization. Add an access token in Settings.");
  }
  return createHcpClient(org.hcp_access_token);
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
