export type InitialWorkflowPromptBundle = {
  analyst: string;
  producer: string;
  critic: string;
  orchestrator: string;
};

type PromptModule = Record<string, unknown>;

type PromptBundleLoader = (modulePath: string) => Promise<PromptModule>;

const mockInitialWorkflowPromptBundle: InitialWorkflowPromptBundle = {
  analyst: "You are analystAgent. This is a public mock prompt for deterministic local tests.",
  producer: "You are producerAgent. This is a public mock prompt for deterministic local tests.",
  critic: "You are criticAgent. This is a public mock prompt for deterministic local tests.",
  orchestrator: "You are orchestratorAgent. This is a public mock prompt for deterministic local tests."
};

const privatePromptModules = {
  analyst: {
    modulePath: "../prompts/analyst.prompt.js",
    exportName: "analystSystemPrompt"
  },
  producer: {
    modulePath: "../prompts/producer.prompt.js",
    exportName: "producerSystemPrompt"
  },
  critic: {
    modulePath: "../prompts/critic.prompt.js",
    exportName: "criticSystemPrompt"
  },
  orchestrator: {
    modulePath: "../prompts/orchestrator.prompt.js",
    exportName: "orchestratorSystemPrompt"
  }
} as const;

export class PromptBundleConfigurationError extends Error {
  constructor() {
    super(
      "Production prompt bundle is unavailable. Restore the private src/prompts overlay or set LLM_MOCK=true for public mock mode."
    );
    this.name = "PromptBundleConfigurationError";
  }
}

export async function loadInitialWorkflowPromptBundle(
  isMockMode = process.env.LLM_MOCK?.toLowerCase() === "true",
  loadModule: PromptBundleLoader = (modulePath) => import(modulePath) as Promise<PromptModule>
): Promise<InitialWorkflowPromptBundle> {
  if (isMockMode) {
    return mockInitialWorkflowPromptBundle;
  }

  try {
    const [analyst, producer, critic, orchestrator] = await Promise.all([
      loadPrompt(privatePromptModules.analyst, loadModule),
      loadPrompt(privatePromptModules.producer, loadModule),
      loadPrompt(privatePromptModules.critic, loadModule),
      loadPrompt(privatePromptModules.orchestrator, loadModule)
    ]);

    return { analyst, producer, critic, orchestrator };
  } catch {
    throw new PromptBundleConfigurationError();
  }
}

async function loadPrompt(
  descriptor: { modulePath: string; exportName: string },
  loadModule: PromptBundleLoader
): Promise<string> {
  const module = await loadModule(descriptor.modulePath);
  const value = module[descriptor.exportName];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PromptBundleConfigurationError();
  }

  return value;
}
