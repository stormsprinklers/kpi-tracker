import { neon } from "@neondatabase/serverless";

const getNeon = () => {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is required");
  return neon(url);
};

/**
 * SQL template tag compatible with @vercel/postgres. Neon returns an array;
 * we normalize to { rows } for compatibility with existing queries.
 */
async function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<{ rows: unknown[]; rowCount: number }> {
  const client = getNeon();
  const result = await (client as (strings: TemplateStringsArray, ...vals: unknown[]) => Promise<unknown[]>)(
    strings,
    ...values
  );
  const rows = Array.isArray(result) ? result : [];
  return { rows, rowCount: rows.length };
}

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
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='trial_ends_at') THEN
        ALTER TABLE organizations ADD COLUMN trial_ends_at TIMESTAMPTZ;
      END IF;
    END $$
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='website') THEN
        ALTER TABLE organizations ADD COLUMN website TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='seo_business_name') THEN
        ALTER TABLE organizations ADD COLUMN seo_business_name TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='seo_domain') THEN
        ALTER TABLE organizations ADD COLUMN seo_domain TEXT;
      END IF;
    END $$
  `;

  // SEO config - keywords and locations per organization
  await sql`
    CREATE TABLE IF NOT EXISTS seo_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      config_type TEXT NOT NULL CHECK (config_type IN ('keywords', 'locations')),
      value TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_seo_config_organization_type
    ON seo_config (organization_id, config_type)
  `;

  // SEO service areas - groups of locations for averaged reporting
  await sql`
    CREATE TABLE IF NOT EXISTS seo_service_areas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_seo_service_areas_org
    ON seo_service_areas (organization_id)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS seo_service_area_locations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      service_area_id UUID NOT NULL REFERENCES seo_service_areas(id) ON DELETE CASCADE,
      location_value TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_seo_service_area_locations_area
    ON seo_service_area_locations (service_area_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      permissions JSONB NOT NULL DEFAULT '{}'
    )
  `;

  // SEO results cache - stores rankings to avoid costly DataForSEO calls (limit ~once/week)
  await sql`
    CREATE TABLE IF NOT EXISTS seo_results_cache (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      config_fingerprint TEXT NOT NULL,
      payload JSONB NOT NULL,
      snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_seo_results_cache_org_fingerprint
    ON seo_results_cache (organization_id, config_fingerprint, snapshot_at DESC)
  `;

  // DataForSEO locations list cache (changes rarely, 7-day TTL)
  await sql`
    CREATE TABLE IF NOT EXISTS seo_locations_cache (
      cache_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Extend users for Auth.js/OAuth
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='name') THEN
        ALTER TABLE users ADD COLUMN name TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='email_verified') THEN
        ALTER TABLE users ADD COLUMN email_verified TIMESTAMPTZ;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND LOWER(column_name)=LOWER('emailVerified')) THEN
        ALTER TABLE users ADD COLUMN "emailVerified" TIMESTAMPTZ;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='image') THEN
        ALTER TABLE users ADD COLUMN image TEXT;
      END IF;
    END $$
  `;
  await sql`
    DO $$
    BEGIN
      ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END $$
  `;
  await sql`
    DO $$
    BEGIN
      ALTER TABLE users ALTER COLUMN organization_id DROP NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END $$
  `;

  // Auth.js adapter tables (use exact schema: verification_token singular, camelCase columns)
  await sql`
    CREATE TABLE IF NOT EXISTS verification_token (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (identifier, token)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      "providerAccountId" TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at BIGINT,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      UNIQUE(provider, "providerAccountId")
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts ("userId")
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "sessionToken" TEXT NOT NULL UNIQUE,
      "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions ("userId")
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens (user_id)
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
