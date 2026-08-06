import { useEffect, useState } from 'react';

import {
  ApiRequestError,
  getApiBaseUrl,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  signInWithPassword,
  signUpWithInvite,
} from '../../api';
import type { CurrentUser } from '../../api';

export type AuthView = 'sign-in' | 'sign-up' | 'verify-email' | 'recovery' | 'reset-password';
export function AuthScreen({
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

export function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className="auth-shell">{children}</main>;
}

export function getInitialAuthView(): AuthView {
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
