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
const tenantId = `${designSnapshot.tenantId}-usage-${uniqueSuffix}`;

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
      userId: "usage-user",
      tenantId,
      role: "admin",
    },
  });

  assert.equal(bootstrap.statusCode, 200);
  const token = bootstrap.json().token;

  const usageBefore = await app.inject({
    method: "GET",
    url: `/v1/tenants/${tenantId}/usage`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(usageBefore.statusCode, 200);
  const usageBeforeBody = usageBefore.json();
  assert.equal(usageBeforeBody.ok, true);
  assert.equal(usageBeforeBody.usage.apiKeyCount, 0);
  assert.equal(usageBeforeBody.usage.webhookCount, 0);
  assert.equal(usageBeforeBody.withinLimits, true);

  const apiKeys = [];
  for (let index = 0; index < 3; index += 1) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/integrations/api-keys",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        tenantId,
        name: `Key ${index + 1}`,
      },
    });

    assert.equal(response.statusCode, 200);
    apiKeys.push(response.json().apiKey);
  }

  const apiKeyLimit = await app.inject({
    method: "POST",
    url: "/v1/integrations/api-keys",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId,
      name: "Key 4",
    },
  });

  assert.equal(apiKeyLimit.statusCode, 429);

  const webhookResponse = await app.inject({
    method: "POST",
    url: "/v1/integrations/webhooks",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId,
      name: "Webhook 1",
      targetUrl: "http://127.0.0.1:9/webhook",
      events: ["comparison.created"],
    },
  });

  assert.equal(webhookResponse.statusCode, 200);

  const webhookResponse2 = await app.inject({
    method: "POST",
    url: "/v1/integrations/webhooks",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId,
      name: "Webhook 2",
      targetUrl: "http://127.0.0.1:9/webhook",
      events: ["comparison.created"],
    },
  });

  assert.equal(webhookResponse2.statusCode, 200);

  const webhookResponse3 = await app.inject({
    method: "POST",
    url: "/v1/integrations/webhooks",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId,
      name: "Webhook 3",
      targetUrl: "http://127.0.0.1:9/webhook",
      events: ["comparison.created"],
    },
  });

  assert.equal(webhookResponse3.statusCode, 200);

  const webhookLimit = await app.inject({
    method: "POST",
    url: "/v1/integrations/webhooks",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId,
      name: "Webhook 4",
      targetUrl: "http://127.0.0.1:9/webhook",
      events: ["comparison.created"],
    },
  });

  assert.equal(webhookLimit.statusCode, 429);

  const usageAfter = await app.inject({
    method: "GET",
    url: `/v1/tenants/${tenantId}/usage`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(usageAfter.statusCode, 200);
  const usageAfterBody = usageAfter.json();
  assert.equal(usageAfterBody.usage.apiKeyCount, 3);
  assert.equal(usageAfterBody.usage.activeWebhookCount, 3);
  assert.equal(usageAfterBody.withinLimits, true);

  console.log("Tenant usage verification passed");
} finally {
  await app.close();
}
