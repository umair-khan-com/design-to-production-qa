import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
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
const sampleHtml = await fs.readFile(`${rootDir}\\apps\\api\\fixtures\\sample-page.html`, "utf8");

const server = http.createServer((request, response) => {
  if (request.url !== "/") {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(sampleHtml);
});

await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();

if (!address || typeof address === "string") {
  server.close();
  throw new Error("Failed to start verification server");
}

const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const tenantId = `${designSnapshot.tenantId}-beta-${uniqueSuffix}`;
const projectId = `${designSnapshot.projectId}-beta-${uniqueSuffix}`;
const figmaFileId = `${designSnapshot.figmaFileId}-beta-${uniqueSuffix}`;
const pageUrl = `http://127.0.0.1:${address.port}/`;

const { buildApp } = await import(pathToFileURL(`${rootDir}\\apps\\api\\src\\app.ts`).href);
const { extractPageSnapshotFromUrl } = await import(
  pathToFileURL(`${rootDir}\\apps\\api\\src\\page-extraction.ts`).href
);
const app = await buildApp();

try {
  const bootstrap = await app.inject({
    method: "POST",
    url: "/v1/dev/bootstrap-token",
    headers: {
      "x-dev-bootstrap-secret": process.env.DEV_BOOTSTRAP_SECRET,
    },
    payload: {
      userId: "beta-user",
      tenantId,
      role: "admin",
    },
  });

  assert.equal(bootstrap.statusCode, 200);
  const token = bootstrap.json().token;

  const extractedPage = await extractPageSnapshotFromUrl(pageUrl, {
    tenantId,
    projectId,
    schemaVersion: "1.0.0",
    capture: {
      viewportWidth: 1280,
      viewportHeight: 900,
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });

  const designForRun = {
    ...designSnapshot,
    tenantId,
    projectId,
    figmaFileId,
  };

  const passComparison = await app.inject({
    method: "POST",
    url: "/v1/comparisons",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId,
      projectId,
      designSnapshot: designForRun,
      pageSnapshot: extractedPage,
    },
  });

  assert.equal(passComparison.statusCode, 201);
  const passBody = passComparison.json();
  assert.equal(passBody.comparison.status, "pass");
  const passRunId = passBody.storedComparison.id;

  const feedbackResponse = await app.inject({
    method: "POST",
    url: `/v1/comparisons/${passRunId}/feedback`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      rating: 5,
      sentiment: "positive",
      notes: "This beta flow is stable against the live extracted page",
      tags: ["beta", "browser", "pass"],
    },
  });

  assert.equal(feedbackResponse.statusCode, 201);

  const tuningResponse = await app.inject({
    method: "GET",
    url: `/v1/tenants/${tenantId}/tuning`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(tuningResponse.statusCode, 200);

  const failingPage = structuredClone(extractedPage);
  failingPage.roots[0].children[0].box.width = 136;
  failingPage.roots[0].children[0].styles.width = "136px";

  const failComparison = await app.inject({
    method: "POST",
    url: "/v1/comparisons",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId,
      projectId,
      designSnapshot: designForRun,
      pageSnapshot: failingPage,
    },
  });

  assert.equal(failComparison.statusCode, 201);
  const failBody = failComparison.json();
  assert.notEqual(failBody.comparison.status, "pass");
  const failRunId = failBody.storedComparison.id;

  const issue = failBody.comparison.issues[0];
  assert.ok(issue);

  const issueStatusResponse = await app.inject({
    method: "POST",
    url: `/v1/comparisons/${failRunId}/issues/statuses`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      issueCode: issue.code,
      issuePath: issue.path,
      issueSeverity: issue.severity,
      status: "resolved",
      note: "Reviewed during beta validation",
    },
  });

  assert.equal(issueStatusResponse.statusCode, 201);

  const issueStatusesResponse = await app.inject({
    method: "GET",
    url: `/v1/comparisons/${failRunId}/issues/statuses`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(issueStatusesResponse.statusCode, 200);
  assert.equal(issueStatusesResponse.json().statuses.length, 1);

  const reportResponse = await app.inject({
    method: "GET",
    url: `/v1/comparisons/${passRunId}/report`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(reportResponse.statusCode, 200);

  const historyResponse = await app.inject({
    method: "GET",
    url: `/v1/comparisons?projectId=${projectId}&figmaFileId=${figmaFileId}&limit=10`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(historyResponse.statusCode, 200);

  console.log("Beta end-to-end verification passed");
} finally {
  await app.close();
  await new Promise((resolve) => server.close(resolve));
}
