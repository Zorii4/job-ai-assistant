import type { ApplicationCaseAnalysisSummary } from '@job-ai-assistant/contracts';
import React from 'react';

import { getAnalysisErrorLabel, getAnalysisRunStatusLabel, getAnalysisStageLabel, isActiveAnalysisStatus } from '../analyses/analysisStatus';

export function ApplicationCaseList({ applicationCases, onOpenAnalysis, onRetryAnalysis, retryingApplicationCaseId }: {
  applicationCases: ApplicationCaseAnalysisSummary[];
  onOpenAnalysis: (applicationCaseId: string, runId: string) => void;
  onRetryAnalysis: (applicationCaseId: string) => void;
  retryingApplicationCaseId: string | null;
}) {
  const activeCases = applicationCases.filter((applicationCase) => (
    applicationCase.analysisRun !== null && isActiveAnalysisStatus(applicationCase.analysisRun.status)
  ));
  const completedCases = applicationCases.filter((applicationCase) => applicationCase.analysisRun?.status === 'SUCCEEDED');
  const otherCases = applicationCases.filter((applicationCase) => (
    !activeCases.includes(applicationCase) && !completedCases.includes(applicationCase)
  ));

  return (
    <section className="application-case-list" aria-labelledby="application-cases-title">
      <div className="application-case-list__heading">
        <p className="eyebrow">ВАШИ ВАКАНСИИ</p>
        <h2 id="application-cases-title">Состояние анализов</h2>
      </div>
      {activeCases.length > 0 && <ApplicationCaseGroup title="В процессе" cases={activeCases} actionLabel="Открыть" onOpenAnalysis={onOpenAnalysis} onRetryAnalysis={onRetryAnalysis} retryingApplicationCaseId={retryingApplicationCaseId} />}
      {completedCases.length > 0 && <ApplicationCaseGroup title="Готовые результаты" cases={completedCases} actionLabel="К результату" onOpenAnalysis={onOpenAnalysis} onRetryAnalysis={onRetryAnalysis} retryingApplicationCaseId={retryingApplicationCaseId} />}
      {otherCases.length > 0 && <ApplicationCaseGroup title="Другие вакансии" cases={otherCases} actionLabel="Открыть" onOpenAnalysis={onOpenAnalysis} onRetryAnalysis={onRetryAnalysis} retryingApplicationCaseId={retryingApplicationCaseId} />}
      {applicationCases.length === 0 && <p className="form-message" role="status">Здесь появится ход и результат запущенных анализов.</p>}
    </section>
  );
}

function ApplicationCaseGroup({ title, cases, actionLabel, onOpenAnalysis, onRetryAnalysis, retryingApplicationCaseId }: {
  title: string;
  cases: ApplicationCaseAnalysisSummary[];
  actionLabel: string;
  onOpenAnalysis: (applicationCaseId: string, runId: string) => void;
  onRetryAnalysis: (applicationCaseId: string) => void;
  retryingApplicationCaseId: string | null;
}) {
  return (
    <section className="application-case-group" aria-label={title}>
      <h3>{title}</h3>
      <ul className="application-case-cards">
        {cases.map((applicationCase) => {
          const run = applicationCase.analysisRun;
          const isFailed = run?.status === 'FAILED';
          const isRetrying = retryingApplicationCaseId === applicationCase.id;
          return <li key={applicationCase.id} className="application-case-card"><div><h4>{applicationCase.title}</h4><p>{run === null ? 'Черновик' : isFailed ? getAnalysisErrorLabel(run.errorCode) : `${getAnalysisRunStatusLabel(run.status)}${run.currentStage === null ? '' : ` · ${getAnalysisStageLabel(run.currentStage)}`}`}</p></div>{run !== null && (isFailed ? <button className="button button--secondary button--small" type="button" disabled={isRetrying} onClick={() => onRetryAnalysis(applicationCase.id)}>{isRetrying ? 'Повторяем…' : 'Повторить анализ'}</button> : <button className="button button--secondary button--small" type="button" onClick={() => onOpenAnalysis(applicationCase.id, run.id)}>{actionLabel}</button>)}</li>;
        })}
      </ul>
    </section>
  );
}
