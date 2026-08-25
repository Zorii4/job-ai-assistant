import { ManualRetryLimit, type ApplicationCaseAnalysisSummary, type ApplicationCaseStatus } from '@job-ai-assistant/contracts';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { IconButton } from '../../components/IconButton';
import { getAnalysisErrorLabel, getAnalysisRunStatusLabel, isActiveAnalysisStatus } from '../analyses/analysisStatus';

const applicationStatusLabels: Record<ApplicationCaseStatus, string> = {
  IN_PROGRESS: 'В процессе',
  REJECTED: 'Отказ',
  OFFER: 'Оффер',
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function ApplicationCaseList({ applicationCases, scope, onOpenAnalysis, onRetryAnalysis, onUpdateStatus, onDelete }: {
  applicationCases: ApplicationCaseAnalysisSummary[];
  scope: 'active' | 'history';
  onOpenAnalysis: (applicationCaseId: string, runId: string) => void;
  onRetryAnalysis: (applicationCaseId: string) => void;
  onUpdateStatus: (applicationCaseId: string, status: ApplicationCaseStatus) => void;
  onDelete: (applicationCaseId: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<ApplicationCaseStatus | 'ALL'>('ALL');
  const visibleCases = applicationCases
    .filter((item) => scope === 'history' || isActiveAnalysisStatus(item.analysisRun?.status ?? 'SUCCEEDED'))
    .filter((item) => statusFilter === 'ALL' || item.status === statusFilter);

  if (visibleCases.length === 0) return null;

  return (
    <section className="application-case-list" aria-label={scope === 'history' ? 'История анализов' : undefined} aria-labelledby={scope === 'active' ? `${scope}-application-cases-title` : undefined}>
      <div className="application-case-list__heading">
        <p className="eyebrow">{scope === 'active' ? 'ТЕКУЩИЕ ПРОЦЕССЫ' : 'ИСТОРИЯ АНАЛИЗОВ'}</p>
        {scope === 'active' && <h2 id={`${scope}-application-cases-title`}>Анализы в работе</h2>}
        {scope === 'history' && <label className="field filter-select"><span>Фильтр статуса вакансии</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ApplicationCaseStatus | 'ALL')}><option value="ALL">Все</option>{Object.entries(applicationStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>}
      </div>
      <ul className="application-case-cards">
        {visibleCases.map((applicationCase) => <ApplicationCaseCard key={applicationCase.id} applicationCase={applicationCase} onOpenAnalysis={onOpenAnalysis} onRetryAnalysis={onRetryAnalysis} onUpdateStatus={onUpdateStatus} onDelete={onDelete} />)}
      </ul>
    </section>
  );
}

function ApplicationCaseCard({ applicationCase, onOpenAnalysis, onRetryAnalysis, onUpdateStatus, onDelete }: {
  applicationCase: ApplicationCaseAnalysisSummary;
  onOpenAnalysis: (applicationCaseId: string, runId: string) => void;
  onRetryAnalysis: (applicationCaseId: string) => void;
  onUpdateStatus: (applicationCaseId: string, status: ApplicationCaseStatus) => void;
  onDelete: (applicationCaseId: string) => void;
}) {
  const run = applicationCase.analysisRun;
  const canOpen = run !== null && run.status !== 'FAILED';
  const canDelete = !isActiveAnalysisStatus(run?.status ?? 'SUCCEEDED')
    && !isActiveAnalysisStatus(applicationCase.hrPreparationRun?.status ?? 'SUCCEEDED')
    && !isActiveAnalysisStatus(applicationCase.postInterviewRun?.status ?? 'SUCCEEDED');
  const technicalStatus = run === null
    ? 'Первоначальный анализ ещё не запускался'
    : run.status === 'FAILED'
      ? getAnalysisErrorLabel(run.errorCode)
      : `Первоначальный анализ: ${getAnalysisRunStatusLabel(run.status)}`;

  return <li className="application-case-card"><div><h3>{canOpen ? <button className="text-link" type="button" onClick={() => onOpenAnalysis(applicationCase.id, run.id)}>{applicationCase.title}</button> : applicationCase.title}</h3><p className="application-case-card__lifecycle">{applicationStatusLabels[applicationCase.status]}</p><p>{technicalStatus}</p><p className="application-case-card__dates">Создано: {dateFormatter.format(new Date(applicationCase.createdAt))} · Обновлено: {dateFormatter.format(new Date(applicationCase.updatedAt))}</p></div><div className="application-case-card__actions">{run?.status === 'FAILED' && run.manualRetryCount < ManualRetryLimit && <button className="button button--secondary button--small" type="button" onClick={() => onRetryAnalysis(applicationCase.id)}>Повторить анализ ({ManualRetryLimit - run.manualRetryCount})</button>}{run?.status === 'FAILED' && run.manualRetryCount >= ManualRetryLimit && <span className="application-case-card__retry-limit">Лимит повторов исчерпан</span>}{canDelete && <IconButton className="button--danger" type="button" label="Удалить вакансию" onClick={() => onDelete(applicationCase.id)}><Trash2 aria-hidden="true" size={18} /></IconButton>}</div></li>;
}
