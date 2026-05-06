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

const { compareDesignToPage } = await import(
  pathToFileURL(path.join(rootDir, "packages", "shared", "src", "comparison.ts")).href
);
const { upsertTenant, upsertMembership, upsertUser } = await import(
  pathToFileURL(path.join(rootDir, "apps", "api", "src", "repositories", "provisioning.ts")).href
);
const { upsertProject } = await import(
  pathToFileURL(path.join(rootDir, "apps", "api", "src", "repositories", "design-snapshots.ts")).href
);
const { upsertFigmaFile } = await import(
  pathToFileURL(path.join(rootDir, "apps", "api", "src", "repositories", "design-snapshots.ts")).href
);
const { insertComparisonRun } = await import(
  pathToFileURL(path.join(rootDir, "apps", "api", "src", "repositories", "comparison-runs.ts")).href
);
const { listComparisonHistory } = await import(
  pathToFileURL(path.join(rootDir, "apps", "api", "src", "repositories", "comparison-history.ts")).href
);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const user = await upsertUser("comparison-history-user");
const tenant = await upsertTenant(designSnapshot.tenantId);
await upsertMembership(tenant.id, user.id, "admin");
const project = await upsertProject(tenant.id, designSnapshot.projectId);
await upsertFigmaFile(project.id, designSnapshot.figmaFileId);

const comparison = compareDesignToPage(designSnapshot, pageSnapshot, 5);
await insertComparisonRun(tenant, project.id, designSnapshot, pageSnapshot, comparison, 5);
await insertComparisonRun(tenant, project.id, designSnapshot, pageSnapshot, comparison, 7);

const history = await listComparisonHistory(tenant.id, project.id, undefined, 10);
const filteredHistory = await listComparisonHistory(tenant.id, project.id, designSnapshot.figmaFileId, 10);

assert.ok(history.length >= 2);
assert.equal(history[0].tenantId, tenant.id);
assert.equal(history[0].projectId, project.id);
assert.equal(history[0].figmaFileExternalId, designSnapshot.figmaFileId);
assert.ok(history[0].createdAt);
assert.ok(filteredHistory.length >= 2);
assert.equal(filteredHistory[0].figmaFileExternalId, designSnapshot.figmaFileId);
console.log("Comparison history verification passed");
