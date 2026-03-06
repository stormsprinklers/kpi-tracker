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
      total_amount NUMERIC,
      outstanding_balance NUMERIC,
      raw JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(hcp_id, company_id)
    )
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='jobs' AND column_name='total_amount') THEN
        ALTER TABLE jobs ADD COLUMN total_amount NUMERIC;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='jobs' AND column_name='outstanding_balance') THEN
        ALTER TABLE jobs ADD COLUMN outstanding_balance NUMERIC;
      END IF;
    END $$
  `;
  await sql`
    UPDATE jobs
    SET
      total_amount = COALESCE((raw->>'total_amount')::numeric, (raw->>'subtotal')::numeric) / 100,
      outstanding_balance = COALESCE((raw->>'outstanding_balance')::numeric, (raw->>'balance_due')::numeric, (raw->>'amount_due')::numeric, 0) / 100
    WHERE total_amount IS NULL AND (raw ? 'total_amount' OR raw ? 'subtotal')
  `;
  await sql`
    UPDATE jobs
    SET total_amount = total_amount / 100, outstanding_balance = outstanding_balance / 100
    WHERE total_amount IS NOT NULL
      AND (total_amount = (raw->>'total_amount')::numeric OR total_amount = (raw->>'subtotal')::numeric)
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
  await sql`
    CREATE TABLE IF NOT EXISTS pros (
      id SERIAL PRIMARY KEY,
      hcp_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      raw JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(hcp_id, company_id)
    )
  `;
}
