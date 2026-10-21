import { useEffect, useState, type FormEvent } from 'react'
import {
  logout,
  resendEmailCode,
  verifyEmailCode,
  type Account,
  type EmailVerification,
} from '../../shared/api/auth'
import { errorMessage } from '../../shared/api/client'

export function EmailCodeForm({
  initial,
  onLogin,
  onRestart,
}: {
  initial: EmailVerification
  onLogin: (account: Account) => void
  onRestart: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [remaining, setRemaining] = useState(initial.resendAfterSeconds)

  useEffect(() => {
    const interval = setInterval(
      () => setRemaining((value) => Math.max(0, value - 1)),
      1000,
    )
    return () => clearInterval(interval)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onLogin(await verifyEmailCode(code.trim()))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const next = await resendEmailCode()
      setRemaining(next.resendAfterSeconds)
      setCode('')
      setNotice('Новый код отправлен. Используйте последнее письмо.')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function restart() {
    setBusy(true)
    setError('')
    try {
      await logout()
      onRestart()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="form-card" aria-labelledby="code-heading">
      <p className="eyebrow">Вход сотрудника</p>
      <h2 id="code-heading">Проверьте почту</h2>
      <p className="muted">
        Мы отправили код на email вашего аккаунта. Введите шесть цифр из письма.
        Код действует пять минут.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          <label htmlFor="email-code">Код из письма</label>
          <input
            id="email-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <button className="primary-button" type="submit">
            {busy ? 'Подождите…' : 'Подтвердить вход'}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={remaining > 0}
            onClick={() => void resend()}
          >
            {remaining > 0
              ? `Отправить повторно через ${remaining} с`
              : 'Отправить код повторно'}
          </button>
          <button
            className="text-button restart-button"
            type="button"
            onClick={() => void restart()}
          >
            Начать вход заново
          </button>
        </fieldset>
      </form>
    </section>
  )
}
