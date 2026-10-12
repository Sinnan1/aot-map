import { loadContent } from "../src/content/load";
import { lintContent } from "../src/content/lint";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("-")) ?? "content/slice";
const strict = args.includes("--strict");

const content = loadContent(dir);
const issues = lintContent(content);
for (const i of issues) console.log(`${i.severity === "error" ? "ERROR" : "warn "} ${i.code.padEnd(18)} ${i.id}: ${i.message}`);

const errors = issues.filter((i) => i.severity === "error").length;
const warns = issues.length - errors;
console.log(`\n${dir}: ${content.nodes.length} nodes, ${content.edges.length} edges, ${content.knowledge_states.length} knowledge states — ${errors} errors, ${warns} warnings`);
process.exit(errors > 0 || (strict && warns > 0) ? 1 : 0);
