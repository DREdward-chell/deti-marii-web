export type CalendarView = 'week' | 'month' | 'day' | 'agenda'
export type Participation =
  'none' | 'pending' | 'confirmed' | 'withdrawn' | 'declined'
export type Direction = 'creative' | 'community' | 'learning' | 'help'
export type CalendarEvent = {
  id: string
  title: string
  description: string
  startsAt: string
  endsAt: string
  allDay: boolean
  direction: Direction
  location: string
  role: string
  requirements: string
  coordinator: string
  status: 'scheduled' | 'cancelled'
  participation: Participation
  registration: 'open' | 'full' | 'closed' | 'restricted'
  restrictionReason?: string
  availablePlaces: number | null
  version: number
}
export type CalendarData = {
  events: CalendarEvent[]
  access: 'granted' | 'restricted'
}
export type CalendarRepository = {
  load(signal?: AbortSignal): Promise<CalendarData>
  respond(
    event: CalendarEvent,
    action: 'apply' | 'withdraw',
  ): Promise<CalendarEvent>
}
export const directions: Record<Direction, { label: string; short: string }> = {
  creative: { label: 'Творческие занятия', short: 'Творчество' },
  community: { label: 'Встречи и прогулки', short: 'Сообщество' },
  learning: { label: 'Знакомство и обучение', short: 'Обучение' },
  help: { label: 'Помощь фонду', short: 'Помощь фонду' },
}
export const participationLabels: Record<Participation, string> = {
  none: 'Можно откликнуться',
  pending: 'Ждёт подтверждения',
  confirmed: 'Вы участвуете',
  withdrawn: 'Отклик отозван',
  declined: 'Участие не согласовано',
}
export const TIME_ZONE = 'Europe/Moscow'
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
export function dayKey(value: Date | string = new Date()): string {
  return dayFormatter.format(new Date(value))
}
export function dateAt(day: string): Date {
  return new Date(`${day}T12:00:00+03:00`)
}
export function validDay(value: string | null): value is string {
  return (
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(dateAt(value).getTime()) &&
    dayKey(dateAt(value)) === value
  )
}
export function addDays(day: string, amount: number): string {
  const date = dateAt(day)
  date.setUTCDate(date.getUTCDate() + amount)
  return dayKey(date)
}
export function startOfWeek(day: string): string {
  return addDays(day, -((dateAt(day).getUTCDay() + 6) % 7))
}
export function moveMonth(day: string, amount: number): string {
  const date = dateAt(day)
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount + 1, 0, 9),
  )
  target.setUTCDate(Math.min(date.getUTCDate(), target.getUTCDate()))
  return dayKey(target)
}
export function monthDays(day: string): string[] {
  const first = startOfWeek(day.slice(0, 8) + '01')
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}
export function formatDay(
  day: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return dateAt(day).toLocaleDateString('ru-RU', {
    ...options,
    timeZone: TIME_ZONE,
  })
}
export function timeLabel(instant: string): string {
  return new Date(instant).toLocaleTimeString('ru-RU', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
}
export function eventTime(event: CalendarEvent): string {
  if (event.allDay) return 'Весь день'
  return `${timeLabel(event.startsAt)}–${timeLabel(event.endsAt)}`
}
export function occursOn(event: CalendarEvent, day: string): boolean {
  return (
    Date.parse(event.startsAt) <
      Date.parse(`${addDays(day, 1)}T00:00:00+03:00`) &&
    Date.parse(event.endsAt) > Date.parse(`${day}T00:00:00+03:00`)
  )
}
export function overlaps(a: CalendarEvent, b: CalendarEvent): boolean {
  return (
    a.id !== b.id &&
    Date.parse(a.startsAt) < Date.parse(b.endsAt) &&
    Date.parse(b.startsAt) < Date.parse(a.endsAt)
  )
}
export function isMine(event: CalendarEvent): boolean {
  return ['pending', 'confirmed'].includes(event.participation)
}
export function statusLabel(event: CalendarEvent, now = new Date()): string {
  if (event.status === 'cancelled') return 'Мероприятие отменено'
  if (Date.parse(event.endsAt) <= now.getTime()) return 'Мероприятие завершено'
  if (isMine(event) || event.participation === 'declined')
    return participationLabels[event.participation]
  if (Date.parse(event.startsAt) <= now.getTime()) return 'Уже началось'
  if (event.registration === 'full' || event.availablePlaces === 0)
    return 'Мест нет'
  if (event.registration === 'restricted') return 'Нужен допуск'
  if (event.registration === 'closed') return 'Запись закрыта'
  return participationLabels[event.participation]
}
export function canApply(event: CalendarEvent, now = new Date()): boolean {
  return (
    event.status === 'scheduled' &&
    event.registration === 'open' &&
    event.availablePlaces !== 0 &&
    ['none', 'withdrawn'].includes(event.participation) &&
    Date.parse(event.startsAt) > now.getTime()
  )
}
export function canWithdraw(event: CalendarEvent, now = new Date()): boolean {
  return (
    event.status === 'scheduled' &&
    isMine(event) &&
    Date.parse(event.startsAt) > now.getTime()
  )
}
export function minutesAt(instant: string): number {
  const [hour, minute] = timeLabel(instant).split(':').map(Number)
  return hour * 60 + minute
}
export type PositionedEvent = {
  event: CalendarEvent
  start: number
  end: number
  column: number
  columns: number
}
// Connected overlap groups get stable columns; adjacent events can reuse a column.
export function layoutDay(
  events: CalendarEvent[],
  day: string,
): PositionedEvent[] {
  const entries = events
    .filter((e) => !e.allDay && occursOn(e, day))
    .map((event) => ({
      event,
      start: dayKey(event.startsAt) < day ? 0 : minutesAt(event.startsAt),
      end: dayKey(event.endsAt) > day ? 1440 : minutesAt(event.endsAt),
      column: 0,
      columns: 1,
    }))
    .sort(
      (a, b) =>
        a.start - b.start ||
        b.end - a.end ||
        a.event.id.localeCompare(b.event.id),
    )
  let group: PositionedEvent[] = []
  let ends: number[] = []
  const finish = () => {
    group.forEach((entry) => {
      entry.columns = ends.length
    })
    group = []
    ends = []
  }
  for (const entry of entries) {
    if (group.length && entry.start >= Math.max(...ends)) finish()
    const free = ends.findIndex((end) => end <= entry.start)
    entry.column = free < 0 ? ends.length : free
    ends[entry.column] = entry.end
    group.push(entry)
  }
  finish()
  return entries
}
function escapeIcs(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;')
    .replaceAll('\r', '')
}
function icsInstant(value: string): string {
  return new Date(value)
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}
function foldIcs(line: string): string {
  const encoder = new TextEncoder()
  let result = '',
    count = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    if (count + bytes > 75) {
      result += '\r\n '
      count = 1
    }
    result += char
    count += bytes
  }
  return result
}
export function createIcs(events: CalendarEvent[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Deti Marii//Volunteer Calendar//RU',
    'CALSCALE:GREGORIAN',
  ]
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcs(event.id)}@deti-marii`,
      `DTSTAMP:${icsInstant(now.toISOString())}`,
      `SEQUENCE:${event.version}`,
      ...(event.allDay
        ? [
            `DTSTART;VALUE=DATE:${dayKey(event.startsAt).replaceAll('-', '')}`,
            `DTEND;VALUE=DATE:${dayKey(event.endsAt).replaceAll('-', '')}`,
          ]
        : [
            `DTSTART:${icsInstant(event.startsAt)}`,
            `DTEND:${icsInstant(event.endsAt)}`,
          ]),
      `SUMMARY:${escapeIcs(event.title)}`,
      `DESCRIPTION:${escapeIcs(event.description + '\n' + statusLabel(event, now))}`,
      `LOCATION:${escapeIcs(event.location)}`,
      `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : event.participation === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT',
    )
  }
  return [...lines, 'END:VCALENDAR'].map(foldIcs).join('\r\n') + '\r\n'
}
export function downloadIcs(events: CalendarEvent[]): void {
  const url = URL.createObjectURL(
    new Blob([createIcs(events)], { type: 'text/calendar;charset=utf-8' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'deti-marii-events.ics'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
