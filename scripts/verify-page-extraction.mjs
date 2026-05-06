import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const apiDir = path.join(rootDir, "apps", "api");

const htmlPath = `./${path.relative(rootDir, path.join(apiDir, "fixtures", "sample-page.html")).replaceAll("\\", "/")}`;
const expectedPath = `./${path.relative(rootDir, path.join(rootDir, "packages", "shared", "fixtures", "sample-page-snapshot.json")).replaceAll("\\", "/")}`;
const validationPath = `./${path.relative(rootDir, path.join(rootDir, "packages", "shared", "src", "validation.ts")).replaceAll("\\", "/")}`;
const expectedSnapshot = JSON.parse(await fs.readFile(path.join(rootDir, expectedPath), "utf8"));
const html = await fs.readFile(path.join(rootDir, htmlPath), "utf8");
const { extractPageSnapshotFromHtml } = await import(
  pathToFileURL(path.join(apiDir, "src", "page-extraction.ts")).href
);
const { validatePageSnapshot } = await import(
  pathToFileURL(path.join(rootDir, "packages", "shared", "src", "validation.ts")).href
);

const actualSnapshot = extractPageSnapshotFromHtml(html, {
  tenantId: expectedSnapshot.tenantId,
  projectId: expectedSnapshot.projectId,
  pageUrl: expectedSnapshot.pageUrl,
  schemaVersion: expectedSnapshot.schemaVersion,
});

const validation = validatePageSnapshot(actualSnapshot);

if (!validation.valid) {
  throw new Error(validation.issues.map((issue) => issue.message).join(", "));
}

if (JSON.stringify(actualSnapshot) !== JSON.stringify(expectedSnapshot)) {
  throw new Error("Extracted page snapshot did not match the expected fixture");
}

console.log("Page extraction fixture verification passed");
