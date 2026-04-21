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
    CREATE TABLE IF NOT EXISTS schema_patches (
      patch_id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // One-time legacy backfill (not on every request — those UPDATEs deadlocked with concurrent job upserts).
  await sql`
    DO $$
    BEGIN
      PERFORM pg_advisory_xact_lock(1482093311);
      IF NOT EXISTS (SELECT 1 FROM schema_patches WHERE patch_id = 'jobs_legacy_amount_scale_v1') THEN
        UPDATE jobs
        SET
          total_amount = COALESCE((raw->>'total_amount')::numeric, (raw->>'subtotal')::numeric) / 100,
          outstanding_balance = COALESCE((raw->>'outstanding_balance')::numeric, (raw->>'balance_due')::numeric, (raw->>'amount_due')::numeric, 0) / 100
        WHERE total_amount IS NULL AND (raw ? 'total_amount' OR raw ? 'subtotal');
        UPDATE jobs
        SET total_amount = total_amount / 100, outstanding_balance = outstanding_balance / 100
        WHERE total_amount IS NOT NULL
          AND (total_amount = (raw->>'total_amount')::numeric OR total_amount = (raw->>'subtotal')::numeric);
        INSERT INTO schema_patches (patch_id) VALUES ('jobs_legacy_amount_scale_v1');
      END IF;
    END $$
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
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='seo_include_ai_mode') THEN
        ALTER TABLE organizations ADD COLUMN seo_include_ai_mode BOOLEAN DEFAULT false;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='pulse_email_enabled') THEN
        ALTER TABLE organizations ADD COLUMN pulse_email_enabled BOOLEAN NOT NULL DEFAULT false;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='pulse_daily_enabled') THEN
        ALTER TABLE organizations ADD COLUMN pulse_daily_enabled BOOLEAN NOT NULL DEFAULT false;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='pulse_weekly_enabled') THEN
        ALTER TABLE organizations ADD COLUMN pulse_weekly_enabled BOOLEAN NOT NULL DEFAULT false;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='pulse_recipient_emails') THEN
        ALTER TABLE organizations ADD COLUMN pulse_recipient_emails TEXT;
      END IF;
      -- New: split recipient override lists by schedule.
      -- Backward compat: existing pulse_recipient_emails will be used as a fallback
      -- until admins configure these two new fields.
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='pulse_daily_recipient_emails') THEN
        ALTER TABLE organizations ADD COLUMN pulse_daily_recipient_emails TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='pulse_weekly_recipient_emails') THEN
        ALTER TABLE organizations ADD COLUMN pulse_weekly_recipient_emails TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='pulse_timezone') THEN
        ALTER TABLE organizations ADD COLUMN pulse_timezone TEXT NOT NULL DEFAULT 'America/Denver';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='pulse_last_daily_ymd') THEN
        ALTER TABLE organizations ADD COLUMN pulse_last_daily_ymd TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='organizations' AND column_name='pulse_last_weekly_end_ymd') THEN
        ALTER TABLE organizations ADD COLUMN pulse_last_weekly_end_ymd TEXT;
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

  // SEO fetch progress - for chunked processing across multiple invocations
  await sql`
    CREATE TABLE IF NOT EXISTS seo_fetch_progress (
      organization_id UUID NOT NULL,
      config_fingerprint TEXT NOT NULL,
      chunk_index INT NOT NULL,
      total_combos INT NOT NULL,
      combos_per_chunk INT NOT NULL,
      partial_organic JSONB NOT NULL DEFAULT '[]',
      partial_local JSONB NOT NULL DEFAULT '[]',
      partial_ai JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, config_fingerprint)
    )
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

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='two_factor_enabled') THEN
        ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='two_factor_channel') THEN
        ALTER TABLE users ADD COLUMN two_factor_channel TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='phone_e164') THEN
        ALTER TABLE users ADD COLUMN phone_e164 TEXT;
      END IF;
    END $$
  `;
  await sql`
    DO $$
    BEGIN
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_two_factor_channel_check;
      ALTER TABLE users ADD CONSTRAINT users_two_factor_channel_check CHECK (two_factor_channel IS NULL OR two_factor_channel IN ('sms', 'email'));
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

  await sql`
    CREATE TABLE IF NOT EXISTS organization_invitations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'employee', 'investor')),
      invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_organization_invitations_token_pending
    ON organization_invitations (token_hash)
    WHERE accepted_at IS NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_organization_invitations_org_email_pending
    ON organization_invitations (organization_id, email)
    WHERE accepted_at IS NULL
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS crews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      foreman_hcp_employee_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_crews_organization_id ON crews (organization_id)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS crew_members (
      crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
      hcp_employee_id TEXT NOT NULL,
      PRIMARY KEY (crew_id, hcp_employee_id)
    )
  `;

  /* Migrate legacy user-based crews → HCP ids (employees/pros synced from Housecall Pro). */
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'crews' AND column_name = 'foreman_user_id'
      ) THEN
        ALTER TABLE crews ADD COLUMN IF NOT EXISTS foreman_hcp_employee_id TEXT;
        UPDATE crews c
        SET foreman_hcp_employee_id = NULLIF(TRIM(u.hcp_employee_id), '')
        FROM users u
        WHERE u.id = c.foreman_user_id;
        DELETE FROM crews WHERE foreman_hcp_employee_id IS NULL OR TRIM(foreman_hcp_employee_id) = '';
        ALTER TABLE crews DROP CONSTRAINT IF EXISTS crews_foreman_user_id_fkey;
        ALTER TABLE crews DROP COLUMN IF EXISTS foreman_user_id;
        ALTER TABLE crews ALTER COLUMN foreman_hcp_employee_id SET NOT NULL;
      END IF;
    END $$
  `;
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'crew_members' AND column_name = 'hcp_employee_id'
      ) THEN
        CREATE INDEX IF NOT EXISTS idx_crew_members_hcp_employee_id ON crew_members (hcp_employee_id);
      END IF;
    END $$
  `;
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'crew_members' AND column_name = 'user_id'
      ) THEN
        ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS hcp_employee_id TEXT;
        UPDATE crew_members cm
        SET hcp_employee_id = NULLIF(TRIM(u.hcp_employee_id), '')
        FROM users u
        WHERE u.id = cm.user_id;
        DELETE FROM crew_members WHERE hcp_employee_id IS NULL OR TRIM(hcp_employee_id) = '';
        ALTER TABLE crew_members DROP CONSTRAINT IF EXISTS crew_members_user_id_fkey;
        ALTER TABLE crew_members DROP CONSTRAINT IF EXISTS crew_members_pkey;
        ALTER TABLE crew_members DROP COLUMN IF EXISTS user_id;
        ALTER TABLE crew_members ALTER COLUMN hcp_employee_id SET NOT NULL;
        ALTER TABLE crew_members ADD PRIMARY KEY (crew_id, hcp_employee_id);
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
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'performance_pay_org' AND column_name = 'bonus_per_five_star_review'
      ) THEN
        ALTER TABLE performance_pay_org ADD COLUMN bonus_per_five_star_review DOUBLE PRECISION;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'performance_pay_org' AND column_name = 'pay_period_timezone'
      ) THEN
        ALTER TABLE performance_pay_org ADD COLUMN pay_period_timezone TEXT NOT NULL DEFAULT 'UTC';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'performance_pay_org' AND column_name = 'pay_period_anchor_date'
      ) THEN
        ALTER TABLE performance_pay_org ADD COLUMN pay_period_anchor_date DATE;
      END IF;
    END $$;
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

  // AI dashboard insights - cached insights from OpenAI per dashboard
  await sql`
    CREATE TABLE IF NOT EXISTS ai_dashboard_insights (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      dashboard_type TEXT NOT NULL CHECK (dashboard_type IN ('main', 'calls', 'profit', 'time', 'marketing')),
      insights_json JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, dashboard_type)
    )
  `;

  // Time-off requests - employees request time ranges off; admin approves/declines
  await sql`
    CREATE TABLE IF NOT EXISTS time_off_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      batch_id UUID NOT NULL,
      hcp_employee_id TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
      admin_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_time_off_requests_org_batch
    ON time_off_requests (organization_id, batch_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_time_off_requests_org_employee
    ON time_off_requests (organization_id, hcp_employee_id)
  `;

  // Notifications - admin gets time-off requests; employee gets approve/decline responses
  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}',
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications (user_id, read_at) WHERE read_at IS NULL
  `;

  // CSV import name mapping - map legal/export names to HCP employee ids for timesheet import
  await sql`
    CREATE TABLE IF NOT EXISTS timesheet_import_name_mappings (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      csv_name TEXT NOT NULL,
      hcp_employee_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, csv_name)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_timesheet_import_name_mappings_org_employee
    ON timesheet_import_name_mappings (organization_id, hcp_employee_id)
  `;

  // Manual unassigned revenue routing - lets admin assign otherwise unassigned jobs to a technician.
  await sql`
    CREATE TABLE IF NOT EXISTS job_revenue_assignments (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      job_hcp_id TEXT NOT NULL,
      hcp_employee_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, job_hcp_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_job_revenue_assignments_org_employee
    ON job_revenue_assignments (organization_id, hcp_employee_id)
  `;

  // Linked Google Business Profile per organization (for review sync).
  await sql`
    CREATE TABLE IF NOT EXISTS google_business_profiles (
      organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      location_name TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Synced Google reviews, optionally assigned to an employee for KPI attribution.
  await sql`
    CREATE TABLE IF NOT EXISTS google_business_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      review_id TEXT NOT NULL,
      reviewer_name TEXT,
      star_rating INT,
      comment TEXT,
      create_time TIMESTAMPTZ,
      update_time TIMESTAMPTZ,
      assigned_hcp_employee_id TEXT,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, review_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_google_business_reviews_org_employee
    ON google_business_reviews (organization_id, assigned_hcp_employee_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS google_business_review_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      google_business_review_id UUID NOT NULL REFERENCES google_business_reviews(id) ON DELETE CASCADE,
      hcp_employee_id TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('manual', 'auto_customer', 'auto_mention')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (google_business_review_id, hcp_employee_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_gbr_assignments_review
    ON google_business_review_assignments (google_business_review_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_gbr_assignments_employee
    ON google_business_review_assignments (hcp_employee_id)
  `;

  await sql`
    DO $$
    BEGIN
      PERFORM pg_advisory_xact_lock(1482093312);
      IF NOT EXISTS (SELECT 1 FROM schema_patches WHERE patch_id = 'google_review_assignments_backfill_v1') THEN
        INSERT INTO google_business_review_assignments (google_business_review_id, hcp_employee_id, source)
        SELECT gbr.id, TRIM(gbr.assigned_hcp_employee_id), 'manual'
        FROM google_business_reviews gbr
        WHERE gbr.assigned_hcp_employee_id IS NOT NULL
          AND TRIM(gbr.assigned_hcp_employee_id) != ''
        ON CONFLICT (google_business_review_id, hcp_employee_id) DO NOTHING;
        INSERT INTO schema_patches (patch_id) VALUES ('google_review_assignments_backfill_v1');
      END IF;
    END $$
  `;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'google_business_profiles' AND column_name = 'google_refresh_token'
      ) THEN
        ALTER TABLE google_business_profiles ADD COLUMN google_refresh_token TEXT;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'google_business_profiles' AND column_name = 'account_id' AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE google_business_profiles ALTER COLUMN account_id DROP NOT NULL;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'google_business_profiles' AND column_name = 'location_id' AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE google_business_profiles ALTER COLUMN location_id DROP NOT NULL;
      END IF;
    END $$
  `;

  // Marketing analytics — channels, attribution, spend snapshots, GBP/GSC facts, OAuth per integration
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_channels (
      slug TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('paid', 'owned', 'earned', 'direct')),
      spend_applicable BOOLEAN NOT NULL DEFAULT false,
      sort_order INT NOT NULL DEFAULT 0
    )
  `;
  await sql`
    INSERT INTO marketing_channels (slug, display_name, kind, spend_applicable, sort_order) VALUES
      ('unassigned', 'Unassigned', 'direct', false, 0),
      ('google_lsa', 'Google LSA', 'paid', true, 10),
      ('google_business_profile', 'Google Business Profile', 'owned', false, 20),
      ('organic_search', 'Organic Search', 'earned', false, 30),
      ('website', 'Website / Direct', 'direct', false, 40),
      ('google_ads', 'Google Ads', 'paid', true, 50),
      ('meta_ads', 'Meta Ads', 'paid', true, 60),
      ('referrals', 'Referrals', 'earned', false, 70)
    ON CONFLICT (slug) DO NOTHING
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_org_settings (
      organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
      search_console_site_url TEXT,
      ga4_property_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_source_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      pattern TEXT NOT NULL,
      channel_slug TEXT NOT NULL REFERENCES marketing_channels(slug),
      priority INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_marketing_source_rules_org_priority
    ON marketing_source_rules (organization_id, priority DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS job_attribution (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      job_hcp_id TEXT NOT NULL,
      channel_slug TEXT NOT NULL REFERENCES marketing_channels(slug),
      confidence TEXT NOT NULL CHECK (confidence IN ('explicit', 'inferred', 'rule', 'model')),
      rule_type TEXT NOT NULL,
      matched_value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, job_hcp_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_job_attribution_org_channel
    ON job_attribution (organization_id, channel_slug)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS fact_marketing_spend_snapshot (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      channel_slug TEXT NOT NULL REFERENCES marketing_channels(slug),
      spend_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      currency_code TEXT NOT NULL DEFAULT 'USD',
      platform_leads INT,
      phone_calls INT,
      source_system TEXT NOT NULL DEFAULT 'lsa_account_report',
      raw JSONB,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, period_start, period_end, channel_slug, source_system)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_fact_marketing_spend_snapshot_org_dates
    ON fact_marketing_spend_snapshot (organization_id, period_end DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS fact_marketing_lead (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel_slug TEXT NOT NULL REFERENCES marketing_channels(slug),
      external_id TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      lead_type TEXT,
      platform_status TEXT,
      raw JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, channel_slug, external_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_fact_marketing_lead_org_time
    ON fact_marketing_lead (organization_id, occurred_at DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS fact_gbp_metrics_daily (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      metric_date DATE NOT NULL,
      location_id TEXT NOT NULL,
      business_impressions_desktop_maps INT,
      business_impressions_desktop_search INT,
      business_impressions_mobile_maps INT,
      business_impressions_mobile_search INT,
      call_clicks INT,
      website_clicks INT,
      direction_requests INT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, metric_date, location_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_fact_gbp_metrics_daily_org_date
    ON fact_gbp_metrics_daily (organization_id, metric_date DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS fact_search_console_daily (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      metric_date DATE NOT NULL,
      site_url TEXT NOT NULL DEFAULT '',
      clicks INT NOT NULL DEFAULT 0,
      impressions INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, metric_date, site_url)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS mart_marketing_daily (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      metric_date DATE NOT NULL,
      channel_slug TEXT NOT NULL REFERENCES marketing_channels(slug),
      spend_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      platform_leads INT NOT NULL DEFAULT 0,
      attributed_job_count INT NOT NULL DEFAULT 0,
      booked_job_count INT NOT NULL DEFAULT 0,
      paid_job_count INT NOT NULL DEFAULT 0,
      attributed_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, metric_date, channel_slug)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_mart_marketing_daily_org_date
    ON mart_marketing_daily (organization_id, metric_date DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_integration_sync_state (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      integration TEXT NOT NULL,
      last_success_at TIMESTAMPTZ,
      last_error TEXT,
      cursor_json JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, integration)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_oauth_credentials (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      integration TEXT NOT NULL,
      refresh_token TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, integration)
    )
  `;

  // Website attribution (first-party links + snippet event ingestion)
  await sql`
    CREATE TABLE IF NOT EXISTS web_attribution_install (
      organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
      publishable_key_hash TEXT NOT NULL,
      allowed_origins TEXT[] NOT NULL DEFAULT '{}'::text[],
      last_event_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS web_attribution_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      public_token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_web_attribution_sources_org_active
    ON web_attribution_sources (organization_id, created_at ASC)
    WHERE archived_at IS NULL
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS web_attribution_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source_id UUID REFERENCES web_attribution_sources(id) ON DELETE SET NULL,
      visitor_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('landing', 'page_view', 'tel_click', 'form_submit', 'booking', 'verify_ping')),
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      page_url TEXT,
      referrer TEXT,
      user_agent TEXT,
      ip_hash TEXT,
      country TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_web_attribution_events_org_time
    ON web_attribution_events (organization_id, occurred_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_web_attribution_events_org_source_time
    ON web_attribution_events (organization_id, source_id, occurred_at DESC)
  `;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'web_attribution_install' AND column_name = 'default_forward_e164') THEN
        ALTER TABLE web_attribution_install ADD COLUMN default_forward_e164 TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'web_attribution_install' AND column_name = 'twilio_intelligence_service_sid') THEN
        ALTER TABLE web_attribution_install ADD COLUMN twilio_intelligence_service_sid TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'web_attribution_install' AND column_name = 'twilio_subaccount_sid') THEN
        ALTER TABLE web_attribution_install ADD COLUMN twilio_subaccount_sid TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'web_attribution_install' AND column_name = 'twilio_subaccount_auth_token_encrypted') THEN
        ALTER TABLE web_attribution_install ADD COLUMN twilio_subaccount_auth_token_encrypted TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'web_attribution_install' AND column_name = 'twilio_subaccount_api_key_sid') THEN
        ALTER TABLE web_attribution_install ADD COLUMN twilio_subaccount_api_key_sid TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'web_attribution_install' AND column_name = 'twilio_subaccount_api_key_secret_encrypted') THEN
        ALTER TABLE web_attribution_install ADD COLUMN twilio_subaccount_api_key_secret_encrypted TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'web_attribution_install' AND column_name = 'twilio_subaccount_created_at') THEN
        ALTER TABLE web_attribution_install ADD COLUMN twilio_subaccount_created_at TIMESTAMPTZ;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'web_attribution_install' AND column_name = 'call_tracking_ivr_enabled') THEN
        ALTER TABLE web_attribution_install ADD COLUMN call_tracking_ivr_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'web_attribution_install' AND column_name = 'call_tracking_ivr_prompt') THEN
        ALTER TABLE web_attribution_install ADD COLUMN call_tracking_ivr_prompt TEXT;
      END IF;
    END $$
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_web_attribution_install_twilio_subaccount
    ON web_attribution_install (twilio_subaccount_sid)
    WHERE twilio_subaccount_sid IS NOT NULL
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS web_attribution_phone_numbers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source_id UUID NOT NULL REFERENCES web_attribution_sources(id) ON DELETE CASCADE,
      twilio_phone_number_sid TEXT NOT NULL,
      phone_e164 TEXT NOT NULL,
      forward_to_e164 TEXT NOT NULL,
      search_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      released_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_web_attribution_phone_e164_active
    ON web_attribution_phone_numbers (phone_e164)
    WHERE released_at IS NULL
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_web_attribution_phone_org_source_active
    ON web_attribution_phone_numbers (organization_id, source_id)
    WHERE released_at IS NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_web_attribution_phone_org
    ON web_attribution_phone_numbers (organization_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS twilio_tracking_calls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source_id UUID REFERENCES web_attribution_sources(id) ON DELETE SET NULL,
      phone_number_id UUID REFERENCES web_attribution_phone_numbers(id) ON DELETE SET NULL,
      call_sid TEXT NOT NULL,
      recording_sid TEXT,
      from_e164 TEXT,
      to_e164 TEXT,
      started_at TIMESTAMPTZ,
      duration_seconds INT,
      transcript_text TEXT,
      intelligence_transcript_sid TEXT,
      transcript_status TEXT NOT NULL DEFAULT 'pending',
      raw_callbacks JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(call_sid)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_twilio_tracking_calls_org_time
    ON twilio_tracking_calls (organization_id, created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_twilio_tracking_calls_transcript_poll
    ON twilio_tracking_calls (transcript_status, created_at)
    WHERE transcript_status IN ('pending', 'queued', 'in-progress')
  `;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'twilio_tracking_calls' AND column_name = 'recording_media_url'
      ) THEN
        ALTER TABLE twilio_tracking_calls ADD COLUMN recording_media_url TEXT;
      END IF;
    END $$
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_twilio_tracking_calls_phone_time
    ON twilio_tracking_calls (organization_id, phone_number_id, created_at DESC)
    WHERE phone_number_id IS NOT NULL
  `;
}
