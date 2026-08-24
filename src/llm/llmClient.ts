import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI from "openai";
import type { ReasoningEffort, ResponseFormatJSONSchema } from "openai/resources/shared";
import { z } from "zod";
import {
  classifyLlmError,
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
  model?: string;
  structuredOutput?: ResponseFormatJSONSchema;
  transientRetryMaxAttempts?: number;
  providerMaxRetries?: number;
  reasoningEffort?: ReasoningEffort;
  metrics?: LlmAttemptMetrics;
};

export type CallLLMJsonResult<T> = {
  data: T;
  raw: string;
};

export class StructuredResponseValidationError extends Error {
  readonly code = "LLM_RESPONSE_INVALID";

  constructor(
    readonly contractName: string,
    readonly issues: readonly string[]
  ) {
    super(`LLM returned an invalid ${contractName} response.`);
    this.name = "StructuredResponseValidationError";
  }
}

class LlmEmptyResponseError extends Error {
  constructor(readonly diagnostics: string) {
    super("LLM returned an empty response.");
    this.name = "LlmEmptyResponseError";
  }
}

export class LlmTruncatedResponseError extends Error {
  constructor() {
    super("LLM response was truncated before completion.");
    this.name = "LlmTruncatedResponseError";
  }
}

const jsonOnlyOutputInstruction = `
# Required output format

Return exactly one complete, valid JSON object. Do not include Markdown fences, commentary, reasoning, or any text before or after the JSON object.
`.trim();

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

  const selectedModel = options.model ?? model;

  if (!selectedModel) {
    throw new Error("LLM_MODEL is missing. Add it to .env.");
  }

  if (!openAICompatibleBaseUrl) {
    throw new Error("LLM_BASE_URL is missing. Add an OpenAI-compatible base URL to .env.");
  }

  if (options.structuredOutput) {
    assertStructuredOutputCapability(openAICompatibleBaseUrl, selectedModel);
  }

  const client = new OpenAI({
    baseURL: openAICompatibleBaseUrl,
    apiKey,
    ...(options.providerMaxRetries === undefined
      ? {}
      : { maxRetries: options.providerMaxRetries })
  });
  return retryTransientRequest(
    async () => {
      if (options.metrics) {
        options.metrics.attemptCount += 1;
      }
      const abortController = new AbortController();
      const requestStartedAt = Date.now();
      const timeout = options.timeoutMs
        ? setTimeout(() => abortController.abort(), options.timeoutMs)
        : undefined;

      try {
        const response = await client.chat.completions.create(
          {
            model: selectedModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.2,
            max_tokens: options.maxOutputTokens,
            ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
            ...(options.structuredOutput ? { response_format: options.structuredOutput } : {})
          },
          {
            signal: abortController.signal
          }
        );

        const choice = response.choices[0];
        const content = choice?.message.content?.trim();

        assertCompleteLlmResponse(choice?.finish_reason);

        if (!content) {
          const message = choice?.message as {
            reasoning?: unknown;
            reasoning_content?: unknown;
          } | undefined;
          const reasoning =
            typeof message?.reasoning_content === "string"
              ? message.reasoning_content
              : typeof message?.reasoning === "string"
                ? message.reasoning
                : "";
          const finishReason = choice?.finish_reason ?? "unknown";

          throw new LlmEmptyResponseError(
            `finish_reason=${finishReason}; content_chars=0; reasoning_chars=${reasoning.length}`
          );
        }

        logLlmAttempt('completed', selectedModel, openAICompatibleBaseUrl, requestStartedAt, response);
        return content;
      } catch (error) {
        const safeError = abortController.signal.aborted
          ? new Error(`LLM step timed out after ${options.timeoutMs}ms.`)
          : error;

        logLlmAttempt('failed', selectedModel, openAICompatibleBaseUrl, requestStartedAt, safeError);
        throw safeError;
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    },
    {
      maxAttempts: options.transientRetryMaxAttempts ?? getTransientRetryMaxAttempts(),
      delayMs: getTransientRetryDelayMs(),
      onRetry: ({ attempt, errorCode }) => {
        options.metrics?.retryErrorCodes.push(errorCode);
        console.warn(`[llm] retrying transient ${errorCode} after attempt ${attempt}`);
      }
    }
  );
}

function logLlmAttempt(
  outcome: 'completed' | 'failed',
  selectedModel: string,
  baseUrl: string,
  startedAtMs: number,
  responseOrError: unknown,
): void {
  const route = getSafeRoute(baseUrl);
  const requestId = getSafeRequestId(responseOrError);
  const diagnostics = {
    model: selectedModel,
    route,
    durationMs: Date.now() - startedAtMs,
    ...(requestId === undefined ? {} : { requestId }),
  };

  if (outcome === 'completed') {
    console.info('[llm] completed request', diagnostics);
    return;
  }

  console.warn('[llm] failed request', {
    ...diagnostics,
    errorCode: classifyLlmError(responseOrError),
  });
}

function getSafeRoute(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return 'invalid-url';
  }
}

