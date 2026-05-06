import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
import esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const pluginDir = path.join(rootDir, "plugins", "figma");
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d2p-figma-verify-"));
const bundledFile = path.join(tmpDir, "verify-figma-fixture.mjs");

const sampleNodeTreePath = `./${path.relative(rootDir, path.join(pluginDir, "fixtures", "sample-node-tree.json")).replaceAll("\\", "/")}`;
const expectedSnapshotPath = `./${path.relative(rootDir, path.join(pluginDir, "fixtures", "sample-snapshot.json")).replaceAll("\\", "/")}`;
const extractPath = `./${path.relative(rootDir, path.join(pluginDir, "src", "extract.ts")).replaceAll("\\", "/")}`;
const validationPath = `./${path.relative(rootDir, path.join(rootDir, "packages", "shared", "src", "validation.ts")).replaceAll("\\", "/")}`;

const verifySource = `
  import assert from "node:assert/strict";
  import sampleNodeTree from "${sampleNodeTreePath}";
  import expectedSnapshot from "${expectedSnapshotPath}";
  import { createDesignSnapshot } from "${extractPath}";
  import { validateDesignSnapshot } from "${validationPath}";

  function normalize(value) {
    if (Array.isArray(value)) {
      return value.map(normalize);
    }

    if (value && typeof value === "object") {
      const normalized = {};
      const isDesignNode = typeof value.id === "string" && typeof value.name === "string" && "bounds" in value;

      for (const [key, child] of Object.entries(value)) {
        if (child === undefined) {
          continue;
        }

        if (key === "metadata" && child && typeof child === "object") {
          const metadata = normalize(child);
          delete metadata.capturedAt;
          normalized[key] = metadata;
          continue;
        }

        if (isDesignNode && (key === "fills" || key === "strokes")) {
          normalized[key] = Array.isArray(child) ? child.map(normalize) : [];
          continue;
        }

        if (isDesignNode && key === "component") {
          normalized[key] = child && typeof child === "object" ? normalize(child) : {};
          continue;
        }

        normalized[key] = normalize(child);
      }

      if (isDesignNode && !("fills" in normalized)) {
        normalized.fills = [];
      }

      if (isDesignNode && !("strokes" in normalized)) {
        normalized.strokes = [];
      }

      if (isDesignNode && !("component" in normalized)) {
        normalized.component = {};
      }

      if (!("metadata" in normalized) && isDesignNode) {
        normalized.metadata = {};
      }

      return normalized;
    }

    return value;
  }

  const actualSnapshot = createDesignSnapshot(
    expectedSnapshot.tenantId,
    expectedSnapshot.projectId,
    expectedSnapshot.figmaFileId,
    expectedSnapshot.metadata.schemaVersion,
    [sampleNodeTree]
  );

  const validation = validateDesignSnapshot(actualSnapshot);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join(", "));
  assert.deepEqual(normalize(actualSnapshot), normalize(expectedSnapshot));
  console.log("Figma fixture verification passed");
`;

const result = await esbuild.build({
  stdin: {
    contents: verifySource,
    resolveDir: rootDir,
    sourcefile: "verify-figma-fixture.ts",
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
await import(pathToFileURL(bundledFile).href);
