import { ManualRetryLimit, type AnalysisRunSummary, type ApplicationCaseAnalysisSummary, type ArtifactSummary, type InitialAnalysisResult } from '@job-ai-assistant/contracts';
import { useEffect, useState } from 'react';

import {
  ApiRequestError,
  getApiBaseUrl,
  getApplicationCaseAnalyses,
  getArtifacts,
  getInitialAnalysisResult,
  getInitialAnalysisStatus,
  launchHrPreparation,
  launchInitialAnalysis,
} from '../../api';
import { ArtifactMaterials, WorkflowArtifact } from '../resumes/AnalysisOutput';
import { FullReportEditor } from './FullReportEditor';
import { getAnalysisErrorLabel, getAnalysisRunStatusLabel, getAnalysisStageLabel } from './analysisStatus';
import { PostInterviewPanel } from './PostInterviewPanel';

const initialArtifactTypes = new Set<ArtifactSummary['type']>([
  'RESUME_RECOMMENDATIONS',
  'COVER_LETTER',
  'RECRUITER_MESSAGE',
  'FOLLOW_UP',
]);

export function AnalysisResultPage({ applicationCaseId, runId, onBackToHistory }: {
  applicationCaseId: string;
  runId: string;
  onBackToHistory: () => void;
}) {
  const [run, setRun] = useState<AnalysisRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InitialAnalysisResult | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [applicationCase, setApplicationCase] = useState<ApplicationCaseAnalysisSummary | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isLaunchingHr, setIsLaunchingHr] = useState(false);
  const [postInterviewUnlocked, setPostInterviewUnlocked] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const value = await getInitialAnalysisStatus(getApiBaseUrl(), applicationCaseId, runId);
        if (active) {
          setRun(value);
          setError(null);
        }
      } catch {
        if (active) setError('Не удалось загрузить статус анализа.');
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [applicationCaseId, runId]);

  useEffect(() => {
    if (run?.status !== 'SUCCEEDED') return;
    void Promise.all([
      getInitialAnalysisResult(getApiBaseUrl(), applicationCaseId, runId),
      getArtifacts(getApiBaseUrl(), applicationCaseId),
    ]).then(([nextResult, nextArtifacts]) => {
      setResult(nextResult);
      setArtifacts(nextArtifacts);
    }).catch(() => setError('Не удалось загрузить готовый результат.'));
  }, [applicationCaseId, run?.status, runId]);

  const refreshApplicationCase = async () => {
    const cases = await getApplicationCaseAnalyses(getApiBaseUrl());
    const value = cases.find((item) => item.id === applicationCaseId) ?? null;
    setApplicationCase(value);
    if (value?.hrPreparationRun?.status === 'SUCCEEDED' || value?.postInterviewRun?.status === 'SUCCEEDED') {
      setArtifacts(await getArtifacts(getApiBaseUrl(), applicationCaseId));
    }
  };

  useEffect(() => {
    void refreshApplicationCase().catch(() => setError('Не удалось загрузить статус вакансии.'));
    const timer = window.setInterval(() => void refreshApplicationCase().catch(() => undefined), 2_000);
    return () => window.clearInterval(timer);
  }, [applicationCaseId]);

  async function retryAnalysis() {
    setError(null);
    setIsRetrying(true);
    try {
      setRun(await launchInitialAnalysis(getApiBaseUrl(), applicationCaseId));
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Не удалось повторить анализ. Попробуйте ещё раз позже.');
    } finally {
      setIsRetrying(false);
    }
  }

  async function startHrPreparation() {
    setError(null);
    setIsLaunchingHr(true);
    try {
      await launchHrPreparation(getApiBaseUrl(), applicationCaseId);
      await refreshApplicationCase();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Не удалось запустить подготовку к HR. Попробуйте ещё раз позже.');
    } finally {
      setIsLaunchingHr(false);
    }
  }

  const hrRun = applicationCase?.hrPreparationRun ?? null;
  const postInterviewRun = applicationCase?.postInterviewRun ?? null;
  const initialArtifacts = artifacts.filter((artifact) => initialArtifactTypes.has(artifact.type));
  const hrArtifact = artifacts.find((artifact) => artifact.type === 'HR_SCREENING_PREPARATION');
  const postInterviewArtifact = artifacts.find((artifact) => artifact.type === 'POST_INTERVIEW_REVIEW');
  const closingMessageArtifact = artifacts.find((artifact) => artifact.type === 'HR_CLOSING_MESSAGE');
  const canStartHrPreparation = run?.status === 'SUCCEEDED' && hrRun === null && hrArtifact === undefined;
  const isHrPreparationReady = hrArtifact !== undefined;
  const canUnlockPostInterview = isHrPreparationReady && postInterviewRun === null && !postInterviewUnlocked;

  return <section className="vacancy-panel" aria-labelledby="analysis-result-title">
    <div className="page-heading">
      <p className="eyebrow">INITIAL ANALYSIS</p>
      <h1 id="analysis-result-title">Результат анализа</h1>
      <p>Материалы созданы как черновики. Проверьте их перед ручной отправкой.</p>
      <button className="button button--secondary button--small" type="button" onClick={onBackToHistory}>К истории анализов</button>
    </div>

    {error !== null && <p className="form-message form-message--error" role="alert">{error}</p>}
    {run !== null && <InitialRunStatus run={run} isRetrying={isRetrying} onRetry={retryAnalysis} />}
    {result !== null && <FullReportEditor markdown={result.finalMarkdown} />}
    {initialArtifacts.length > 0 && <ArtifactMaterials artifacts={initialArtifacts} />}

    {canStartHrPreparation && <section className="workflow-step" aria-labelledby="hr-preparation-title">
      <div>
        <h2 id="hr-preparation-title">Подготовка к HR-скринингу</h2>
        <p>Соберём вопросы и структурированные ответы для разговора с рекрутером.</p>
      </div>
      <button className="button button--primary" type="button" disabled={isLaunchingHr} onClick={() => void startHrPreparation()}>
        {isLaunchingHr ? 'Запускаем…' : 'Подготовиться к HR-скринингу'}
      </button>
    </section>}

    {hrRun !== null && hrRun.status !== 'SUCCEEDED' && <WorkflowRunStatus label="Подготовка к HR" run={hrRun} isRetrying={isLaunchingHr} onRetry={startHrPreparation} />}
    {isHrPreparationReady && <WorkflowArtifact
      artifact={hrArtifact}
      title="Предполагаемые вопросы от HR и структурированные ответы"
      description="Используйте памятку для подготовки к разговору. Это не материал для отправки работодателю."
    />}

    {canUnlockPostInterview && <section className="workflow-step" aria-labelledby="post-interview-unlock-title">
      <div>
        <h2 id="post-interview-unlock-title">HR-скрининг состоялся</h2>
        <p>Когда получите сообщение по итогам интервью, можно попросить краткий разбор и подготовить ответ вручную.</p>
      </div>
      <button className="button button--primary" type="button" onClick={() => setPostInterviewUnlocked(true)}>Продолжить</button>
    </section>}

    {applicationCase !== null && <PostInterviewPanel
      applicationCaseId={applicationCaseId}
      isUnlocked={postInterviewUnlocked || postInterviewRun !== null}
      run={postInterviewRun}
      onRunChanged={refreshApplicationCase}
    />}
    {postInterviewArtifact !== undefined && <WorkflowArtifact
      artifact={postInterviewArtifact}
      title="Разбор сообщения HR"
      description="Краткий разбор основан на сохранённом сообщении и контексте этой вакансии."
    />}
    {closingMessageArtifact !== undefined && <WorkflowArtifact
      artifact={closingMessageArtifact}
      title="Закрывающее сообщение HR"
      description="Проверьте текст, при необходимости отредактируйте вне сервиса и отправьте вручную."
    />}
  </section>;
}

