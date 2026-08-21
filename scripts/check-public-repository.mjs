import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const publicClassifications = new Set(["PUBLIC", "PUBLIC_AFTER_REVIEW"]);
const privateClassifications = new Set(["PRIVATE", "SECRET", "GENERATED"]);
const contentRules = [
  { name: "private key", pattern: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/ },
  { name: "OpenAI-like API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  {
    name: "exported prompt template",
    pattern: /\b(?:export\s+)?(?:const|let|var)\s+\w*(?:system|developer)Prompt\w*\s*=/i,
  },
];

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  return new RegExp(
    `^${escaped.replaceAll("**", "\u0000").replaceAll("*", "[^/]*").replaceAll("\u0000", ".*")}$`
  );
}

export function loadPolicy(policyPath = "public-file-policy.json") {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.rules)) {
    throw new Error("Public file policy must use schemaVersion 1 and contain rules.");
  }

  return policy.rules.map((rule) => {
    if (
      typeof rule.pattern !== "string" ||
      typeof rule.classification !== "string" ||
      (!publicClassifications.has(rule.classification) && !privateClassifications.has(rule.classification))
    ) {
      throw new Error("Public file policy contains an invalid rule.");
    }

    return { ...rule, expression: globToRegExp(rule.pattern) };
  });
}

export function classifyPath(filePath, rules) {
  return rules.find((rule) => rule.expression.test(filePath))?.classification ?? "UNCLASSIFIED";
}

export function findContentViolation(content) {
  return contentRules.find((rule) => rule.pattern.test(content))?.name;
}

function git(args, encoding = "utf8") {
  return execFileSync("git", args, { encoding }).trim();
}

export function checkFiles({ mode, paths, readContent, rules }) {
  const violations = [];
  for (const filePath of paths) {
    const classification = classifyPath(filePath, rules);
    if (classification === "UNCLASSIFIED") {
      violations.push(`${filePath}: отсутствует классификация public-file-policy.json`);
      continue;
    }
    if (!publicClassifications.has(classification)) {
      violations.push(`${filePath}: запрещённая для Git классификация ${classification}`);
      continue;
    }

    const contentViolation = findContentViolation(readContent(filePath));
    if (contentViolation) violations.push(`${filePath}: ${contentViolation}`);
  }
  return violations;
}

function main() {
  const mode = process.argv.includes("--staged") ? "staged" : "all";
  const paths = (mode === "staged"
    ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    : git(["ls-files"])
  )
    .split(/\r?\n/)
    .filter(Boolean);
  const rules = loadPolicy();
  const violations = checkFiles({
    mode,
    paths,
    rules,
    readContent: (filePath) => {
      if (mode === "staged") return git(["show", `:${filePath}`]);

      try {
        return git(["show", `HEAD:${filePath}`]);
      } catch {
        // A newly staged file is tracked by the index but has no HEAD object yet.
        return readFileSync(filePath, "utf8");
      }
    },
  });

  if (violations.length > 0) {
    console.error("Проверка публичной безопасности не пройдена:");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exit(1);
  }

  console.log(
    `Проверка публичной безопасности пройдена (${mode === "staged" ? "staged" : "tracked"} files).`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
