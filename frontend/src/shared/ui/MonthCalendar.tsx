import { useId, useState } from 'react'

const weekdays = [
  ['Пн', 'понедельник'],
  ['Вт', 'вторник'],
  ['Ср', 'среда'],
  ['Чт', 'четверг'],
  ['Пт', 'пятница'],
  ['Сб', 'суббота'],
  ['Вс', 'воскресенье'],
] as const

const monthName = new Intl.DateTimeFormat('ru', { month: 'long' })

function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Недели месяца с понедельника; пустые ячейки — дни соседних месяцев. */
function weeksOf(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leading = (first.getDay() + 6) % 7
  const cells: (Date | null)[] = Array.from({ length: leading }, () => null)
  for (let day = 1; day <= daysInMonth; day++)
    cells.push(new Date(year, month, day))
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/**
 * Обычный календарь на месяц: начинается с текущего, листается кнопками.
 * Сегодня отмечено, прошедшие дни приглушены. Дни пока не интерактивны.
 */
export function MonthCalendar({ today: fixedToday }: { today?: Date }) {
  const [today] = useState(() => fixedToday ?? new Date())
  const [offset, setOffset] = useState(0)
  const headingId = useId()
  const shown = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const year = shown.getFullYear()
  const month = shown.getMonth()
  const todayIso = isoDate(today)
  const title = monthName.format(shown)

  return (
    <div className="calendar">
      <div className="calendar-head">
        <h2 id={headingId} className="calendar-title" aria-live="polite">
          {title[0].toUpperCase() + title.slice(1)}{' '}
          <span className="calendar-year">{year}</span>
        </h2>
        <div className="calendar-nav">
          <button
            type="button"
            aria-label="Предыдущий месяц"
            onClick={() => setOffset((value) => value - 1)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Следующий месяц"
            onClick={() => setOffset((value) => value + 1)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
      <table className="calendar-grid" aria-labelledby={headingId}>
        <thead>
          <tr>
            {weekdays.map(([short, full]) => (
              <th key={short} scope="col" abbr={full}>
                {short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeksOf(year, month).map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((date, index) =>
                date ? (
                  <td key={index}>
                    <time
                      dateTime={isoDate(date)}
                      className="calendar-day"
                      data-past={isoDate(date) < todayIso || undefined}
                      aria-current={
                        isoDate(date) === todayIso ? 'date' : undefined
                      }
                    >
                      {date.getDate()}
                    </time>
                  </td>
                ) : (
                  <td key={index} />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
