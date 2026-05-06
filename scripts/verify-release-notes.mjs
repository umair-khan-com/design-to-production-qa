import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = __filename.slice(0, __filename.lastIndexOf("\\"));
const rootDir = __dirname.replace(/\\scripts$/, "");

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  throw new Error("DATABASE_URL and JWT_SECRET are required");
}

const { buildApp } = await import(pathToFileURL(`${rootDir}\\apps\\api\\src\\app.ts`).href);
const app = await buildApp();

try {
  const releases = await app.inject({
    method: "GET",
    url: "/v1/releases",
  });

  assert.equal(releases.statusCode, 200);
  const releasesBody = releases.json();
  assert.equal(releasesBody.ok, true);
  assert.ok(Array.isArray(releasesBody.releases));
  assert.ok(releasesBody.releases.length >= 1);

  const latest = await app.inject({
    method: "GET",
    url: "/v1/releases/latest",
  });

  assert.equal(latest.statusCode, 200);
  const latestBody = latest.json();
  assert.equal(latestBody.ok, true);
  assert.ok(latestBody.release.version);

  console.log("Release notes verification passed");
} finally {
  await app.close();
}
