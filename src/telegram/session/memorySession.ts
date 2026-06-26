export type AnalyzeSessionStep = "waiting_resume" | "waiting_vacancy";

export type AnalyzeSession = {
  chatId: number;
  step: AnalyzeSessionStep;
  resumeText?: string;
};

const sessions = new Map<number, AnalyzeSession>();

export function startAnalyzeSession(chatId: number): AnalyzeSession {
  const session: AnalyzeSession = {
    chatId,
    step: "waiting_resume"
  };

  sessions.set(chatId, session);

  return session;
}

export function getAnalyzeSession(chatId: number): AnalyzeSession | undefined {
  return sessions.get(chatId);
}

export function saveResumeText(chatId: number, resumeText: string): AnalyzeSession {
  const session = getRequiredSession(chatId);
  const updatedSession: AnalyzeSession = {
    ...session,
    step: "waiting_vacancy",
    resumeText
  };

  sessions.set(chatId, updatedSession);

  return updatedSession;
}

export function clearAnalyzeSession(chatId: number): void {
  sessions.delete(chatId);
}

function getRequiredSession(chatId: number): AnalyzeSession {
  const session = sessions.get(chatId);

  if (!session) {
    throw new Error(`No active analyze session for chat ${chatId}.`);
  }

  return session;
}
