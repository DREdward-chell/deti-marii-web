import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { Chip } from '../../shared/ui/Chip'
import { TextArea } from '../../shared/ui/TextArea'
import { dayKey, directions, type Direction } from '../calendar/model'
import { DemoNotice } from './DemoNotice'
import {
  confirmedCount,
  emptyEvent,
  eventProblems,
  eventStatusLabels,
  pendingCount,
  responseLabels,
  staffEventRepository,
  type StaffEvent,
  type StaffEventFields,
  type StaffEventStatus,
} from './staffEvents'

const statusTone = {
  DRAFT: 'muted',
  PUBLISHED: 'success',
  CANCELLED: 'neutral',
} as const
const responseTone = {
  PENDING: 'waiting',
  CONFIRMED: 'success',
  DECLINED: 'neutral',
  WITHDRAWN: 'muted',
} as const

const dayTitle = (value: string) =>
  new Date(`${value}T12:00:00+03:00`).toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

/** Мероприятия: создание, публикация, отклики и подтверждение участия. */
export function EventsSection({
  onSessionExpired,
  onPendingChange,
}: {
  onSessionExpired: () => void
  onPendingChange: (count: number) => void
}) {
  const [events, setEvents] = useState<StaffEvent[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<'new' | string | null>(null)
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void staffEventRepository
      .list(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setEvents(value)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired()
        else setLoadError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [attempt, onSessionExpired])

  useEffect(() => {
    if (events)
      onPendingChange(
        events
          .filter((event) => event.status === 'PUBLISHED')
          .reduce((sum, event) => sum + pendingCount(event), 0),
      )
  }, [events, onPendingChange])

  function reload() {
    setEvents(null)
    setLoadError('')
    setActionError('')
    setAttempt((value) => value + 1)
  }

  function put(updated: StaffEvent) {
    setEvents((previous) =>
      previous?.some((item) => item.id === updated.id)
        ? previous.map((item) => (item.id === updated.id ? updated : item))
        : [...(previous ?? []), updated],
    )
  }

  async function run(action: () => Promise<StaffEvent>) {
    if (busy) return
    setBusy(true)
    setActionError('')
    try {
      put(await action())
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else setActionError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const sorted = [...(events ?? [])].sort((a, b) =>
    `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`),
  )
  const today = dayKey()
  const upcoming = sorted.filter((event) => event.date >= today)
  const past = sorted.filter((event) => event.date < today)

  return (
    <section className="panel-section" aria-labelledby="events-heading">
      <header className="coordinator-header panel-header-row">
        <h1 id="events-heading">Мероприятия</h1>
        {editing === null && (
          <Button size="sm" onClick={() => setEditing('new')}>
            Новое мероприятие
          </Button>
        )}
      </header>
      <DemoNotice>
        Мероприятия пока хранятся только в этом браузере, а волонтёрский
        календарь показывает свои демо-события. Связь появится вместе с API
        мероприятий.
      </DemoNotice>

      {editing !== null && (
        <EventEditor
          event={
            editing === 'new'
              ? null
              : (events?.find((item) => item.id === editing) ?? null)
          }
          onSaved={(saved) => {
            put(saved)
            setEditing(null)
            setOpen(saved.id)
          }}
          onCancel={() => setEditing(null)}
          onSessionExpired={onSessionExpired}
        />
      )}

      {loadError ? (
        <Card tone="raised" as="div" className="coordinator-message">
          <p className="form-error">{loadError}</p>
          <Button variant="secondary" size="sm" onClick={reload}>
            Попробовать снова
          </Button>
        </Card>
      ) : !events ? (
        <p className="notice" role="status">
          Загружаем мероприятия…
        </p>
      ) : events.length === 0 ? (
        <Card tone="plain" as="div" className="coordinator-message">
          <h2>Мероприятий пока нет</h2>
          <p className="muted">
            Создайте первое: после публикации волонтёры увидят его в календаре и
            смогут откликнуться.
          </p>
        </Card>
      ) : (
        <>
          {actionError && (
            <div className="coordinator-message">
              <p className="form-error" role="alert">
                {actionError}
              </p>
              <Button variant="secondary" size="sm" onClick={reload}>
                Обновить список
              </Button>
            </div>
          )}
          <EventList
            title="Ближайшие"
            events={upcoming}
            open={open}
            busy={busy}
            onToggle={(id) => setOpen(open === id ? null : id)}
            onEdit={(id) => setEditing(id)}
            onStatus={(event, status) =>
              void run(() =>
                staffEventRepository.setStatus(event.id, event.version, status),
              )
            }
            onDecide={(event, responseId, status) =>
              void run(() =>
                staffEventRepository.decide(
                  event.id,
                  event.version,
                  responseId,
                  status,
                ),
              )
            }
          />
          {past.length > 0 && (
            <details className="events-past">
              <summary>Прошедшие ({past.length})</summary>
              <EventList
                title=""
                events={past}
                open={open}
                busy
                onToggle={(id) => setOpen(open === id ? null : id)}
                onEdit={() => {}}
                onStatus={() => {}}
                onDecide={() => {}}
              />
            </details>
          )}
        </>
      )}
    </section>
  )
}

function EventList({
  title,
  events,
  open,
  busy,
  onToggle,
  onEdit,
  onStatus,
  onDecide,
}: {
  title: string
  events: StaffEvent[]
  open: string | null
  busy: boolean
  onToggle: (id: string) => void
  onEdit: (id: string) => void
  onStatus: (event: StaffEvent, status: StaffEventStatus) => void
  onDecide: (
    event: StaffEvent,
    responseId: string,
    status: 'CONFIRMED' | 'DECLINED',
  ) => void
}) {
  if (events.length === 0)
    return title ? (
      <p className="muted">Ближайших мероприятий нет — создайте новое.</p>
    ) : null
  return (
    <ul className="event-list" aria-label={title || 'Прошедшие мероприятия'}>
      {events.map((event) => {
        const expanded = open === event.id
        const waiting = pendingCount(event)
        const confirmed = confirmedCount(event)
        return (
          <li key={event.id} className="event-item" data-status={event.status}>
            <button
              type="button"
              className="event-row"
              aria-expanded={expanded}
              onClick={() => onToggle(event.id)}
            >
              <span className={`event-dot event-dot--${event.direction}`} />
              <span className="event-row-main">
                <strong>{event.title}</strong>
                <span className="muted">
                  {dayTitle(event.date)} · {event.start}–{event.end}
                </span>
              </span>
              <span className="event-row-places muted">
                {event.capacity === null
                  ? `${confirmed} подтверждено`
                  : `${confirmed} из ${event.capacity} мест`}
              </span>
              <Chip tone={statusTone[event.status]}>
                {eventStatusLabels[event.status]}
              </Chip>
              {waiting > 0 && event.status === 'PUBLISHED' ? (
                <span
                  className="count-badge"
                  aria-label={`Ждут решения: ${waiting}`}
                >
                  {waiting}
                </span>
              ) : (
                <span />
              )}
            </button>
            {expanded && (
              <div className="event-body">
                <dl className="event-facts">
                  <dt>Направление</dt>
                  <dd>{directions[event.direction].label}</dd>
                  <dt>Место</dt>
                  <dd>{event.location}</dd>
                  {event.roleName && (
                    <>
                      <dt>Роль</dt>
                      <dd>{event.roleName}</dd>
                    </>
                  )}
                  {event.requirements && (
                    <>
                      <dt>Что нужно знать</dt>
                      <dd className="preserve-lines">{event.requirements}</dd>
                    </>
                  )}
                  {event.description && (
                    <>
                      <dt>Описание</dt>
                      <dd className="preserve-lines">{event.description}</dd>
                    </>
                  )}
                </dl>

                <h3>Отклики</h3>
                {event.responses.length === 0 ? (
                  <p className="muted">
                    {event.status === 'PUBLISHED'
                      ? 'Пока никто не откликнулся.'
                      : 'Отклики появятся после публикации.'}
                  </p>
                ) : (
                  <ul className="response-list">
                    {event.responses.map((response) => (
                      <li key={response.id}>
                        <span className="response-name">
                          {response.volunteerName}
                        </span>
                        <Chip tone={responseTone[response.status]}>
                          {responseLabels[response.status]}
                        </Chip>
                        {response.status === 'PENDING' &&
                        event.status === 'PUBLISHED' ? (
                          <span className="response-actions">
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                onDecide(event, response.id, 'CONFIRMED')
                              }
                            >
                              Подтвердить
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() =>
                                onDecide(event, response.id, 'DECLINED')
                              }
                            >
                              Отклонить
                            </Button>
                          </span>
                        ) : (
                          <span />
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="panel-actions">
                  {event.status === 'DRAFT' && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => onStatus(event, 'PUBLISHED')}
                    >
                      Опубликовать
                    </Button>
                  )}
                  {event.status !== 'CANCELLED' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onEdit(event.id)}
                    >
                      Изменить
                    </Button>
                  )}
                  {event.status === 'PUBLISHED' && (
                    <Button
                      size="sm"
                      variant="quiet"
                      disabled={busy}
                      onClick={() => onStatus(event, 'CANCELLED')}
                    >
                      Отменить мероприятие
                    </Button>
                  )}
                  {event.status === 'CANCELLED' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onStatus(event, 'DRAFT')}
                    >
                      Вернуть в черновики
                    </Button>
                  )}
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function EventEditor({
  event,
  onSaved,
  onCancel,
  onSessionExpired,
}: {
  event: StaffEvent | null
  onSaved: (event: StaffEvent) => void
  onCancel: () => void
  onSessionExpired: () => void
}) {
  const [draft, setDraft] = useState<StaffEventFields>(() =>
    event ? { ...event } : emptyEvent(),
  )
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function change<K extends keyof StaffEventFields>(
    key: K,
    value: StaffEventFields[K],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (saving) return
    const problems = eventProblems(draft) as Record<string, string>
    setFields(problems)
    setError('')
    if (Object.keys(problems).length) return
    setSaving(true)
    try {
      onSaved(
        await staffEventRepository.save(
          event?.id ?? null,
          event?.version ?? 0,
          draft,
        ),
      )
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else {
        setError(errorMessage(cause))
        if (cause instanceof ApiError) setFields(cause.fields)
      }
    } finally {
      setSaving(false)
    }
  }

  const hint = (key: string) =>
    fields[key] ? (
      <p className="field-error" id={`event-${key}-error`}>
        {fields[key]}
      </p>
    ) : null

  return (
    <Card
      tone="raised"
      className="event-editor"
      aria-labelledby="event-editor-heading"
    >
      <h2 id="event-editor-heading">
        {event ? 'Изменить мероприятие' : 'Новое мероприятие'}
      </h2>
      <p className="muted">
        {event
          ? 'Волонтёры увидят изменения после сохранения.'
          : 'Сохранится черновиком: волонтёры увидят мероприятие после публикации.'}
      </p>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <fieldset disabled={saving}>
          <label htmlFor="event-title">Название</label>
          <input
            id="event-title"
            maxLength={120}
            value={draft.title}
            onChange={(e) => change('title', e.target.value)}
            aria-invalid={!!fields.title}
          />
          {hint('title')}
          <div className="form-grid">
            <div>
              <label htmlFor="event-direction">Направление</label>
              <select
                id="event-direction"
                value={draft.direction}
                onChange={(e) =>
                  change('direction', e.target.value as Direction)
                }
              >
                {Object.entries(directions).map(([value, item]) => (
                  <option key={value} value={value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="event-date">Дата</label>
              <input
                id="event-date"
                type="date"
                value={draft.date}
                onChange={(e) => change('date', e.target.value)}
                aria-invalid={!!fields.date}
              />
              {hint('date')}
            </div>
          </div>
          <div className="form-grid">
            <div>
              <label htmlFor="event-start">Начало</label>
              <input
                id="event-start"
                type="time"
                value={draft.start}
                onChange={(e) => change('start', e.target.value)}
                aria-invalid={!!fields.start}
              />
              {hint('start')}
            </div>
            <div>
              <label htmlFor="event-end">Окончание</label>
              <input
                id="event-end"
                type="time"
                value={draft.end}
                onChange={(e) => change('end', e.target.value)}
                aria-invalid={!!fields.end}
              />
              {hint('end')}
            </div>
          </div>
          <label htmlFor="event-location">Место</label>
          <input
            id="event-location"
            maxLength={200}
            placeholder="Например, творческая мастерская фонда или «онлайн»"
            value={draft.location}
            onChange={(e) => change('location', e.target.value)}
            aria-invalid={!!fields.location}
          />
          {hint('location')}
          <div className="form-grid">
            <div>
              <label htmlFor="event-role">
                Роль волонтёра{' '}
                <span className="optional-label">необязательно</span>
              </label>
              <input
                id="event-role"
                maxLength={100}
                placeholder="Например, помощник ведущего"
                value={draft.roleName}
                onChange={(e) => change('roleName', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="event-capacity">Сколько нужно людей</label>
              <input
                id="event-capacity"
                type="number"
                min={1}
                max={500}
                disabled={draft.capacity === null}
                value={draft.capacity ?? ''}
                onChange={(e) =>
                  change(
                    'capacity',
                    e.target.value === '' ? 0 : Number(e.target.value),
                  )
                }
                aria-invalid={!!fields.capacity}
              />
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={draft.capacity === null}
                  onChange={(e) =>
                    change('capacity', e.target.checked ? null : 4)
                  }
                />
                Без ограничения
              </label>
              {hint('capacity')}
            </div>
          </div>
          <label htmlFor="event-requirements">
            Что нужно знать заранее{' '}
            <span className="optional-label">необязательно</span>
          </label>
          <TextArea
            id="event-requirements"
            maxLength={1000}
            value={draft.requirements}
            onChange={(e) => change('requirements', e.target.value)}
          />
          <label htmlFor="event-description">
            Описание <span className="optional-label">необязательно</span>
          </label>
          <TextArea
            id="event-description"
            maxLength={2000}
            value={draft.description}
            onChange={(e) => change('description', e.target.value)}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="panel-actions">
            <Button type="submit" size="sm">
              {saving
                ? 'Сохраняем…'
                : event
                  ? 'Сохранить изменения'
                  : 'Сохранить черновик'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onCancel}
            >
              Отмена
            </Button>
          </div>
        </fieldset>
      </form>
    </Card>
  )
}
