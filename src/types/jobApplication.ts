export type AnalyzeJobApplicationSource = "cli" | "telegram";

export type AnalyzeJobApplicationInput = {
  resumeText: string;
  vacancyText: string;
  source: AnalyzeJobApplicationSource;
  userId?: string;
};

export type CriticDecision = "APPROVED" | "NEEDS_REVISION" | "REVISION_REQUIRED" | "REJECTED" | "UNKNOWN";

export type JobApplicationAgentName =
  | "orchestrator.initial"
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
  warning?: string;
};

export type AnalyzeJobApplicationResult = {
  finalMarkdown: string;
  steps: JobApplicationStep[];
  meta: AnalyzeJobApplicationMeta;
};

export type JobApplicationDocuments = {
  resumeText: string;
  vacancyText: string;
  initialOrchestratorOutput: string;
};
