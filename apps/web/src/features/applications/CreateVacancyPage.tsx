import { useCallback, useEffect, useState } from 'react';

import { ApiRequestError, createFileApplicationCase, getApiBaseUrl, getResumes, launchInitialAnalysis } from '../../api';
import type { ResumeSummary } from '@job-ai-assistant/contracts';
import { FileUpload } from '../../components/FileUpload';

export function CreateVacancyPage({ onCreated }: { onCreated: (applicationCaseId: string, runId: string) => void }) {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [resumeId, setResumeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loadResumes = useCallback(async () => { try { const items = (await getResumes(getApiBaseUrl())).filter((resume) => resume.sanitizationStatus === 'CONFIRMED'); setResumes(items); setResumeId((current) => current || items[0]?.id || ''); setState('ready'); } catch { setState('error'); } }, []);
  useEffect(() => { void loadResumes(); }, [loadResumes]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    if (title.trim().length === 0) return setError('Укажите название вакансии.');
    if (resumeId.length === 0) return setError('Сначала выберите подтверждённое резюме.');
    if (file === null) return setError('Выберите файл вакансии в формате PDF, MD или TXT.');
    setIsSubmitting(true);
    try { const applicationCase = await createFileApplicationCase(getApiBaseUrl(), { title: title.trim(), resumeId, file }); const run = await launchInitialAnalysis(getApiBaseUrl(), applicationCase.id); onCreated(applicationCase.id, run.id); } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'Не удалось запустить анализ. Повторите попытку позже.'); } finally { setIsSubmitting(false); }
  }
  return <section className="vacancy-panel" aria-labelledby="create-vacancy-title"><div className="page-heading"><p className="eyebrow">НОВЫЙ АНАЛИЗ</p><h1 id="create-vacancy-title">Создать вакансию</h1><p>Выберите подтверждённое резюме, добавьте вакансию и запустите один первоначальный анализ.</p></div>{state === 'loading' && <p className="library-state" role="status">Загружаем подтверждённые резюме…</p>}{state === 'error' && <div className="library-state library-state--error" role="alert"><p>Не удалось загрузить резюме.</p><button className="button button--secondary" type="button" onClick={() => void loadResumes()}>Повторить</button></div>}{state === 'ready' && resumes.length === 0 && <p className="form-message" role="status">Подтвердите хотя бы одно резюме, чтобы начать анализ вакансии.</p>}{state === 'ready' && resumes.length > 0 && <form className="resume-form" onSubmit={(event) => void submit(event)} noValidate><label className="field"><span>Название вакансии</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="Например, Backend developer — Acme" disabled={isSubmitting} /></label><label className="field"><span>Резюме для анализа</span><select value={resumeId} onChange={(event) => setResumeId(event.target.value)} disabled={isSubmitting}>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.title}</option>)}</select></label><FileUpload id="vacancy-file" label="Файл вакансии" file={file} onFileChange={setFile} disabled={isSubmitting} />{error !== null && <p className="form-message form-message--error" role="alert">{error}</p>}<button className="button button--primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Запускаем…' : 'Запустить анализ'}</button></form>}</section>;
}
