import { ApiError, get, isRecord, write } from '../../shared/api/client'
import {
  addDays,
  canApply,
  canWithdraw,
  dayKey,
  startOfWeek,
  type CalendarData,
  type CalendarEvent,
  type CalendarRepository,
  type Direction,
} from './model'

function parseEvent(value: unknown): CalendarEvent {
  if (
    !isRecord(value) ||
    ![
      'id',
      'title',
      'description',
      'startsAt',
      'endsAt',
      'location',
      'role',
      'requirements',
      'coordinator',
    ].every((key) => typeof value[key] === 'string') ||
    !['creative', 'community', 'learning', 'help'].includes(
      String(value.direction),
    ) ||
    !['scheduled', 'cancelled'].includes(String(value.status)) ||
    !['none', 'pending', 'confirmed', 'withdrawn', 'declined'].includes(
      String(value.participation),
    ) ||
    !['open', 'full', 'closed', 'restricted'].includes(
      String(value.registration),
    ) ||
    typeof value.allDay !== 'boolean' ||
    !Number.isInteger(value.version) ||
    Number(value.version) < 0 ||
    (value.availablePlaces !== null &&
      (!Number.isInteger(value.availablePlaces) ||
        Number(value.availablePlaces) < 0)) ||
    (value.restrictionReason !== undefined &&
      typeof value.restrictionReason !== 'string') ||
    ![value.startsAt, value.endsAt].every(
      (date) =>
        typeof date === 'string' &&
        /(Z|[+-]\d{2}:\d{2})$/.test(date) &&
        Number.isFinite(Date.parse(date)),
    ) ||
    Date.parse(String(value.endsAt)) <= Date.parse(String(value.startsAt))
  )
    throw new Error('Invalid calendar response')
  return value as CalendarEvent
}
export function parseCalendar(value: unknown): CalendarData {
  if (
    !isRecord(value) ||
    !Array.isArray(value.events) ||
    !['granted', 'restricted'].includes(String(value.access))
  )
    throw new Error('Invalid calendar response')
  const events = value.events.map(parseEvent)
  if (new Set(events.map((event) => event.id)).size !== events.length)
    throw new Error('Duplicate calendar event')
  // A restricted response must never expose the event catalogue.
  return {
    access: value.access as CalendarData['access'],
    events: value.access === 'restricted' ? [] : events,
  }
}
// Proposed API, deliberately opt-in until the backend implements docs/calendar.md.
export const apiCalendarRepository: CalendarRepository = {
  async load(signal) {
    return parseCalendar(await get('/calendar', signal))
  },
  async respond(event, action) {
    return parseEvent(
      await write(
        `/calendar/events/${encodeURIComponent(event.id)}/response`,
        'PUT',
        { action, version: event.version },
      ),
    )
  },
}
export function demoEvents(today = dayKey()): CalendarEvent[] {
  const monday = startOfWeek(today)
  const templates: [
    string,
    Direction,
    number,
    number,
    number,
    CalendarEvent['participation'],
  ][] = [
    ['Открытая мастерская', 'creative', 0, 10, 2, 'confirmed'],
    ['Знакомство с фондом', 'learning', 0, 15, 1.5, 'none'],
    ['Вместе готовим обед', 'community', 1, 11, 2, 'none'],
    ['Помогаем мастерской', 'help', 1, 16, 2, 'none'],
    ['Рисуем осень', 'creative', 2, 10, 2, 'confirmed'],
    ['Встреча волонтёров', 'learning', 2, 15, 1.5, 'pending'],
    ['Керамика: простые формы', 'creative', 3, 11, 2, 'none'],
    ['Прогулка в парке', 'community', 3, 15, 2, 'confirmed'],
    ['Готовимся к выставке', 'help', 4, 10, 2, 'none'],
    ['Музыкальная гостиная', 'community', 4, 14, 2, 'none'],
    ['Субботняя мастерская', 'creative', 5, 11, 3, 'none'],
    ['Вводная встреча', 'learning', 5, 12, 1.5, 'none'],
    ['Тёплая встреча за чаем', 'community', 6, 12, 2, 'none'],
    ['Рисуем вместе', 'creative', 8, 14, 2, 'none'],
    ['Мастерская открыток', 'creative', 10, 11, 2, 'pending'],
    ['Собираем материалы', 'help', 12, 10, 2, 'none'],
    ['Встреча перед занятием', 'learning', 15, 12, 1, 'none'],
  ]
  const at = (offset: number, hour: number) =>
    `${addDays(monday, offset)}T${String(Math.floor(hour)).padStart(2, '0')}:${hour % 1 ? '30' : '00'}:00+03:00`
  const events = templates.map(
    (
      [title, direction, offset, hour, duration, participation],
      index,
    ): CalendarEvent => ({
      id: `demo-${index}`,
      title,
      direction,
      startsAt: at(offset, hour),
      endsAt: at(offset, hour + duration),
      allDay: false,
      description:
        direction === 'creative'
          ? 'Поможем участникам раскрыть свои идеи и создать что-то своё. Подготовим материалы, поддержим во время занятия и вместе приведём мастерскую в порядок.'
          : direction === 'learning'
            ? 'Познакомимся с командой, обсудим принципы бережного общения и ответим на вопросы о волонтёрстве.'
            : direction === 'help'
              ? 'Небольшие дела, благодаря которым занятия становятся возможными. Разберём материалы и подготовим пространство вместе с командой.'
              : 'Проведём время вместе: будем общаться, делиться впечатлениями и поддерживать участников. Все детали обсудим перед встречей.',
      location:
        direction === 'learning'
          ? 'Онлайн · ссылку пришлёт координатор'
          : direction === 'community' && offset === 3
            ? 'Парк · место встречи уточнит координатор'
            : 'Творческая мастерская фонда · Москва',
      role: direction === 'learning' ? 'Участник встречи' : 'Помощник ведущего',
      requirements:
        direction === 'learning'
          ? 'Специальная подготовка не нужна. Возьмите с собой вопросы.'
          : 'Оформление и допуск к направлению подтверждает координатор. Приходите за 10 минут до начала.',
      coordinator: 'Координатор фонда',
      status: index === 12 ? 'cancelled' : 'scheduled',
      participation,
      registration: index === 9 ? 'full' : index === 16 ? 'restricted' : 'open',
      restrictionReason:
        index === 16
          ? 'Для этой встречи нужен допуск координатора к направлению.'
          : undefined,
      availablePlaces: index === 9 ? 0 : (index % 4) + 1,
      version: 0,
    }),
  )
  events.push({
    ...events[8],
    id: 'demo-all-day',
    title: 'Неделя добрых дел',
    startsAt: at(0, 0),
    endsAt: at(7, 0),
    allDay: true,
    availablePlaces: null,
    registration: 'closed',
    participation: 'none',
  })
  return events
}
export function createDemoRepository(): CalendarRepository {
  let events = demoEvents()
  return {
    async load(signal) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return {
        events: events.map((event) => ({ ...event })),
        access: 'granted',
      }
    },
    async respond(event, action) {
      const current = events.find((item) => item.id === event.id)
      if (!current || current.version !== event.version)
        throw new ApiError(
          409,
          'Условия изменились. Обновите календарь и проверьте мероприятие.',
        )
      if (action === 'apply' ? !canApply(current) : !canWithdraw(current))
        throw new ApiError(
          409,
          'Действие больше недоступно. Обновите календарь.',
        )
      const updated: CalendarEvent = {
        ...current,
        participation: action === 'apply' ? 'pending' : 'withdrawn',
        version: current.version + 1,
      }
      events = events.map((item) => (item.id === updated.id ? updated : item))
      return { ...updated }
    },
  }
}
