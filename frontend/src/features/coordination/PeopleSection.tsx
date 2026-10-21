import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  getVolunteer,
  listVolunteers,
  regularityLabels,
  type VolunteerCard,
  type VolunteerPage,
} from '../../shared/api/coordination'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { Chip } from '../../shared/ui/Chip'
import { PersonCard } from './PersonCard'
import {
  membershipLabels,
  membershipRepository,
  membershipTone,
  type Membership,
  type MembershipStatus,
} from './membership'

function date(value: string) {
  return new Date(value).toLocaleDateString('ru-RU')
}

/** Люди: анкеты с поиском и фильтром, карточка с приёмом, рассмотрением и допусками. */
export function PeopleSection({
  actorEmail,
  onSessionExpired,
}: {
  actorEmail: string
  onSessionExpired: () => void
}) {
  const [search, setSearch] = useState('')
  const [regularity, setRegularity] = useState('')
  const [filter, setFilter] = useState({ q: '', regularity: '', page: 0 })
  const [page, setPage] = useState<VolunteerPage | null>(null)
  const [statuses, setStatuses] = useState<Record<string, MembershipStatus>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [card, setCard] = useState<VolunteerCard | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const request = selected
      ? getVolunteer(selected, controller.signal).then((value) => {
          if (!controller.signal.aborted) setCard(value)
        })
      : listVolunteers(
          filter.q,
          filter.regularity,
          filter.page,
          controller.signal,
        ).then(async (value) => {
          if (controller.signal.aborted) return
          setPage(value)
          const map = await membershipRepository
            .statuses(value.items.map((item) => item.id))
            .catch(() => ({}))
          if (!controller.signal.aborted) setStatuses(map)
        })
    void request.catch((cause: unknown) => {
      if (controller.signal.aborted) return
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else setError(errorMessage(cause))
    })
    return () => controller.abort()
  }, [filter, selected, retry, onSessionExpired])

  const membershipChanged = useCallback((id: string, value: Membership) => {
    setStatuses((previous) => ({
      ...previous,
      [id]: value.current.fields.status,
    }))
  }, [])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearLoaded()
    setFilter({ q: search.trim(), regularity, page: 0 })
  }

  function clearLoaded() {
    setError('')
    setPage(null)
    setCard(null)
  }

  function select(id: string | null) {
    clearLoaded()
    setSelected(id)
    window.scrollTo({ top: 0 })
  }

  function changePage(delta: number) {
    clearLoaded()
    setFilter((previous) => ({ ...previous, page: previous.page + delta }))
  }

  return (
    <section className="panel-section" aria-labelledby="coordinator-heading">
      <header className="coordinator-header">
        <h1 id="coordinator-heading">
          {selected ? 'Карточка волонтёра' : 'Анкеты волонтёров'}
        </h1>
      </header>
      {selected ? (
        <Button
          variant="quiet"
          size="sm"
          className="back-link"
          onClick={() => select(null)}
        >
          ← К списку анкет
        </Button>
      ) : (
        <form className="directory-filters" onSubmit={submit}>
          <div>
            <label htmlFor="volunteer-search">Поиск по имени</label>
            <input
              id="volunteer-search"
              maxLength={120}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Как зовут волонтёра?"
            />
          </div>
          <div>
            <label htmlFor="regularity-filter">Ритм участия</label>
            <select
              id="regularity-filter"
              value={regularity}
              onChange={(event) => setRegularity(event.target.value)}
            >
              <option value="">Любой</option>
              {Object.entries(regularityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="secondary" type="submit">
            Найти
          </Button>
        </form>
      )}
      {error ? (
        <Card tone="raised" as="div" className="coordinator-message">
          <p role="alert">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              clearLoaded()
              setRetry((value) => value + 1)
            }}
          >
            Попробовать снова
          </Button>
        </Card>
      ) : selected ? (
        card ? (
          <PersonCard
            card={card}
            actorEmail={actorEmail}
            onMembershipChange={membershipChanged}
            onSessionExpired={onSessionExpired}
          />
        ) : (
          <p className="notice" role="status">
            Загружаем карточку…
          </p>
        )
      ) : page ? (
        <>
          <p className="muted directory-count" role="status">
            Найдено анкет: {page.total}
          </p>
          {page.items.length === 0 ? (
            <Card tone="plain" as="div" className="coordinator-message">
              <h2>Пока нет анкет</h2>
              <p className="muted">
                Здесь появятся сохранённые анкеты. Если задан поиск, попробуйте
                изменить условия.
              </p>
            </Card>
          ) : (
            <ul className="volunteer-list">
              {page.items.map((volunteer) => {
                const status = statuses[volunteer.id]
                return (
                  <li key={volunteer.id}>
                    <button
                      className="volunteer-row"
                      onClick={() => select(volunteer.id)}
                    >
                      <span className="volunteer-avatar" aria-hidden="true">
                        {volunteer.displayName.charAt(0).toUpperCase()}
                      </span>
                      <span className="volunteer-row-name">
                        <strong>{volunteer.displayName}</strong>
                        <span className="muted">
                          {volunteer.availability || 'Время пока не указано'}
                        </span>
                      </span>
                      <span className="volunteer-row-rhythm">
                        {regularityLabels[volunteer.regularity]}
                      </span>
                      {status && status !== 'NOT_ACCEPTED' ? (
                        <Chip tone={membershipTone[status]}>
                          {membershipLabels[status]}
                        </Chip>
                      ) : (
                        <span />
                      )}
                      <span className="muted volunteer-row-date">
                        {date(volunteer.createdAt)} →
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="pagination">
            <Button
              variant="secondary"
              size="sm"
              disabled={page.page === 0}
              onClick={() => changePage(-1)}
            >
              Назад
            </Button>
            <span>Страница {page.page + 1}</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={(page.page + 1) * page.size >= page.total}
              onClick={() => changePage(1)}
            >
              Далее
            </Button>
          </div>
        </>
      ) : (
        <p className="notice" role="status">
          Загружаем анкеты…
        </p>
      )}
    </section>
  )
}
