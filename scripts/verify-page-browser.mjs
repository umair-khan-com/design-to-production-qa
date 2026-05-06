import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const htmlPath = path.join(rootDir, "apps", "api", "fixtures", "sample-page.html");
const expectedPath = path.join(rootDir, "packages", "shared", "fixtures", "sample-page-snapshot.json");

const expectedSnapshot = JSON.parse(await fs.readFile(expectedPath, "utf8"));
const html = await fs.readFile(htmlPath, "utf8");

const server = http.createServer((request, response) => {
  if (request.url !== "/") {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});

await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();

if (!address || typeof address === "string") {
  server.close();
  throw new Error("Failed to start verification server");
}

try {
  const pageUrl = `http://127.0.0.1:${address.port}/`;
  const { extractPageSnapshotFromBrowser } = await import(
    pathToFileURL(path.join(rootDir, "apps", "api", "src", "page-extraction.ts")).href
  );

  const actualSnapshot = await extractPageSnapshotFromBrowser(pageUrl, {
    tenantId: expectedSnapshot.tenantId,
    projectId: expectedSnapshot.projectId,
    schemaVersion: expectedSnapshot.schemaVersion,
    capture: {
      viewportWidth: 1280,
      viewportHeight: 900,
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });

  function normalize(actual, expected) {
    if (Array.isArray(actual) && Array.isArray(expected)) {
      return actual.map((item, index) => normalize(item, expected[index] ?? {}));
    }

    if (!actual || typeof actual !== "object" || !expected || typeof expected !== "object") {
      return actual;
    }

    const normalized = {};

    for (const key of Object.keys(expected)) {
      if (key === "pageUrl") {
        normalized[key] = actual[key];
        continue;
      }

      if (key === "styles" && actual.styles && typeof actual.styles === "object") {
        const expectedStyles = expected.styles ?? {};
        const filteredStyles = {};

        for (const styleKey of Object.keys(expectedStyles)) {
          filteredStyles[styleKey] = actual.styles[styleKey];
        }

        normalized[key] = filteredStyles;
        continue;
      }

      normalized[key] = normalize(actual[key], expected[key]);
    }

    if ("capture" in actual) {
      normalized.capture = actual.capture;
    }

    return normalized;
  }

  const normalizedActual = normalize(actualSnapshot, expectedSnapshot);
  const normalizedExpected = structuredClone(expectedSnapshot);
  normalizedExpected.pageUrl = actualSnapshot.pageUrl;
  normalizedExpected.capture = actualSnapshot.capture;

  assert.deepEqual(normalizedActual, normalizedExpected);
  assert.deepEqual(actualSnapshot.capture, {
    viewportWidth: 1280,
    viewportHeight: 900,
    deviceScaleFactor: 1,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  console.log("Browser page extraction verification passed");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
