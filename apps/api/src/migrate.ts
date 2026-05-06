import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const pool = getPool();
  const migrationDir = path.resolve(__dirname, "../migrations");
  const files = (await fs.readdir(migrationDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationDir, file), "utf8");
    await pool.query(sql);
  }

  await pool.end();

  console.log("Applied migrations");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

