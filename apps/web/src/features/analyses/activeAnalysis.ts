const activeAnalysisStorageKey = 'job-ai-assistant.active-analysis';

export type ActiveAnalysis = {
  applicationCaseId: string;
  runId: string;
};

type StoredActiveAnalysis = ActiveAnalysis & {
  userId: string;
};

export function readActiveAnalysis(userId: string): ActiveAnalysis | null {
  try {
    const rawValue = window.localStorage.getItem(activeAnalysisStorageKey);

    if (rawValue === null) return null;

    const value: unknown = JSON.parse(rawValue);
    if (!isStoredActiveAnalysis(value) || value.userId !== userId) return null;

    return { applicationCaseId: value.applicationCaseId, runId: value.runId };
  } catch {
    return null;
  }
}

export function saveActiveAnalysis(userId: string, activeAnalysis: ActiveAnalysis): void {
  try {
    window.localStorage.setItem(activeAnalysisStorageKey, JSON.stringify({ userId, ...activeAnalysis }));
  } catch {
    // Privacy settings can block browser storage; the current page remains usable.
  }
}

export function clearActiveAnalysis(): void {
  try {
    window.localStorage.removeItem(activeAnalysisStorageKey);
  } catch {
    // Privacy settings can block browser storage; there is no in-memory data to clean up.
  }
}

function isStoredActiveAnalysis(value: unknown): value is StoredActiveAnalysis {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return typeof candidate.userId === 'string'
    && typeof candidate.applicationCaseId === 'string'
    && typeof candidate.runId === 'string'
    && candidate.userId.length > 0
    && candidate.applicationCaseId.length > 0
    && candidate.runId.length > 0;
}
