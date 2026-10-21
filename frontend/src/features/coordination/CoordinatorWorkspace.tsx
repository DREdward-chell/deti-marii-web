import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
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
      className="coordinator-workspace"
      aria-labelledby="coordinator-heading"
    >
      <p className="eyebrow">Кабинет координатора</p>
      <h1 id="coordinator-heading">
        {selected ? 'Карточка волонтёра' : 'Анкеты волонтёров'}
      </h1>
      {!selected && <RoleCatalogPanel onSessionExpired={onSessionExpired} />}
      {selected ? (
        <button className="text-button" onClick={() => select(null)}>
          ← К списку анкет
        </button>
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
          <button className="secondary-button" type="submit">
            Найти
          </button>
        </form>
      )}
      {error ? (
        <div className="form-card">
          <p role="alert">{error}</p>
          <button
            className="secondary-button"
            onClick={() => {
              clearLoaded()
              setRetry((value) => value + 1)
            }}
          >
            Попробовать снова
          </button>
        </div>
      ) : selected ? (
        card ? (
          <>
            <article className="form-card volunteer-card">
              <h2>{card.displayName}</h2>
              <p className="muted">
                Анкета создана {date(card.createdAt)} · Обновлена{' '}
                {date(card.updatedAt)}
              </p>
              <dl>
                <dt>Email</dt>
                <dd>{card.email || 'Не указан'}</dd>
                <dt>Телефон</dt>
                <dd>{card.phone || 'Не указан'}</dd>
                <dt>Интересы</dt>
                <dd>{card.interests || 'Пока не указаны'}</dd>
                <dt>Навыки</dt>
                <dd>{card.skills || 'Пока не указаны'}</dd>
                <dt>Ритм участия</dt>
                <dd>{regularityLabels[card.regularity]}</dd>
                <dt>Удобное время</dt>
                <dd>{card.availability || 'Пока не указано'}</dd>
              </dl>
            </article>
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
          </>
        ) : (
          <p className="notice" role="status">
            Загружаем карточку…
          </p>
        )
      ) : page ? (
        <>
          <p className="muted" role="status">
            Найдено анкет: {page.total}
          </p>
          {page.items.length === 0 ? (
            <div className="form-card">
              <h2>Пока нет анкет</h2>
              <p className="muted">
                Здесь появятся сохранённые анкеты. Если задан поиск, попробуйте
                изменить условия.
              </p>
            </div>
          ) : (
            <ul className="volunteer-list">
              {page.items.map((volunteer) => (
                <li key={volunteer.id}>
                  <button
                    className="volunteer-row"
                    onClick={() => select(volunteer.id)}
                  >
                    <span>
                      <strong>{volunteer.displayName}</strong>
                      <span className="muted">
                        {volunteer.availability || 'Время пока не указано'}
                      </span>
                    </span>
                    <span>{regularityLabels[volunteer.regularity]}</span>
                    <span className="muted">{date(volunteer.createdAt)} →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="pagination">
            <button
              className="secondary-button"
              disabled={page.page === 0}
              onClick={() => changePage(-1)}
            >
              Назад
            </button>
            <span>Страница {page.page + 1}</span>
            <button
              className="secondary-button"
              disabled={(page.page + 1) * page.size >= page.total}
              onClick={() => changePage(1)}
            >
              Далее
            </button>
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
