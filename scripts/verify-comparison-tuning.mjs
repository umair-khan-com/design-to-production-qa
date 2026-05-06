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
const pageSnapshot = JSON.parse(
  await fs.readFile(`${rootDir}\\packages\\shared\\fixtures\\sample-page-snapshot.json`, "utf8")
);

const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const tenantId = `${designSnapshot.tenantId}-tuning-${uniqueSuffix}`;
const projectId = `${designSnapshot.projectId}-tuning-${uniqueSuffix}`;
const figmaFileId = `${designSnapshot.figmaFileId}-tuning-${uniqueSuffix}`;

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
      userId: "tuning-user",
      tenantId,
      role: "admin",
    },
  });

  assert.equal(bootstrap.statusCode, 200);
  const token = bootstrap.json().token;

  const firstComparison = await app.inject({
    method: "POST",
    url: "/v1/comparisons",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId,
      projectId,
      designSnapshot: {
        ...designSnapshot,
        tenantId,
        projectId,
        figmaFileId,
      },
      pageSnapshot,
    },
  });

  assert.equal(firstComparison.statusCode, 201);

  const firstRun = firstComparison.json().storedComparison;

  const feedback = await app.inject({
    method: "POST",
    url: `/v1/comparisons/${firstRun.id}/feedback`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      rating: 2,
      sentiment: "negative",
      notes: "Tolerance should be higher for spacing issues",
      tags: ["spacing", "layout"],
    },
  });

  assert.equal(feedback.statusCode, 201);

  const tuning = await app.inject({
    method: "GET",
    url: `/v1/tenants/${tenantId}/tuning`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(tuning.statusCode, 200);
  const tuningBody = tuning.json();
  assert.equal(tuningBody.ok, true);
  assert.ok(tuningBody.tuning.feedbackCount >= 1);
  assert.ok(tuningBody.tuning.recommendedTolerancePx >= 6);

  const secondComparison = await app.inject({
    method: "POST",
    url: "/v1/comparisons",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId,
      projectId,
      designSnapshot: {
        ...designSnapshot,
        tenantId,
        projectId,
        figmaFileId,
      },
      pageSnapshot,
    },
  });

  assert.equal(secondComparison.statusCode, 201);
  const secondRun = secondComparison.json().storedComparison;
  assert.equal(secondRun.tolerancePx, tuningBody.tuning.recommendedTolerancePx);

  console.log("Comparison tuning verification passed");
} finally {
  await app.close();
}
