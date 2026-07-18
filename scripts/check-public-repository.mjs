import { execFileSync } from "node:child_process";

const mode = process.argv.includes("--staged") ? "staged" : "all";
const pathRules = [
  /^(?:AGENTS|SPEC|PROJECT_PLAN)\.md$/i,
  /^(?:data|evaluation|private|secrets|local)\//i,
  /^src\/prompts\//i,
  /\.(?:pem|key|p12|pfx)$/i,
  /(?:^|\/)\.env(?:\.|$)/i,
];
const contentRules = [
  { name: "private key", pattern: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/ },
  { name: "OpenAI-like API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "embedded prompt template", pattern: /\b(?:system|developer)\s*(?:prompt|message)\s*[:=]/i },
];

function git(args, encoding = "utf8") {
  return execFileSync("git", args, { encoding }).trim();
}

const paths = (mode === "staged"
  ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
  : git(["ls-files"])
)
  .split(/\r?\n/)
  .filter(Boolean);

const violations = [];
for (const filePath of paths) {
  if (pathRules.some((rule) => rule.test(filePath))) {
    violations.push(`${filePath}: запрещённый путь`);
    continue;
  }

  const object = mode === "staged" ? `:${filePath}` : `HEAD:${filePath}`;
  const content = git(["show", object]);
  for (const rule of contentRules) {
    if (rule.pattern.test(content)) {
      violations.push(`${filePath}: ${rule.name}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Проверка публичной безопасности не пройдена:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Проверка публичной безопасности пройдена (${mode === "staged" ? "staged" : "tracked"} files).`);
