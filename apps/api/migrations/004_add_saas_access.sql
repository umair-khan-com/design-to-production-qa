ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan_name TEXT NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes JSONB NOT NULL DEFAULT '["comparisons:write"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tenant_api_keys_tenant_idx
  ON tenant_api_keys (tenant_id);

