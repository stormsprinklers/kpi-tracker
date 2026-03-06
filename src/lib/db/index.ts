import { sql } from "@vercel/postgres";

export { sql };

/**
 * Run schema creation. Idempotent - uses IF NOT EXISTS.
 * Call from sync or a one-time setup route.
 */
export async function initSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS sync_state (
      id SERIAL PRIMARY KEY,
      company_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(company_id, entity_type)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      hcp_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      raw JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(hcp_id, company_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      hcp_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      customer_hcp_id TEXT,
      raw JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(hcp_id, company_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      hcp_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      job_hcp_id TEXT,
      raw JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(hcp_id, company_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS estimates (
      id SERIAL PRIMARY KEY,
      hcp_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      job_hcp_id TEXT,
      customer_hcp_id TEXT,
      raw JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(hcp_id, company_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      hcp_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      job_hcp_id TEXT,
      raw JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(hcp_id, company_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      hcp_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      raw JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(hcp_id, company_id)
    )
  `;
}
