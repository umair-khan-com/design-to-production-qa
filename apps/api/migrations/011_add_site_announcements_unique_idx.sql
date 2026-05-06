CREATE UNIQUE INDEX IF NOT EXISTS site_announcements_kind_version_unique_idx
  ON site_announcements (kind, version);
