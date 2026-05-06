CREATE TABLE IF NOT EXISTS announcement_acknowledgements (
  id BIGSERIAL PRIMARY KEY,
  announcement_id BIGINT NOT NULL REFERENCES site_announcements(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS announcement_acknowledgements_user_idx
  ON announcement_acknowledgements (user_id, acknowledged_at DESC, id DESC);
