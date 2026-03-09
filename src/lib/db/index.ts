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
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='logo_url') THEN
        ALTER TABLE organizations ADD COLUMN logo_url TEXT;
      END IF;
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
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='call_records' AND column_name='job_hcp_id') THEN
        ALTER TABLE call_records ADD COLUMN job_hcp_id TEXT;
      END IF;
    END $$
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_call_records_job
    ON call_records (organization_id, job_hcp_id)
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='call_records' AND column_name='call_headers') THEN
        ALTER TABLE call_records ADD COLUMN call_headers JSONB;
      END IF;
    END $$
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='call_records' AND column_name='call_key') THEN
        ALTER TABLE call_records ADD COLUMN call_key TEXT;
        UPDATE call_records SET call_key = md5(
          organization_id::text || company_id || call_date::text || COALESCE(call_time::text,'') ||
          COALESCE(customer_phone,'') || COALESCE(hcp_employee_id,'') || COALESCE(duration_seconds::text,'0') ||
          COALESCE(LEFT(transcript, 500), '') || id::text
        ) WHERE call_key IS NULL;
        ALTER TABLE call_records ALTER COLUMN call_key SET NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_call_records_call_key ON call_records (call_key);
      END IF;
    END $$
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

  // CSR selections - admin picks which employees appear in CSR KPIs / Call Insights
  await sql`
    CREATE TABLE IF NOT EXISTS csr_selections (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      hcp_employee_id TEXT NOT NULL,
      PRIMARY KEY (organization_id, hcp_employee_id)
    )
  `;

  // Webhook forwarding - forward inbound webhooks to external URLs (Zapier, Make, etc.)
  await sql`
    CREATE TABLE IF NOT EXISTS webhook_forwarding (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT false,
      forward_url TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, source)
    )
  `;

  // Performance pay - admin-configurable pay structures
  await sql`
    CREATE TABLE IF NOT EXISTS performance_pay_org (
      organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
      setup_completed BOOLEAN NOT NULL DEFAULT false,
      pay_period_start_weekday INT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS performance_pay_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('hcp', 'custom'))
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_performance_pay_roles_org
    ON performance_pay_roles (organization_id)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS performance_pay_assignments (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      hcp_employee_id TEXT NOT NULL,
      role_id UUID REFERENCES performance_pay_roles(id) ON DELETE SET NULL,
      overridden BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (organization_id, hcp_employee_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS performance_pay_configs (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('role', 'employee')),
      scope_id TEXT NOT NULL,
      structure_type TEXT NOT NULL,
      config_json JSONB NOT NULL DEFAULT '{}',
      bonuses_json JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, scope_type, scope_id)
    )
  `;
}
