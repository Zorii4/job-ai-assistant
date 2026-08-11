import { useEffect, useState } from 'react';

import { getApiBaseUrl, getArtifacts, getInitialAnalysisResult, getInitialAnalysisStatus, resetArtifactToGeneratedContent, updateArtifact } from '../../api';
import type { AnalysisRunSummary, ArtifactSummary } from '@job-ai-assistant/contracts';
import { ArtifactMaterials, MarkdownReport } from '../resumes/AnalysisOutput';

export function AnalysisResultPage({ applicationCaseId, runId }: { applicationCaseId: string; runId: string }) {
  const [run, setRun] = useState<AnalysisRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});

  useEffect(() => {
    if (run !== null && run.status !== 'QUEUED' && run.status !== 'RUNNING') {
      return;
    }

    let active = true;
    const load = async () => {
      try {
        const nextRun = await getInitialAnalysisStatus(getApiBaseUrl(), applicationCaseId, runId);
        if (active) { setRun(nextRun); setError(null); }
      } catch { if (active) setError('Не удалось загрузить статус анализа. Повторите попытку позже.'); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 2_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [applicationCaseId, run?.status, runId]);

  useEffect(() => {
    if (run?.status !== 'SUCCEEDED') return;
    void Promise.all([getInitialAnalysisResult(getApiBaseUrl(), applicationCaseId, runId), getArtifacts(getApiBaseUrl(), applicationCaseId)])
      .then(([nextMarkdown, nextArtifacts]) => { setMarkdown(nextMarkdown); setArtifacts(nextArtifacts); setDrafts(Object.fromEntries(nextArtifacts.map((artifact) => [artifact.id, artifact.editedContent ?? artifact.generatedContent]))); })
      .catch(() => setError('Не удалось загрузить готовый результат. Повторите попытку позже.'));
  }, [applicationCaseId, run?.status, runId]);

  useEffect(() => {
    const timers = artifacts.flatMap((artifact) => {
      const draft = drafts[artifact.id];
      if (draft === undefined || draft.trim().length === 0 || draft === (artifact.editedContent ?? artifact.generatedContent)) return [];
      return [window.setTimeout(() => { setStates((current) => ({ ...current, [artifact.id]: 'saving' })); void updateArtifact(getApiBaseUrl(), applicationCaseId, artifact.id, draft.trim()).then((updated) => { setArtifacts((current) => current.map((item) => item.id === updated.id ? updated : item)); setStates((current) => ({ ...current, [artifact.id]: 'saved' })); }).catch(() => setStates((current) => ({ ...current, [artifact.id]: 'error' }))); }, 700)];
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [applicationCaseId, artifacts, drafts]);

  return <section className="vacancy-panel" aria-labelledby="analysis-result-title"><div className="page-heading"><p className="eyebrow">INITIAL ANALYSIS</p><h1 id="analysis-result-title">Результат анализа</h1><p>Материалы созданы как черновики. Проверьте отмеченные AI-предположения перед ручной отправкой.</p></div>{run === null && error === null && <p className="analysis-state" role="status">Загружаем статус анализа…</p>}{run !== null && <div className={`analysis-state analysis-state--${run.status.toLowerCase()}`} role="status"><p><strong>Статус анализа:</strong> {getRunLabel(run)}</p>{run.status === 'FAILED' && <p>Анализ не завершился. Данные вакансии сохранены в черновике.</p>}</div>}{error !== null && <p className="form-message form-message--error" role="alert">{error}</p>}{artifacts.length > 0 && <ArtifactMaterials artifacts={artifacts} drafts={drafts} states={states} onDraftChange={(artifactId, value) => setDrafts((current) => ({ ...current, [artifactId]: value }))} onReset={(artifact) => { if (!window.confirm('Вернуть AI-версию? Ваша ручная редакция будет удалена.')) return; setStates((current) => ({ ...current, [artifact.id]: 'saving' })); void resetArtifactToGeneratedContent(getApiBaseUrl(), applicationCaseId, artifact.id).then((updated) => { setArtifacts((current) => current.map((item) => item.id === updated.id ? updated : item)); setDrafts((current) => ({ ...current, [artifact.id]: updated.generatedContent })); setStates((current) => ({ ...current, [artifact.id]: 'saved' })); }).catch(() => setStates((current) => ({ ...current, [artifact.id]: 'error' }))); }} />}{markdown !== null && <MarkdownReport markdown={markdown} />}</section>;
}

function getRunLabel(run: AnalysisRunSummary): string {
  if (run.status === 'QUEUED') return 'в очереди';
  if (run.status === 'RUNNING') return run.currentStage === null ? 'выполняется' : `этап: ${run.currentStage}`;
  if (run.status === 'SUCCEEDED') return 'готов';
  return 'завершился с ошибкой';
}
