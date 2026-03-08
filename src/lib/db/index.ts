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

  await sql`
    CREATE TABLE IF NOT EXISTS job_line_items (
      id SERIAL PRIMARY KEY,
      hcp_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      job_hcp_id TEXT NOT NULL,
      raw JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(hcp_id, company_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_job_line_items_job
    ON job_line_items (company_id, job_hcp_id)
  `;

  // Auth tables (organizations, users)
  await sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      hcp_access_token TEXT,
      hcp_webhook_secret TEXT,
      hcp_company_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'employee', 'investor')),
      hcp_employee_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(email, organization_id)
    )
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='hcp_employee_id') THEN
        ALTER TABLE users ADD COLUMN hcp_employee_id TEXT;
      END IF;
    END $$
  `;
  await sql`
    DO $$
    BEGIN
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'employee', 'investor'));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END $$
  `;

  // Time entries (timesheets) - employee time tracking, scoped by hcp_employee_id
  await sql`
    CREATE TABLE IF NOT EXISTS time_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      hcp_employee_id TEXT NOT NULL,
      entry_date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      hours NUMERIC,
      job_hcp_id TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_time_entries_org_employee_date
    ON time_entries (organization_id, hcp_employee_id, entry_date)
  `;

  // Technician profiles (photos) - technician or admin can upload
  await sql`
    CREATE TABLE IF NOT EXISTS technician_profiles (
      id SERIAL PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      hcp_employee_id TEXT NOT NULL,
      photo_url TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, hcp_employee_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_technician_profiles_org_employee
    ON technician_profiles (organization_id, hcp_employee_id)
  `;

  // GHL call records - inbound call completion data from GoHighLevel webhooks
  await sql`
    CREATE TABLE IF NOT EXISTS call_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      company_id TEXT NOT NULL,
      hcp_employee_id TEXT,
      csr_first_name_raw TEXT,
      booking_value TEXT NOT NULL,
      call_date DATE NOT NULL,
      call_time TIME,
      duration_seconds INTEGER,
      transcript TEXT,
      customer_phone TEXT,
      customer_name TEXT,
      customer_city TEXT,
      customer_hcp_id TEXT,
      raw_payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_call_records_org_date
    ON call_records (organization_id, call_date)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_call_records_hcp_employee
    ON call_records (organization_id, hcp_employee_id)
  `;

  // Webhook logs - raw payload/headers for debugging (GHL, HCP, etc.)
  await sql`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      raw_body TEXT,
      headers JSONB,
      status TEXT NOT NULL CHECK (status IN ('processed', 'skipped', 'received')),
      skip_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    DO $$
    BEGIN
      ALTER TABLE webhook_logs DROP CONSTRAINT IF EXISTS webhook_logs_status_check;
      ALTER TABLE webhook_logs ADD CONSTRAINT webhook_logs_status_check
        CHECK (status IN ('processed', 'skipped', 'received'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_org_created
    ON webhook_logs (organization_id, created_at DESC)
  `;

}
