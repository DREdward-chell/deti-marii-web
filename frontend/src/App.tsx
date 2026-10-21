import { useCallback, useEffect, useState } from 'react'
import { CourseWorkspace } from './features/learning/CourseWorkspace'
import { LearningWorkspace } from './features/learning/LearningWorkspace'
import { OpportunityWorkspace } from './features/opportunities/OpportunityWorkspace'
import { OpportunityCatalog } from './features/opportunities/OpportunityCatalog'
import { AuthForm } from './features/auth/AuthForm'
import { ProfileForm } from './features/profile/ProfileForm'
import {
  getSession,
  logout,
  type Account,
  type EmailVerification,
} from './shared/api/auth'
import { ApiError, errorMessage } from './shared/api/client'
import { CoordinatorWorkspace } from './features/coordination/CoordinatorWorkspace'

export default function App() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [workspaceNavigationBlocked, setWorkspaceNavigationBlocked] =
    useState(false)
  const [verification, setVerification] = useState<EmailVerification | null>(
    null,
  )
  const [workspace, setWorkspace] = useState<
    | 'coordination'
    | 'profile'
    | 'courses'
    | 'learning'
    | 'opportunities'
    | 'catalog'
  >('coordination')

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
              disabled={signingOut || workspaceNavigationBlocked}
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
              initialVerification={verification}
              onLogin={(next) => {
                setAccount(next)
                setVerification(null)
                setWorkspace('coordination')
                setNotice('')
              }}
            />
          </div>
        ) : (
          <>
            <nav className="workspace-tabs" aria-label="Раздел кабинета">
              {account.roles.includes('COORDINATOR') && (
                <>
                  <button
                    className="secondary-button"
                    aria-pressed={workspace === 'coordination'}
                    disabled={workspaceNavigationBlocked}
                    onClick={() => setWorkspace('coordination')}
                  >
                    Кабинет координатора
                  </button>
                  <button
                    className="secondary-button"
                    aria-pressed={workspace === 'courses'}
                    disabled={workspaceNavigationBlocked}
                    onClick={() => setWorkspace('courses')}
                  >
                    Учебные маршруты
                  </button>
                  <button
                    className="secondary-button"
                    aria-pressed={workspace === 'opportunities'}
                    disabled={workspaceNavigationBlocked}
                    onClick={() => setWorkspace('opportunities')}
                  >
                    Возможности помощи
                  </button>
                </>
              )}
              {account.roles.includes('VOLUNTEER') && (
                <>
                  <button
                    className="secondary-button"
                    aria-pressed={
                      workspace === 'profile' ||
                      (workspace === 'coordination' &&
                        !account.roles.includes('COORDINATOR'))
                    }
                    disabled={workspaceNavigationBlocked}
                    onClick={() => setWorkspace('profile')}
                  >
                    Моя анкета
                  </button>
                  <button
                    className="secondary-button"
                    aria-pressed={workspace === 'learning'}
                    disabled={workspaceNavigationBlocked}
                    onClick={() => setWorkspace('learning')}
                  >
                    Моё обучение
                  </button>
                  <button
                    className="secondary-button"
                    aria-pressed={workspace === 'catalog'}
                    disabled={workspaceNavigationBlocked}
                    onClick={() => setWorkspace('catalog')}
                  >
                    Найти дело
                  </button>
                </>
              )}
            </nav>
            {workspace === 'opportunities' &&
            account.roles.includes('COORDINATOR') ? (
              <OpportunityWorkspace
                key={account.id}
                onSessionExpired={expired}
                onNavigationBlocked={setWorkspaceNavigationBlocked}
              />
            ) : workspace === 'catalog' &&
              account.roles.includes('VOLUNTEER') ? (
              <OpportunityCatalog key={account.id} onSessionExpired={expired} />
            ) : workspace === 'courses' &&
              account.roles.includes('COORDINATOR') ? (
              <CourseWorkspace
                key={account.id}
                onSessionExpired={expired}
                onNavigationBlocked={setWorkspaceNavigationBlocked}
              />
            ) : workspace === 'learning' &&
              account.roles.includes('VOLUNTEER') ? (
              <LearningWorkspace key={account.id} onSessionExpired={expired} />
            ) : account.roles.includes('COORDINATOR') &&
              (workspace === 'coordination' ||
                !account.roles.includes('VOLUNTEER')) ? (
              <CoordinatorWorkspace
                key={account.id}
                onSessionExpired={expired}
              />
            ) : account.roles.includes('VOLUNTEER') ? (
              <ProfileForm
                key={account.id}
                email={account.email}
                onSessionExpired={expired}
              />
            ) : (
              <p className="notice">
                Для аккаунта пока нет доступных разделов. Обратитесь к
                администратору.
              </p>
            )}
          </>
        )}
      </main>
      <footer>Дети Марии · Вместе создаём пространство заботы</footer>
    </div>
  )
}
