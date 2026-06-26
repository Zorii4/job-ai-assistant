export type AnalyzeJobApplicationSource = "cli" | "telegram";

export type AnalyzeJobApplicationInput = {
  resumeText: string;
  vacancyText: string;
  source: AnalyzeJobApplicationSource;
  userId?: string;
};

export type JobApplicationAgentName = "analyst" | "producer" | "critic";

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
  startedAt: string;
  finishedAt: string;
  llmMock: boolean;
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
