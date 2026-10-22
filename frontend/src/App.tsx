import { useCallback, useEffect, useState } from 'react'
import { AccountPage } from './features/account/AccountPage'
import { AuthForm } from './features/auth/AuthForm'
import { CalendarPage } from './features/calendar/CalendarPage'
import { CoordinatorWorkspace } from './features/coordination/CoordinatorWorkspace'
import { CourseWorkspace } from './features/learning/CourseWorkspace'
import { LearningWorkspace } from './features/learning/LearningWorkspace'
import { OpportunityCatalog } from './features/opportunities/OpportunityCatalog'
import { OpportunityWorkspace } from './features/opportunities/OpportunityWorkspace'
import { LearningPage } from './features/learning/LearningPage'
import { ProfileForm } from './features/profile/ProfileForm'
import logo from './assets/logo.svg'
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

const calendarRoute = () => window.location.pathname === '/calendar'
const learningRoute = () => window.location.pathname === '/learning'
const demoCalendar = () =>
  calendarRoute() &&
  new URLSearchParams(window.location.search).get('demo') === '1'
const leaveDemo = () => window.location.assign('/')

type Workspace =
  | 'coordination'
  | 'volunteer'
  | 'courses'
  | 'opportunities'
  | 'learning'
  | 'catalog'

export default function App() {
  // Демо-календарь на вымышленных событиях открывается без входа и сервера.
  if (demoCalendar())
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
          <CalendarPage demo onSessionExpired={leaveDemo} />
        </main>
        <footer>Дети Марии · Вместе создаём пространство заботы</footer>
      </div>
    )
  return <AccountApp />
}

function AccountApp() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  // onboarding — анкета сразу после регистрации; questionnaire — анкета, открытая из кабинета
  const [view, setView] = useState<'account' | 'questionnaire' | 'onboarding'>(
    'account',
  )
  // Незавершённый вход сотрудника: пароль принят, ждём код из письма.
  const [verification, setVerification] = useState<EmailVerification | null>(
    null,
  )
  // У кого есть обе роли, выбирает раздел; координатор начинает со своего.
  const [workspace, setWorkspace] = useState<Workspace>('coordination')
  // Редакторы курса и возможностей не дают уйти с несохранёнными правками.
  const [navigationBlocked, setNavigationBlocked] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void getSession(controller.signal)
      .then((session) => {
        if (controller.signal.aborted) return
        setAccount(session.account)
        setVerification(session.verification)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // Сессию отозвали до загрузки страницы — это не сбой, а повод войти заново.
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
    setView('account')
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
      setView('account')
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
              disabled={signingOut || navigationBlocked}
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
        ) : calendarRoute() ? (
          <CalendarPage key={account.id} onSessionExpired={expired} />
        ) : learningRoute() ? (
          <LearningPage
            key={account.id}
            accountId={account.id}
            email={account.email}
          />
        ) : (workspace === 'courses' || workspace === 'opportunities') &&
          account.roles.includes('COORDINATOR') ? (
          <>
            <WorkspaceTabs
              account={account}
              workspace={workspace}
              blocked={navigationBlocked}
              onChange={setWorkspace}
            />
            {workspace === 'courses' ? (
              <CourseWorkspace
                key={account.id}
                onSessionExpired={expired}
                onNavigationBlocked={setNavigationBlocked}
              />
            ) : (
              <OpportunityWorkspace
                key={account.id}
                onSessionExpired={expired}
                onNavigationBlocked={setNavigationBlocked}
              />
            )}
          </>
        ) : (workspace === 'learning' || workspace === 'catalog') &&
          account.roles.includes('VOLUNTEER') ? (
          <>
            <WorkspaceTabs
              account={account}
              workspace={workspace}
              blocked={navigationBlocked}
              onChange={setWorkspace}
            />
            {workspace === 'learning' ? (
              <LearningWorkspace key={account.id} onSessionExpired={expired} />
            ) : (
              <OpportunityCatalog key={account.id} onSessionExpired={expired} />
            )}
          </>
        ) : account.roles.includes('COORDINATOR') &&
          (workspace === 'coordination' ||
            !account.roles.includes('VOLUNTEER')) ? (
          <>
            <WorkspaceTabs
              account={account}
              workspace={workspace}
              blocked={navigationBlocked}
              onChange={setWorkspace}
            />
            <CoordinatorWorkspace
              key={account.id}
              account={account}
              onSessionExpired={expired}
            />
          </>
        ) : !account.roles.includes('VOLUNTEER') ? (
          <p className="notice">
            Для аккаунта пока нет доступных разделов. Обратитесь к
            администратору.
          </p>
        ) : view === 'account' ? (
          <>
            <WorkspaceTabs
              account={account}
              workspace={workspace}
              blocked={navigationBlocked}
              onChange={setWorkspace}
            />
            <AccountPage
              key={account.id}
              account={account}
              onOpenQuestionnaire={() => {
                setNotice('')
                setView('questionnaire')
              }}
              onSessionExpired={expired}
            />
          </>
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
      </main>
      <footer>Дети Марии · Вместе создаём пространство заботы</footer>
    </div>
  )
}

/** Разделы кабинета: координатор — анкеты, учебные маршруты и возможности; волонтёр — кабинет, обучение и поиск дела. */
function WorkspaceTabs({
  account,
  workspace,
  blocked,
  onChange,
}: {
  account: Account
  workspace: Workspace
  blocked: boolean
  onChange: (workspace: Workspace) => void
}) {
  const coordinator = account.roles.includes('COORDINATOR')
  const volunteer = account.roles.includes('VOLUNTEER')
  const tabs: [Workspace, string][] = [
    ...(coordinator
      ? ([
          ['coordination', 'Кабинет координатора'],
          ['courses', 'Учебные маршруты'],
          ['opportunities', 'Возможности помощи'],
        ] as [Workspace, string][])
      : []),
    ...(volunteer
      ? ([
          ['volunteer', 'Моя анкета'],
          ['learning', 'Моё обучение'],
          ['catalog', 'Найти дело'],
        ] as [Workspace, string][])
      : []),
  ]
  // Волонтёр без роли координатора начинает со своего кабинета.
  const current =
    !coordinator && workspace === 'coordination' ? 'volunteer' : workspace
  return (
    <nav className="workspace-tabs" aria-label="Раздел кабинета">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={current === id}
          disabled={blocked}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
