import { useState, type FormEvent } from 'react'
import {
  login,
  register,
  type Account,
  type EmailVerification,
} from '../../shared/api/auth'
import { ApiError, errorMessage } from '../../shared/api/client'
import { EmailCodeForm } from './EmailCodeForm'

export function AuthForm({
  onLogin,
  initialVerification,
}: {
  onLogin: (account: Account) => void
  initialVerification: EmailVerification | null
}) {
  const [verification, setVerification] = useState(initialVerification)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    setFields({})
    setNotice('')
    if (mode === 'register' && password !== confirmation) {
      setError('Пароли не совпадают. Проверьте повтор пароля.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'register') {
        await register(email.trim(), password)
        setMode('login')
        setNotice(
          'Аккаунт создан. Если вход прервётся, используйте указанные email и пароль.',
        )
      }
      const result = await login(email.trim(), password)
      if ('verificationRequired' in result) {
        setPassword('')
        setConfirmation('')
        setVerification(result)
      } else onLogin(result)
    } catch (cause) {
      setError(errorMessage(cause))
      if (cause instanceof ApiError) setFields(cause.fields)
    } finally {
      setBusy(false)
    }
  }

  if (verification)
    return (
      <EmailCodeForm
        initial={verification}
        onLogin={onLogin}
        onRestart={() => {
          setVerification(null)
          setNotice('')
          setMode('login')
        }}
      />
    )

  return (
    <section className="form-card" aria-labelledby="auth-heading">
      <div className="mode-switch" aria-label="Вход или регистрация">
        <button
          type="button"
          aria-pressed={mode === 'login'}
          disabled={busy}
          onClick={() => {
            setMode('login')
            setError('')
            setFields({})
            setNotice('')
          }}
        >
          Вход
        </button>
        <button
          type="button"
          aria-pressed={mode === 'register'}
          disabled={busy}
          onClick={() => {
            setMode('register')
            setError('')
            setFields({})
            setNotice('')
          }}
        >
          Регистрация
        </button>
      </div>
      <h2 id="auth-heading">
        {mode === 'login' ? 'Рады видеть вас снова' : 'Давайте познакомимся'}
      </h2>
      <p className="muted">
        {mode === 'login'
          ? 'Войдите, чтобы открыть свою анкету.'
          : 'Создайте аккаунт, а затем расскажите немного о себе.'}
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={!!fields.email}
            aria-describedby={fields.email ? 'email-error' : undefined}
          />
          {fields.email && (
            <p className="field-error" id="email-error">
              {fields.email}
            </p>
          )}
          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={
              mode === 'register' ? 'new-password' : 'current-password'
            }
            required
            minLength={mode === 'register' ? 15 : 1}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={!!fields.password}
            aria-describedby="password-help"
          />
          <p className="field-hint" id="password-help">
            {fields.password ||
              (mode === 'register'
                ? 'От 15 до 128 символов. Можно использовать длинную фразу.'
                : 'Используйте пароль, который указали при регистрации.')}
          </p>
          {mode === 'register' && (
            <>
              <label htmlFor="confirmation">Повторите пароль</label>
              <input
                id="confirmation"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                required
                maxLength={128}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" type="submit">
            {busy
              ? 'Подождите…'
              : mode === 'login'
                ? 'Войти'
                : 'Создать аккаунт'}
          </button>
        </fieldset>
      </form>
    </section>
  )
}
