import type { ApplicationCaseAnalysisSummary } from '@job-ai-assistant/contracts';
import { useCallback, useEffect, useState } from 'react';

import { ApiRequestError, deleteCompletedApplicationCase, getApiBaseUrl, getApplicationCaseAnalyses, launchInitialAnalysis, updateApplicationCaseStage } from '../../api';
import { ApplicationCaseList } from './ApplicationCaseList';

export function AnalysisHistoryPage({ onOpenAnalysis }: { onOpenAnalysis: (applicationCaseId: string, runId: string) => void }) {
  const [applicationCases, setApplicationCases] = useState<ApplicationCaseAnalysisSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setApplicationCases(await getApplicationCaseAnalyses(getApiBaseUrl())); setState('ready'); } catch { setState('error'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function retryAnalysis(id: string) {
    setError(null);
    try { const run = await launchInitialAnalysis(getApiBaseUrl(), id); await load(); onOpenAnalysis(id, run.id); } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'Не удалось повторить анализ. Попробуйте ещё раз позже.'); }
  }
  async function updateStatus(id: string, status: ApplicationCaseAnalysisSummary['status']) {
    setError(null);
    try { await updateApplicationCaseStage(getApiBaseUrl(), id, status); await load(); } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'Не удалось обновить статус вакансии. Попробуйте ещё раз позже.'); }
  }
  async function deleteApplicationCase(id: string) {
    if (!window.confirm('Удалить вакансию, все результаты и материалы? Это действие нельзя отменить.')) return;
    setError(null);
    try { await deleteCompletedApplicationCase(getApiBaseUrl(), id); await load(); } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'Не удалось удалить вакансию. Попробуйте ещё раз позже.'); }
  }

  return <section className="vacancy-panel" aria-labelledby="analysis-history-title"><div className="page-heading"><p className="eyebrow">ИСТОРИЯ</p><h1 id="analysis-history-title">История анализов</h1><p>Здесь остаются все вакансии: текущие, готовые и требующие технического повтора.</p></div>{error !== null && <p className="form-message form-message--error" role="alert">{error}</p>}{state === 'loading' && <p className="library-state" role="status">Загружаем историю…</p>}{state === 'error' && <p className="form-message form-message--error" role="alert">Не удалось загрузить историю анализов.</p>}{state === 'ready' && <ApplicationCaseList applicationCases={applicationCases} scope="history" onOpenAnalysis={onOpenAnalysis} onRetryAnalysis={(id) => void retryAnalysis(id)} onUpdateStatus={(id, status) => void updateStatus(id, status)} onDelete={(id) => void deleteApplicationCase(id)} />}</section>;
}
