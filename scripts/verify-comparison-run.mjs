import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const designPath = path.join(rootDir, "plugins", "figma", "fixtures", "sample-snapshot.json");
const pagePath = path.join(rootDir, "packages", "shared", "fixtures", "sample-page-snapshot.json");

const designSnapshot = JSON.parse(await fs.readFile(designPath, "utf8"));
const pageSnapshot = JSON.parse(await fs.readFile(pagePath, "utf8"));

const { compareDesignToPage } = await import(
  pathToFileURL(path.join(rootDir, "packages", "shared", "src", "comparison.ts")).href
);
const { upsertTenant, upsertMembership, upsertUser } = await import(
  pathToFileURL(path.join(rootDir, "apps", "api", "src", "repositories", "provisioning.ts")).href
);
const { upsertProject } = await import(
  pathToFileURL(path.join(rootDir, "apps", "api", "src", "repositories", "design-snapshots.ts")).href
);
const { insertComparisonRun } = await import(
  pathToFileURL(path.join(rootDir, "apps", "api", "src", "repositories", "comparison-runs.ts")).href
);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const user = await upsertUser("comparison-run-user");
const tenant = await upsertTenant(designSnapshot.tenantId);
await upsertMembership(tenant.id, user.id, "admin");

const comparison = compareDesignToPage(designSnapshot, pageSnapshot, 5);
const project = await upsertProject(tenant.id, designSnapshot.projectId);
const stored = await insertComparisonRun(
  tenant,
  project.id,
  designSnapshot,
  pageSnapshot,
  comparison,
  5
);

assert.equal(stored.status, comparison.status);
assert.equal(stored.tolerancePx, 5);
assert.ok(stored.id > 0);

console.log("Comparison run persistence verification passed");
