import { useCallback, useEffect, useState } from 'react';

import {
  ApiRequestError,
  confirmResume,
  createFileApplicationCase,
  createFileResume,
  createTextApplicationCase,
  createTextResume,
  deleteResume,
  getApiBaseUrl,
  getApiHealth,
  getCurrentUser,
  getInitialAnalysisResult,
  getInitialAnalysisStatus,
  getArtifacts,
  getResume,
  getResumes,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  signInWithPassword,
  signOut,
  signUpWithInvite,
  launchInitialAnalysis,
  resetArtifactToGeneratedContent,
  updateArtifact,
  updateSanitizedResume,
} from './api';
import type { CurrentUser } from './api';
import type { AnalysisRunSummary, ArtifactSummary, ResumeDetail, ResumeSummary } from '@job-ai-assistant/contracts';

type ApiState = 'loading' | 'ready' | 'error';
type ResumeState = 'loading' | 'ready' | 'error';
type SourceMode = 'text' | 'file';
type VacancySourceMode = 'text' | 'file';
type AuthView = 'sign-in' | 'sign-up' | 'verify-email' | 'recovery' | 'reset-password';

export function App() {
  const [sessionState, setSessionState] = useState<'loading' | 'authenticated' | 'anonymous'>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authView, setAuthView] = useState<AuthView>(() => getInitialAuthView());
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser(getApiBaseUrl());
      setUser(currentUser);
      setSessionState('authenticated');
      setAuthView(currentUser.emailVerified ? 'sign-in' : 'verify-email');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        setUser(null);
        setSessionState('anonymous');
        return;
      }

      setUser(null);
      setSessionState('anonymous');
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  async function handleSignOut() {
    try {
      await signOut(getApiBaseUrl());
      setUser(null);
      setSessionState('anonymous');
      setAuthView('sign-in');
      setLogoutError(null);
    } catch (error) {
      setLogoutError(getAuthErrorMessage(error));
    }
  }

  if (sessionState === 'loading') {
    return <AuthShell><p className="auth-state" role="status">Проверяем сессию…</p></AuthShell>;
  }

  if (sessionState === 'authenticated' && user !== null && user.emailVerified) {
    return <ResumeLibrary user={user} logoutError={logoutError} onSignOut={handleSignOut} />;
  }

  return (
    <AuthScreen
      initialView={sessionState === 'authenticated' ? 'verify-email' : authView}
      user={user}
      onAuthenticated={() => void loadSession()}
      onViewChange={setAuthView}
    />
  );
}