function getSafeRequestId(value: unknown): string | undefined {
  const directRequestId = getRecordString(value, '_request_id')
    ?? getRecordString(value, 'request_id')
    ?? getRecordString(value, 'requestId');
  const response = getRecordValue(value, 'response');
  const headers = getRecordValue(response, 'headers');
  const headerRequestId = getHeaderValue(headers, 'x-request-id')
    ?? getHeaderValue(headers, 'x-request_id');
  const requestId = directRequestId ?? headerRequestId;

  return requestId !== undefined && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId)
    ? requestId
    : undefined;
}

function getHeaderValue(headers: unknown, key: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined;
  }

  return getRecordString(headers, key) ?? getRecordString(headers, key.toLowerCase());
}

function getRecordValue(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function getRecordString(value: unknown, key: string): string | undefined {
  const candidate = getRecordValue(value, key);
  return typeof candidate === 'string' ? candidate : undefined;
}

export async function callLLMJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  contractName: string,
  options: CallLLMOptions = {}
): Promise<CallLLMJsonResult<T>> {
  let raw: string;
  const structuredOutput = options.structuredOutput ?? createStructuredOutputFormat(schema, contractName);

  try {
    raw = await callLLM(
      `${systemPrompt}\n\n${jsonOnlyOutputInstruction}`,
      userPrompt,
      { ...options, structuredOutput }
    );
  } catch (error) {
    if (error instanceof LlmEmptyResponseError) {
      throw new StructuredResponseValidationError(contractName, [
        `root: provider returned empty content (${error.diagnostics})`
      ]);
    }

    throw error;
  }
  let jsonText: string;

  try {
    jsonText = extractFirstJsonObject(raw);
  } catch {
    throw new StructuredResponseValidationError(contractName, ["root: JSON object is missing or incomplete"]);
  }

  let value: unknown;

  try {
    value = JSON.parse(jsonText);
  } catch {
    throw new StructuredResponseValidationError(contractName, ["root: invalid JSON"]);
  }

  const result = schema.safeParse(value);

  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);

    throw new StructuredResponseValidationError(contractName, issues);
  }

  return {
    data: result.data,
    raw
  };
}

const aitunnelApiHost = "api.aitunnel.ru";
const defaultStructuredOutputModels = [
  "deepseek-v4-flash",
  "deepseek/deepseek-v4-flash",
  "deepseek-v4-flash-0731",
  "deepseek/deepseek-v4-flash-0731",
  "gpt-oss-20b",
  "openai/gpt-oss-20b"
];

export function createStructuredOutputFormat<T>(
  schema: z.ZodType<T>,
  contractName: string
): ResponseFormatJSONSchema {
  return {
    type: "json_schema",
    json_schema: {
      name: toSchemaName(contractName),
      strict: true,
      schema: z.toJSONSchema(schema, { target: "draft-7" })
    }
  };
}

export function assertStructuredOutputCapability(baseUrl: string, selectedModel: string): void {
  let providerUrl: URL;

  try {
    providerUrl = new URL(baseUrl);
  } catch {
    throw new Error("LLM_BASE_URL must be a valid URL for a structured-output provider.");
  }

  if (providerUrl.protocol !== "https:" || providerUrl.hostname !== aitunnelApiHost) {
    throw new Error("Configured LLM route does not support required strict Structured Outputs.");
  }

  const supportedModels = new Set(
    (process.env.LLM_STRUCTURED_OUTPUT_MODELS ?? defaultStructuredOutputModels.join(","))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  if (!supportedModels.has(selectedModel)) {
    throw new Error("Configured LLM model is not declared as supporting required strict Structured Outputs.");
  }
}

export function assertCompleteLlmResponse(finishReason: string | null | undefined): void {
  if (finishReason === "length") {
    throw new LlmTruncatedResponseError();
  }
}

function toSchemaName(contractName: string): string {
  const normalized = contractName.replace(/[^a-zA-Z0-9_-]/g, "_");

  return normalized.slice(0, 64) || "structured_response";
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

  if (agentName === "hrPreparationAgent") {
    return createMockHrPreparationResponse();
  }

  if (agentName === "postInterviewAgent") {
    return createMockPostInterviewResponse();
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

function createMockHrPreparationResponse(): string {
  return JSON.stringify({
    schemaVersion: "1",
    items: Array.from({ length: 5 }, (_, index) => ({
      question: `Как вы объясните свой релевантный опыт для этой роли ${index + 1}?`,
      answer: "Я опираюсь на подтверждённый опыт из резюме и готов спокойно пояснить, какие задачи выполнял и как этот опыт соотносится с ролью.",
    })),
  });
}

function createMockPostInterviewResponse(): string {
  return JSON.stringify({
    schemaVersion: "1",
    analysisMarkdown: "## Разбор сообщения HR\n\nВ сообщении нет прямого подтверждения следующего этапа. Уточните дальнейшие шаги у HR.",
    hrClosingMessage: "Спасибо за обратную связь. Буду признателен за информацию о дальнейших шагах.",
  });
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

  if (systemPrompt.includes("hrPreparationAgent") || systemPrompt.includes("HR Preparation Generator")) {
    return "hrPreparationAgent";
  }

  if (systemPrompt.includes("postInterviewAgent") || systemPrompt.includes("Post-interview Generator")) {
    return "postInterviewAgent";
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
