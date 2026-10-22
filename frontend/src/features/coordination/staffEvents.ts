import { ApiError } from '../../shared/api/client'
import { addDays, dayKey, type Direction } from '../calendar/model'
import { demoId, readDemo, writeDemo } from './demoStore'

/*
 * Мероприятия со стороны координатора: создать, опубликовать, увидеть отклики,
 * подтвердить или отклонить, отменить. Волонтёрская сторона — features/calendar
 * (docs/calendar.md). Серверного API пока нет (BE-04), поэтому данные демо.
 */

export const eventStatusLabels = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Опубликовано',
  CANCELLED: 'Отменено',
} as const
export type StaffEventStatus = keyof typeof eventStatusLabels

export const responseLabels = {
  PENDING: 'Ждёт решения',
  CONFIRMED: 'Подтверждено',
  DECLINED: 'Отклонено',
  WITHDRAWN: 'Отозвал отклик',
} as const
export type ResponseStatus = keyof typeof responseLabels

export interface EventResponse {
  id: string
  volunteerName: string
  status: ResponseStatus
  respondedAt: string
}
export interface StaffEventFields {
  title: string
  description: string
  direction: Direction
  date: string
  start: string
  end: string
  location: string
  roleName: string
  requirements: string
  /** null — без ограничения мест. */
  capacity: number | null
}
export interface StaffEvent extends StaffEventFields {
  id: string
  status: StaffEventStatus
  version: number
  responses: EventResponse[]
}

export const emptyEvent = (date = dayKey()): StaffEventFields => ({
  title: '',
  description: '',
  direction: 'creative',
  date,
  start: '11:00',
  end: '13:00',
  location: '',
  roleName: '',
  requirements: '',
  capacity: 4,
})

export function eventProblems(fields: StaffEventFields) {
  const problems: Partial<Record<keyof StaffEventFields, string>> = {}
  if (!fields.title.trim()) problems.title = 'Назовите мероприятие.'
  else if (fields.title.trim().length > 120)
    problems.title = 'Название — до 120 символов.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) problems.date = 'Укажите дату.'
  if (!/^\d{2}:\d{2}$/.test(fields.start)) problems.start = 'Укажите начало.'
  if (!/^\d{2}:\d{2}$/.test(fields.end)) problems.end = 'Укажите окончание.'
  else if (fields.end <= fields.start)
    problems.end = 'Окончание должно быть позже начала.'
  if (!fields.location.trim()) problems.location = 'Укажите место или «онлайн».'
  if (
    fields.capacity !== null &&
    (!Number.isInteger(fields.capacity) ||
      fields.capacity < 1 ||
      fields.capacity > 500)
  )
    problems.capacity = 'Количество мест — целое число от 1 до 500.'
  return problems
}

export const confirmedCount = (event: StaffEvent) =>
  event.responses.filter((response) => response.status === 'CONFIRMED').length
export const pendingCount = (event: StaffEvent) =>
  event.responses.filter((response) => response.status === 'PENDING').length

export interface StaffEventRepository {
  list(signal?: AbortSignal): Promise<StaffEvent[]>
  save(
    id: string | null,
    version: number,
    fields: StaffEventFields,
  ): Promise<StaffEvent>
  setStatus(
    id: string,
    version: number,
    status: StaffEventStatus,
  ): Promise<StaffEvent>
  decide(
    id: string,
    version: number,
    responseId: string,
    status: 'CONFIRMED' | 'DECLINED',
  ): Promise<StaffEvent>
}

const KEY = 'dm-demo-staff-events'

