import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const pluginDir = path.join(rootDir, "plugins", "figma");
const entryPoint = path.join(pluginDir, "code.ts");
const outFile = path.join(pluginDir, "code.js");
const uiHtml = fs.readFileSync(path.join(pluginDir, "ui.html"), "utf8");

await esbuild.build({
  entryPoints: [entryPoint],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  outfile: outFile,
  define: {
    __html__: JSON.stringify(uiHtml),
  },
  logLevel: "info",
});

console.log(`Built ${path.relative(rootDir, outFile)}`);
