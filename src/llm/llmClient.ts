import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI from "openai";
import type { z } from "zod";
import {
  retryTransientRequest,
  type LlmAttemptMetrics
} from "./retryTransientRequest.js";

const envPath = resolve(process.cwd(), ".env");

loadEnvFile(envPath);

const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;
const openAICompatibleBaseUrl = process.env.LLM_BASE_URL;
const isMockMode = process.env.LLM_MOCK?.toLowerCase() === "true";

export type CallLLMOptions = {
  maxOutputTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
  metrics?: LlmAttemptMetrics;
};

export type CallLLMJsonResult<T> = {
  data: T;
  raw: string;
};

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options: CallLLMOptions = {}
): Promise<string> {
  if (isMockMode) {
    if (options.metrics) {
      options.metrics.attemptCount += 1;
    }
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
  return retryTransientRequest(
    async () => {
      if (options.metrics) {
        options.metrics.attemptCount += 1;
      }
      const abortController = new AbortController();
      const timeout = options.timeoutMs
        ? setTimeout(() => abortController.abort(), options.timeoutMs)
        : undefined;

      try {
        const response = await client.chat.completions.create(
          {
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.2,
            max_tokens: options.maxOutputTokens,
            ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {})
          },
          {
            signal: abortController.signal
          }
        );

        const content = response.choices[0]?.message.content?.trim();

        if (!content) {
          throw new Error("LLM returned an empty response.");
        }

        return content;
      } catch (error) {
        if (abortController.signal.aborted) {
          throw new Error(`LLM step timed out after ${options.timeoutMs}ms.`);
        }

        throw error;
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    },
    {
      maxAttempts: getTransientRetryMaxAttempts(),
      delayMs: getTransientRetryDelayMs(),
      onRetry: ({ attempt, errorCode }) => {
        options.metrics?.retryErrorCodes.push(errorCode);
        console.warn(`[llm] retrying transient ${errorCode} after attempt ${attempt}`);
      }
    }
  );
}

export async function callLLMJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  contractName: string,
  options: CallLLMOptions = {}
): Promise<CallLLMJsonResult<T>> {
  const raw = await callLLM(systemPrompt, userPrompt, options);
  const jsonText = extractFirstJsonObject(raw);

  let value: unknown;

  try {
    value = JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`LLM returned invalid JSON for ${contractName}: ${message}`);
  }

  const result = schema.safeParse(value);

  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");

    throw new Error(`LLM returned an invalid ${contractName} contract: ${issues}`);
  }

  return {
    data: result.data,
    raw
  };
}

function extractFirstJsonObject(raw: string): string {
  const text = raw.trim();

  if (text.startsWith("{") && text.endsWith("}")) {
    return text;
  }

  const startIndex = text.indexOf("{");

  if (startIndex === -1) {
    throw new Error("LLM response does not contain a JSON object.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error("LLM response contains an incomplete JSON object.");
}

function createMockResponse(systemPrompt: string, userPrompt: string): string {
  const agentName = detectAgentName(systemPrompt);
  const mode = detectMode(userPrompt);
  const inputLength = userPrompt.length;

  if (agentName === "analystAgent") {
    return createMockAnalystResponse(inputLength);
  }

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

function createMockAnalystResponse(inputLength: number): string {
  return JSON.stringify({
    schemaVersion: 1,
    recommendation: "LIKELY_APPLY",
    priority: "MEDIUM",
    verdict: `Mock analyst completed the analysis for ${inputLength} input characters.`,
    limitations: ["Mock mode does not analyze real content."],
    scores: {
      atsMatch: { score: 7, reason: "Mock score." },
      vacancyMatch: { score: 7, reason: "Mock score." },
      recruiterAppeal: { score: 7, reason: "Mock score." },
      interviewProbability: { score: 6, reason: "Mock score." },
      offerPotential: { score: 6, reason: "Mock score." }
    },
    companyNeeds: ["Mock company need."],
    companyAnalysis: ["Mock company analysis."],
    gaps: [
      {
        requirement: "Mock requirement.",
        status: "PARTIAL",
        evidence: "Mock evidence.",
        impact: "Mock impact."
      }
    ],
    strengths: ["Mock candidate strength."],
    risks: ["Mock candidate risk."],
    keyRecommendations: ["Mock key recommendation."],
    additionalImprovements: ["Mock additional improvement."],
    producerBrief: {
      positioning: "Mock positioning.",
      mustEmphasize: ["Mock emphasis."],
      vacancyKeywords: ["mock keyword"],
      prohibitedClaims: ["Do not add unverified facts."]
    },
    criticChecklist: ["Check mock materials against the contract."]
  });
}

function createMockCriticResponse(userPrompt: string, inputLength: number): string {
  const producerVersionMatch = userPrompt.match(/Producer version:\s*producer\.v(\d)|producer\.v(\d)/i);
  const version = Number(producerVersionMatch?.[1] ?? producerVersionMatch?.[2] ?? 1);

  if (version >= 3) {
    return JSON.stringify({
      schemaVersion: 3,
      decision: "APPROVED",
      reviewStatus: "GOOD",
      issues: [],
      claimAudit: [
        {
          claim: "Mock producer output is a generated test artifact.",
          material: "Analysis",
          classification: "DIRECT",
          severity: "INFO",
          evidence: [{ source: "resume", quote: "Mock resume input." }],
          reason: "Mock mode provides deterministic test data only.",
          requiredAction: ""
        }
      ],
      summary: `Mock critic approved producer.v${version}. Input length: ${inputLength} characters.`
    });
  }

  return JSON.stringify({
    schemaVersion: 3,
    decision: "NEEDS_REVISION",
    reviewStatus: "REJECTED",
    issues: [
      {
        category: "ATS",
        severity: "CRITICAL",
        problem: "Mock critic requests another producer iteration.",
        reason: "This mock response exercises the revision flow.",
        requiredAction: "Improve the producer output before final approval.",
        reference: "Mock reference."
      }
    ],
    claimAudit: [
      {
        claim: "Mock producer output needs another iteration.",
        material: "CoverLetter",
        classification: "UNSUPPORTED",
        severity: "CRITICAL",
        evidence: [],
        reason: "This mock response exercises the revision flow.",
        requiredAction: "Revise the mock producer output."
      }
    ],
    summary: "Mock critic requires revision before approval."
  });
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

function getTransientRetryMaxAttempts(): number {
  return parsePositiveInteger(process.env.LLM_TRANSIENT_RETRY_MAX_ATTEMPTS, 2, 2);
}

function getTransientRetryDelayMs(): number {
  return parsePositiveInteger(process.env.LLM_TRANSIENT_RETRY_DELAY_MS, 250);
}

function parsePositiveInteger(value: string | undefined, fallback: number, maximum?: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return maximum ? Math.min(parsed, maximum) : parsed;
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