function seed(today = dayKey()): StaffEvent[] {
  const response = (
    volunteerName: string,
    status: ResponseStatus,
  ): EventResponse => ({
    id: demoId('resp'),
    volunteerName,
    status,
    respondedAt: new Date().toISOString(),
  })
  const base = {
    description: '',
    requirements: 'Приходите за 10 минут до начала.',
    version: 0,
  }
  return [
    {
      ...base,
      id: demoId('event'),
      title: 'Субботняя мастерская',
      description:
        'Помогаем участникам с керамикой: готовим материалы, поддерживаем во время занятия, убираем мастерскую.',
      direction: 'creative',
      date: addDays(today, 2),
      start: '11:00',
      end: '14:00',
      location: 'Творческая мастерская фонда · Москва',
      roleName: 'Помощник ведущего',
      capacity: 3,
      status: 'PUBLISHED',
      responses: [
        response('Анна С.', 'CONFIRMED'),
        response('Михаил О.', 'PENDING'),
        response('Дарья К.', 'PENDING'),
      ],
    },
    {
      ...base,
      id: demoId('event'),
      title: 'Знакомство с фондом',
      direction: 'learning',
      date: addDays(today, 4),
      start: '18:00',
      end: '19:30',
      location: 'Онлайн · ссылку пришлёт координатор',
      roleName: 'Участник встречи',
      requirements: 'Специальная подготовка не нужна.',
      capacity: null,
      status: 'PUBLISHED',
      responses: [response('Елизавета Н.', 'PENDING')],
    },
    {
      ...base,
      id: demoId('event'),
      title: 'Прогулка в парке',
      direction: 'community',
      date: addDays(today, 7),
      start: '15:00',
      end: '17:00',
      location: 'Парк · место встречи уточнит координатор',
      roleName: 'Сопровождающий',
      capacity: 4,
      status: 'DRAFT',
      responses: [],
    },
  ]
}

const all = () => readDemo<StaffEvent[]>(KEY, () => seed())
function replace(event: StaffEvent) {
  writeDemo(
    KEY,
    all().map((item) => (item.id === event.id ? event : item)),
  )
  return event
}
function find(id: string, version: number) {
  const event = all().find((item) => item.id === id)
  if (!event)
    throw new ApiError(404, 'Мероприятие не найдено. Обновите список.')
  if (event.version !== version)
    throw new ApiError(
      409,
      'Мероприятие уже изменили в другом окне. Обновите список.',
    )
  return event
}

export const demoStaffEvents: StaffEventRepository = {
  async list() {
    return all()
  },
  async save(id, version, fields) {
    const problems = eventProblems(fields)
    const first = Object.values(problems)[0]
    if (first)
      throw new ApiError(400, first, problems as Record<string, string>)
    const clean = {
      ...fields,
      title: fields.title.trim(),
      location: fields.location.trim(),
      roleName: fields.roleName.trim(),
    }
    if (id === null) {
      const created: StaffEvent = {
        ...clean,
        id: demoId('event'),
        status: 'DRAFT',
        version: 0,
        responses: [],
      }
      writeDemo(KEY, [...all(), created])
      return created
    }
    const current = find(id, version)
    if (clean.capacity !== null && confirmedCount(current) > clean.capacity)
      throw new ApiError(
        409,
        'Подтверждено больше людей, чем новое число мест. Сначала отклоните лишние отклики.',
      )
    return replace({ ...current, ...clean, version: version + 1 })
  },
  async setStatus(id, version, status) {
    const current = find(id, version)
    return replace({ ...current, status, version: version + 1 })
  },
  async decide(id, version, responseId, status) {
    const current = find(id, version)
    if (current.status !== 'PUBLISHED')
      throw new ApiError(
        409,
        'Отклики решаются только у опубликованного мероприятия.',
      )
    if (
      status === 'CONFIRMED' &&
      current.capacity !== null &&
      confirmedCount(current) >= current.capacity
    )
      throw new ApiError(
        409,
        'Свободных мест нет. Увеличьте число мест или отклоните другой отклик.',
      )
    return replace({
      ...current,
      version: version + 1,
      responses: current.responses.map((response) =>
        response.id === responseId ? { ...response, status } : response,
      ),
    })
  },
}

export const staffEventRepository: StaffEventRepository = demoStaffEvents
