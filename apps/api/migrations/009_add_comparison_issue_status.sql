CREATE TABLE IF NOT EXISTS comparison_issue_status (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  comparison_run_id BIGINT NOT NULL REFERENCES comparison_runs(id) ON DELETE CASCADE,
  issue_code TEXT NOT NULL,
  issue_path TEXT NOT NULL,
  issue_severity TEXT NOT NULL CHECK (issue_severity IN ('minor', 'major', 'critical')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'ignored')),
  note TEXT NOT NULL DEFAULT '',
  resolved_by_user_id TEXT NOT NULL REFERENCES users(external_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, comparison_run_id, issue_code, issue_path)
);

CREATE INDEX IF NOT EXISTS comparison_issue_status_lookup_idx
  ON comparison_issue_status (tenant_id, comparison_run_id, status, created_at DESC, id DESC);
