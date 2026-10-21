import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { ReviewPanel } from './ReviewPanel'
import { ClearancePanel } from './ClearancePanel'
import { RoleCatalogPanel } from './RoleCatalogPanel'
import {
  getVolunteer,
  listVolunteers,
  regularityLabels,
  type VolunteerCard,
  type VolunteerPage,
} from '../../shared/api/coordination'

function date(value: string) {
  return new Date(value).toLocaleDateString('ru-RU')
}

/** Рабочее место координатора: список анкет с поиском и карточка волонтёра. */
export function CoordinatorWorkspace({
  onSessionExpired,
}: {
  onSessionExpired: () => void
}) {
  const [search, setSearch] = useState('')
  const [regularity, setRegularity] = useState('')
  const [filter, setFilter] = useState({ q: '', regularity: '', page: 0 })
  const [page, setPage] = useState<VolunteerPage | null>(null)
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
        ).then((value) => {
          if (!controller.signal.aborted) setPage(value)
        })
    void request.catch((cause: unknown) => {
      if (controller.signal.aborted) return
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else setError(errorMessage(cause))
    })
    return () => controller.abort()
  }, [filter, selected, retry, onSessionExpired])

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
  }

  function changePage(delta: number) {
    clearLoaded()
    setFilter((previous) => ({ ...previous, page: previous.page + delta }))
  }

  return (
    <section
      className="coordinator appear"
      aria-labelledby="coordinator-heading"
    >
      <header className="coordinator-header">
        <p className="coordinator-eyebrow">Кабинет координатора</p>
        <h1 id="coordinator-heading">
          {selected ? 'Карточка волонтёра' : 'Анкеты волонтёров'}
        </h1>
      </header>
      {!selected && <RoleCatalogPanel onSessionExpired={onSessionExpired} />}
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
          <div className="volunteer-details">
            <Card tone="raised" as="article" className="volunteer-card">
              <div className="volunteer-card-head">
                <span className="volunteer-avatar" aria-hidden="true">
                  {card.displayName.charAt(0).toUpperCase()}
                </span>
                <div>
                  <h2>{card.displayName}</h2>
                  <p className="muted">
                    Анкета создана {date(card.createdAt)} · Обновлена{' '}
                    {date(card.updatedAt)}
                  </p>
                </div>
              </div>
              <dl className="volunteer-facts">
                <dt>Email</dt>
                <dd>{card.email || 'Не указан'}</dd>
                <dt>Телефон</dt>
                <dd>{card.phone || 'Не указан'}</dd>
                <dt>Интересы</dt>
                <dd className="preserve-lines">
                  {card.interests || 'Пока не указаны'}
                </dd>
                <dt>Навыки</dt>
                <dd className="preserve-lines">
                  {card.skills || 'Пока не указаны'}
                </dd>
                <dt>Ритм участия</dt>
                <dd>{regularityLabels[card.regularity]}</dd>
                <dt>Удобное время</dt>
                <dd>{card.availability || 'Пока не указано'}</dd>
              </dl>
            </Card>
            <ReviewPanel
              key={card.id}
              volunteerId={card.id}
              onSessionExpired={onSessionExpired}
            />
            <ClearancePanel
              key={`clearance:${card.id}`}
              volunteerId={card.id}
              onSessionExpired={onSessionExpired}
            />
          </div>
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
              {page.items.map((volunteer) => (
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
                    <span className="muted volunteer-row-date">
                      {date(volunteer.createdAt)} →
                    </span>
                  </button>
                </li>
              ))}
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
