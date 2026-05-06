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

pageSnapshot.roots[0].children[0].box.width = 136;
pageSnapshot.roots[0].children[0].styles.width = "136px";

const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const tenantId = `${designSnapshot.tenantId}-issue-${uniqueSuffix}`;
const projectId = `${designSnapshot.projectId}-issue-${uniqueSuffix}`;
const figmaFileId = `${designSnapshot.figmaFileId}-issue-${uniqueSuffix}`;

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
      userId: "issue-user",
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
      pageSnapshot: {
        ...pageSnapshot,
        tenantId,
        projectId,
      },
    },
  });

  assert.equal(comparison.statusCode, 201);
  const comparisonBody = comparison.json();
  const runId = comparisonBody.storedComparison.id;
  assert.notEqual(comparisonBody.comparison.status, "pass");

  const initialStatuses = await app.inject({
    method: "GET",
    url: `/v1/comparisons/${runId}/issues/statuses`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(initialStatuses.statusCode, 200);
  assert.equal(initialStatuses.json().statuses.length, 0);

  const issue = comparisonBody.comparison.issues[0];
  const saveStatus = await app.inject({
    method: "POST",
    url: `/v1/comparisons/${runId}/issues/statuses`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      issueCode: issue.code,
      issuePath: issue.path,
      issueSeverity: issue.severity,
      status: "resolved",
      note: "Reviewed in beta and confirmed acceptable",
    },
  });

  assert.equal(saveStatus.statusCode, 201);
  const saveBody = saveStatus.json();
  assert.equal(saveBody.ok, true);
  assert.equal(saveBody.status.status, "resolved");

  const finalStatuses = await app.inject({
    method: "GET",
    url: `/v1/comparisons/${runId}/issues/statuses`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(finalStatuses.statusCode, 200);
  const finalBody = finalStatuses.json();
  assert.equal(finalBody.statuses.length, 1);
  assert.equal(finalBody.statuses[0].status, "resolved");
  assert.equal(finalBody.statuses[0].note, "Reviewed in beta and confirmed acceptable");

  console.log("Comparison issue status verification passed");
} finally {
  await app.close();
}
