import { HRPreparationResultSchema, type HRPreparationResult } from '@job-ai-assistant/contracts';

import { loadHRPreparationPromptBundle, type HRPreparationPromptBundle } from '../ai/hrPreparationPromptBundle.js';
import { callLLMJson } from '../llm/llmClient.js';

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
    { timeoutMs: 120_000, maxOutputTokens: 3_000 },
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
