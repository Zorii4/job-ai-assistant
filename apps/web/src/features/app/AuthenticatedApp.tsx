import { useCallback, useEffect, useState } from 'react';

import { getApiBaseUrl, getApiHealth } from '../../api';
import type { CurrentUser } from '../../api';
import { getAppRoutePath } from '../../routing';
import { AnalysisResultPage } from '../analyses/AnalysisResultPage';
import { CreateVacancyPage } from '../applications/CreateVacancyPage';
import { useAppRouter } from '../navigation/useAppRouter';
import { PrivacyPolicyPlaceholderPage } from '../privacy/PrivacyPolicyPlaceholderPage';
import { ResumeLibrary } from '../resumes/ResumeLibrary';
import { ThemeToggle } from '../../components/ThemeToggle';
import type { VisualTheme } from '../../components/ThemeToggle';

type ApiState = 'loading' | 'ready' | 'error';

export function AuthenticatedApp({ user, logoutError, onSignOut, onDeleteAccount, theme, onThemeChange }: { user: CurrentUser; logoutError: string | null; onSignOut: () => Promise<void>; onDeleteAccount: () => Promise<void>; theme: VisualTheme; onThemeChange: (theme: VisualTheme) => void }) {
  const { route, navigate } = useAppRouter();
  const [apiState, setApiState] = useState<ApiState>('loading');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const checkApiHealth = useCallback(async () => {
    setApiState('loading');
    try { await getApiHealth(getApiBaseUrl()); setApiState('ready'); } catch { setApiState('error'); }
  }, []);
  useEffect(() => { void checkApiHealth(); }, [checkApiHealth]);
  const handleAnalysisCreated = (applicationCaseId: string, runId: string) => {
    navigate({ name: 'analysis-result', applicationCaseId, runId });
  };
  async function deleteAccount() {
    setDeleteAccountError(null);
    setIsDeletingAccount(true);
    try { await onDeleteAccount(); } catch { setDeleteAccountError('Не удалось удалить аккаунт. Повторите попытку позже.'); setIsDeletingAccount(false); }
  }

  return <main className="app-shell">
    <header className="app-header">
      <div><p className="eyebrow">JOB AI ASSISTANT</p><nav className="app-nav" aria-label="Основная навигация"><button className="nav-link" type="button" aria-current={route.name === 'resumes' ? 'page' : undefined} onClick={() => navigate({ name: 'resumes' })}>Резюме</button><button className="nav-link" type="button" aria-current={route.name === 'new-application' ? 'page' : undefined} onClick={() => navigate({ name: 'new-application' })}>Новая вакансия</button></nav></div>
      <div className="header-actions"><ThemeToggle theme={theme} onChange={onThemeChange} /><p className={`connection-state connection-state--${apiState}`} role="status"><span aria-hidden="true" />{apiState === 'loading' && 'Проверяем API'}{apiState === 'ready' && 'API подключён'}{apiState === 'error' && 'Нет подключения к API'}</p><button className="button button--secondary button--small" type="button" onClick={() => void onSignOut()}>Выйти ({user.email})</button></div>
    </header>
    {logoutError !== null && <p className="form-message form-message--error" role="alert">{logoutError}</p>}
    <section className="account-danger-zone" aria-labelledby="delete-account-title"><h2 id="delete-account-title">Удаление аккаунта</h2><p>Будут безвозвратно удалены все резюме, вакансии, результаты, материалы и активные сессии.</p><label className="field"><span>Введите «УДАЛИТЬ АККАУНТ»</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} disabled={isDeletingAccount} /></label>{deleteAccountError !== null && <p className="form-message form-message--error" role="alert">{deleteAccountError}</p>}<button className="button button--danger" type="button" disabled={deleteConfirmation !== 'УДАЛИТЬ АККАУНТ' || isDeletingAccount} onClick={() => void deleteAccount()}>{isDeletingAccount ? 'Удаляем…' : 'Удалить аккаунт'}</button></section>
    {apiState === 'error' && <section className="notice notice--error" aria-labelledby="api-error-title"><div><h2 id="api-error-title">Не удалось подключиться к API</h2><p>Проверьте, что API запущен, и повторите попытку.</p></div><button className="button button--secondary" type="button" onClick={() => void checkApiHealth()}>Повторить</button></section>}
    {route.name === 'resumes' && <ResumeLibrary />}
    {route.name === 'new-application' && <CreateVacancyPage onCreated={handleAnalysisCreated} onOpenAnalysis={handleAnalysisCreated} />}
    {route.name === 'analysis-result' && <AnalysisResultPage applicationCaseId={route.applicationCaseId} runId={route.runId} />}
    {route.name === 'privacy-policy' && <PrivacyPolicyPlaceholderPage onBack={() => navigate({ name: 'resumes' })} />}
    {route.name === 'not-found' && <section className="empty-page"><h1>Страница не найдена</h1><p>Проверьте адрес или вернитесь в библиотеку резюме.</p><button className="button button--primary" type="button" onClick={() => navigate({ name: 'resumes' })}>Открыть резюме</button></section>}
  </main>;
}

export function getResultPath(applicationCaseId: string, runId: string) {
  return getAppRoutePath({ name: 'analysis-result', applicationCaseId, runId });
}
