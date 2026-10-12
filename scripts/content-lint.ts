import { loadContent } from "../src/content/load";
import { lintContent } from "../src/content/lint";

/**
 * NOTE: npm swallows `--flag` before it reaches this script ("npm warn Unknown cli config"), so
 * strict mode is exposed as its own npm script (`content:lint-strict`), not as a runtime flag.
 * Passing it here by hand still works: `npx tsx scripts/content-lint.ts content/slice --strict`.
 */
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("-")) ?? "content/slice";
const strict = args.includes("--strict");

const content = loadContent(dir);
const issues = lintContent(content);
for (const i of issues) console.log(`${i.severity === "error" ? "ERROR" : "warn "} ${i.code.padEnd(18)} ${i.id}: ${i.message}`);

const errors = issues.filter((i) => i.severity === "error").length;
const warns = issues.filter((i) => i.severity === "warn").length;
console.log(`\n${dir}: ${content.nodes.length} nodes, ${content.edges.length} edges, ${content.knowledge_states.length} knowledge states — ${errors} errors, ${warns} warnings`);

const failed = errors > 0 || (strict && warns > 0);
if (strict && warns > 0) console.log(`\nstrict: failing on ${warns} warning(s). See content/RESEARCHER-BRIEF.md if one is a judgement call.`);
process.exit(failed ? 1 : 0);
