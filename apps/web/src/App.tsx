import { useCallback, useEffect, useState } from 'react';

import { ApiRequestError, deleteCurrentUser, getApiBaseUrl, getCurrentUser, signOut } from './api';
import type { CurrentUser } from './api';
import { AuthScreen, AuthShell, getInitialAuthView } from './features/auth/AuthScreen';
import type { AuthView } from './features/auth/AuthScreen';
import { AuthenticatedApp } from './features/app/AuthenticatedApp';
import type { VisualTheme } from './components/ThemeToggle';

const visualThemeStorageKey = 'job-ai-assistant.visual-theme';

export function App() {
  const [sessionState, setSessionState] = useState<'loading' | 'authenticated' | 'anonymous'>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authView, setAuthView] = useState<AuthView>(() => getInitialAuthView());
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [visualTheme, setVisualTheme] = useState<VisualTheme>(() => document.documentElement.dataset.visualDirection === 'dark' ? 'dark' : 'light');

  function changeVisualTheme(theme: VisualTheme) {
    document.documentElement.dataset.visualDirection = theme;
    try { window.localStorage.setItem(visualThemeStorageKey, theme); } catch { /* Browser privacy settings can block storage. */ }
    setVisualTheme(theme);
  }

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
      setLogoutError(error instanceof ApiRequestError ? error.message : 'Не удалось выполнить действие. Повторите попытку позже.');
    }
  }

  async function handleDeleteAccount() {
    await deleteCurrentUser(getApiBaseUrl());
    setUser(null);
    setSessionState('anonymous');
    setAuthView('sign-in');
  }

  if (sessionState === 'loading') {
    return <AuthShell theme={visualTheme} onThemeChange={changeVisualTheme}><p className="auth-state" role="status">Проверяем сессию…</p></AuthShell>;
  }

  if (sessionState === 'authenticated' && user !== null && user.emailVerified) {
    return <AuthenticatedApp user={user} logoutError={logoutError} onSignOut={handleSignOut} onDeleteAccount={handleDeleteAccount} theme={visualTheme} onThemeChange={changeVisualTheme} />;
  }

  return (
    <AuthScreen
      initialView={sessionState === 'authenticated' ? 'verify-email' : authView}
      user={user}
      onAuthenticated={() => void loadSession()}
      onViewChange={setAuthView}
      theme={visualTheme}
      onThemeChange={changeVisualTheme}
    />
  );
}
