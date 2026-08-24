import { HRPreparationResultSchema, type HRPreparationResult } from '@job-ai-assistant/contracts';

import { loadHRPreparationPromptBundle, type HRPreparationPromptBundle } from '../ai/hrPreparationPromptBundle.js';
import { callLLMJson, type CallLLMOptions } from '../llm/llmClient.js';

export type PrepareForHrScreeningInput = {
  resumeSanitizedSnapshot: string;
  vacancyTextSnapshot: string;
  initialAnalysisFinalMarkdown: string;
};

export type PrepareForHrScreeningResult = {
  result: HRPreparationResult;
  promptVersion: string;
};

type HRPreparationLlmCall = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<{ data: HRPreparationResult }>;

const DEFAULT_HR_PREPARATION_MAX_OUTPUT_TOKENS = 5_000;

export function resolveHRPreparationMaxOutputTokens(value: string | undefined): number {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_HR_PREPARATION_MAX_OUTPUT_TOKENS;
}

export function createHRPreparationLlmOptions(
  maxOutputTokensValue: string | undefined,
): CallLLMOptions {
  return {
    timeoutMs: 120_000,
    maxOutputTokens: resolveHRPreparationMaxOutputTokens(maxOutputTokensValue),
    transientRetryMaxAttempts: 1,
    providerMaxRetries: 0,
  };
}

export function createPrepareForHrScreening(dependencies: {
  loadPromptBundle?: () => Promise<HRPreparationPromptBundle>;
  call?: HRPreparationLlmCall;
} = {}) {
  const loadPromptBundle = dependencies.loadPromptBundle ?? loadHRPreparationPromptBundle;
  const call = dependencies.call ?? ((systemPrompt, userPrompt) => callLLMJson(
    systemPrompt,
    userPrompt,
    HRPreparationResultSchema,
    'hr_preparation_result',
    createHRPreparationLlmOptions(process.env.LLM_MAX_OUTPUT_TOKENS_HR_PREPARATION),
  ));

  return async (input: PrepareForHrScreeningInput): Promise<PrepareForHrScreeningResult> => {
    const promptBundle = await loadPromptBundle();
    const response = await call(
      promptBundle.systemPrompt,
      JSON.stringify({
        schemaVersion: '1',
        resumeSanitizedSnapshot: input.resumeSanitizedSnapshot,
        vacancyTextSnapshot: input.vacancyTextSnapshot,
        initialAnalysisFinalMarkdown: input.initialAnalysisFinalMarkdown,
      }),
    );

    return {
      result: HRPreparationResultSchema.parse(response.data),
      promptVersion: promptBundle.promptVersion,
    };
  };
}
