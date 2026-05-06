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
const tenantId = `${designSnapshot.tenantId}-billing-${uniqueSuffix}`;

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
      userId: "billing-user",
      tenantId,
      role: "admin",
    },
  });

  assert.equal(bootstrap.statusCode, 200);
  const token = bootstrap.json().token;

  const billing = await app.inject({
    method: "GET",
    url: `/v1/billing/${tenantId}`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(billing.statusCode, 200);
  const billingBody = billing.json();
  assert.equal(billingBody.ok, true);
  assert.equal(billingBody.billing.billingProvider, "manual");

  const checkout = await app.inject({
    method: "POST",
    url: `/v1/billing/${tenantId}/checkout-session`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(checkout.statusCode, 200);
  const checkoutBody = checkout.json();
  assert.equal(checkoutBody.ok, true);
  assert.equal(checkoutBody.action.provider, "manual");
  assert.equal(checkoutBody.action.url, null);

  const portal = await app.inject({
    method: "POST",
    url: `/v1/billing/${tenantId}/portal-session`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(portal.statusCode, 200);
  const portalBody = portal.json();
  assert.equal(portalBody.ok, true);
  assert.equal(portalBody.action.provider, "manual");
  assert.equal(portalBody.action.url, null);

  console.log("Billing provider verification passed");
} finally {
  await app.close();
}
