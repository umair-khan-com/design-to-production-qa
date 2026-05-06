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
const { buildComparisonReport, serializeComparisonReportToPdfBytes } = await import(
  pathToFileURL(path.join(rootDir, "packages", "shared", "src", "report.ts")).href
);

const comparison = compareDesignToPage(designSnapshot, pageSnapshot, 5);
const report = buildComparisonReport(
  designSnapshot.tenantId,
  designSnapshot.projectId,
  designSnapshot.figmaFileId,
  comparison.issues,
  5,
  designSnapshot,
  pageSnapshot
);

const pdfBytes = serializeComparisonReportToPdfBytes(report);
const pdfText = new TextDecoder().decode(pdfBytes);

assert.ok(pdfText.startsWith("%PDF-1.4"));
assert.ok(pdfText.includes("Comparison report"));
assert.ok(pdfText.includes("Issue groups"));
assert.ok(pdfText.includes("Pattern drill-down"));
console.log("Report PDF verification passed");
