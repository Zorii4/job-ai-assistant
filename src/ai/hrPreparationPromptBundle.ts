export type HRPreparationPromptBundle = {
  systemPrompt: string;
  promptVersion: string;
};

type PromptModule = Record<string, unknown>;
type PromptModuleLoader = (modulePath: string) => Promise<PromptModule>;

const mockBundle: HRPreparationPromptBundle = {
  systemPrompt: 'You are hrPreparationAgent. This is a public mock prompt for deterministic local tests.',
  promptVersion: 'mock-v1',
};

const privatePromptModule = '../prompts/hrPreparation.prompt.js';

export class HRPreparationPromptConfigurationError extends Error {
  constructor() {
    super(
      'HR preparation prompt is unavailable. Restore the private src/prompts overlay or set LLM_MOCK=true for public mock mode.',
    );
    this.name = 'HRPreparationPromptConfigurationError';
  }
}

export async function loadHRPreparationPromptBundle(
  isMockMode = process.env.LLM_MOCK?.toLowerCase() === 'true',
  loadModule: PromptModuleLoader = (modulePath) => import(modulePath) as Promise<PromptModule>,
): Promise<HRPreparationPromptBundle> {
  if (isMockMode) {
    return mockBundle;
  }

  try {
    const module = await loadModule(privatePromptModule);
    const instruction = module.hrPreparationSystemPrompt;
    const promptVersion = module.hrPreparationPromptVersion;

    if (
      typeof instruction !== 'string' || instruction.trim().length === 0 ||
      typeof promptVersion !== 'string' || promptVersion.trim().length === 0
    ) {
      throw new Error('Invalid HR preparation prompt bundle.');
    }

    return { systemPrompt: instruction, promptVersion };
  } catch {
    throw new HRPreparationPromptConfigurationError();
  }
}
