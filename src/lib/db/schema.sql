-- Housecall Pro sync schema
-- Run this once to create tables (e.g. via Vercel Postgres dashboard or migration script)

CREATE TABLE IF NOT EXISTS sync_state (
  id SERIAL PRIMARY KEY,
  company_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, entity_type)
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  hcp_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  raw JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(hcp_id, company_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  hcp_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  customer_hcp_id TEXT,
  raw JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(hcp_id, company_id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  hcp_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  job_hcp_id TEXT,
  raw JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(hcp_id, company_id)
);

CREATE TABLE IF NOT EXISTS estimates (
  id SERIAL PRIMARY KEY,
  hcp_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  job_hcp_id TEXT,
  customer_hcp_id TEXT,
  raw JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(hcp_id, company_id)
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  hcp_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  job_hcp_id TEXT,
  raw JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(hcp_id, company_id)
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  hcp_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  raw JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(hcp_id, company_id)
);
