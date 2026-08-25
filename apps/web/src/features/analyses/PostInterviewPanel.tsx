import { useState } from 'react';

import { ManualRetryLimit, type AnalysisRunSummary } from '@job-ai-assistant/contracts';

import { ApiRequestError, getApiBaseUrl, launchPostInterview, retryPostInterview } from '../../api';
import { getAnalysisErrorLabel, getAnalysisRunStatusLabel } from './analysisStatus';

const maxMessageLength = 8_000;

export function PostInterviewPanel({ applicationCaseId, isUnlocked, run, onRunChanged }: {
  applicationCaseId: string;
  isUnlocked: boolean;
  run: AnalysisRunSummary | null;
  onRunChanged: () => Promise<void>;
}) {
  const [hrMessage, setHrMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canStart = run === null && isUnlocked;
  const canRetry = run?.status === 'FAILED' && run.manualRetryCount < ManualRetryLimit;
  const retriesRemaining = run === null ? 0 : ManualRetryLimit - run.manualRetryCount;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!hrMessage.trim()) return setError('Вставьте сообщение HR по итогам интервью.');
    setIsSubmitting(true);
    try {
      await launchPostInterview(getApiBaseUrl(), applicationCaseId, hrMessage);
      setHrMessage('');
      await onRunChanged();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Не удалось запустить разбор. Попробуйте ещё раз позже.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function retry() {
    setError(null);
    setIsSubmitting(true);
    try {
      await retryPostInterview(getApiBaseUrl(), applicationCaseId);
      await onRunChanged();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Не удалось повторить разбор. Попробуйте ещё раз позже.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canStart && run === null) return null;

  return <section className="post-interview-panel" aria-labelledby="post-interview-title"><div><p className="eyebrow">ПОСЛЕ HR</p><h2 id="post-interview-title">Разобрать сообщение HR</h2><p>Контакты и подпись не сохраняются. Проверьте результат перед ручной отправкой.</p></div>{error !== null && <p className="form-message form-message--error" role="alert">{error}</p>}{canStart && <form className="resume-form" onSubmit={(event) => void submit(event)} noValidate><label className="field"><span>Сообщение от HR по итогам интервью</span><textarea value={hrMessage} onChange={(event) => setHrMessage(event.target.value)} maxLength={maxMessageLength} disabled={isSubmitting} /></label><p className="post-interview-panel__count" aria-live="polite">{hrMessage.length} / {maxMessageLength}</p><button className="button button--primary" type="submit" disabled={isSubmitting || !hrMessage.trim()}>{isSubmitting ? 'Запускаем…' : 'Получить разбор'}</button></form>}{run !== null && <div className={`analysis-state analysis-state--${run.status.toLowerCase()}`} role="status"><p>Разбор после HR: {getAnalysisRunStatusLabel(run.status)}</p>{run.status === 'FAILED' && <><p>{getAnalysisErrorLabel(run.errorCode)}</p>{canRetry ? <><p>Осталось повторов: {retriesRemaining}.</p><button className="button button--secondary" type="button" disabled={isSubmitting} onClick={() => void retry()}>{isSubmitting ? 'Повторяем…' : 'Повторить разбор'}</button></> : <p>Лимит ручных повторов исчерпан.</p>}</>}</div>}</section>;
}
