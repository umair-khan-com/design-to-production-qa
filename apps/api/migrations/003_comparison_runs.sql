CREATE TABLE IF NOT EXISTS comparison_runs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  design_snapshot JSONB NOT NULL,
  page_snapshot JSONB NOT NULL,
  status TEXT NOT NULL,
  issues JSONB NOT NULL,
  tolerance_px INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comparison_runs_tenant_project_idx
  ON comparison_runs (tenant_id, project_id);

CREATE INDEX IF NOT EXISTS comparison_runs_status_idx
  ON comparison_runs (status);
