import { getPool } from "../db";

export interface AnnouncementFeedItem {
  id: number;
  kind: "release" | "maintenance";
  version: string | null;
  title: string;
  summary: string;
  highlights: string[];
  message: string;
  releasedAt: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

async function getUserIdByExternalId(userExternalId: string): Promise<number | null> {
  const pool = getPool();
  const result = await pool.query<{ user_id: number }>(
    `
      SELECT id AS user_id
      FROM users
      WHERE external_id = $1
      LIMIT 1
    `,
    [userExternalId]
  );

  return result.rows[0]?.user_id ?? null;
}

function mapFeedRow(row: {
  id: number | string;
  kind: "release" | "maintenance";
  version: string | null;
  title: string;
  summary: string;
  highlights: string[];
  message: string;
  released_at: Date;
  acknowledged_at: Date | null;
}): AnnouncementFeedItem {
  return {
    id: Number(row.id),
    kind: row.kind,
    version: row.version,
    title: row.title,
    summary: row.summary,
    highlights: row.highlights ?? [],
    message: row.message,
    releasedAt: row.released_at.toISOString(),
    acknowledged: Boolean(row.acknowledged_at),
    acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
  };
}

export async function listAnnouncementFeed(
  userExternalId: string
): Promise<{ announcements: AnnouncementFeedItem[]; unreadCount: number }> {
  const pool = getPool();
  const userId = await getUserIdByExternalId(userExternalId);

  const result = await pool.query<{
    id: number | string;
    kind: "release" | "maintenance";
    version: string | null;
    title: string;
    summary: string;
    highlights: string[];
    message: string;
    released_at: Date;
    acknowledged_at: Date | null;
  }>(
    `
      SELECT
        sa.id,
        sa.kind,
        sa.version,
        sa.title,
        sa.summary,
        sa.highlights,
        sa.message,
        sa.released_at,
        aa.acknowledged_at
      FROM site_announcements sa
      LEFT JOIN announcement_acknowledgements aa
        ON aa.announcement_id = sa.id
       AND aa.user_id = $1
      WHERE sa.active = TRUE
      ORDER BY sa.released_at DESC, sa.id DESC
    `,
    [userId]
  );

  const announcements = result.rows.map(mapFeedRow);

  return {
    announcements,
    unreadCount: announcements.filter((announcement) => !announcement.acknowledged).length,
  };
}

export async function acknowledgeAnnouncement(
  userExternalId: string,
  announcementId: number
): Promise<{ announcement: AnnouncementFeedItem | null; unreadCount: number }> {
  const pool = getPool();
  const userId = await getUserIdByExternalId(userExternalId);

  if (!userId) {
    return { announcement: null, unreadCount: 0 };
  }

  await pool.query(
    `
      INSERT INTO announcement_acknowledgements (announcement_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (announcement_id, user_id)
      DO UPDATE SET acknowledged_at = NOW()
    `,
    [announcementId, userId]
  );

  const feed = await listAnnouncementFeed(userExternalId);
  return {
    announcement: feed.announcements.find((announcement) => announcement.id === announcementId) ?? null,
    unreadCount: feed.unreadCount,
  };
}

