import { useCallback, useEffect, useState } from 'react';

import { getApiBaseUrl, getApiHealth } from './api';

type ApiState = 'loading' | 'ready' | 'error';

export function App() {
  const [apiState, setApiState] = useState<ApiState>('loading');

  const checkApiHealth = useCallback(async () => {
    setApiState('loading');

    try {
      await getApiHealth(getApiBaseUrl());
      setApiState('ready');
    } catch {
      setApiState('error');
    }
  }, []);

  useEffect(() => {
    void checkApiHealth();
  }, [checkApiHealth]);

  return (
    <main>
      <h1>Job AI Assistant</h1>
      <p>Платформа для работы с вакансиями и материалами для отклика.</p>

      {apiState === 'loading' && <p role="status">Проверяем подключение к API…</p>}

      {apiState === 'ready' && (
        <p role="status">API доступен. Платформа готова к следующим шагам.</p>
      )}

      {apiState === 'error' && (
        <section aria-labelledby="api-error-title">
          <h2 id="api-error-title">Не удалось подключиться к API</h2>
          <p>Проверьте, что API запущен, и повторите попытку.</p>
          <button type="button" onClick={() => void checkApiHealth()}>
            Повторить проверку
          </button>
        </section>
      )}
    </main>
  );
}
