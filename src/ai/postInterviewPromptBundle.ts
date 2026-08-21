export type PostInterviewPromptBundle = {
  systemPrompt: string;
  promptVersion: string;
};

type PromptModule = Record<string, unknown>;
type PromptModuleLoader = (modulePath: string) => Promise<PromptModule>;

const mockBundle: PostInterviewPromptBundle = {
  systemPrompt: 'You are postInterviewAgent. This is a public mock prompt for deterministic local tests.',
  promptVersion: 'mock-v1',
};

const privatePromptModule = '../prompts/postInterview.prompt.js';

export class PostInterviewPromptConfigurationError extends Error {
  constructor() {
    super(
      'Post-interview prompt is unavailable. Restore the private src/prompts overlay or set LLM_MOCK=true for public mock mode.',
    );
    this.name = 'PostInterviewPromptConfigurationError';
  }
}

export async function loadPostInterviewPromptBundle(
  isMockMode = process.env.LLM_MOCK?.toLowerCase() === 'true',
  loadModule: PromptModuleLoader = (modulePath) => import(modulePath) as Promise<PromptModule>,
): Promise<PostInterviewPromptBundle> {
  if (isMockMode) {
    return mockBundle;
  }

  try {
    const module = await loadModule(privatePromptModule);
    const instruction = module.postInterviewSystemPrompt;
    const promptVersion = module.postInterviewPromptVersion;

    if (
      typeof instruction !== 'string' || instruction.trim().length === 0 ||
      typeof promptVersion !== 'string' || promptVersion.trim().length === 0
    ) {
      throw new Error('Invalid post-interview prompt bundle.');
    }

    return { systemPrompt: instruction, promptVersion };
  } catch {
    throw new PostInterviewPromptConfigurationError();
  }
}
