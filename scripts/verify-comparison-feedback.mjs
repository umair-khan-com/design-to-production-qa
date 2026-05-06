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
const tenantId = `${designSnapshot.tenantId}-feedback-${uniqueSuffix}`;
const projectId = `${designSnapshot.projectId}-feedback-${uniqueSuffix}`;
const figmaFileId = `${designSnapshot.figmaFileId}-feedback-${uniqueSuffix}`;

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
      userId: "feedback-user",
      tenantId,
      role: "admin",
    },
  });

  assert.equal(bootstrap.statusCode, 200);
  const token = bootstrap.json().token;

  const comparison = await app.inject({
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
      tolerancePx: 5,
    },
  });

  assert.equal(comparison.statusCode, 201);
  const comparisonBody = comparison.json();
  const runId = comparisonBody.storedComparison.id;

  const submitFeedback = await app.inject({
    method: "POST",
    url: `/v1/comparisons/${runId}/feedback`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      rating: 5,
      sentiment: "positive",
      notes: "Looks good in beta",
      tags: ["beta", "happy-path"],
    },
  });

  assert.equal(submitFeedback.statusCode, 201);
  const submitBody = submitFeedback.json();
  assert.equal(submitBody.ok, true);
  assert.equal(submitBody.feedback.rating, 5);

  const feedbackList = await app.inject({
    method: "GET",
    url: `/v1/comparisons/${runId}/feedback`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(feedbackList.statusCode, 200);
  const feedbackBody = feedbackList.json();
  assert.equal(feedbackBody.ok, true);
  assert.equal(feedbackBody.feedback.length, 1);
  assert.equal(feedbackBody.feedback[0].notes, "Looks good in beta");

  console.log("Comparison feedback verification passed");
} finally {
  await app.close();
}
