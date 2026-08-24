import { PostInterviewResultSchema, type PostInterviewResult } from '@job-ai-assistant/contracts';

import { loadPostInterviewPromptBundle, type PostInterviewPromptBundle } from '../ai/postInterviewPromptBundle.js';
import { callLLMJson, type CallLLMOptions } from '../llm/llmClient.js';

export type AnalyzePostInterviewInput = {
  sanitizedHrMessage: string;
  vacancyTextSnapshot: string;
  initialAnalysisFinalMarkdown: string;
};

export type AnalyzePostInterviewResult = {
  result: PostInterviewResult;
  promptVersion: string;
};

type PostInterviewLlmCall = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<{ data: PostInterviewResult }>;

const DEFAULT_POST_INTERVIEW_MAX_OUTPUT_TOKENS = 5_000;
const DEFAULT_POST_INTERVIEW_MODEL = 'deepseek-v4-flash-0731';

export function resolvePostInterviewMaxOutputTokens(value: string | undefined): number {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_POST_INTERVIEW_MAX_OUTPUT_TOKENS;
}

export function resolvePostInterviewModel(value: string | undefined): string {
  return value?.trim() || DEFAULT_POST_INTERVIEW_MODEL;
}

export function createPostInterviewLlmOptions(
  maxOutputTokensValue: string | undefined,
  modelValue: string | undefined,
): CallLLMOptions {
  return {
    timeoutMs: 600_000,
    maxOutputTokens: resolvePostInterviewMaxOutputTokens(maxOutputTokensValue),
    transientRetryMaxAttempts: 1,
    providerMaxRetries: 0,
    reasoningEffort: 'low',
    model: resolvePostInterviewModel(modelValue),
  };
}

export function createAnalyzePostInterview(dependencies: {
  loadPromptBundle?: () => Promise<PostInterviewPromptBundle>;
  call?: PostInterviewLlmCall;
} = {}) {
  const loadPromptBundle = dependencies.loadPromptBundle ?? loadPostInterviewPromptBundle;
  const call = dependencies.call ?? ((systemPrompt, userPrompt) => callLLMJson(
    systemPrompt,
    userPrompt,
    PostInterviewResultSchema,
    'post_interview_result',
    createPostInterviewLlmOptions(
      process.env.LLM_MAX_OUTPUT_TOKENS_POST_INTERVIEW,
      process.env.LLM_POST_INTERVIEW_MODEL,
    ),
  ));

  return async (input: AnalyzePostInterviewInput): Promise<AnalyzePostInterviewResult> => {
    const promptBundle = await loadPromptBundle();
    const response = await call(
      promptBundle.systemPrompt,
      JSON.stringify({
        schemaVersion: '1',
        sanitizedHrMessage: input.sanitizedHrMessage,
        vacancyTextSnapshot: input.vacancyTextSnapshot,
        initialAnalysisFinalMarkdown: input.initialAnalysisFinalMarkdown,
      }),
    );

    return {
      result: PostInterviewResultSchema.parse(response.data),
      promptVersion: promptBundle.promptVersion,
    };
  };
}
