import { useCallback, useEffect, useState } from 'react';

import {
  ApiRequestError,
  confirmResume,
  createFileApplicationCase,
  createFileResume,
  deleteResume,
  getApiBaseUrl,
  getApiHealth,
  getArtifacts,
  getInitialAnalysisResult,
  getInitialAnalysisStatus,
  getResume,
  getResumes,
  launchInitialAnalysis,
  resetArtifactToGeneratedContent,
  updateArtifact,
  updateSanitizedResume,
} from '../../api';
import type { CurrentUser } from '../../api';
import type { AnalysisRunSummary, ArtifactSummary, ResumeDetail, ResumeSummary } from '@job-ai-assistant/contracts';
import { ArtifactMaterials, MarkdownReport } from './AnalysisOutput';

type ApiState = 'loading' | 'ready' | 'error';
type ResumeState = 'loading' | 'ready' | 'error';
export function ResumeLibrary({
  user,
  logoutError,
  onSignOut,
}: {
  user: CurrentUser;
  logoutError: string | null;
  onSignOut: () => Promise<void>;
}) {
  const [apiState, setApiState] = useState<ApiState>('loading');
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
  const [vacancyTitle, setVacancyTitle] = useState('');
  const [vacancyFile, setVacancyFile] = useState<File | null>(null);
  const [selectedVacancyResumeId, setSelectedVacancyResumeId] = useState('');
  const [vacancyError, setVacancyError] = useState<string | null>(null);
  const [vacancyMessage, setVacancyMessage] = useState<string | null>(null);
  const [isSubmittingVacancy, setIsSubmittingVacancy] = useState(false);
  const [analysisRun, setAnalysisRun] = useState<AnalysisRunSummary | null>(null);
  const [analysisMarkdown, setAnalysisMarkdown] = useState<string | null>(null);
  const [analysisResultError, setAnalysisResultError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [artifactDrafts, setArtifactDrafts] = useState<Record<string, string>>({});
  const [artifactStates, setArtifactStates] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});

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

  useEffect(() => {
    const confirmedResume = resumes.find((resume) => resume.sanitizationStatus === 'CONFIRMED');

    if (selectedVacancyResumeId.length === 0 && confirmedResume !== undefined) {
      setSelectedVacancyResumeId(confirmedResume.id);
    }
  }, [resumes, selectedVacancyResumeId]);

  useEffect(() => {
    if (analysisRun === null || (analysisRun.status !== 'QUEUED' && analysisRun.status !== 'RUNNING')) {
      return;
    }

    const timer = window.setInterval(() => {
      void getInitialAnalysisStatus(
        getApiBaseUrl(),
        analysisRun.applicationCaseId,
        analysisRun.id,
      )
        .then(setAnalysisRun)
        .catch((error) => setVacancyError(getFormErrorMessage(error)));
    }, 2_000);

    return () => window.clearInterval(timer);
  }, [analysisRun]);

  useEffect(() => {
    if (analysisRun === null || analysisRun.status !== 'SUCCEEDED') {
      return;
    }

    void Promise.all([
      getInitialAnalysisResult(getApiBaseUrl(), analysisRun.applicationCaseId, analysisRun.id),
      getArtifacts(getApiBaseUrl(), analysisRun.applicationCaseId),
    ])
      .then(([markdown, nextArtifacts]) => {
        setAnalysisMarkdown(markdown);
        setArtifacts(nextArtifacts);
        setArtifactDrafts(Object.fromEntries(nextArtifacts.map((artifact) => [
          artifact.id, artifact.editedContent ?? artifact.generatedContent,
        ])));
        setArtifactStates({});
        setAnalysisResultError(null);
      })
      .catch((error) => setAnalysisResultError(getFormErrorMessage(error)));
  }, [analysisRun]);

  useEffect(() => {
    if (analysisRun === null) {
      return;
    }

    const timers = artifacts.flatMap((artifact) => {
      const draft = artifactDrafts[artifact.id];
      const savedContent = artifact.editedContent ?? artifact.generatedContent;

      if (draft === undefined || draft.trim().length === 0 || draft === savedContent) {
        return [];
      }

      return [window.setTimeout(() => {
        setArtifactStates((current) => ({ ...current, [artifact.id]: 'saving' }));
        void updateArtifact(getApiBaseUrl(), analysisRun.applicationCaseId, artifact.id, draft.trim())
          .then((updatedArtifact) => {
            setArtifacts((current) => current.map((artifact_) => artifact_.id === updatedArtifact.id ? updatedArtifact : artifact_));
            setArtifactStates((current) => ({ ...current, [artifact.id]: 'saved' }));
          })
          .catch(() => setArtifactStates((current) => ({ ...current, [artifact.id]: 'error' })));
      }, 700)];
    });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [analysisRun, artifactDrafts, artifacts]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const normalizedTitle = title.trim();

    if (normalizedTitle.length === 0) {
      setFormError('Укажите название, чтобы отличать это резюме от других.');
      return;
    }

    if (sourceFile === null) {
      setFormError('Выберите файл в формате PDF, MD или TXT.');
      return;
    }

    setIsSubmitting(true);

    try {
      const resume = await createFileResume(getApiBaseUrl(), {
        title: normalizedTitle,
        file: sourceFile,
      });

      setResumes((currentResumes) => [resume, ...currentResumes]);
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

  async function submitVacancy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVacancyError(null);
    setVacancyMessage(null);

    const normalizedTitle = vacancyTitle.trim();

    if (normalizedTitle.length === 0) {
      setVacancyError('Укажите название вакансии.');
      return;
    }

    if (selectedVacancyResumeId.length === 0) {
      setVacancyError('Сначала выберите подтверждённое резюме.');
      return;
    }

    if (vacancyFile === null) {
      setVacancyError('Выберите файл вакансии в формате PDF, MD или TXT.');
      return;
    }

    setIsSubmittingVacancy(true);

    try {
      const applicationCase = await createFileApplicationCase(getApiBaseUrl(), {
        title: normalizedTitle,
        resumeId: selectedVacancyResumeId,
        file: vacancyFile,
      });
      const run = await launchInitialAnalysis(getApiBaseUrl(), applicationCase.id);

      setAnalysisRun(run);
      setAnalysisMarkdown(null);
      setAnalysisResultError(null);
      setArtifacts([]);
      setArtifactDrafts({});
      setArtifactStates({});
      setVacancyTitle('');
      setVacancyFile(null);
      setVacancyMessage('Анализ запущен. Обновляем статус автоматически.');
    } catch (error) {
      setVacancyError(getFormErrorMessage(error));
    } finally {
      setIsSubmittingVacancy(false);
    }
  }

  const confirmedResumes = resumes.filter((resume) => resume.sanitizationStatus === 'CONFIRMED');

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">JOB AI ASSISTANT</p>
          <h1>Резюме</h1>
        </div>
        <div className="header-actions">
          <p className={`connection-state connection-state--${apiState}`} role="status">
            <span aria-hidden="true" />
            {apiState === 'loading' && 'Проверяем API'}
            {apiState === 'ready' && 'API подключён'}
            {apiState === 'error' && 'Нет подключения к API'}
          </p>
          <button className="button button--secondary button--small" type="button" onClick={() => void onSignOut()}>
            Выйти ({user.email})
          </button>
        </div>
      </header>

      {logoutError !== null && <p className="form-message form-message--error" role="alert">{logoutError}</p>}

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
                      <p>Загруженный файл</p>
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

      <section className="vacancy-panel" aria-labelledby="create-vacancy-title">
        <div className="preview-heading">
          <div>
            <p className="eyebrow">СЛЕДУЮЩИЙ ШАГ</p>
            <h2 id="create-vacancy-title">Создать вакансию</h2>
            <p>Выберите подтверждённое резюме, добавьте вакансию и запустите один первоначальный анализ.</p>
          </div>
        </div>

        {confirmedResumes.length === 0 ? (
          <p className="form-message" role="status">Подтвердите хотя бы одно резюме, чтобы начать анализ вакансии.</p>
        ) : (
          <form className="resume-form" onSubmit={(event) => void submitVacancy(event)} noValidate>
            <label className="field">
              <span>Название вакансии</span>
              <input
                value={vacancyTitle}
                onChange={(event) => setVacancyTitle(event.target.value)}
                maxLength={180}
                placeholder="Например, Backend developer — Acme"
                disabled={isSubmittingVacancy}
              />
            </label>

            <label className="field">
              <span>Резюме для анализа</span>
              <select
                value={selectedVacancyResumeId}
                onChange={(event) => setSelectedVacancyResumeId(event.target.value)}
                disabled={isSubmittingVacancy}
              >
                {confirmedResumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.title}</option>)}
              </select>
            </label>
            <label className="file-field">
                <span>Файл вакансии</span>
                <input
                  type="file"
                  accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
                  onChange={(event) => setVacancyFile(event.target.files?.[0] ?? null)}
                  disabled={isSubmittingVacancy}
                />
                <strong>{vacancyFile?.name ?? 'PDF, MD или TXT'}</strong>
              </label>

            {vacancyError !== null && <p className="form-message form-message--error" role="alert">{vacancyError}</p>}
            {vacancyMessage !== null && <p className="form-message form-message--success" role="status">{vacancyMessage}</p>}

            <button className="button button--primary" type="submit" disabled={isSubmittingVacancy}>
              {isSubmittingVacancy ? 'Запускаем…' : 'Запустить анализ'}
            </button>
          </form>
        )}

        {analysisRun !== null && (
          <div className={`analysis-state analysis-state--${analysisRun.status.toLowerCase()}`} role="status">
            <p><strong>Статус анализа:</strong> {getAnalysisRunLabel(analysisRun)}</p>
            {analysisRun.status === 'FAILED' && <p>Не удалось завершить анализ. Ваш текст вакансии сохранён в черновике.</p>}
          </div>
        )}

        {analysisResultError !== null && <p className="form-message form-message--error" role="alert">{analysisResultError}</p>}
        {artifacts.length > 0 && analysisRun !== null && (
          <ArtifactMaterials
            artifacts={artifacts}
            drafts={artifactDrafts}
            states={artifactStates}
            onDraftChange={(artifactId, value) => setArtifactDrafts((current) => ({ ...current, [artifactId]: value }))}
            onReset={(artifact) => {
              if (!window.confirm('Вернуть AI-версию? Ваша ручная редакция будет удалена.')) return;

              setArtifactStates((current) => ({ ...current, [artifact.id]: 'saving' }));
              void resetArtifactToGeneratedContent(getApiBaseUrl(), analysisRun.applicationCaseId, artifact.id)
                .then((updatedArtifact) => {
                  setArtifacts((current) => current.map((artifact_) => artifact_.id === artifact.id ? updatedArtifact : artifact_));
                  setArtifactDrafts((current) => ({ ...current, [artifact.id]: updatedArtifact.generatedContent }));
                  setArtifactStates((current) => ({ ...current, [artifact.id]: 'saved' }));
                })
                .catch(() => setArtifactStates((current) => ({ ...current, [artifact.id]: 'error' })));
            }}
          />
        )}
        {analysisMarkdown !== null && <MarkdownReport markdown={analysisMarkdown} />}
      </section>
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

function getAnalysisRunLabel(analysisRun: AnalysisRunSummary): string {
  if (analysisRun.status === 'QUEUED') return 'в очереди';
  if (analysisRun.status === 'RUNNING') return analysisRun.currentStage === null ? 'выполняется' : `этап: ${analysisRun.currentStage}`;
  if (analysisRun.status === 'SUCCEEDED') return 'готов';
  return 'завершился с ошибкой';
}
