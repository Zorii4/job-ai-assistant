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

function detectAgentName(systemPrompt: string): string {
  const directMatch = systemPrompt.match(/You are\s+(orchestratorAgent|analystAgent|producerAgent|criticAgent)/i);

  if (directMatch?.[1]) {
    return directMatch[1];
  }

  if (systemPrompt.includes("orchestratorAgent")) {
    return "orchestratorAgent";
  }

  if (systemPrompt.includes("criticAgent")) {
    return "criticAgent";
  }

  if (systemPrompt.includes("producerAgent")) {
    return "producerAgent";
  }

  if (systemPrompt.includes("analystAgent")) {
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