function ResumeLibrary({
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
  const [vacancySourceMode, setVacancySourceMode] = useState<VacancySourceMode>('text');
  const [vacancyTitle, setVacancyTitle] = useState('');
  const [vacancyText, setVacancyText] = useState('');
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

    if (vacancySourceMode === 'text' && vacancyText.trim().length === 0) {
      setVacancyError('Вставьте текст вакансии.');
      return;
    }

    if (vacancySourceMode === 'file' && vacancyFile === null) {
      setVacancyError('Выберите файл вакансии в формате PDF, MD или TXT.');
      return;
    }

    setIsSubmittingVacancy(true);

    try {
      const applicationCase = vacancySourceMode === 'text'
        ? await createTextApplicationCase(getApiBaseUrl(), {
            title: normalizedTitle,
            resumeId: selectedVacancyResumeId,
            vacancyText: vacancyText.trim(),
          })
        : await createFileApplicationCase(getApiBaseUrl(), {
            title: normalizedTitle,
            resumeId: selectedVacancyResumeId,
            file: vacancyFile as File,
          });
      const run = await launchInitialAnalysis(getApiBaseUrl(), applicationCase.id);

      setAnalysisRun(run);
      setAnalysisMarkdown(null);
      setAnalysisResultError(null);
      setArtifacts([]);
      setArtifactDrafts({});
      setArtifactStates({});
      setVacancyTitle('');
      setVacancyText('');
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

            <fieldset className="source-switch" disabled={isSubmittingVacancy}>
              <legend>Как добавить вакансию</legend>
              <label>
                <input type="radio" name="vacancy-source-mode" checked={vacancySourceMode === 'text'} onChange={() => setVacancySourceMode('text')} />
                <span>Вставить текст</span>
              </label>
              <label>
                <input type="radio" name="vacancy-source-mode" checked={vacancySourceMode === 'file'} onChange={() => setVacancySourceMode('file')} />
                <span>Загрузить файл</span>
              </label>
            </fieldset>

            {vacancySourceMode === 'text' ? (
              <label className="field">
                <span>Текст вакансии</span>
                <textarea
                  value={vacancyText}
                  onChange={(event) => setVacancyText(event.target.value)}
                  rows={10}
                  maxLength={50_000}
                  placeholder="Вставьте текст вакансии целиком"
                  disabled={isSubmittingVacancy}
                />
                <small>{vacancyText.length.toLocaleString('ru-RU')} / 50&nbsp;000 символов</small>
              </label>
            ) : (
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
            )}

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

function AuthScreen({
  initialView,
  user,
  onAuthenticated,
  onViewChange,
}: {
  initialView: AuthView;
  user: CurrentUser | null;
  onAuthenticated: () => void;
  onViewChange: (view: AuthView) => void;
}) {
  const [view, setView] = useState<AuthView>(initialView);
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState('');
  const [inviteId, setInviteId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(
    getAuthCallbackMessage(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  function changeView(nextView: AuthView) {
    setError(null);
    setMessage(null);
    setPassword('');
    setPasswordConfirmation('');
    setView(nextView);
    onViewChange(nextView);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (view !== 'reset-password' && !normalizedEmail) {
      setError('Укажите email.');
      return;
    }
    if ((view === 'sign-in' || view === 'sign-up' || view === 'reset-password') && password.length < 8) {
      setError('Пароль должен содержать не менее 8 символов.');
      return;
    }
    if ((view === 'sign-up' || view === 'reset-password') && password !== passwordConfirmation) {
      setError('Пароли не совпадают.');
      return;
    }
    if (view === 'sign-up' && (!name.trim() || !inviteId.trim())) {
      setError('Укажите имя и код инвайта.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (view === 'sign-up') {
        await signUpWithInvite(getApiBaseUrl(), {
          name: name.trim(),
          email: normalizedEmail,
          password,
          inviteId: inviteId.trim(),
        });
        setEmail(normalizedEmail);
        changeView('verify-email');
        setMessage('Регистрация завершена. Проверьте почту и подтвердите адрес, чтобы войти.');
      } else if (view === 'sign-in') {
        await signInWithPassword(getApiBaseUrl(), { email: normalizedEmail, password });
        onAuthenticated();
      } else if (view === 'verify-email') {
        await sendVerificationEmail(getApiBaseUrl(), normalizedEmail);
        setMessage('Новое письмо с подтверждением отправлено.');
      } else if (view === 'recovery') {
        await requestPasswordReset(getApiBaseUrl(), normalizedEmail);
        setMessage('Если этот адрес зарегистрирован, письмо для восстановления уже отправлено.');
      } else {
        const token = new URLSearchParams(window.location.search).get('token');
        if (token === null) {
          setError('Ссылка для восстановления недействительна или устарела.');
          return;
        }
        await resetPassword(getApiBaseUrl(), token, password);
        changeView('sign-in');
        setMessage('Пароль изменён. Войдите с новым паролем.');
      }
    } catch (submissionError) {
      setError(getAuthErrorMessage(submissionError));
    } finally {
      setIsSubmitting(false);
    }
  }

  const heading = {
    'sign-in': 'Вход в аккаунт',
    'sign-up': 'Регистрация по инвайту',
    'verify-email': 'Подтвердите email',
    recovery: 'Восстановление доступа',
    'reset-password': 'Новый пароль',
  }[view];

  return (
    <AuthShell>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-heading">
          <p className="eyebrow">ЗАЩИЩЁННЫЙ ДОСТУП</p>
          <h1 id="auth-title">{heading}</h1>
          <p>{getAuthDescription(view)}</p>
        </div>

        <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
          {view === 'sign-up' && (
            <>
              <label className="field"><span>Имя</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" disabled={isSubmitting} /></label>
              <label className="field"><span>Код инвайта</span><input value={inviteId} onChange={(event) => setInviteId(event.target.value)} autoComplete="off" disabled={isSubmitting} /></label>
            </>
          )}

          {view !== 'reset-password' && (
            <label className="field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" disabled={isSubmitting || view === 'verify-email'} /></label>
          )}

          {(view === 'sign-in' || view === 'sign-up' || view === 'reset-password') && (
            <label className="field"><span>{view === 'reset-password' ? 'Новый пароль' : 'Пароль'}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={view === 'reset-password' ? 'new-password' : view === 'sign-up' ? 'new-password' : 'current-password'} disabled={isSubmitting} /></label>
          )}

          {(view === 'sign-up' || view === 'reset-password') && (
            <label className="field"><span>Повторите пароль</span><input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" disabled={isSubmitting} /></label>
          )}

          {error !== null && <p className="form-message form-message--error" role="alert">{error}</p>}
          {message !== null && <p className="form-message form-message--success" role="status">{message}</p>}

          <button className="button button--primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Подождите…' : getAuthActionLabel(view)}
          </button>
        </form>

        <nav className="auth-links" aria-label="Действия с аккаунтом">
          {view !== 'sign-in' && <button type="button" onClick={() => changeView('sign-in')}>Войти</button>}
          {view !== 'sign-up' && view !== 'verify-email' && <button type="button" onClick={() => changeView('sign-up')}>Есть инвайт</button>}
          {view !== 'recovery' && view !== 'verify-email' && <button type="button" onClick={() => changeView('recovery')}>Забыли пароль?</button>}
        </nav>
      </section>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className="auth-shell">{children}</main>;
}

function getInitialAuthView(): AuthView {
  const params = new URLSearchParams(window.location.search);
  return params.get('auth') === 'reset-password' ? 'reset-password' : 'sign-in';
}

function getAuthCallbackMessage(): string | null {
  return new URLSearchParams(window.location.search).get('auth') === 'verified'
    ? 'Email подтверждён. Теперь войдите в аккаунт.'
    : null;
}

function getAuthDescription(view: AuthView): string {
  switch (view) {
    case 'sign-up': return 'Введите код, полученный от владельца сервиса. После регистрации подтвердите email.';
    case 'verify-email': return 'Мы отправим ссылку на указанный адрес. Без подтверждения доступ к данным закрыт.';
    case 'recovery': return 'Мы отправим одноразовую ссылку для выбора нового пароля.';
    case 'reset-password': return 'Задайте новый пароль. Все предыдущие сессии будут отозваны.';
    default: return 'Войдите, чтобы работать со своей библиотекой резюме.';
  }
}

function getAuthActionLabel(view: AuthView): string {
  return { 'sign-in': 'Войти', 'sign-up': 'Зарегистрироваться', 'verify-email': 'Отправить письмо ещё раз', recovery: 'Отправить ссылку', 'reset-password': 'Сохранить пароль' }[view];
}

function getAuthErrorMessage(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Не удалось выполнить действие. Повторите попытку позже.';
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

function MarkdownReport({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <section className="analysis-report" aria-labelledby="analysis-report-title">
      <h2 id="analysis-report-title">Результат анализа</h2>
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        const heading = /^(#{1,3})\s+(.+)$/.exec(lines[0] ?? '');

        if (heading !== null) {
          const content = heading[2];
          if (heading[1].length === 1) return <h3 key={index}>{content}</h3>;
          return <h4 key={index}>{content}</h4>;
        }

        if (lines.every((line) => line.startsWith('- '))) {
          return <ul key={index}>{lines.map((line) => <li key={line}>{line.slice(2)}</li>)}</ul>;
        }

        return <p key={index}>{block}</p>;
      })}
    </section>
  );
}

function ArtifactMaterials({
  artifacts, drafts, states, onDraftChange, onReset,
}: {
  artifacts: ArtifactSummary[];
  drafts: Record<string, string>;
  states: Record<string, 'saving' | 'saved' | 'error'>;
  onDraftChange: (artifactId: string, value: string) => void;
  onReset: (artifact: ArtifactSummary) => void;
}) {
  return (
    <section className="artifact-materials" aria-labelledby="artifact-materials-title">
      <div className="artifact-materials-heading">
        <div>
          <p className="eyebrow">МАТЕРИАЛЫ</p>
          <h2 id="artifact-materials-title">Черновики для следующего шага</h2>
        </div>
        <p>Изменения сохраняются автоматически.</p>
      </div>
      <p className="material-warning" role="note">
        <span>WARNING · CONDITIONAL</span>
        Материалы готовы. Проверьте отмеченные AI-предположения перед отправкой. Отправка остаётся ручным действием пользователя.
      </p>
      <div className="artifact-list">
        {artifacts.map((artifact) => (
          <article className="artifact-card" key={artifact.id}>
            <div className="artifact-card-heading">
              <h3>{getArtifactTitle(artifact.type)}</h3>
              <p className={`artifact-save-state artifact-save-state--${states[artifact.id] ?? 'saved'}`} role="status">
                {getArtifactStateLabel(states[artifact.id] ?? 'saved')}
              </p>
            </div>
            <label className="field">
              <span className="sr-only">{getArtifactTitle(artifact.type)}</span>
              <textarea
                value={drafts[artifact.id] ?? artifact.editedContent ?? artifact.generatedContent}
                onChange={(event) => onDraftChange(artifact.id, event.target.value)}
                rows={8}
                maxLength={50_000}
              />
            </label>
            {artifact.editedContent !== null && (
              <button className="button button--secondary" type="button" onClick={() => onReset(artifact)} disabled={states[artifact.id] === 'saving'}>
                {states[artifact.id] === 'saving' ? 'Возвращаем…' : 'Вернуть AI-версию'}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function getArtifactTitle(type: ArtifactSummary['type']): string {
  return {
    RESUME_RECOMMENDATIONS: 'Блоки для резюме',
    COVER_LETTER: 'Сопроводительное письмо',
    RECRUITER_MESSAGE: 'Сообщение рекрутеру',
    FOLLOW_UP: 'Follow-up',
  }[type];
}

function getArtifactStateLabel(state: 'saving' | 'saved' | 'error'): string {
  if (state === 'saving') return 'Сохраняем…';
  if (state === 'error') return 'Не удалось сохранить';
  return 'Сохранено';
}