function InitialRunStatus({ run, isRetrying, onRetry }: {
  run: AnalysisRunSummary;
  isRetrying: boolean;
  onRetry: () => Promise<void>;
}) {
  return <div className={`analysis-state analysis-state--${run.status.toLowerCase()}`} role="status">
    <p>Статус анализа: {getAnalysisRunStatusLabel(run.status)}</p>
    {run.currentStage !== null && <p>Текущий этап: {getAnalysisStageLabel(run.currentStage)}</p>}
    {run.status === 'FAILED' && <>
      <p>{getAnalysisErrorLabel(run.errorCode)}</p>
      <RetryAction run={run} isRetrying={isRetrying} onRetry={onRetry} label="Повторить анализ" />
    </>}
  </div>;
}

function WorkflowRunStatus({ label, run, isRetrying, onRetry }: { label: string; run: AnalysisRunSummary; isRetrying: boolean; onRetry: () => Promise<void> }) {
  return <div className={`analysis-state analysis-state--${run.status.toLowerCase()}`} role="status">
    <p>{label}: {getAnalysisRunStatusLabel(run.status)}</p>
    {run.status === 'FAILED' && <><p>{getAnalysisErrorLabel(run.errorCode)}</p><RetryAction run={run} isRetrying={isRetrying} onRetry={onRetry} label="Повторить подготовку" /></>}
  </div>;
}

function RetryAction({ run, isRetrying, onRetry, label }: { run: AnalysisRunSummary; isRetrying: boolean; onRetry: () => Promise<void>; label: string }) {
  const remaining = ManualRetryLimit - run.manualRetryCount;
  if (remaining <= 0) return <p>Лимит ручных повторов исчерпан.</p>;
  return <><p>Осталось повторов: {remaining}.</p><button className="button button--secondary" type="button" disabled={isRetrying} onClick={() => void onRetry()}>{isRetrying ? 'Повторяем…' : label}</button></>;
}
