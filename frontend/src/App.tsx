import { useCallback, useEffect, useState } from 'react'
import { AccountPage } from './features/account/AccountPage'
import { AuthForm } from './features/auth/AuthForm'
import { ProfileForm } from './features/profile/ProfileForm'
import logo from './assets/logo.svg'
import { CoordinatorWorkspace } from './features/coordination/CoordinatorWorkspace'
import {
  getSession,
  logout,
  type Account,
  type EmailVerification,
} from './shared/api/auth'
import { ApiError, errorMessage } from './shared/api/client'
import { Button } from './shared/ui/Button'
import { Card } from './shared/ui/Card'
import { Journey } from './shared/ui/Journey'
import { ThemeToggle } from './shared/ui/ThemeToggle'

export default function App() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  // onboarding — анкета сразу после регистрации; questionnaire — анкета, открытая из кабинета
  const [view, setView] = useState<'account' | 'questionnaire' | 'onboarding'>(
    'account',
  )
  // незавершённый вход сотрудника: пароль принят, ждём код с почты
  const [verification, setVerification] = useState<EmailVerification | null>(
    null,
  )
  // у кого есть обе роли, переключается между кабинетами
  const [workspace, setWorkspace] = useState<'coordination' | 'volunteer'>(
    'coordination',
  )

  useEffect(() => {
    const controller = new AbortController()
    void getSession(controller.signal)
      .then((session) => {
        if (!controller.signal.aborted) {
          setAccount(session.account)
          setVerification(session.verification)
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) {
          setAccount(null)
          setVerification(null)
          setNotice(errorMessage(error))
        } else setLoadError(errorMessage(error))
      })
    return () => controller.abort()
  }, [attempt])

  const expired = useCallback(() => {
    setAccount(null)
    setView('account')
    setVerification(null)
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
      setView('account')
      setVerification(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAccount(null)
        setVerification(null)
      }
      setNotice(errorMessage(error))
    } finally {
      setSigningOut(false)
    }
  }

  const isCoordinator = account?.roles.includes('COORDINATOR') ?? false
  const isVolunteer = account?.roles.includes('VOLUNTEER') ?? false

  return (
    <div className="page">
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
              initialVerification={verification}
              onLogin={(next, registered) => {
                setAccount(next)
                setVerification(null)
                setWorkspace('coordination')
                setView(registered ? 'onboarding' : 'account')
                setNotice(
                  registered
                    ? 'Аккаунт создан. Заполните анкету — после неё откроется личный кабинет.'
                    : '',
                )
              }}
            />
          </div>
        ) : (
          <>
            {isCoordinator && isVolunteer && (
              <nav className="workspace-tabs" aria-label="Раздел">
                <Button
                  variant="secondary"
                  size="sm"
                  aria-pressed={workspace === 'coordination'}
                  onClick={() => setWorkspace('coordination')}
                >
                  Кабинет координатора
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-pressed={workspace === 'volunteer'}
                  onClick={() => setWorkspace('volunteer')}
                >
                  Личный кабинет
                </Button>
              </nav>
            )}
            {isCoordinator && (workspace === 'coordination' || !isVolunteer) ? (
              <CoordinatorWorkspace
                key={account.id}
                onSessionExpired={expired}
              />
            ) : !isVolunteer ? (
              <p className="notice">
                Для аккаунта пока нет доступных разделов. Обратитесь к
                администратору.
              </p>
            ) : view === 'account' ? (
              <AccountPage
                key={account.id}
                account={account}
                onOpenQuestionnaire={() => {
                  setNotice('')
                  setView('questionnaire')
                }}
                onSessionExpired={expired}
              />
            ) : (
              <div className="questionnaire-view">
                {view === 'questionnaire' && (
                  <Button
                    variant="quiet"
                    size="sm"
                    className="back-link"
                    onClick={() => setView('account')}
                  >
                    Вернуться в личный кабинет
                  </Button>
                )}
                <ProfileForm
                  key={account.id}
                  email={account.email}
                  onSessionExpired={expired}
                  onSaved={() => {
                    setNotice(
                      view === 'onboarding'
                        ? 'Анкета сохранена. Это ваш личный кабинет: здесь можно поправить данные и следить за календарём.'
                        : 'Анкета сохранена.',
                    )
                    setView('account')
                  }}
                />
              </div>
            )}
          </>
        )}
      </main>
      <footer>Дети Марии · Вместе создаём пространство заботы</footer>
    </div>
  )
}
