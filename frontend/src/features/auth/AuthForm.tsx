import { useState, type FormEvent } from 'react'
import {
  login,
  register,
  type Account,
  type EmailVerification,
} from '../../shared/api/auth'
import { ApiError, errorMessage } from '../../shared/api/client'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { EmailCodeForm } from './EmailCodeForm'

/**
 * onLogin получает registered = true, если человек только что создал аккаунт.
 * Сотрудникам после пароля сервер присылает проверку по коду из письма.
 */
export function AuthForm({
  onLogin,
  initialVerification = null,
}: {
  onLogin: (account: Account, registered: boolean) => void
  initialVerification?: EmailVerification | null
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
    const registering = mode === 'register'
    try {
      if (registering) {
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
      } else onLogin(result, registering)
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
        onLogin={(account) => onLogin(account, false)}
        onRestart={() => {
          setVerification(null)
          setNotice('')
          setMode('login')
        }}
      />
    )

  return (
    <Card tone="raised" aria-labelledby="auth-heading">
      <div
        className="mode-switch"
        data-mode={mode}
        aria-label="Вход или регистрация"
      >
        <span className="mode-switch-indicator" aria-hidden="true" />
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
      <div key={mode} className="swap-in">
        <h2 id="auth-heading">
          {mode === 'login' ? 'Рады видеть вас снова' : 'Давайте познакомимся'}
        </h2>
        <p className="muted">
          {mode === 'login'
            ? 'Войдите, чтобы открыть свою анкету.'
            : 'Создайте аккаунт, а затем расскажите немного о себе.'}
        </p>
      </div>
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
            minLength={mode === 'register' ? 8 : 1}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={!!fields.password}
            aria-describedby="password-help"
          />
          <p className="field-hint" id="password-help">
            {fields.password ||
              (mode === 'register'
                ? 'Не меньше 8 символов.'
                : 'Используйте пароль, который указали при регистрации.')}
          </p>
          {/* Поле остаётся в разметке, чтобы плавно раскрываться; при входе оно отключено и недоступно. */}
          <div
            className="reveal"
            data-open={mode === 'register'}
            inert={mode !== 'register'}
          >
            <div className="reveal-inner">
              <label htmlFor="confirmation">Повторите пароль</label>
              <input
                id="confirmation"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                required
                disabled={mode !== 'register'}
                maxLength={128}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
          </div>
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
          <Button className="form-submit" type="submit" block>
            {busy
              ? 'Подождите…'
              : mode === 'login'
                ? 'Войти'
                : 'Создать аккаунт'}
          </Button>
        </fieldset>
      </form>
    </Card>
  )
}
