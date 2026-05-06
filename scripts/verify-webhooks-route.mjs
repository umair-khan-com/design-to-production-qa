import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyWebhookSignature } from "../packages/shared/src/webhooks.ts";

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

const received = [];
const successfulServer = http.createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const timestamp = request.headers["x-webhook-timestamp"];
    const signature = request.headers["x-webhook-signature"];
    const secret = request.headers["x-webhook-secret"];
    const verified =
      typeof timestamp === "string" &&
      typeof signature === "string" &&
      typeof secret === "string" &&
      verifyWebhookSignature(secret, timestamp, signature, body);

    received.push({
      secret,
      timestamp,
      signature,
      verified,
      body,
    });
    if (!verified) {
      response.writeHead(401);
      response.end("Invalid signature");
      return;
    }
    response.writeHead(204);
    response.end();
  });
});

await new Promise((resolve) => {
  successfulServer.listen(0, "127.0.0.1", resolve);
});

const failingReceived = [];
let acceptFailingWebhookRequests = false;
const failingServer = http.createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const timestamp = request.headers["x-webhook-timestamp"];
    const signature = request.headers["x-webhook-signature"];
    const secret = request.headers["x-webhook-secret"];
    const verified =
      typeof timestamp === "string" &&
      typeof signature === "string" &&
      typeof secret === "string" &&
      verifyWebhookSignature(secret, timestamp, signature, body);

    failingReceived.push({
      secret,
      timestamp,
      signature,
      verified,
      body,
    });
    if (acceptFailingWebhookRequests) {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(500, { "content-type": "text/plain" });
    response.end("Temporary failure");
  });
});

await new Promise((resolve) => {
  failingServer.listen(0, "127.0.0.1", resolve);
});

const address = successfulServer.address();
const failingAddress = failingServer.address();

if (!address || typeof address === "string") {
  successfulServer.close();
  failingServer.close();
  throw new Error("Failed to start webhook server");
}

if (!failingAddress || typeof failingAddress === "string") {
  successfulServer.close();
  failingServer.close();
  throw new Error("Failed to start failing webhook server");
}

