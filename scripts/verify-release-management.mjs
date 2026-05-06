import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = __filename.slice(0, __filename.lastIndexOf("\\"));
const rootDir = __dirname.replace(/\\scripts$/, "");

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || !process.env.DEV_BOOTSTRAP_SECRET) {
  throw new Error("DATABASE_URL, JWT_SECRET, and DEV_BOOTSTRAP_SECRET are required");
}

const designSnapshot = JSON.parse(
  await fs.readFile(`${rootDir}\\plugins\\figma\\fixtures\\sample-snapshot.json`, "utf8")
);

const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const tenantId = `${designSnapshot.tenantId}-release-${uniqueSuffix}`;

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
      userId: "release-admin",
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
      version: "0.1.1",
      title: "Admin-authored update",
      summary: "Release notes are now editable by tenant admins.",
      highlights: ["Release creation", "Maintenance messages"],
    },
  });

  assert.equal(publishRelease.statusCode, 201);
  const publishBody = publishRelease.json();
  assert.equal(publishBody.release.version, "0.1.1");

  const publishMaintenance = await app.inject({
    method: "POST",
    url: `/v1/tenants/${tenantId}/maintenance`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      message: "Planned maintenance tonight at 22:00 UTC.",
    },
  });

  assert.equal(publishMaintenance.statusCode, 200);

  const releases = await app.inject({
    method: "GET",
    url: "/v1/releases",
  });

  assert.equal(releases.statusCode, 200);
  const releasesBody = releases.json();
  assert.equal(releasesBody.releases[0].version, "0.1.1");

  const latest = await app.inject({
    method: "GET",
    url: "/v1/releases/latest",
  });

  assert.equal(latest.statusCode, 200);
  const latestBody = latest.json();
  assert.equal(latestBody.release.version, "0.1.1");
  assert.equal(latestBody.maintenanceMessage, "Planned maintenance tonight at 22:00 UTC.");

  console.log("Release management verification passed");
} finally {
  await app.close();
}
