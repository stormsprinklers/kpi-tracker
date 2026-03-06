/** Shared extractors for HCP API records - used by sync and webhook persist. */

export function extractId(record: Record<string, unknown>): string | null {
  const id = record.id ?? record.uuid;
  return id != null ? String(id) : null;
}

export function extractCustomerHcpId(job: Record<string, unknown>): string | null {
  const customer = job.customer;
  if (customer && typeof customer === "object" && "id" in customer) {
    return String((customer as { id: unknown }).id);
  }
  return (job.customer_id ?? job.customer_hcp_id) as string | null ?? null;
}

/**
 * Extract job HCP ID from invoice, estimate, or appointment.
 * HCP may use: job (object), job_id, request_id, service_request_id, service_request (object), request (object).
 */
export function extractJobHcpId(record: Record<string, unknown>): string | null {
  const job =
    record.job ??
    record.job_id ??
    record.service_request ??
    record.request;
  if (job && typeof job === "object" && "id" in job) {
    return String((job as { id: unknown }).id);
  }
  const scalar =
    record.job_id ??
    record.job_hcp_id ??
    record.request_id ??
    record.service_request_id;
  return scalar != null ? String(scalar) : null;
}
