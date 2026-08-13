import { useEffect, useState } from 'react';
import { getApiBaseUrl, getArtifacts, getInitialAnalysisResult, getInitialAnalysisStatus } from '../../api';
import type { AnalysisRunSummary, ArtifactSummary, InitialAnalysisResult } from '@job-ai-assistant/contracts';
import { ArtifactMaterials } from '../resumes/AnalysisOutput';
import { getAnalysisRunStatusLabel, getAnalysisStageLabel } from './analysisStatus';
import { FullReportEditor } from './FullReportEditor';

export function AnalysisResultPage({ applicationCaseId, runId }: { applicationCaseId: string; runId: string }) {
  const [run, setRun] = useState<AnalysisRunSummary | null>(null); const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InitialAnalysisResult | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  useEffect(() => { let active = true; const load = async () => { try { const value = await getInitialAnalysisStatus(getApiBaseUrl(), applicationCaseId, runId); if (active) { setRun(value); setError(null); } } catch { if (active) setError('Не удалось загрузить статус анализа.'); } }; void load(); const timer = window.setInterval(() => void load(), 2_000); return () => { active = false; window.clearInterval(timer); }; }, [applicationCaseId, runId]);
  useEffect(() => { if (run?.status !== 'SUCCEEDED') return; void Promise.all([getInitialAnalysisResult(getApiBaseUrl(), applicationCaseId, runId), getArtifacts(getApiBaseUrl(), applicationCaseId)]).then(([nextResult, nextArtifacts]) => { setResult(nextResult); setArtifacts(nextArtifacts); }).catch(() => setError('Не удалось загрузить готовый результат.')); }, [applicationCaseId, run?.status, runId]);
  return <section className="vacancy-panel" aria-labelledby="analysis-result-title"><div className="page-heading"><p className="eyebrow">INITIAL ANALYSIS</p><h1 id="analysis-result-title">Результат анализа</h1><p>Материалы созданы как черновики. Проверьте их перед ручной отправкой.</p></div>{error && <p className="form-message form-message--error" role="alert">{error}</p>}{run && <div className={`analysis-state analysis-state--${run.status.toLowerCase()}`} role="status"><p>Статус анализа: {getAnalysisRunStatusLabel(run.status)}</p>{run.currentStage !== null && <p>Текущий этап: {getAnalysisStageLabel(run.currentStage)}</p>}</div>}{result && <FullReportEditor markdown={result.finalMarkdown} />}{artifacts.length > 0 && <ArtifactMaterials artifacts={artifacts} />}</section>;
}
