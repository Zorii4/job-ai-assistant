import { useCallback, useEffect, useState } from 'react';

import {
  ApiRequestError,
  confirmResume,
  createFileResume,
  deleteResume,
  getApiBaseUrl,
  getResume,
  getResumes,
  updateSanitizedResume,
} from '../../api';
import type { ResumeDetail, ResumeSummary } from '@job-ai-assistant/contracts';
import { FileUpload } from '../../components/FileUpload';
import { LocalPdfPreview } from '../../components/LocalPdfPreview';
import { ResumeMarkdownPreview } from './ResumeMarkdownPreview';

type ResumeState = 'loading' | 'ready' | 'error';

export function ResumeLibrary() {
  const [resumeState, setResumeState] = useState<ResumeState>('loading');
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [title, setTitle] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedResume, setSelectedResume] = useState<ResumeDetail | null>(null);
  const [editableSanitizedText, setEditableSanitizedText] = useState('');
  const [previewState, setPreviewState] = useState<ResumeState>('ready');
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [isSavingPreview, setIsSavingPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<'markdown' | 'preview'>('markdown');

  const loadResumes = useCallback(async () => {
    setResumeState('loading');
    try {
      setResumes(await getResumes(getApiBaseUrl()));
      setResumeState('ready');
    } catch {
      setResumeState('error');
    }
  }, []);

  useEffect(() => { void loadResumes(); }, [loadResumes]);

  async function openPreview(resumeId: string) {
    setPreviewState('loading');
    setPreviewMessage(null);
    try {
      const resume = await getResume(getApiBaseUrl(), resumeId);
      setSelectedResume(resume);
      setEditableSanitizedText(resume.sanitizedText);
      setPreviewState('ready');
    } catch (error) {
      setSelectedResume(null);
      setPreviewState('error');
      setPreviewMessage(getFormErrorMessage(error));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (title.trim().length === 0) return setFormError('Укажите название, чтобы отличать это резюме от других.');
    if (sourceFile === null) return setFormError('Выберите файл в формате PDF, MD или TXT.');

    setIsSubmitting(true);
    try {
      const resume = await createFileResume(getApiBaseUrl(), { title: title.trim(), file: sourceFile });
      setResumes((current) => [resume, ...current]);
      setResumeState('ready');
      setTitle('');
      setSourceFile(null);
      setFormSuccess('Черновик создан. Следующим шагом проверьте обезличенную версию.');
      void openPreview(resume.id);
    } catch (error) {
      setFormError(getFormErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateResumeSummary(resume: ResumeDetail) {
    const { sanitizedText: _sanitizedText, sanitizationVersion: _sanitizationVersion, ...summary } = resume;
    setResumes((current) => current.map((item) => item.id === resume.id ? summary : item));
  }

  async function saveSanitizedText() {
    if (selectedResume === null) return;
    const nextText = editableSanitizedText.trim();
    if (nextText.length === 0) return setPreviewMessage('Обезличенная версия не может быть пустой.');
    setIsSavingPreview(true);
    setPreviewMessage(null);
    try {
      const resume = await updateSanitizedResume(getApiBaseUrl(), selectedResume.id, nextText);
      setSelectedResume(resume);
      setEditableSanitizedText(resume.sanitizedText);
      updateResumeSummary(resume);
      setPreviewMessage('Изменения сохранены. Проверьте текст и подтвердите его перед анализом.');
    } catch (error) {
      setPreviewMessage(getFormErrorMessage(error));
    } finally {
      setIsSavingPreview(false);
    }
  }

  async function confirmSelectedResume() {
    if (selectedResume === null) return;
    if (editableSanitizedText.trim() !== selectedResume.sanitizedText) return saveSanitizedText();
    setIsSavingPreview(true);
    setPreviewMessage(null);
    try {
      const resume = await confirmResume(getApiBaseUrl(), selectedResume.id);
      setSelectedResume(resume);
      updateResumeSummary(resume);
      setPreviewMessage('Версия подтверждена. Её можно будет использовать для анализа вакансий.');
    } catch (error) {
      setPreviewMessage(getFormErrorMessage(error));
    } finally {
      setIsSavingPreview(false);
    }
  }

  async function deleteSelectedResume() {
    if (selectedResume === null || !window.confirm(`Удалить резюме «${selectedResume.title}»? Это действие нельзя отменить.`)) return;
    setIsSavingPreview(true);
    setPreviewMessage(null);
    try {
      await deleteResume(getApiBaseUrl(), selectedResume.id);
      setResumes((current) => current.filter((resume) => resume.id !== selectedResume.id));
      setSelectedResume(null);
      setEditableSanitizedText('');
    } catch (error) {
      setPreviewMessage(getFormErrorMessage(error));
    } finally {
      setIsSavingPreview(false);
    }
  }

  return <>
    <div className="page-heading"><p className="eyebrow">БИБЛИОТЕКА</p><h1>Резюме</h1></div>
    <section className="workspace" aria-label="Библиотека резюме">
      <section className="panel panel--form" aria-labelledby="create-resume-title">
        <div className="panel-heading"><div><p className="eyebrow">ШАГ 1 ИЗ 2</p><h2 id="create-resume-title">Добавить резюме</h2></div><p>Сначала создадим черновик, затем вы проверите данные перед использованием в AI.</p></div>
        <form className="resume-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <label className="field"><span>Название</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Например, Product Manager" disabled={isSubmitting} /></label>
          <FileUpload id="resume-file" label="Файл резюме" file={sourceFile} onFileChange={setSourceFile} disabled={isSubmitting} description="PDF, MD или TXT · до 10 МБ. Исходный файл будет удалён после извлечения текста." />
          <LocalPdfPreview file={sourceFile} />
          {formError !== null && <p className="form-message form-message--error" role="alert">{formError}</p>}
          {formSuccess !== null && <p className="form-message form-message--success" role="status">{formSuccess}</p>}
          <button className="button button--primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Создаём…' : 'Создать черновик'}</button>
        </form>
      </section>
      <section className="panel panel--library" aria-labelledby="resume-library-title">
        <div className="panel-heading panel-heading--library"><div><p className="eyebrow">БИБЛИОТЕКА</p><h2 id="resume-library-title">Ваши резюме</h2></div>{resumeState === 'ready' && <span className="count-label">{resumes.length}</span>}</div>
        {resumeState === 'loading' && <p className="library-state" role="status">Загружаем резюме…</p>}
        {resumeState === 'error' && <div className="library-state library-state--error" role="alert"><p>Не удалось загрузить библиотеку. Войдите в аккаунт и повторите попытку.</p><button className="button button--secondary" type="button" onClick={() => void loadResumes()}>Повторить</button></div>}
        {resumeState === 'ready' && resumes.length === 0 && <p className="library-state">Здесь появятся подготовленные резюме. Начните с формы слева.</p>}
        {resumeState === 'ready' && resumes.length > 0 && <ul className="resume-list">{resumes.map((resume) => <li key={resume.id}><article className="resume-card"><div><h3>{resume.title}</h3><p>Загруженный файл</p></div><div className="resume-card-actions"><span className={`resume-status resume-status--${resume.sanitizationStatus.toLowerCase()}`}>{resume.sanitizationStatus === 'CONFIRMED' ? 'Подтверждено' : 'Нужна проверка'}</span><button className="button button--secondary button--small" type="button" onClick={() => void openPreview(resume.id)}>Проверить</button></div></article></li>)}</ul>}
      </section>
    </section>
    {(previewState === 'loading' || selectedResume !== null || previewState === 'error') && <section className="preview-panel" aria-labelledby="preview-title">
      {previewState === 'loading' && <p role="status">Открываем обезличенную версию…</p>}
      {previewState === 'error' && <div className="library-state library-state--error" role="alert"><p>{previewMessage ?? 'Не удалось открыть резюме.'}</p></div>}
      {selectedResume !== null && previewState === 'ready' && <><div className="preview-heading"><div><p className="eyebrow">ШАГ 2 ИЗ 2</p><h2 id="preview-title">Проверьте обезличенную версию</h2><p>Именно этот текст будет доступен AI после подтверждения. Исходный текст резюме не передаётся.</p></div><span className={`resume-status resume-status--${selectedResume.sanitizationStatus.toLowerCase()}`}>{selectedResume.sanitizationStatus === 'CONFIRMED' ? 'Подтверждено' : 'Черновик'}</span></div><div className="resume-markdown-tabs" role="tablist" aria-label="Режим просмотра резюме"><button className="button button--secondary" type="button" role="tab" aria-selected={previewMode === 'markdown'} onClick={() => setPreviewMode('markdown')}>Markdown</button><button className="button button--secondary" type="button" role="tab" aria-selected={previewMode === 'preview'} onClick={() => setPreviewMode('preview')}>Предпросмотр</button></div><div className={`resume-markdown-split resume-markdown-split--${previewMode}`}><label className="field preview-editor"><span>Обезличенная Markdown-версия</span><textarea value={editableSanitizedText} onChange={(event) => setEditableSanitizedText(event.target.value)} rows={14} maxLength={50_000} disabled={isSavingPreview} /><small>{editableSanitizedText.length.toLocaleString('ru-RU')} / 50&nbsp;000 символов</small></label><ResumeMarkdownPreview markdown={editableSanitizedText} /></div>{previewMessage !== null && <p className="form-message" role="status">{previewMessage}</p>}<div className="preview-actions"><button className="button button--secondary" type="button" onClick={() => void saveSanitizedText()} disabled={isSavingPreview || editableSanitizedText.trim() === selectedResume.sanitizedText}>{isSavingPreview ? 'Сохраняем…' : 'Сохранить изменения'}</button><button className="button button--primary" type="button" onClick={() => void confirmSelectedResume()} disabled={isSavingPreview || selectedResume.sanitizationStatus === 'CONFIRMED'}>Подтвердить версию</button><button className="button button--danger" type="button" onClick={() => void deleteSelectedResume()} disabled={isSavingPreview}>Удалить</button></div></>}
    </section>}
  </>;
}

function getFormErrorMessage(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Не удалось создать черновик. Повторите попытку позже.';
}
