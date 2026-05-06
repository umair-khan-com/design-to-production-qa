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
      userId: "scope-user",
      tenantId: designSnapshot.tenantId,
      role: "admin",
    },
  });

  assert.equal(bootstrap.statusCode, 200);
  const token = bootstrap.json().token;

  const readKeyResponse = await app.inject({
    method: "POST",
    url: "/v1/integrations/api-keys",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      name: "Read key",
      scopes: ["comparisons:read", "reports:read"],
    },
  });

  assert.equal(readKeyResponse.statusCode, 200);
  const readKey = readKeyResponse.json().apiKey;
  assert.deepEqual(readKey.scopes, ["comparisons:read", "reports:read"]);

  const writeKeyResponse = await app.inject({
    method: "POST",
    url: "/v1/integrations/api-keys",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      name: "Write key",
      scopes: ["comparisons:write"],
    },
  });

  assert.equal(writeKeyResponse.statusCode, 200);
  const writeKey = writeKeyResponse.json().apiKey;

  const writeComparisonResponse = await app.inject({
    method: "POST",
    url: "/v1/integrations/comparisons",
    headers: {
      "x-api-key": writeKey.rawKey,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      projectId: designSnapshot.projectId,
      designSnapshot,
      pageSnapshot,
      tolerancePx: 5,
    },
  });

  assert.equal(writeComparisonResponse.statusCode, 201);
  const storedComparisonId = writeComparisonResponse.json().storedComparison.id;

  const historyResponse = await app.inject({
    method: "GET",
    url: `/v1/comparisons?projectId=${encodeURIComponent(designSnapshot.projectId)}&limit=10`,
    headers: {
      "x-api-key": readKey.rawKey,
    },
  });

  assert.equal(historyResponse.statusCode, 200);
  const historyBody = historyResponse.json();
  assert.equal(historyBody.ok, true);
  assert.equal(historyBody.history.some((item) => item.id === storedComparisonId), true);

  const detailResponse = await app.inject({
    method: "GET",
    url: `/v1/comparisons/${storedComparisonId}`,
    headers: {
      "x-api-key": readKey.rawKey,
    },
  });

  assert.equal(detailResponse.statusCode, 200);
  const detailBody = detailResponse.json();
  assert.equal(detailBody.ok, true);
  assert.equal(detailBody.run.id, storedComparisonId);

  const reportResponse = await app.inject({
    method: "GET",
    url: `/v1/comparisons/${storedComparisonId}/report`,
    headers: {
      "x-api-key": readKey.rawKey,
    },
  });

  assert.equal(reportResponse.statusCode, 200);
  const reportBody = reportResponse.json();
  assert.equal(reportBody.ok, true);
  assert.equal(reportBody.report.runId, storedComparisonId);

  const rejectedComparison = await app.inject({
    method: "POST",
    url: "/v1/integrations/comparisons",
    headers: {
      "x-api-key": readKey.rawKey,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      projectId: designSnapshot.projectId,
      designSnapshot,
      pageSnapshot,
      tolerancePx: 5,
    },
  });

  assert.equal(rejectedComparison.statusCode, 403);

  console.log("API key scope verification passed");
} finally {
  await app.close();
}
