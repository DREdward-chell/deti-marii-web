import { useEffect, useRef } from 'react'
import {
  addDays,
  dayKey,
  eventTime,
  formatDay,
  layoutDay,
  minutesAt,
  occursOn,
  statusLabel,
  type CalendarEvent,
} from './model'
import { CalendarIcon } from './CalendarIcon'

type EventProps = {
  event: CalendarEvent
  onOpen: (id: string) => void
  compact?: boolean
}
export function EventButton({ event, onOpen, compact = false }: EventProps) {
  return (
    <button
      className={`cal-event cal-event--${event.direction} ${event.status === 'cancelled' ? 'cal-event--cancelled' : ''} ${compact ? 'cal-event--compact' : ''}`}
      onClick={() => onOpen(event.id)}
      aria-label={`${event.title}, ${eventTime(event)}, ${statusLabel(event)}`}
      title={`${event.title} · ${statusLabel(event)}`}
    >
      <span className="cal-event-time">
        {eventTime(event)}
        {event.participation === 'confirmed' && <CalendarIcon name="check" />}
        {event.participation === 'pending' && <CalendarIcon name="clock" />}
      </span>
      <strong>{event.title}</strong>
      {!compact && (
        <span className="cal-event-status">{statusLabel(event)}</span>
      )}
    </button>
  )
}
export function TimeGrid({
  days,
  events,
  now,
  onOpen,
  onDay,
}: {
  days: string[]
  events: CalendarEvent[]
  now: Date
  onOpen: (id: string) => void
  onDay: (day: string) => void
}) {
  const scroll = useRef<HTMLDivElement>(null)
  const first = days[0]
  const starts = days.flatMap((day) =>
    layoutDay(events, day).map((entry) => entry.start),
  )
  const firstEventMinute = starts.length ? Math.min(...starts) : 8 * 60
  useEffect(() => {
    // Reveal real events with a little context; keep scroll stable on status-only updates.
    if (scroll.current)
      scroll.current.scrollTop = Math.max(0, firstEventMinute - 30)
  }, [first, firstEventMinute])
  const today = dayKey(now)
  return (
    <div
      className={`cal-time-view ${days.length === 1 ? 'cal-time-view--day' : ''}`}
      style={{ '--cal-days': days.length } as React.CSSProperties}
    >
      <div className="cal-day-headings">
        <span className="cal-zone">
          МСК
          <br />
          UTC+3
        </span>
        {days.map((day) => (
          <button
            key={day}
            onClick={() => onDay(day)}
            className={day === today ? 'is-today' : ''}
            aria-label={`Открыть ${formatDay(day, { day: 'numeric', month: 'long' })}`}
          >
            <span>{formatDay(day, { weekday: 'short' })}</span>
            <strong>{Number(day.slice(-2))}</strong>
          </button>
        ))}
      </div>
      <div className="cal-all-day">
        <span>весь день</span>
        {days.map((day) => (
          <div key={day}>
            {events
              .filter((e) => e.allDay && occursOn(e, day))
              .map((event) => (
                <button
                  key={event.id}
                  className={`cal-all-day-event cal-event--${event.direction}`}
                  onClick={() => onOpen(event.id)}
                >
                  {event.title}
                </button>
              ))}
          </div>
        ))}
      </div>
      <div
        className="cal-time-scroll"
        ref={scroll}
        tabIndex={0}
        role="region"
        aria-label="Расписание по часам, прокручивайте для просмотра всего дня"
      >
        <div className="cal-time-grid">
          <div className="cal-hours">
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} style={{ top: hour * 60 }}>
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div
              className={`cal-time-column ${day === today ? 'is-today' : ''}`}
              key={day}
            >
              {layoutDay(events, day).map(
                ({ event, start, end, column, columns }) => (
                  <div
                    className="cal-event-position"
                    key={event.id}
                    style={{
                      top: start,
                      height: Math.max(end - start, 24),
                      left: `${(column / columns) * 100}%`,
                      width: `${100 / columns}%`,
                    }}
                  >
                    <EventButton
                      event={event}
                      onOpen={onOpen}
                      compact={end - start < 65 || columns > 1}
                    />
                  </div>
                ),
              )}
              {day === today && (
                <div
                  className="cal-now-line"
                  style={{ top: minutesAt(now.toISOString()) }}
                  aria-label={`Сейчас ${now.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })}`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
export function MonthGrid({
  days,
  selected,
  events,
  onOpen,
  onDay,
}: {
  days: string[]
  selected: string
  events: CalendarEvent[]
  onOpen: (id: string) => void
  onDay: (day: string) => void
}) {
  return (
    <div className="cal-month-view">
      <div className="cal-month-weekdays">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cal-month-grid">
        {days.map((day) => {
          const list = events.filter((event) => occursOn(event, day))
          return (
            <div
              key={day}
              className={`cal-month-cell ${day.slice(0, 7) !== selected.slice(0, 7) ? 'is-outside' : ''}`}
            >
              <button
                className={`cal-day-number ${day === dayKey() ? 'is-today' : ''}`}
                onClick={() => onDay(day)}
                aria-label={`Открыть ${formatDay(day, { day: 'numeric', month: 'long' })}`}
              >
                {Number(day.slice(-2))}
              </button>
              {list.slice(0, 3).map((event) => (
                <EventButton
                  key={event.id}
                  event={event}
                  onOpen={onOpen}
                  compact
                />
              ))}
              {list.length > 3 && (
                <button className="cal-more" onClick={() => onDay(day)}>
                  Ещё {list.length - 3}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
export function Agenda({
  start,
  events,
  onOpen,
}: {
  start: string
  events: CalendarEvent[]
  onOpen: (id: string) => void
}) {
  const days = Array.from({ length: 30 }, (_, i) => addDays(start, i))
  return (
    <div className="cal-agenda">
      {days.map((day) => {
        const list = events.filter((event) => occursOn(event, day))
        if (!list.length) return null
        return (
          <section className="cal-agenda-day" key={day}>
            <h3>
              <strong>{formatDay(day, { day: 'numeric' })}</strong>
              <span>
                {formatDay(day, { month: 'short', weekday: 'short' })}
              </span>
            </h3>
            <div>
              {list.map((event) => (
                <button
                  className={`cal-agenda-event cal-event--${event.direction}`}
                  key={event.id}
                  onClick={() => onOpen(event.id)}
                >
                  <span className="cal-agenda-time">{eventTime(event)}</span>
                  <span className="cal-agenda-description">
                    <strong>{event.title}</strong>
                    <span>{event.location}</span>
                  </span>
                  <span className="cal-agenda-status">
                    {statusLabel(event)}
                  </span>
                  <CalendarIcon name="right" />
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
