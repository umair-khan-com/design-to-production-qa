CREATE TABLE IF NOT EXISTS site_announcements (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('release', 'maintenance')),
  version TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  message TEXT NOT NULL DEFAULT '',
  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT NOT NULL REFERENCES users(external_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS site_announcements_release_version_idx
  ON site_announcements (kind, version)
  WHERE kind = 'release';

CREATE INDEX IF NOT EXISTS site_announcements_kind_idx
  ON site_announcements (kind, active, released_at DESC, id DESC);
