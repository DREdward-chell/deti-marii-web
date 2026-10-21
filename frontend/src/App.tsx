import { useCallback, useEffect, useState } from 'react'
import { AuthForm } from './features/auth/AuthForm'
import { ProfileForm } from './features/profile/ProfileForm'
import { getSession, logout, type Account } from './shared/api/auth'
import { errorMessage } from './shared/api/client'

export default function App() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void getSession(controller.signal)
      .then((session) => {
        if (!controller.signal.aborted) setAccount(session)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(error))
      })
    return () => controller.abort()
  }, [attempt])

  const expired = useCallback(() => {
    setAccount(null)
    setNotice(
      'Сессия завершилась. Войдите ещё раз. Несохранённые изменения не отправлены.',
    )
  }, [])

  async function signOut() {
    setSigningOut(true)
    setNotice('')
    try {
      await logout()
      setAccount(null)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <a className="brand" href="/" aria-label="Дети Марии — главная">
          Дети Марии<span>Благотворительный фонд</span>
        </a>
        <div className="header-actions">
          <span className="preview-label">Прототип</span>
          {account && (
            <button
              className="text-button"
              disabled={signingOut}
              onClick={() => void signOut()}
            >
              {signingOut ? 'Выходим…' : 'Выйти'}
            </button>
          )}
        </div>
      </header>
      <main>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {loadError ? (
          <section className="form-card">
            <h1>Не удалось открыть пространство</h1>
            <p role="alert">{loadError}</p>
            <button
              className="secondary-button"
              onClick={() => {
                setLoadError('')
                setAttempt((value) => value + 1)
              }}
            >
              Попробовать снова
            </button>
          </section>
        ) : account === undefined ? (
          <p className="notice" role="status">
            Открываем пространство волонтёров…
          </p>
        ) : account === null ? (
          <div className="welcome-layout">
            <section className="welcome-copy">
              <p className="eyebrow">Помощь начинается со знакомства</p>
              <h1>
                У каждого есть
                <br />
                своё доброе дело.
              </h1>
              <p className="intro">
                Расскажите о себе, своих интересах и удобном ритме участия в
                жизни фонда.
              </p>
              <ol className="journey">
                <li>Создайте аккаунт</li>
                <li>Заполните анкету</li>
                <li>Возвращайтесь и дополняйте</li>
              </ol>
            </section>
            <AuthForm
              onLogin={(next) => {
                setAccount(next)
                setNotice('')
              }}
            />
          </div>
        ) : (
          <ProfileForm
            key={account.id}
            email={account.email}
            onSessionExpired={expired}
          />
        )}
      </main>
      <footer>Дети Марии · Вместе создаём пространство заботы</footer>
    </div>
  )
}
