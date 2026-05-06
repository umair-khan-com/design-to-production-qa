import { getPool } from "../db";

export interface ReleaseNote {
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  highlights: string[];
}

const DEFAULT_RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "0.1.0",
    releasedAt: "2026-04-26T00:00:00.000Z",
    title: "Phase 7 beta loop",
    summary: "Feedback, tuning, and issue tracking are wired through the dashboard and API.",
    highlights: [
      "Comparison feedback on run detail",
      "Feedback-derived tolerance tuning",
      "Issue resolution controls",
      "Beta end-to-end smoke coverage",
    ],
  },
  {
    version: "0.0.9",
    releasedAt: "2026-04-20T00:00:00.000Z",
    title: "SaaS scaling and billing",
    summary: "Quotas, billing metadata, webhooks, and API keys are available for tenant operations.",
    highlights: [
      "Plan-based usage limits",
      "Billing metadata and checkout/portal actions",
      "Webhook signing and retries",
      "Scoped tenant API keys",
    ],
  },
  {
    version: "0.0.8",
    releasedAt: "2026-04-14T00:00:00.000Z",
    title: "Comparison and reporting",
    summary: "Comparison history, reporting exports, and dashboard drill-downs are in place.",
    highlights: [
      "Comparison history and report endpoints",
      "CSV and PDF export",
      "Project and file drill-down",
      "Browser-backed page capture",
    ],
  },
];

export async function listReleaseNotes(): Promise<ReleaseNote[]> {
  const pool = getPool();
  const result = await pool.query<{
    version: string | null;
    released_at: Date;
    title: string;
    summary: string;
    highlights: string[];
  }>(
    `
      SELECT
        version,
        released_at,
        title,
        summary,
        highlights
      FROM site_announcements
      WHERE kind = 'release'
        AND active = TRUE
      ORDER BY released_at DESC, id DESC
    `
  );

  if (result.rowCount === 0) {
    return DEFAULT_RELEASE_NOTES;
  }

  return result.rows.map((row) => ({
    version: row.version ?? "unversioned",
    releasedAt: row.released_at.toISOString(),
    title: row.title,
    summary: row.summary,
    highlights: row.highlights ?? [],
  }));
}

export async function getLatestReleaseNote(): Promise<ReleaseNote> {
  const releases = await listReleaseNotes();
  return releases[0] ?? DEFAULT_RELEASE_NOTES[0];
}

export async function getMaintenanceMessage(): Promise<string | null> {
  const pool = getPool();
  const result = await pool.query<{
    message: string;
  }>(
    `
      SELECT message
      FROM site_announcements
      WHERE kind = 'maintenance'
        AND active = TRUE
      ORDER BY released_at DESC, id DESC
      LIMIT 1
    `
  );

  if (result.rowCount > 0) {
    return result.rows[0].message;
  }

  return process.env.MAINTENANCE_MESSAGE?.trim() || null;
}

export async function createReleaseNote(input: {
  version: string;
  title: string;
  summary: string;
  highlights: string[];
  createdByUserId: string;
}): Promise<ReleaseNote> {
  const pool = getPool();
  const result = await pool.query<{
    version: string;
    released_at: Date;
    title: string;
    summary: string;
    highlights: string[];
  }>(
    `
      INSERT INTO site_announcements (
        kind,
        version,
        title,
        summary,
        highlights,
        message,
        created_by_user_id
      )
      VALUES ('release', $1, $2, $3, $4::jsonb, '', $5)
      ON CONFLICT (kind, version)
      DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        highlights = EXCLUDED.highlights,
        released_at = NOW()
      RETURNING version, released_at, title, summary, highlights
    `,
    [input.version, input.title, input.summary, JSON.stringify(input.highlights), input.createdByUserId]
  );

  const row = result.rows[0];
  return {
    version: row.version,
    releasedAt: row.released_at.toISOString(),
    title: row.title,
    summary: row.summary,
    highlights: row.highlights ?? [],
  };
}

export async function setMaintenanceMessage(input: {
  message: string;
  createdByUserId: string;
}): Promise<string> {
  const pool = getPool();
  await pool.query(
    `
      UPDATE site_announcements
      SET active = FALSE
      WHERE kind = 'maintenance'
        AND active = TRUE
    `
  );

  await pool.query(
    `
      INSERT INTO site_announcements (
        kind,
        title,
        summary,
        highlights,
        message,
        created_by_user_id
      )
      VALUES ('maintenance', 'Maintenance Message', '', '[]'::jsonb, $1, $2)
    `,
    [input.message, input.createdByUserId]
  );

  return input.message;
}

