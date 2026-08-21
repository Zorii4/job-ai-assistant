import { PostInterviewResultSchema, type PostInterviewResult } from '@job-ai-assistant/contracts';

import { loadPostInterviewPromptBundle, type PostInterviewPromptBundle } from '../ai/postInterviewPromptBundle.js';
import { callLLMJson } from '../llm/llmClient.js';

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
    { timeoutMs: 120_000, maxOutputTokens: 2_000 },
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
