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
      userId: "api-key-user",
      tenantId: designSnapshot.tenantId,
      role: "admin",
    },
  });

  assert.equal(bootstrap.statusCode, 200);
  const token = bootstrap.json().token;

  const apiKeyResponse = await app.inject({
    method: "POST",
    url: "/v1/integrations/api-keys",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      name: "CI key",
    },
  });

  assert.equal(apiKeyResponse.statusCode, 200);
  const apiKeyBody = apiKeyResponse.json();
  assert.equal(apiKeyBody.ok, true);
  assert.ok(apiKeyBody.apiKey.rawKey.startsWith("d2p_"));

  const billingResponse = await app.inject({
    method: "GET",
    url: `/v1/billing/${designSnapshot.tenantId}`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(billingResponse.statusCode, 200);
  const billingBody = billingResponse.json();
  assert.equal(billingBody.ok, true);
  assert.equal(billingBody.billing.externalId, designSnapshot.tenantId);

  const integrationResponse = await app.inject({
    method: "POST",
    url: "/v1/integrations/comparisons",
    headers: {
      "x-api-key": apiKeyBody.apiKey.rawKey,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      projectId: designSnapshot.projectId,
      designSnapshot,
      pageSnapshot,
      tolerancePx: 5,
    },
  });

  assert.equal(integrationResponse.statusCode, 201);
  const integrationBody = integrationResponse.json();
  assert.equal(integrationBody.ok, true);
  assert.equal(integrationBody.comparison.status, "pass");
  console.log("API key route verification passed");
} finally {
  await app.close();
}
