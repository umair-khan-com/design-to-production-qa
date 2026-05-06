CREATE TABLE IF NOT EXISTS comparison_feedback (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  comparison_run_id BIGINT NOT NULL REFERENCES comparison_runs(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(external_id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  notes TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comparison_feedback_tenant_idx
  ON comparison_feedback (tenant_id, comparison_run_id, created_at DESC, id DESC);