const webhookUrl = `http://127.0.0.1:${address.port}/webhook`;
const failingWebhookUrl = `http://127.0.0.1:${failingAddress.port}/webhook`;
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
      userId: "webhook-user",
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
      name: "Webhook key",
    },
  });

  assert.equal(apiKeyResponse.statusCode, 200);
  const apiKey = apiKeyResponse.json().apiKey;

  const webhookResponse = await app.inject({
    method: "POST",
    url: "/v1/integrations/webhooks",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      name: "Local webhook",
      targetUrl: webhookUrl,
      events: ["comparison.created"],
    },
  });

  assert.equal(webhookResponse.statusCode, 200);
  const webhookBody = webhookResponse.json();
  assert.equal(webhookBody.ok, true);
  assert.ok(webhookBody.webhook.rawSecret);

  const deadLetterWebhookResponse = await app.inject({
    method: "POST",
    url: "/v1/integrations/webhooks",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      name: "Failing webhook",
      targetUrl: failingWebhookUrl,
      events: ["comparison.created"],
    },
  });

  assert.equal(deadLetterWebhookResponse.statusCode, 200);
  const deadLetterWebhookBody = deadLetterWebhookResponse.json();
  assert.equal(deadLetterWebhookBody.ok, true);

  const failedEventWebhookResponse = await app.inject({
    method: "POST",
    url: "/v1/integrations/webhooks",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      name: "Failed event webhook",
      targetUrl: webhookUrl,
      events: ["comparison.failed"],
    },
  });

  assert.equal(failedEventWebhookResponse.statusCode, 200);
  const failedEventWebhookBody = failedEventWebhookResponse.json();
  assert.equal(failedEventWebhookBody.ok, true);

  const comparisonResponse = await app.inject({
    method: "POST",
    url: "/v1/integrations/comparisons",
    headers: {
      "x-api-key": apiKey.rawKey,
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

  for (let index = 0; index < 20 && received.length === 0; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.equal(received.length > 0, true);
  assert.equal(received[0].secret, webhookBody.webhook.rawSecret);
  assert.equal(received[0].verified, true);
  const parsed = JSON.parse(received[0].body);
  assert.equal(parsed.eventType, "comparison.created");
  assert.equal(parsed.data.eventType, "comparison.created");
  assert.equal(parsed.data.comparison.status, "pass");
  assert.equal(parsed.data.tenantId, designSnapshot.tenantId);
  assert.equal(parsed.data.projectId, designSnapshot.projectId);
  assert.equal(typeof received[0].timestamp, "string");
  assert.equal(typeof received[0].signature, "string");

  const failingComparisonResponse = await app.inject({
    method: "POST",
    url: "/v1/integrations/comparisons",
    headers: {
      "x-api-key": apiKey.rawKey,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      projectId: designSnapshot.projectId,
      designSnapshot,
      pageSnapshot: {
        ...pageSnapshot,
        roots: [
          {
            ...pageSnapshot.roots[0],
            box: {
              ...pageSnapshot.roots[0].box,
              width: pageSnapshot.roots[0].box.width + 50,
            },
          },
        ],
      },
      tolerancePx: 0,
    },
  });

  assert.equal(failingComparisonResponse.statusCode, 201);

  for (let index = 0; index < 30 && failingReceived.length < 3; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.equal(failingReceived.length >= 3, true);
  assert.equal(failingReceived[0].verified, true);

  const eventWebhookLogResponse = await app.inject({
    method: "GET",
    url: `/v1/integrations/webhooks/${failedEventWebhookBody.webhook.id}/deliveries?limit=10`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(eventWebhookLogResponse.statusCode, 200);
  const eventWebhookLogBody = eventWebhookLogResponse.json();
  assert.equal(eventWebhookLogBody.ok, true);
  assert.equal(eventWebhookLogBody.deliveries.some((delivery) => delivery.eventType === "comparison.failed"), true);

  const deliveryLogResponse = await app.inject({
    method: "GET",
    url: `/v1/integrations/webhooks/${deadLetterWebhookBody.webhook.id}/deliveries?limit=10`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(deliveryLogResponse.statusCode, 200);
  const deliveryLogBody = deliveryLogResponse.json();
  assert.equal(deliveryLogBody.ok, true);
  assert.equal(deliveryLogBody.deliveries.length > 0, true);
  assert.equal(deliveryLogBody.deliveries[0].status, "dead_lettered");
  assert.equal(deliveryLogBody.deliveries[0].attemptCount, 3);
  assert.equal(deliveryLogBody.deliveries[0].responseStatus, 500);

  acceptFailingWebhookRequests = true;

  const redeliverResponse = await app.inject({
    method: "POST",
    url: `/v1/integrations/webhooks/${deadLetterWebhookBody.webhook.id}/deliveries/${deliveryLogBody.deliveries[0].id}/redeliver`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(redeliverResponse.statusCode, 200);
  const redeliverBody = redeliverResponse.json();
  assert.equal(redeliverBody.ok, true);
  assert.equal(redeliverBody.delivery.status, "delivered");

  const redeliveredLogResponse = await app.inject({
    method: "GET",
    url: `/v1/integrations/webhooks/${deadLetterWebhookBody.webhook.id}/deliveries?limit=10`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(redeliveredLogResponse.statusCode, 200);
  const redeliveredLogBody = redeliveredLogResponse.json();
  assert.equal(redeliveredLogBody.deliveries[0].status, "delivered");
  assert.equal(redeliveredLogBody.deliveries[0].attemptCount, 4);

  const revokeKeyResponse = await app.inject({
    method: "POST",
    url: `/v1/integrations/api-keys/${apiKey.id}/revoke`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(revokeKeyResponse.statusCode, 200);

  const rejectedComparison = await app.inject({
    method: "POST",
    url: "/v1/integrations/comparisons",
    headers: {
      "x-api-key": apiKey.rawKey,
    },
    payload: {
      tenantId: designSnapshot.tenantId,
      projectId: designSnapshot.projectId,
      designSnapshot,
      pageSnapshot,
      tolerancePx: 5,
    },
  });

  assert.equal(rejectedComparison.statusCode, 401);
  console.log("Webhook route verification passed");
} finally {
  await app.close();
  await new Promise((resolve) => successfulServer.close(resolve));
  await new Promise((resolve) => failingServer.close(resolve));
}
