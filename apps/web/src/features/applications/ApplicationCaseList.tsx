import type { ApplicationCaseAnalysisSummary, ApplicationCaseStatus } from '@job-ai-assistant/contracts';
import React, { useState } from 'react';

import { getAnalysisErrorLabel, getAnalysisRunStatusLabel, getAnalysisStageLabel, isActiveAnalysisStatus } from '../analyses/analysisStatus';

const applicationStatusLabels = {
  DRAFT: 'Черновик',
  ANALYZING: 'Идёт первоначальный анализ',
  ANALYSIS_READY: 'Анализ готов',
  APPLIED: 'Отклик отправлен',
  WAITING_RESPONSE: 'Ждём ответа',
  HR_INVITED: 'Приглашение на HR-скрининг',
  HR_PREPARATION_READY: 'Подготовка к HR готова',
  HR_COMPLETED: 'HR-скрининг завершён',
  REJECTED: 'Отказ',
  OFFER: 'Получен оффер',
  ARCHIVED: 'В архиве',
  FAILED: 'Анализ требует внимания',
} as const;

const quickStageTransitions: Partial<Record<ApplicationCaseStatus, Array<{ status: ApplicationCaseStatus; label: string }>>> = {
  DRAFT: [{ status: 'ARCHIVED', label: 'Архивировать' }],
  ANALYSIS_READY: [{ status: 'APPLIED', label: 'Отклик отправлен' }],
  APPLIED: [{ status: 'WAITING_RESPONSE', label: 'Жду ответа' }, { status: 'REJECTED', label: 'Получен отказ' }, { status: 'ARCHIVED', label: 'Архивировать' }],
  WAITING_RESPONSE: [{ status: 'HR_INVITED', label: 'Меня пригласили' }, { status: 'REJECTED', label: 'Получен отказ' }, { status: 'ARCHIVED', label: 'Архивировать' }],
  HR_INVITED: [{ status: 'HR_COMPLETED', label: 'HR-скрининг завершён' }, { status: 'REJECTED', label: 'Получен отказ' }, { status: 'ARCHIVED', label: 'Архивировать' }],
  HR_COMPLETED: [{ status: 'WAITING_RESPONSE', label: 'Жду ответа' }, { status: 'OFFER', label: 'Получен оффер' }, { status: 'REJECTED', label: 'Получен отказ' }, { status: 'ARCHIVED', label: 'Архивировать' }],
  HR_PREPARATION_READY: [{ status: 'HR_COMPLETED', label: 'HR-скрининг завершён' }, { status: 'ARCHIVED', label: 'Архивировать' }],
  FAILED: [{ status: 'ARCHIVED', label: 'Архивировать' }],
  OFFER: [{ status: 'ARCHIVED', label: 'Архивировать' }],
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function ApplicationCaseList({ applicationCases, onOpenAnalysis, onRetryAnalysis, onLaunchHrPreparation, onUpdateStage, retryingApplicationCaseId, preparingHrApplicationCaseId, updatingApplicationCaseId }: {
  applicationCases: ApplicationCaseAnalysisSummary[];
  onOpenAnalysis: (applicationCaseId: string, runId: string) => void;
  onRetryAnalysis: (applicationCaseId: string) => void;
  onLaunchHrPreparation: (applicationCaseId: string) => void;
  onUpdateStage: (applicationCaseId: string, status: ApplicationCaseStatus) => void;
  retryingApplicationCaseId: string | null;
  preparingHrApplicationCaseId: string | null;
  updatingApplicationCaseId: string | null;
}) {
  const [statusFilter, setStatusFilter] = useState<ApplicationCaseStatus | 'ALL'>('ALL');
  const visibleCases = statusFilter === 'ALL' ? applicationCases : applicationCases.filter((item) => item.status === statusFilter);
  const activeCases = visibleCases.filter((applicationCase) => (
    applicationCase.analysisRun !== null && isActiveAnalysisStatus(applicationCase.analysisRun.status)
  ));
  const completedCases = visibleCases.filter((applicationCase) => applicationCase.analysisRun?.status === 'SUCCEEDED');
  const otherCases = visibleCases.filter((applicationCase) => (
    !activeCases.includes(applicationCase) && !completedCases.includes(applicationCase)
  ));

  return (
    <section className="application-case-list" aria-labelledby="application-cases-title">
      <div className="application-case-list__heading">
        <p className="eyebrow">ВАШИ ВАКАНСИИ</p>
        <h2 id="application-cases-title">Состояние анализов</h2>
        <label className="field"><span>Фильтр статуса</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ApplicationCaseStatus | 'ALL')}><option value="ALL">Все</option>{Object.entries(applicationStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
      </div>
      {activeCases.length > 0 && <ApplicationCaseGroup title="В процессе" cases={activeCases} actionLabel="Открыть" onOpenAnalysis={onOpenAnalysis} onRetryAnalysis={onRetryAnalysis} onLaunchHrPreparation={onLaunchHrPreparation} onUpdateStage={onUpdateStage} retryingApplicationCaseId={retryingApplicationCaseId} preparingHrApplicationCaseId={preparingHrApplicationCaseId} updatingApplicationCaseId={updatingApplicationCaseId} />}
      {completedCases.length > 0 && <ApplicationCaseGroup title="Готовые результаты" cases={completedCases} actionLabel="К результату" onOpenAnalysis={onOpenAnalysis} onRetryAnalysis={onRetryAnalysis} onLaunchHrPreparation={onLaunchHrPreparation} onUpdateStage={onUpdateStage} retryingApplicationCaseId={retryingApplicationCaseId} preparingHrApplicationCaseId={preparingHrApplicationCaseId} updatingApplicationCaseId={updatingApplicationCaseId} />}
      {otherCases.length > 0 && <ApplicationCaseGroup title="Другие вакансии" cases={otherCases} actionLabel="Открыть" onOpenAnalysis={onOpenAnalysis} onRetryAnalysis={onRetryAnalysis} onLaunchHrPreparation={onLaunchHrPreparation} onUpdateStage={onUpdateStage} retryingApplicationCaseId={retryingApplicationCaseId} preparingHrApplicationCaseId={preparingHrApplicationCaseId} updatingApplicationCaseId={updatingApplicationCaseId} />}
      {visibleCases.length === 0 && <p className="form-message" role="status">Для этого фильтра вакансий нет.</p>}
    </section>
  );
}

function ApplicationCaseGroup({ title, cases, actionLabel, onOpenAnalysis, onRetryAnalysis, onLaunchHrPreparation, onUpdateStage, retryingApplicationCaseId, preparingHrApplicationCaseId, updatingApplicationCaseId }: {
  title: string;
  cases: ApplicationCaseAnalysisSummary[];
  actionLabel: string;
  onOpenAnalysis: (applicationCaseId: string, runId: string) => void;
  onRetryAnalysis: (applicationCaseId: string) => void;
  onLaunchHrPreparation: (applicationCaseId: string) => void;
  onUpdateStage: (applicationCaseId: string, status: ApplicationCaseStatus) => void;
  retryingApplicationCaseId: string | null;
  preparingHrApplicationCaseId: string | null;
  updatingApplicationCaseId: string | null;
}) {
  return (
    <section className="application-case-group" aria-label={title}>
      <h3>{title}</h3>
      <ul className="application-case-cards">
        {cases.map((applicationCase) => {
          const run = applicationCase.analysisRun;
          const hrPreparationRun = applicationCase.hrPreparationRun;
          const isFailed = run?.status === 'FAILED';
          const isRetrying = retryingApplicationCaseId === applicationCase.id;
          const isPreparingHr = preparingHrApplicationCaseId === applicationCase.id;
          const isUpdatingStage = updatingApplicationCaseId === applicationCase.id;
          const analysisStatus = run === null
            ? null
            : isFailed
              ? getAnalysisErrorLabel(run.errorCode)
              : `${getAnalysisRunStatusLabel(run.status)}${run.currentStage === null ? '' : ` · ${getAnalysisStageLabel(run.currentStage)}`}`;
          const hrPreparationStatus = hrPreparationRun === null
            ? null
            : hrPreparationRun.status === 'FAILED'
              ? getAnalysisErrorLabel(hrPreparationRun.errorCode)
              : `HR-подготовка: ${getAnalysisRunStatusLabel(hrPreparationRun.status)}`;
          const isHrPreparationActive = isActiveAnalysisStatus(hrPreparationRun?.status ?? 'SUCCEEDED');
          const canLaunchHrPreparation = applicationCase.status === 'HR_INVITED' && (hrPreparationRun === null || hrPreparationRun.status === 'FAILED');
          return <li key={applicationCase.id} className="application-case-card"><div><h4>{applicationCase.title}</h4><p className="application-case-card__lifecycle">{applicationStatusLabels[applicationCase.status]}</p>{analysisStatus !== null && <p>{analysisStatus}</p>}{hrPreparationStatus !== null && <p>{hrPreparationStatus}</p>}<p className="application-case-card__dates">Создано: {dateFormatter.format(new Date(applicationCase.createdAt))} · Обновлено: {dateFormatter.format(new Date(applicationCase.updatedAt))}</p></div><div className="application-case-card__actions"><label className="field"><span className="sr-only">Изменить статус</span><select value={applicationCase.status} disabled={isUpdatingStage || isHrPreparationActive || isActiveAnalysisStatus(run?.status ?? 'SUCCEEDED')} onChange={(event) => onUpdateStage(applicationCase.id, event.target.value as ApplicationCaseStatus)}>{Object.entries(applicationStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>{run !== null && (isFailed ? <button className="button button--secondary button--small" type="button" disabled={isRetrying || isUpdatingStage || isHrPreparationActive} onClick={() => onRetryAnalysis(applicationCase.id)}>{isRetrying ? 'Повторяем…' : 'Повторить анализ'}</button> : <button className="button button--secondary button--small" type="button" disabled={isUpdatingStage || isHrPreparationActive} onClick={() => onOpenAnalysis(applicationCase.id, run.id)}>{applicationCase.status === 'HR_PREPARATION_READY' ? 'Открыть подготовку' : actionLabel}</button>)}{canLaunchHrPreparation && <button className="button button--primary button--small" type="button" disabled={isPreparingHr || isUpdatingStage} onClick={() => onLaunchHrPreparation(applicationCase.id)}>{isPreparingHr ? 'Запускаем…' : hrPreparationRun?.status === 'FAILED' ? 'Повторить подготовку' : 'Подготовиться к HR'}</button>}{!isActiveAnalysisStatus(run?.status ?? 'SUCCEEDED') && !isHrPreparationActive && quickStageTransitions[applicationCase.status]?.map((transition) => <button key={transition.status} className="button button--secondary button--small" type="button" disabled={isRetrying || isPreparingHr || isUpdatingStage} onClick={() => onUpdateStage(applicationCase.id, transition.status)}>{isUpdatingStage ? 'Сохраняем…' : transition.label}</button>)}</div></li>;
        })}
      </ul>
    </section>
  );
}
