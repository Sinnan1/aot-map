import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadContent } from "../src/content/load";
import { hasErrors, lintContent } from "../src/content/lint";
import * as schema from "../src/db/schema";
import { seedContent } from "../src/db/seed";

const dir = process.argv[2] ?? "content/slice";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL (see .env.example)");

const content = loadContent(dir);
const issues = lintContent(content);
issues.forEach((i) => console.log(`${i.severity} ${i.code} ${i.id}: ${i.message}`));
if (hasErrors(issues)) {
  console.error("Refusing to seed: lint errors.");
  process.exit(1);
}

const client = postgres(url, { max: 1 });
await seedContent(drizzle(client, { schema }), content);
await client.end();
console.log(`seeded ${content.nodes.length} nodes from ${dir}`);
