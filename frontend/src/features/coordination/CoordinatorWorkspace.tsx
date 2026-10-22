import { useCallback, useEffect, useState } from 'react'
import type { Account } from '../../shared/api/auth'
import { EventsSection } from './EventsSection'
import { LearningSection } from './LearningSection'
import { PeopleSection } from './PeopleSection'
import { RoleCatalogEditor } from './RoleCatalogPanel'
import { StaffSection } from './StaffSection'
import { pendingCount, staffEventRepository } from './staffEvents'
import './panel.css'

type Section = 'people' | 'events' | 'learning' | 'roles' | 'staff'

const sections: { id: Section; title: string; hint: string; admin?: true }[] = [
  { id: 'people', title: 'Люди', hint: 'Анкеты, приём, документы' },
  { id: 'events', title: 'Мероприятия', hint: 'События и отклики' },
  { id: 'learning', title: 'Обучение', hint: 'Уроки и публикация' },
  { id: 'roles', title: 'Виды помощи', hint: 'Справочник для допусков' },
  { id: 'staff', title: 'Сотрудники', hint: 'Кто координатор', admin: true },
]

const remembered = 'dm-panel-section'
function initialSection(isAdmin: boolean): Section {
  try {
    const value = localStorage.getItem(remembered)
    const known = sections.find((item) => item.id === value)
    if (known && (!known.admin || isAdmin)) return known.id
  } catch {
    // Без хранилища открываем «Люди».
  }
  return 'people'
}

/** Кабинет координатора: разделы слева, выбранный раздел справа. */
export function CoordinatorWorkspace({
  account,
  onSessionExpired,
}: {
  account: Account
  onSessionExpired: () => void
}) {
  const isAdmin = account.roles.includes('ADMIN')
  const [section, setSection] = useState<Section>(() => initialSection(isAdmin))
  const [pending, setPending] = useState(0)

  // Число откликов, ждущих решения, видно в навигации из любого раздела.
  useEffect(() => {
    const controller = new AbortController()
    staffEventRepository
      .list(controller.signal)
      .then((events) => {
        if (controller.signal.aborted) return
        setPending(
          events
            .filter((event) => event.status === 'PUBLISHED')
            .reduce((sum, event) => sum + pendingCount(event), 0),
        )
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const choose = useCallback((next: Section) => {
    setSection(next)
    try {
      localStorage.setItem(remembered, next)
    } catch {
      // Выбор просто не запомнится.
    }
  }, [])

  return (
    <div className="coordinator coord-panel appear">
      <nav className="panel-nav" aria-label="Разделы кабинета координатора">
        <p className="panel-nav-title">Кабинет координатора</p>
        <ul>
          {sections
            .filter((item) => !item.admin || isAdmin)
            .map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={section === item.id ? 'page' : undefined}
                  onClick={() => choose(item.id)}
                >
                  <span className="panel-nav-text">
                    <span>{item.title}</span>
                    <span className="panel-nav-hint">{item.hint}</span>
                  </span>
                  {item.id === 'events' && pending > 0 && (
                    <span
                      className="count-badge"
                      aria-label={`ждут решения: ${pending}`}
                    >
                      {pending}
                    </span>
                  )}
                </button>
              </li>
            ))}
        </ul>
      </nav>

      <div className="panel-main">
        {section === 'people' && (
          <PeopleSection
            actorEmail={account.email}
            onSessionExpired={onSessionExpired}
          />
        )}
        {section === 'events' && (
          <EventsSection
            onSessionExpired={onSessionExpired}
            onPendingChange={setPending}
          />
        )}
        {section === 'learning' && (
          <LearningSection onSessionExpired={onSessionExpired} />
        )}
        {section === 'roles' && (
          <section
            className="panel-section"
            aria-labelledby="roles-section-heading"
          >
            <header className="coordinator-header">
              <h1 id="roles-section-heading">Виды помощи</h1>
            </header>
            <div className="role-catalog">
              <RoleCatalogEditor onSessionExpired={onSessionExpired} />
            </div>
          </section>
        )}
        {section === 'staff' && isAdmin && (
          <StaffSection
            actorEmail={account.email}
            onSessionExpired={onSessionExpired}
          />
        )}
      </div>
    </div>
  )
}
