ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS billing_provider TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS billing_customer_id TEXT;
