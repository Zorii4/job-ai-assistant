import { useCallback, useEffect, useState } from 'react';

import {
  ApiRequestError,
  confirmResume,
  createFileResume,
  createTextResume,
  deleteResume,
  getApiBaseUrl,
  getApiHealth,
  getResume,
  getResumes,
  updateSanitizedResume,
} from './api';
import type { ResumeDetail, ResumeSummary } from '@job-ai-assistant/contracts';

type ApiState = 'loading' | 'ready' | 'error';
type ResumeState = 'loading' | 'ready' | 'error';
type SourceMode = 'text' | 'file';

export function App() {
  const [apiState, setApiState] = useState<ApiState>('loading');
  const [resumeState, setResumeState] = useState<ResumeState>('loading');
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [sourceMode, setSourceMode] = useState<SourceMode>('text');
  const [title, setTitle] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedResume, setSelectedResume] = useState<ResumeDetail | null>(null);
  const [editableSanitizedText, setEditableSanitizedText] = useState('');
  const [previewState, setPreviewState] = useState<ResumeState>('ready');
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [isSavingPreview, setIsSavingPreview] = useState(false);

  const checkApiHealth = useCallback(async () => {
    setApiState('loading');

    try {
      await getApiHealth(getApiBaseUrl());
      setApiState('ready');
    } catch {
      setApiState('error');
    }
  }, []);

  const loadResumes = useCallback(async () => {
    setResumeState('loading');

    try {
      const nextResumes = await getResumes(getApiBaseUrl());
      setResumes(nextResumes);
      setResumeState('ready');
    } catch {
      setResumeState('error');
    }
  }, []);

  useEffect(() => {
    void checkApiHealth();
  }, [checkApiHealth]);

  useEffect(() => {
    void loadResumes();
  }, [loadResumes]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const normalizedTitle = title.trim();

    if (normalizedTitle.length === 0) {
      setFormError('Укажите название, чтобы отличать это резюме от других.');
      return;
    }

    if (sourceMode === 'text' && sourceText.trim().length === 0) {
      setFormError('Вставьте текст резюме.');
      return;
    }

    if (sourceMode === 'file' && sourceFile === null) {
      setFormError('Выберите файл в формате PDF, MD или TXT.');
      return;
    }

    setIsSubmitting(true);

    try {
      const resume =
        sourceMode === 'text'
          ? await createTextResume(getApiBaseUrl(), {
              title: normalizedTitle,
              sourceText: sourceText.trim(),
            })
          : await createFileResume(getApiBaseUrl(), {
              title: normalizedTitle,
              file: sourceFile as File,
            });

      setResumes((currentResumes) => [resume, ...currentResumes]);
      setResumeState('ready');
      setTitle('');
      setSourceText('');
      setSourceFile(null);
      setFormSuccess('Черновик создан. Следующим шагом проверьте обезличенную версию.');
      void openPreview(resume.id);
    } catch (error) {
      setFormError(getFormErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

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

  async function saveSanitizedText() {
    if (selectedResume === null) {
      return;
    }

    const nextText = editableSanitizedText.trim();

    if (nextText.length === 0) {
      setPreviewMessage('Обезличенная версия не может быть пустой.');
      return;
    }

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
    if (selectedResume === null) {
      return;
    }

    if (editableSanitizedText.trim() !== selectedResume.sanitizedText) {
      await saveSanitizedText();
      return;
    }

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
    if (
      selectedResume === null ||
      !window.confirm(`Удалить резюме «${selectedResume.title}»? Это действие нельзя отменить.`)
    ) {
      return;
    }

    setIsSavingPreview(true);
    setPreviewMessage(null);

    try {
      await deleteResume(getApiBaseUrl(), selectedResume.id);
      setResumes((currentResumes) =>
        currentResumes.filter((resume) => resume.id !== selectedResume.id),
      );
      setSelectedResume(null);
      setEditableSanitizedText('');
    } catch (error) {
      setPreviewMessage(getFormErrorMessage(error));
    } finally {
      setIsSavingPreview(false);
    }
  }

  function updateResumeSummary(resume: ResumeDetail) {
    setResumes((currentResumes) =>
      currentResumes.map((currentResume) =>
        currentResume.id === resume.id ? toResumeSummary(resume) : currentResume,
      ),
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">JOB AI ASSISTANT</p>
          <h1>Резюме</h1>
        </div>
        <p className={`connection-state connection-state--${apiState}`} role="status">
          <span aria-hidden="true" />
          {apiState === 'loading' && 'Проверяем API'}
          {apiState === 'ready' && 'API подключён'}
          {apiState === 'error' && 'Нет подключения к API'}
        </p>
      </header>

      {apiState === 'error' && (
        <section className="notice notice--error" aria-labelledby="api-error-title">
          <div>
            <h2 id="api-error-title">Не удалось подключиться к API</h2>
            <p>Проверьте, что API запущен, и повторите попытку.</p>
          </div>
          <button className="button button--secondary" type="button" onClick={() => void checkApiHealth()}>
            Повторить
          </button>
        </section>
      )}

      <section className="workspace" aria-label="Библиотека резюме">
        <section className="panel panel--form" aria-labelledby="create-resume-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ШАГ 1 ИЗ 2</p>
              <h2 id="create-resume-title">Добавить резюме</h2>
            </div>
            <p>Сначала создадим черновик, затем вы проверите данные перед использованием в AI.</p>
          </div>

          <form className="resume-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <label className="field">
              <span>Название</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder="Например, Product Manager"
                disabled={isSubmitting}
              />
            </label>

            <fieldset className="source-switch" disabled={isSubmitting}>
              <legend>Как добавить резюме</legend>
              <label>
                <input
                  type="radio"
                  name="source-mode"
                  value="text"
                  checked={sourceMode === 'text'}
                  onChange={() => setSourceMode('text')}
                />
                <span>Вставить текст</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="source-mode"
                  value="file"
                  checked={sourceMode === 'file'}
                  onChange={() => setSourceMode('file')}
                />
                <span>Загрузить файл</span>
              </label>
            </fieldset>

            {sourceMode === 'text' ? (
              <label className="field">
                <span>Текст резюме</span>
                <textarea
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  rows={10}
                  maxLength={50_000}
                  placeholder="Вставьте текст резюме целиком"
                  disabled={isSubmitting}
                />
                <small>{sourceText.length.toLocaleString('ru-RU')} / 50&nbsp;000 символов</small>
              </label>
            ) : (
              <label className="file-field">
                <span>Файл резюме</span>
                <input
                  type="file"
                  accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
                  onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
                  disabled={isSubmitting}
                />
                <strong>{sourceFile?.name ?? 'PDF, MD или TXT'}</strong>
                <small>Исходный файл будет удалён после извлечения текста.</small>
              </label>
            )}

            {formError !== null && <p className="form-message form-message--error" role="alert">{formError}</p>}
            {formSuccess !== null && <p className="form-message form-message--success" role="status">{formSuccess}</p>}

            <button className="button button--primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Создаём…' : 'Создать черновик'}
            </button>
          </form>
        </section>

        <section className="panel panel--library" aria-labelledby="resume-library-title">
          <div className="panel-heading panel-heading--library">
            <div>
              <p className="eyebrow">БИБЛИОТЕКА</p>
              <h2 id="resume-library-title">Ваши резюме</h2>
            </div>
            {resumeState === 'ready' && <span className="count-label">{resumes.length}</span>}
          </div>

          {resumeState === 'loading' && <p className="library-state" role="status">Загружаем резюме…</p>}

          {resumeState === 'error' && (
            <div className="library-state library-state--error" role="alert">
              <p>Не удалось загрузить библиотеку. Войдите в аккаунт и повторите попытку.</p>
              <button className="button button--secondary" type="button" onClick={() => void loadResumes()}>
                Повторить
              </button>
            </div>
          )}

          {resumeState === 'ready' && resumes.length === 0 && (
            <p className="library-state">Здесь появятся подготовленные резюме. Начните с формы слева.</p>
          )}

          {resumeState === 'ready' && resumes.length > 0 && (
            <ul className="resume-list">
              {resumes.map((resume) => (
                <li key={resume.id}>
                  <article className="resume-card">
                    <div>
                      <h3>{resume.title}</h3>
                      <p>{resume.sourceType === 'FILE' ? 'Загруженный файл' : 'Вставленный текст'}</p>
                    </div>
                    <div className="resume-card-actions">
                      <span className={`resume-status resume-status--${resume.sanitizationStatus.toLowerCase()}`}>
                        {resume.sanitizationStatus === 'CONFIRMED' ? 'Подтверждено' : 'Нужна проверка'}
                      </span>
                      <button
                        className="button button--secondary button--small"
                        type="button"
                        onClick={() => void openPreview(resume.id)}
                      >
                        Проверить
                      </button>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      {(previewState === 'loading' || selectedResume !== null || previewState === 'error') && (
        <section className="preview-panel" aria-labelledby="preview-title">
          {previewState === 'loading' && <p role="status">Открываем обезличенную версию…</p>}

          {previewState === 'error' && (
            <div className="library-state library-state--error" role="alert">
              <p>{previewMessage ?? 'Не удалось открыть резюме.'}</p>
            </div>
          )}

          {selectedResume !== null && previewState === 'ready' && (
            <>
              <div className="preview-heading">
                <div>
                  <p className="eyebrow">ШАГ 2 ИЗ 2</p>
                  <h2 id="preview-title">Проверьте обезличенную версию</h2>
                  <p>Именно этот текст будет доступен AI после подтверждения. Исходный текст резюме не передаётся.</p>
                </div>
                <span className={`resume-status resume-status--${selectedResume.sanitizationStatus.toLowerCase()}`}>
                  {selectedResume.sanitizationStatus === 'CONFIRMED' ? 'Подтверждено' : 'Черновик'}
                </span>
              </div>

              <label className="field preview-editor">
                <span>Обезличенный текст</span>
                <textarea
                  value={editableSanitizedText}
                  onChange={(event) => setEditableSanitizedText(event.target.value)}
                  rows={14}
                  maxLength={50_000}
                  disabled={isSavingPreview}
                />
                <small>{editableSanitizedText.length.toLocaleString('ru-RU')} / 50&nbsp;000 символов</small>
              </label>

              {previewMessage !== null && (
                <p className="form-message" role="status">{previewMessage}</p>
              )}

              <div className="preview-actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => void saveSanitizedText()}
                  disabled={isSavingPreview || editableSanitizedText.trim() === selectedResume.sanitizedText}
                >
                  {isSavingPreview ? 'Сохраняем…' : 'Сохранить изменения'}
                </button>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => void confirmSelectedResume()}
                  disabled={isSavingPreview || selectedResume.sanitizationStatus === 'CONFIRMED'}
                >
                  Подтвердить версию
                </button>
                <button
                  className="button button--danger"
                  type="button"
                  onClick={() => void deleteSelectedResume()}
                  disabled={isSavingPreview}
                >
                  Удалить
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function toResumeSummary(resume: ResumeDetail): ResumeSummary {
  const { sanitizedText: _sanitizedText, sanitizationVersion: _sanitizationVersion, ...summary } = resume;

  return summary;
}

function getFormErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }

  return 'Не удалось создать черновик. Повторите попытку позже.';
}
