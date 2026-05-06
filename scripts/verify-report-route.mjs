import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const designSnapshot = JSON.parse(
  await fs.readFile(path.join(rootDir, "plugins", "figma", "fixtures", "sample-snapshot.json"), "utf8")
);
const pageSnapshot = JSON.parse(
  await fs.readFile(path.join(rootDir, "packages", "shared", "fixtures", "sample-page-snapshot.json"), "utf8")
);

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || !process.env.DEV_BOOTSTRAP_SECRET) {
  throw new Error("DATABASE_URL, JWT_SECRET, and DEV_BOOTSTRAP_SECRET are required");
}

const { buildApp } = await import(pathToFileURL(path.join(rootDir, "apps", "api", "src", "app.ts")).href);

const app = await buildApp();

try {
  const bootstrap = await app.inject({
    method: "POST",
    url: "/v1/dev/bootstrap-token",
    headers: {
      "x-dev-bootstrap-secret": process.env.DEV_BOOTSTRAP_SECRET,
    },
    payload: {
      userId: "report-route-user",
      tenantId: designSnapshot.tenantId,
      role: "admin",
    },
  });

  assert.equal(bootstrap.statusCode, 200);
  const bootstrapBody = bootstrap.json();
  assert.equal(bootstrapBody.ok, true);
  const token = bootstrapBody.token;

  const designResponse = await app.inject({
    method: "POST",
    url: "/v1/design-snapshots",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: designSnapshot,
  });

  assert.equal(designResponse.statusCode, 201);

  const comparisonResponse = await app.inject({
    method: "POST",
    url: "/v1/comparisons",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      projectId: designSnapshot.projectId,
      designSnapshot,
      pageSnapshot,
      tolerancePx: 5,
    },
  });

  assert.equal(comparisonResponse.statusCode, 201);
  const comparisonBody = comparisonResponse.json();
  const runId = comparisonBody.storedComparison.id;

  const reportResponse = await app.inject({
    method: "GET",
    url: `/v1/comparisons/${runId}/report`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(reportResponse.statusCode, 200);
  const reportBody = reportResponse.json();

  assert.equal(reportBody.ok, true);
  assert.equal(reportBody.report.runId, runId);
  assert.equal(reportBody.report.summary.status, "pass");
  assert.equal(reportBody.report.summary.totalIssues, 0);
  assert.equal(reportBody.report.figmaFileId, designSnapshot.figmaFileId);
  assert.equal(reportBody.report.issuePatterns.length, 0);
  console.log("Report route verification passed");
} finally {
  await app.close();
}
