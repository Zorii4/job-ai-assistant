import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI from "openai";

const envPath = resolve(process.cwd(), ".env");

loadEnvFile(envPath);

const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;
const openAICompatibleBaseUrl = process.env.LLM_BASE_URL;
const isMockMode = process.env.LLM_MOCK?.toLowerCase() === "true";

export async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  if (isMockMode) {
    return createMockResponse(systemPrompt, userPrompt);
  }

  if (!apiKey || apiKey === "put-your-api-key-here") {
    throw new Error("LLM_API_KEY is missing or still set to put-your-api-key-here. Add a real key to .env or set LLM_MOCK=true.");
  }

  if (!model) {
    throw new Error("LLM_MODEL is missing. Add it to .env.");
  }

  if (!openAICompatibleBaseUrl) {
    throw new Error("LLM_BASE_URL is missing. Add an OpenAI-compatible base URL to .env.");
  }

  const client = new OpenAI({
    baseURL: openAICompatibleBaseUrl,
    apiKey
  });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2
  });

  const content = response.choices[0]?.message.content?.trim();

  if (!content) {
    throw new Error("LLM returned an empty response.");
  }

  return content;
}

function createMockResponse(systemPrompt: string, userPrompt: string): string {
  const agentName = detectAgentName(systemPrompt);
  const mode = detectMode(userPrompt);
  const inputLength = userPrompt.length;

  if (agentName === "criticAgent") {
    return createMockCriticResponse(userPrompt, inputLength);
  }

  return `
# Mock response: ${agentName}

This is a local test Markdown response generated with \`LLM_MOCK=true\`.

- Agent: \`${agentName}\`
- Mode: \`${mode ?? "default"}\`
- HTTP request: skipped
- Input length: ${inputLength} characters

## Test result

The orchestrator successfully called ${agentName}.
`.trim();
}

function createMockCriticResponse(userPrompt: string, inputLength: number): string {
  const producerVersionMatch = userPrompt.match(/Producer version:\s*producer\.v(\d)|producer\.v(\d)/i);
  const version = Number(producerVersionMatch?.[1] ?? producerVersionMatch?.[2] ?? 1);

  if (version >= 3) {
    return `
DECISION: APPROVED

SUMMARY:

Mock critic approved producer.v${version}. Input length: ${inputLength} characters.
`.trim();
  }

  return `
DECISION: NEEDS_REVISION

ISSUES:

### ISSUE

Category:
ATS

Severity:
Major

Problem:
Mock critic requests another producer iteration.

Reason:
This mock response exercises the revision flow.

Required action:
Improve the producer output before final approval.

Reference:
Mock reference.

---

SUMMARY:

Mock critic requires revision before approval.
`.trim();
}

function detectAgentName(systemPrompt: string): string {
  const directMatch = systemPrompt.match(/You are\s+(orchestratorAgent|analystAgent|producerAgent|criticAgent)/i);

  if (directMatch?.[1]) {
    return directMatch[1];
  }

  if (
    systemPrompt.includes("orchestratorAgent") ||
    systemPrompt.includes("Job Application Orchestrator")
  ) {
    return "orchestratorAgent";
  }

  if (
    systemPrompt.includes("criticAgent") ||
    systemPrompt.includes("Application Quality Critic")
  ) {
    return "criticAgent";
  }

  if (
    systemPrompt.includes("producerAgent") ||
    systemPrompt.includes("Application Producer") ||
    systemPrompt.includes("Производитель отклика")
  ) {
    return "producerAgent";
  }

  if (
    systemPrompt.includes("analystAgent") ||
    systemPrompt.includes("Application Analyst") ||
    systemPrompt.includes("Стратегический Аналитик")
  ) {
    return "analystAgent";
  }

  return "unknownAgent";
}

function detectMode(userPrompt: string): string | undefined {
  const modeMatch = userPrompt.match(/Mode:\s*(initial|final)/i);

  return modeMatch?.[1]?.toLowerCase();
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
