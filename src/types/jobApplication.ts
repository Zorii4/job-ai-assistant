export type AnalyzeJobApplicationSource = "cli" | "telegram";

export type AnalyzeJobApplicationInput = {
  resumeText: string;
  vacancyText: string;
  source: AnalyzeJobApplicationSource;
  userId?: string;
  inputMeta?: JobApplicationInputMeta;
  onProgress?: (event: AnalyzeJobApplicationProgressEvent) => Promise<void> | void;
};

export type AnalyzeJobApplicationProgressStage = "analyst" | "producer" | "critic" | "final";

export type AnalyzeJobApplicationProgressEvent = {
  stage: AnalyzeJobApplicationProgressStage;
  stepName: JobApplicationAgentName;
};

export type JobApplicationInputSourceType = "text" | "file";

export type JobApplicationInputExtension = ".pdf" | ".md" | ".txt";

export type JobApplicationInputPartMeta = {
  sourceType: JobApplicationInputSourceType;
  fileName?: string;
  extension?: JobApplicationInputExtension;
  mimeType?: string;
  sizeBytes?: number;
};

export type JobApplicationInputMeta = {
  resume?: JobApplicationInputPartMeta;
  vacancy?: JobApplicationInputPartMeta;
};

export type CriticDecision = "APPROVED" | "NEEDS_REVISION" | "UNKNOWN";

export type JobApplicationAgentName =
  | "analyst"
  | "producer.v1"
  | "critic.v1"
  | "producer.v2"
  | "critic.v2"
  | "producer.v3"
  | "critic.v3"
  | "orchestrator.final";

export type JobApplicationStep = {
  agentName: JobApplicationAgentName;
  output: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  inputChars: number;
  outputChars: number;
};

export type AnalyzeJobApplicationMeta = {
  runId: string;
  source: AnalyzeJobApplicationSource;
  userId?: string;
  model?: string;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  llmMock: boolean;
  revisionCyclesUsed: number;
  finalDecision: CriticDecision;
  input?: JobApplicationInputMeta;
  analysisMode?: "fast" | "deep";
  maxRevisionCycles?: number;
  error?: {
    message: string;
    stepName?: JobApplicationAgentName;
    occurredAt: string;
  };
};

export type AnalyzeJobApplicationResult = {
  finalMarkdown: string;
  steps: JobApplicationStep[];
  meta: AnalyzeJobApplicationMeta;
};

export type JobApplicationDocuments = {
  resumeText: string;
  vacancyText: string;
};

export type AgentExecutionResult<TOutput = string> = {
  output: TOutput;
  outputText: string;
  inputChars: number;
  outputChars: number;
};

export type AgentExecutionOptions = {
  maxOutputTokens: number;
  timeoutMs: number;
};
