import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sharedDir = path.join(rootDir, "packages", "shared");
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d2p-compare-verify-"));
const bundledFile = path.join(tmpDir, "verify-comparison.mjs");

const designPath = `./${path.relative(rootDir, path.join(rootDir, "plugins", "figma", "fixtures", "sample-snapshot.json")).replaceAll("\\", "/")}`;
const pagePath = `./${path.relative(rootDir, path.join(sharedDir, "fixtures", "sample-page-snapshot.json")).replaceAll("\\", "/")}`;

const source = `
  import assert from "node:assert/strict";
  import designSnapshot from "${designPath}";
  import pageSnapshot from "${pagePath}";
  import { compareDesignToPage } from "./packages/shared/src/comparison.ts";

  const result = compareDesignToPage(designSnapshot, pageSnapshot, 5);

  assert.equal(result.status, "pass");
  assert.equal(result.issues.length, 0);

  const semanticDesign = {
    tenantId: "tenant-semantic",
    projectId: "project-semantic",
    figmaFileId: "file-semantic",
    metadata: {
      payloadVersion: "1.0.0",
      schemaVersion: "1.0.0",
      capturedAt: "2024-01-01T00:00:00.000Z",
      producer: "fixture",
    },
    nodes: [
      {
        id: "root",
        name: "Controls Row",
        type: "FRAME",
        bounds: { x: 0, y: 0, width: 320, height: 64 },
        text: null,
        styles: {},
        children: [
          {
            id: "button",
            name: "Primary Button",
            type: "FRAME",
            bounds: { x: 0, y: 0, width: 120, height: 40 },
            text: "Save",
            styles: {},
            children: [],
          },
          {
            id: "input",
            name: "Search Input",
            type: "FRAME",
            bounds: { x: 140, y: 0, width: 180, height: 40 },
            text: null,
            styles: {},
            children: [],
          },
        ],
      },
    ],
  };

  const semanticPage = {
    tenantId: "tenant-semantic",
    projectId: "project-semantic",
    pageUrl: "http://localhost/semantic",
    schemaVersion: "1.0.0",
    roots: [
      {
        key: "1:1",
        tagName: "main",
        text: null,
        box: { x: 0, y: 0, width: 320, height: 64 },
        visible: true,
        styles: {},
        children: [
          {
            key: "1:2",
            tagName: "input",
            text: null,
            box: { x: 140, y: 0, width: 180, height: 40 },
            visible: true,
            role: "textbox",
            placeholder: "Search",
            inputType: "text",
            href: null,
            styles: {},
            children: [],
          },
          {
            key: "1:3",
            tagName: "button",
            text: "Save",
            box: { x: 0, y: 0, width: 120, height: 40 },
            visible: true,
            role: "button",
            ariaLabel: null,
            placeholder: null,
            inputType: "submit",
            href: null,
            styles: {},
            children: [],
          },
        ],
      },
    ],
  };

  const semanticResult = compareDesignToPage(semanticDesign, semanticPage, 5);

  assert.equal(semanticResult.status, "pass");
  assert.equal(semanticResult.issues.length, 0);
  console.log("Comparison fixture verification passed");
`;

const result = await esbuild.build({
  stdin: {
    contents: source,
    resolveDir: rootDir,
    sourcefile: "verify-comparison.ts",
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node18"],
  write: false,
  loader: {
    ".json": "json",
  },
});

await fs.writeFile(bundledFile, result.outputFiles[0].text, "utf8");
await import(`file://${bundledFile.replace(/\\/g, "/")}`);
