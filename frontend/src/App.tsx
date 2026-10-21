import { useCallback, useEffect, useState } from 'react'
import { CalendarPage } from './features/calendar/CalendarPage'
import { AuthForm } from './features/auth/AuthForm'
import { ProfileForm } from './features/profile/ProfileForm'
import logo from './assets/logo.svg'
import { getSession, logout, type Account } from './shared/api/auth'
import { errorMessage } from './shared/api/client'
import { Button } from './shared/ui/Button'
import { Card } from './shared/ui/Card'
import { Journey } from './shared/ui/Journey'
import { ThemeToggle } from './shared/ui/ThemeToggle'

const calendarRoute = () => window.location.pathname === '/calendar'
const noSession = () => {
  window.location.assign('/')
}

export default function App() {
  if (
    calendarRoute() &&
    new URLSearchParams(window.location.search).get('demo') === '1'
  ) {
    return (
      <div className="page page--calendar">
        <header className="header">
          <a className="brand" href="/" aria-label="Дети Марии — главная">
            <img src={logo} alt="" width="162" height="32" />
            <span>Пространство волонтёров</span>
          </a>
          <ThemeToggle />
        </header>
        <main>
          <CalendarPage demo onSessionExpired={noSession} />
        </main>
        <footer>Дети Марии · Вместе создаём пространство заботы</footer>
      </div>
    )
  }
  return <AccountApp />
}

function AccountApp() {
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
    <div className={calendarRoute() ? 'page page--calendar' : 'page'}>
      <header className="header">
        <a className="brand" href="/" aria-label="Дети Марии — главная">
          <img src={logo} alt="" width="162" height="32" />
          <span>Пространство волонтёров</span>
        </a>
        <div className="header-actions">
          <ThemeToggle />
          {account && (
            <Button
              variant="quiet"
              size="sm"
              disabled={signingOut}
              onClick={() => void signOut()}
            >
              {signingOut ? 'Выходим…' : 'Выйти'}
            </Button>
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
          <Card tone="raised">
            <h1>Не удалось открыть пространство</h1>
            <p role="alert">{loadError}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setLoadError('')
                setAttempt((value) => value + 1)
              }}
            >
              Попробовать снова
            </Button>
          </Card>
        ) : account === undefined ? (
          <p className="notice" role="status">
            Открываем пространство волонтёров…
          </p>
        ) : account === null ? (
          <div className="welcome-layout appear">
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
              <Journey
                label="Как начать"
                steps={[
                  {
                    title: 'Создайте аккаунт',
                    description: 'Нужны только email и пароль.',
                    state: 'current',
                  },
                  {
                    title: 'Заполните анкету',
                    description: 'Интересы, навыки и удобный ритм участия.',
                    state: 'upcoming',
                  },
                  {
                    title: 'Возвращайтесь и дополняйте',
                    description: 'Анкету можно менять в любой момент.',
                    state: 'upcoming',
                  },
                ]}
              />
            </section>
            <AuthForm
              onLogin={(next) => {
                setAccount(next)
                setNotice('')
              }}
            />
          </div>
        ) : calendarRoute() ? (
          <CalendarPage key={account.id} onSessionExpired={expired} />
        ) : (
          <>
            <nav className="cal-section-nav" aria-label="Личный кабинет">
              <a href="/" aria-current="page">
                Мой профиль
              </a>
              <a href="/calendar">Календарь событий</a>
            </nav>
            <ProfileForm
              key={account.id}
              email={account.email}
              onSessionExpired={expired}
            />
          </>
        )}
      </main>
      <footer>Дети Марии · Вместе создаём пространство заботы</footer>
    </div>
  )
}
