import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = __filename.slice(0, __filename.lastIndexOf("\\"));
const rootDir = __dirname.replace(/\\scripts$/, "");

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || !process.env.DEV_BOOTSTRAP_SECRET) {
  throw new Error("DATABASE_URL, JWT_SECRET, and DEV_BOOTSTRAP_SECRET are required");
}

const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const tenantId = `tenant_announcements_${uniqueSuffix}`;
const userId = `announcement-admin-${uniqueSuffix}`;

const { buildApp } = await import(pathToFileURL(`${rootDir}\\apps\\api\\src\\app.ts`).href);
const app = await buildApp();

try {
  const bootstrap = await app.inject({
    method: "POST",
    url: "/v1/dev/bootstrap-token",
    headers: {
      "x-dev-bootstrap-secret": process.env.DEV_BOOTSTRAP_SECRET,
    },
    payload: {
      userId,
      tenantId,
      role: "admin",
    },
  });

  assert.equal(bootstrap.statusCode, 200);
  const token = bootstrap.json().token;

  const publishRelease = await app.inject({
    method: "POST",
    url: `/v1/tenants/${tenantId}/releases`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      version: "0.1.2",
      title: "Announcement feed",
      summary: "Release and maintenance messages can now be acknowledged in-app.",
      highlights: ["Unread announcements", "Per-user acknowledgements"],
    },
  });

  assert.equal(publishRelease.statusCode, 201);

  const publishMaintenance = await app.inject({
    method: "POST",
    url: `/v1/tenants/${tenantId}/maintenance`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      message: "Maintenance window tonight at 23:00 UTC.",
    },
  });

  assert.equal(publishMaintenance.statusCode, 200);

  const feed = await app.inject({
    method: "GET",
    url: "/v1/announcements",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(feed.statusCode, 200);
  const feedBody = feed.json();
  assert.equal(feedBody.ok, true);
  assert.ok(feedBody.unreadCount >= 2);
  assert.ok(feedBody.announcements.length >= 2);

  const releaseAnnouncement = feedBody.announcements.find((item) => item.kind === "release");
  assert.ok(releaseAnnouncement);

  const acknowledge = await app.inject({
    method: "POST",
    url: `/v1/announcements/${releaseAnnouncement.id}/ack`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(acknowledge.statusCode, 200);
  const acknowledgeBody = acknowledge.json();
  assert.equal(acknowledgeBody.ok, true);
  assert.equal(acknowledgeBody.unreadCount, feedBody.unreadCount - 1);
  assert.equal(acknowledgeBody.announcement.acknowledged, true);

  const refreshedFeed = await app.inject({
    method: "GET",
    url: "/v1/announcements",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(refreshedFeed.statusCode, 200);
  const refreshedBody = refreshedFeed.json();
  assert.equal(refreshedBody.unreadCount, feedBody.unreadCount - 1);
  assert.equal(
    refreshedBody.announcements.find((item) => item.id === releaseAnnouncement.id)?.acknowledged,
    true
  );

  console.log("Announcement feed verification passed");
} finally {
  await app.close();
}
