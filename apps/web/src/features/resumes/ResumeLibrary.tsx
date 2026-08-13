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
  const [deletingResumeId, setDeletingResumeId] = useState<string | null>(null);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);

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

  function closePreview() {
    setSelectedResume(null);
    setEditableSanitizedText('');
    setPreviewMessage(null);
    setPreviewState('ready');
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

  async function confirmSelectedResume() {
    if (selectedResume === null) return;
    const nextText = editableSanitizedText.trim();
    if (nextText.length === 0) return setPreviewMessage('Обезличенная версия не может быть пустой.');
    setIsSavingPreview(true);
    setPreviewMessage(null);
    try {
      if (nextText !== selectedResume.sanitizedText) {
        const updatedResume = await updateSanitizedResume(getApiBaseUrl(), selectedResume.id, nextText);
        setSelectedResume(updatedResume);
        setEditableSanitizedText(updatedResume.sanitizedText);
        updateResumeSummary(updatedResume);
      }
      const resume = await confirmResume(getApiBaseUrl(), selectedResume.id);
      updateResumeSummary(resume);
      closePreview();
      setFormSuccess(`Резюме «${resume.title}» подтверждено. Его можно использовать для анализа вакансий.`);
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

  async function deleteResumeFromLibrary(resume: ResumeSummary) {
    if (!window.confirm(`Удалить резюме «${resume.title}»? Это действие нельзя отменить.`)) return;
    setDeletingResumeId(resume.id);
    setLibraryMessage(null);
    try {
      await deleteResume(getApiBaseUrl(), resume.id);
      setResumes((current) => current.filter((item) => item.id !== resume.id));
      if (selectedResume?.id === resume.id) closePreview();
    } catch (error) {
      setLibraryMessage(getFormErrorMessage(error));
    } finally {
      setDeletingResumeId(null);
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
        {libraryMessage !== null && <p className="form-message form-message--error" role="alert">{libraryMessage}</p>}
        {resumeState === 'ready' && resumes.length > 0 && <ul className="resume-list">{resumes.map((resume) => <li key={resume.id}><article className="resume-card"><div><h3>{resume.title}</h3><p>Загруженный файл</p></div><div className="resume-card-actions"><span className={`resume-status resume-status--${resume.sanitizationStatus.toLowerCase()}`}>{resume.sanitizationStatus === 'CONFIRMED' ? 'Подтверждено' : 'Нужна проверка'}</span><button className="button button--secondary button--small" type="button" onClick={() => void openPreview(resume.id)} disabled={deletingResumeId !== null}>Проверить</button><button className="button button--danger button--icon" type="button" aria-label={`Удалить резюме «${resume.title}»`} onClick={() => void deleteResumeFromLibrary(resume)} disabled={deletingResumeId !== null}>{deletingResumeId === resume.id ? '…' : '🗑'}</button></div></article></li>)}</ul>}
      </section>
    </section>
    {(previewState === 'loading' || selectedResume !== null || previewState === 'error') && <section className="preview-panel" aria-labelledby="preview-title">
      {previewState === 'loading' && <p role="status">Открываем обезличенную версию…</p>}
      {previewState === 'error' && <div className="library-state library-state--error" role="alert"><p>{previewMessage ?? 'Не удалось открыть резюме.'}</p></div>}
      {selectedResume !== null && previewState === 'ready' && <>
        <div className="preview-heading"><div><p className="eyebrow">ШАГ 2 ИЗ 2</p><h2 id="preview-title">Проверьте обезличенную версию</h2><p>Именно этот текст будет доступен AI после подтверждения. Исходный текст резюме не передаётся.</p></div><span className={`resume-status resume-status--${selectedResume.sanitizationStatus.toLowerCase()}`}>{selectedResume.sanitizationStatus === 'CONFIRMED' ? 'Подтверждено' : 'Черновик'}</span></div>
        <label className="field preview-editor" aria-describedby="resume-sanitized-description"><span>Обезличенная версия</span><p id="resume-sanitized-description" className="field-description">Вот что удалось извлечь из резюме. Мы постарались максимально его обезличить; если требуется, исправьте оставшиеся данные здесь.</p><textarea value={editableSanitizedText} onChange={(event) => setEditableSanitizedText(event.target.value)} rows={18} maxLength={50_000} wrap="soft" readOnly={selectedResume.sanitizationStatus === 'CONFIRMED'} disabled={isSavingPreview} /><small>{editableSanitizedText.length.toLocaleString('ru-RU')} / 50&nbsp;000 символов</small></label>
        {previewMessage !== null && <p className="form-message" role="status">{previewMessage}</p>}
        <div className="preview-actions">{selectedResume.sanitizationStatus === 'CONFIRMED' ? <><button className="button button--secondary" type="button" onClick={closePreview}>Скрыть версию</button><button className="button button--danger" type="button" onClick={() => void deleteSelectedResume()} disabled={isSavingPreview}>Удалить</button></> : <><div><button className="button button--primary" type="button" onClick={() => void confirmSelectedResume()} disabled={isSavingPreview}>{isSavingPreview ? 'Подтверждаем…' : 'Подтвердить версию*'}</button><p className="confirmation-note">* Нажимая кнопку, вы подтверждаете, что ознакомились с этой версией. <a href="/privacy-policy">Политика обработки персональных данных готовится.</a></p></div><button className="button button--danger" type="button" onClick={() => void deleteSelectedResume()} disabled={isSavingPreview}>Удалить</button></>}</div>
      </>}
    </section>}
  </>;
}

function getFormErrorMessage(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Не удалось создать черновик. Повторите попытку позже.';
}
