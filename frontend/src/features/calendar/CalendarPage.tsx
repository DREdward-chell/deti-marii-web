import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import { Button } from '../../shared/ui/Button'
import { CalendarIcon } from './CalendarIcon'
import { Agenda, MonthGrid, TimeGrid } from './CalendarViews'
import { EventDetails } from './EventDetails'
import { apiCalendarRepository, createDemoRepository } from './repository'
import { calendarApiEnabled, useCalendarRefresh } from './integration'
import {
  addDays,
  canApply,
  dayKey,
  directions,
  downloadIcs,
  eventTime,
  formatDay,
  isMine,
  monthDays,
  moveMonth,
  occursOn,
  startOfWeek,
  validDay,
  type CalendarData,
  type CalendarEvent,
  type CalendarRepository,
  type CalendarView,
  type Direction,
} from './model'
import './calendar.css'

const viewLabels: Record<CalendarView, string> = {
  month: 'Месяц',
  week: 'Неделя',
  day: 'День',
  agenda: 'Список',
}
function readLocation() {
  const params = new URLSearchParams(window.location.search)
  const candidate = params.get('date')
  const view = params.get('view')
  return {
    date: validDay(candidate) ? candidate : dayKey(),
    view:
      view && Object.hasOwn(viewLabels, view)
        ? (view as CalendarView)
        : window.matchMedia('(max-width: 700px)').matches
          ? ('agenda' as const)
          : ('week' as const),
    event: params.get('event'),
  }
}
export function CalendarPage({
  demo = false,
  onSessionExpired,
  repository: injectedRepository,
}: {
  demo?: boolean
  onSessionExpired: () => void
  repository?: CalendarRepository
}) {
  const repository = useMemo(
    () =>
      injectedRepository ??
      (demo ? createDemoRepository() : apiCalendarRepository),
    [demo, injectedRepository],
  )
  const enabled = demo || !!injectedRepository || calendarApiEnabled()
  const [location, setLocation] = useState(readLocation)
  const [miniMonth, setMiniMonth] = useState(location.date)
  const [data, setData] = useState<CalendarData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(enabled)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  const [selectedDirections, setSelectedDirections] = useState<Direction[]>(
    Object.keys(directions) as Direction[],
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const refresh = useCallback(() => {
    setLoading(true)
    setError('')
    setData(null)
    setAttempt((value) => value + 1)
  }, [])
  useCalendarRefresh(enabled && !demo, refresh)
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    const pop = () => {
      const next = readLocation()
      setLocation(next)
      setMiniMonth(next.date)
    }
    window.addEventListener('popstate', pop)
    return () => {
      clearInterval(timer)
      window.removeEventListener('popstate', pop)
    }
  }, [])
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    void repository
      .load(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted)
          setData({
            ...next,
            events: next.access === 'restricted' ? [] : next.events,
          })
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        if (reason instanceof ApiError && reason.status === 401) {
          onSessionExpired()
          return
        }
        setError(
          reason instanceof ApiError && reason.status === 403
            ? 'Расписание пока недоступно. Доступ открывает координатор после оформления.'
            : errorMessage(reason),
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [attempt, enabled, repository, onSessionExpired])

  function navigate(next: Partial<typeof location>, replace = false) {
    const result = { ...location, ...next }
    setLocation(result)
    if (next.date) setMiniMonth(next.date)
    const url = new URL(window.location.href)
    url.searchParams.set('date', result.date)
    url.searchParams.set('view', result.view)
    if (result.event) url.searchParams.set('event', result.event)
    else url.searchParams.delete('event')
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url)
  }
  const events = data?.events ?? []
  const today = dayKey(now)
  const filtered = events
    .filter(
      (event) =>
        selectedDirections.includes(event.direction) &&
        (scope === 'all' ||
          (scope === 'mine' && isMine(event)) ||
          (scope === 'available' && canApply(event, now)) ||
          (scope === 'pending' && event.participation === 'pending')) &&
        `${event.title} ${event.location} ${event.role}`
          .toLocaleLowerCase('ru-RU')
          .includes(query.trim().toLocaleLowerCase('ru-RU')),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const days =
    location.view === 'month'
      ? monthDays(location.date)
      : location.view === 'week'
        ? Array.from({ length: 7 }, (_, i) =>
            addDays(startOfWeek(location.date), i),
          )
        : location.view === 'agenda'
          ? Array.from({ length: 30 }, (_, i) => addDays(location.date, i))
          : [location.date]
  const visible = filtered.filter((event) =>
    days.some((day) => occursOn(event, day)),
  )
  const activeEvent = events.find((event) => event.id === location.event)
  const upcoming = events
    .filter(
      (event) =>
        event.participation === 'confirmed' &&
        event.status === 'scheduled' &&
        Date.parse(event.endsAt) > now.getTime(),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const confirmed = upcoming[0]
  const selectedMonth = formatDay(location.date, {
    month: 'long',
    year: 'numeric',
  }).replace(' г.', '')
  const rangeLabel =
    location.view === 'day'
      ? formatDay(location.date, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : location.view === 'week' || location.view === 'agenda'
        ? `${formatDay(days[0], { day: 'numeric', month: 'short' })} — ${formatDay(days[days.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}`
        : selectedMonth
  function move(amount: number) {
    navigate({
      date:
        location.view === 'month'
          ? moveMonth(location.date, amount)
          : addDays(
              location.date,
              amount *
                (location.view === 'week'
                  ? 7
                  : location.view === 'agenda'
                    ? 30
                    : 1),
            ),
    })
  }
  function resetFilters() {
    setQuery('')
    setScope('all')
    setSelectedDirections(Object.keys(directions) as Direction[])
  }
  function updateEvent(updated: CalendarEvent) {
    setData((previous) =>
      previous
        ? {
            ...previous,
            events: previous.events.map((event) =>
              event.id === updated.id ? updated : event,
            ),
          }
        : previous,
    )
  }
  const openEvent = (id: string) => navigate({ event: id })
  const openDay = (date: string) => navigate({ date, view: 'day' })
  return (
    <section className="calendar-page" aria-label="Календарь мероприятий">
      <nav className="cal-section-nav" aria-label="Личный кабинет">
        <a href="/">Мой профиль</a>
        <a href={demo ? '/calendar?demo=1' : '/calendar'} aria-current="page">
          <CalendarIcon name="calendar" />
          Календарь событий
        </a>
      </nav>
      <div className="cal-page-heading">
        <div>
          <p className="cal-eyebrow">БЫТЬ РЯДОМ. ДЕЛАТЬ ВМЕСТЕ.</p>
          <h1>
            Календарь добрых дел<span>.</span>
          </h1>
          <p>Найдите своё дело и оставьте для него время.</p>
        </div>
        <div className="cal-heading-art" aria-hidden="true">
          <CalendarIcon name="heart" />
          <span>
            У каждого дела
            <br />
            есть своё время
          </span>
        </div>
      </div>
      {demo && (
        <div className="cal-demo-banner">
          <span className="cal-demo-dot" />
          <span>
            <strong>Демо календаря</strong> · Вымышленные события. Отклики
            сохраняются до перезагрузки.
          </span>
        </div>
      )}
      {!enabled ? (
        <div className="cal-empty">
          <CalendarIcon name="calendar" />
          <h2>Готовим расписание</h2>
          <p>
            Здесь появятся мероприятия фонда и ваши участия. Пока можно
            познакомиться с календарём на демонстрационных событиях.
          </p>
          <a className="btn btn--primary" href="/calendar?demo=1">
            Посмотреть пример календаря
          </a>
        </div>
      ) : (
        <div className="cal-layout">
          <button
            className="cal-mobile-filters cal-outline-button"
            onClick={() => setFiltersOpen(!filtersOpen)}
            aria-expanded={filtersOpen}
            aria-controls="calendar-filters"
          >
            <CalendarIcon name="filter" />
            Дата и направления
          </button>
          <aside
            className={`cal-sidebar ${filtersOpen ? 'is-open' : ''}`}
            id="calendar-filters"
          >
            <div className="cal-mini">
              <div className="cal-mini-title">
                <strong>
                  {formatDay(miniMonth, {
                    month: 'long',
                    year: 'numeric',
                  }).replace(' г.', '')}
                </strong>
                <div>
                  <button
                    className="cal-icon-button"
                    aria-label="Предыдущий месяц в мини-календаре"
                    onClick={() => setMiniMonth(moveMonth(miniMonth, -1))}
                  >
                    <CalendarIcon name="left" />
                  </button>
                  <button
                    className="cal-icon-button"
                    aria-label="Следующий месяц в мини-календаре"
                    onClick={() => setMiniMonth(moveMonth(miniMonth, 1))}
                  >
                    <CalendarIcon name="right" />
                  </button>
                </div>
              </div>
              <div className="cal-mini-grid">
                {['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map((day, index) => (
                  <span key={index}>{day}</span>
                ))}
                {monthDays(miniMonth).map((day) => (
                  <button
                    key={day}
                    className={`${day.slice(0, 7) !== miniMonth.slice(0, 7) ? 'is-outside' : ''} ${day === today ? 'is-today' : ''} ${day === location.date ? 'is-selected' : ''}`}
                    aria-label={formatDay(day, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    aria-pressed={day === location.date}
                    aria-current={day === today ? 'date' : undefined}
                    onClick={() => {
                      navigate({ date: day })
                      setFiltersOpen(false)
                    }}
                  >
                    {Number(day.slice(-2))}
                  </button>
                ))}
              </div>
              <label className="cal-date-label" htmlFor="calendar-date">
                Перейти к дате
              </label>
              <input
                id="calendar-date"
                type="date"
                value={location.date}
                onChange={(e) => {
                  if (validDay(e.target.value))
                    navigate({ date: e.target.value })
                }}
              />
            </div>
            <fieldset className="cal-directions">
              <legend>Направления</legend>
              {Object.entries(directions).map(([key, direction]) => (
                <label
                  key={key}
                  className={`cal-direction-filter cal-event--${key}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedDirections.includes(key as Direction)}
                    onChange={(e) =>
                      setSelectedDirections((previous) =>
                        e.target.checked
                          ? [...previous, key as Direction]
                          : previous.filter((value) => value !== key),
                      )
                    }
                  />
                  <span>{direction.label}</span>
                </label>
              ))}
            </fieldset>
            <div className="cal-legend">
              <h3>Ваше участие</h3>
              <span>
                <i className="cal-legend-confirmed">
                  <CalendarIcon name="check" />
                </i>
                Подтверждено
              </span>
              <span>
                <i className="cal-legend-pending">
                  <CalendarIcon name="clock" />
                </i>
                Ждёт подтверждения
              </span>
              <p>
                Цвет события — направление.
                <br />
                Подпись — статус вашего участия.
              </p>
            </div>
            {confirmed && (
              <button
                className="cal-next"
                onClick={() => openEvent(confirmed.id)}
              >
                <span className="cal-next-eyebrow">ВАШЕ БЛИЖАЙШЕЕ ДЕЛО</span>
                <strong>{confirmed.title}</strong>
                <span>
                  {formatDay(dayKey(confirmed.startsAt), {
                    day: 'numeric',
                    month: 'long',
                  })}{' '}
                  · {eventTime(confirmed)}
                </span>
                <span className="cal-next-link">
                  До встречи! <CalendarIcon name="arrow" />
                </span>
              </button>
            )}
            <Button
              variant="quiet"
              size="sm"
              block
              disabled={!upcoming.length}
              onClick={() => downloadIcs(upcoming)}
            >
              <CalendarIcon name="download" />
              Скачать мои события
            </Button>
          </aside>
          <div className="cal-workspace">
            <div className="cal-toolbar">
              <div className="cal-period">
                <button
                  className="cal-outline-button"
                  onClick={() => navigate({ date: today })}
                >
                  Сегодня
                </button>
                <div className="cal-period-arrows">
                  <button
                    className="cal-icon-button"
                    aria-label="Предыдущий период"
                    onClick={() => move(-1)}
                  >
                    <CalendarIcon name="left" />
                  </button>
                  <button
                    className="cal-icon-button"
                    aria-label="Следующий период"
                    onClick={() => move(1)}
                  >
                    <CalendarIcon name="right" />
                  </button>
                </div>
                <h2>{selectedMonth}</h2>
              </div>
              <div
                className="cal-view-switch"
                role="group"
                aria-label="Вид календаря"
              >
                {Object.entries(viewLabels).map(([view, label]) => (
                  <button
                    key={view}
                    aria-pressed={location.view === view}
                    onClick={() => navigate({ view: view as CalendarView })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="cal-filterbar">
              <div
                className="cal-scopes"
                role="group"
                aria-label="Какие события показать"
              >
                {[
                  ['all', 'Все события'],
                  ['mine', 'Мои участия'],
                  ['available', 'Можно записаться'],
                  ['pending', 'Ждут решения'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={scope === value}
                    onClick={() => setScope(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="cal-search">
                <CalendarIcon name="search" />
                <span className="visually-hidden">Поиск мероприятий</span>
                <input
                  placeholder="Найти событие"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  type="search"
                />
              </label>
            </div>
            <div className="cal-range">
              <span aria-live="polite">{rangeLabel}</span>
              <span>{visible.length} событий · МСК</span>
            </div>
            {loading ? (
              <div className="cal-empty" role="status">
                <span className="cal-loading" />
                <p>Собираем расписание…</p>
              </div>
            ) : error ? (
              <div className="cal-empty">
                <h2>Не удалось загрузить календарь</h2>
                <p role="alert">{error}</p>
                <Button variant="secondary" onClick={refresh}>
                  Попробовать снова
                </Button>
              </div>
            ) : data?.access === 'restricted' ? (
              <div className="cal-empty">
                <CalendarIcon name="heart" />
                <h2>Ваш следующий шаг — знакомство</h2>
                <p>
                  Расписание станет доступно, когда координатор подтвердит
                  оформление. Пройденные уроки сами по себе не открывают запись.
                </p>
                <a className="btn btn--secondary" href="/">
                  Вернуться в профиль
                </a>
              </div>
            ) : (
              <>
                {!visible.length && (
                  <div className="cal-empty cal-empty--compact" role="status">
                    <h3>Здесь пока нет событий</h3>
                    <p>Выберите другие даты или измените фильтры.</p>
                    <button className="cal-text-button" onClick={resetFilters}>
                      Сбросить фильтры
                    </button>
                  </div>
                )}
                {location.view === 'month' ? (
                  <MonthGrid
                    days={days}
                    selected={location.date}
                    events={filtered}
                    onOpen={openEvent}
                    onDay={openDay}
                  />
                ) : location.view === 'agenda' ? (
                  <Agenda
                    start={location.date}
                    events={filtered}
                    onOpen={openEvent}
                  />
                ) : (
                  <TimeGrid
                    days={days}
                    events={filtered}
                    now={now}
                    onOpen={openEvent}
                    onDay={openDay}
                  />
                )}
              </>
            )}
            <div className="cal-bottom-note">
              <span>
                <CalendarIcon name="heart" />
                Даже небольшая помощь меняет чей-то день.
              </span>
              <button
                className="cal-text-button"
                disabled={loading}
                onClick={refresh}
              >
                Обновить
              </button>
            </div>
            {location.event &&
              !loading &&
              data?.access === 'granted' &&
              !activeEvent && (
                <div className="cal-warning" role="status">
                  Мероприятие больше недоступно.{' '}
                  <button
                    className="cal-text-button"
                    onClick={() => navigate({ event: null }, true)}
                  >
                    Закрыть
                  </button>
                </div>
              )}
          </div>
        </div>
      )}
      {activeEvent && !loading && (
        <EventDetails
          key={activeEvent.id}
          event={activeEvent}
          events={events}
          repository={repository}
          demo={demo}
          onClose={() => navigate({ event: null }, true)}
          onUpdate={updateEvent}
          onRefresh={refresh}
          onSessionExpired={onSessionExpired}
        />
      )}
    </section>
  )
}
