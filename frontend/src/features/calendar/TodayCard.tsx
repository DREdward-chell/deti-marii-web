import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import { apiCalendarRepository, createDemoRepository } from './repository'
import {
  calendarApiEnabled,
  calendarHref,
  useCalendarRefresh,
} from './integration'
import {
  dayKey,
  directions,
  formatDay,
  isMine,
  occursOn,
  participationLabels,
  timeLabel,
  type CalendarEvent,
  type CalendarRepository,
} from './model'

type Moment = 'past' | 'now' | 'upcoming'

function momentOf(event: CalendarEvent, now: Date): Moment {
  if (Date.parse(event.endsAt) <= now.getTime()) return 'past'
  if (Date.parse(event.startsAt) <= now.getTime()) return 'now'
  return 'upcoming'
}

/**
 * Виджет личного кабинета: сегодняшняя дата и события дня на таймлайне.
 * Нажатие открывает расширенный календарь на этом дне.
 */
export function TodayCard({
  onSessionExpired,
  repository: injected,
}: {
  onSessionExpired: () => void
  repository?: CalendarRepository
}) {
  const apiEnabled = calendarApiEnabled()
  const demo = !injected && !apiEnabled
  const repository = useMemo(
    () =>
      injected ?? (apiEnabled ? apiCalendarRepository : createDemoRepository()),
    [injected, apiEnabled],
  )
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [restricted, setRestricted] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const today = dayKey(now)
  const refresh = useCallback(() => {
    setError('')
    setEvents(null)
    setAttempt((value) => value + 1)
  }, [])
  useCalendarRefresh(!demo, refresh)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void repository
      .load(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setRestricted(data.access === 'restricted')
        setEvents(data.access === 'restricted' ? [] : data.events)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        if (reason instanceof ApiError && reason.status === 401) {
          onSessionExpired()
          return
        }
        if (reason instanceof ApiError && reason.status === 403) {
          setRestricted(true)
          setEvents([])
          return
        }
        setError(errorMessage(reason))
      })
    return () => controller.abort()
  }, [repository, attempt, onSessionExpired, today])

  const todays = (events ?? [])
    .filter((event) => occursOn(event, today))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const allDay = todays.filter((event) => event.allDay)
  const timed = todays.filter((event) => !event.allDay)
  const next = (events ?? [])
    .filter(
      (event) =>
        !event.allDay &&
        event.status === 'scheduled' &&
        Date.parse(event.startsAt) >= Date.parse(`${today}T23:59:59+03:00`),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0]
  // Отметка «сейчас» встаёт перед первым событием, которое ещё не закончилось.
  const nowIndex = timed.findIndex((event) => momentOf(event, now) !== 'past')
  const nowMarker = (
    <li className="today-now" aria-hidden="true">
      <span className="today-time">{timeLabel(now.toISOString())}</span>
      <span className="today-now-line" />
    </li>
  )

  return (
    <section className="today-card" aria-labelledby="today-heading">
      <header className="today-head">
        <div>
          <p className="today-weekday">
            {formatDay(today, { weekday: 'long' })}
          </p>
          <h2 id="today-heading">
            {formatDay(today, { day: 'numeric', month: 'long' })}
          </h2>
        </div>
        {demo && <span className="today-demo">пример</span>}
      </header>

      {error ? (
        <div className="today-state">
          <p role="alert">{error}</p>
          <button type="button" className="today-retry" onClick={refresh}>
            Повторить
          </button>
        </div>
      ) : events === null ? (
        <p className="today-state" role="status">
          Загружаем события дня…
        </p>
      ) : restricted ? (
        <p className="today-state">
          Расписание откроется после того, как координатор подтвердит
          оформление.
        </p>
      ) : todays.length === 0 ? (
        <div className="today-state">
          <p>Сегодня событий нет.</p>
          {next && (
            <p className="today-next">
              Ближайшее —{' '}
              {formatDay(dayKey(next.startsAt), {
                weekday: 'short',
                day: 'numeric',
                month: 'long',
              })}
              , {timeLabel(next.startsAt)}: {next.title}
            </p>
          )}
        </div>
      ) : (
        <>
          {allDay.map((event) => (
            <p
              key={event.id}
              className={`today-all-day today-dir--${event.direction}`}
            >
              <span>Весь день</span> {event.title}
            </p>
          ))}
          <ol className="today-timeline" aria-label="События сегодня">
            {timed.map((event, index) => {
              const moment = momentOf(event, now)
              const cancelled = event.status === 'cancelled'
              return (
                <Fragment key={event.id}>
                  {index === nowIndex && nowMarker}
                  <li
                    className={`today-event today-dir--${event.direction}`}
                    data-moment={moment}
                    data-cancelled={cancelled || undefined}
                  >
                    <span className="today-time">
                      {timeLabel(event.startsAt)}
                      <span className="today-time-end">
                        {timeLabel(event.endsAt)}
                      </span>
                    </span>
                    <span className="today-dot" aria-hidden="true" />
                    <span className="today-body">
                      <strong>{event.title}</strong>
                      <span className="today-meta">
                        {directions[event.direction].short} · {event.location}
                      </span>
                      {cancelled ? (
                        <span className="today-badge">Отменено</span>
                      ) : moment === 'now' ? (
                        <span className="today-badge today-badge--now">
                          Идёт сейчас
                        </span>
                      ) : (
                        isMine(event) && (
                          <span className="today-badge today-badge--mine">
                            {participationLabels[event.participation]}
                          </span>
                        )
                      )}
                    </span>
                  </li>
                </Fragment>
              )
            })}
            {nowIndex === -1 && nowMarker}
          </ol>
        </>
      )}

      <a className="today-link" href={calendarHref(today, demo)}>
        Открыть календарь
        <span aria-hidden="true">→</span>
      </a>
    </section>
  )
}
