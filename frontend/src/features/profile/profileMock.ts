/**
 * МОК. Поля анкеты, которых ещё нет в API (`/volunteers/me`): возраст, опыт,
 * направления, способ связи, формат, место, «периодически» и согласие.
 * Пока бэкенд их не принимает, они хранятся только в этом браузере.
 * Когда появятся на сервере — перенести в ProfileDraft и удалить этот файл.
 */

/** Пять направлений фонда из презентации (с. 2) и «пока не знаю». */
export type Direction =
  'CREATIVITY' | 'EDUCATION' | 'INCLUSION' | 'MENTORING' | 'TRIPS' | 'UNSURE'
export type ContactMethod = 'PHONE' | 'TELEGRAM' | 'EMAIL' | 'ANY'
export type ParticipationFormat = 'STUDIO' | 'TRIPS' | 'INDIVIDUAL'

export interface ProfileExtras {
  age: string
  experience: string
  directions: Direction[]
  contactMethod: ContactMethod | ''
  formats: ParticipationFormat[]
  place: string
  /** «Периодически» — сервер знает только разово/регулярно, поэтому туда уходит REGULAR. */
  periodic: boolean
  consent: boolean
}

export const emptyExtras: ProfileExtras = {
  age: '',
  experience: '',
  directions: [],
  contactMethod: '',
  formats: [],
  place: '',
  periodic: false,
  consent: false,
}

export const directionOptions: Array<{
  value: Direction
  title: string
  description: string
}> = [
  {
    value: 'CREATIVITY',
    title: 'Творчество',
    description: 'Арт-лаборатория, ремесленные мастерские, арт-суббота',
  },
  {
    value: 'EDUCATION',
    title: 'Обучение',
    description: 'Образовательные занятия «Хочу больше знать»',
  },
  {
    value: 'INCLUSION',
    title: 'Инклюзия',
    description: 'Общее пространство и совместная жизнь сообщества',
  },
  {
    value: 'MENTORING',
    title: 'Индивидуальное сопровождение',
    description: 'Поддержка самостоятельности вместе со специалистами',
  },
  {
    value: 'TRIPS',
    title: 'Выездные спецпроекты',
    description: 'Арт-резиденция на Волге, зимний отдых в Сорочанах',
  },
  {
    value: 'UNSURE',
    title: 'Пока не знаю',
    description: 'Определюсь, когда познакомлюсь с фондом',
  },
]

export const contactOptions: Array<{ value: ContactMethod; title: string }> = [
  { value: 'PHONE', title: 'Звонок' },
  { value: 'TELEGRAM', title: 'Telegram' },
  { value: 'EMAIL', title: 'Email' },
  { value: 'ANY', title: 'Любой' },
]

export const formatOptions: Array<{
  value: ParticipationFormat
  title: string
}> = [
  { value: 'STUDIO', title: 'Занятия в студии' },
  { value: 'TRIPS', title: 'Выезды' },
  { value: 'INDIVIDUAL', title: 'Индивидуальное сопровождение' },
]

/** «Пока не знаю» исключает конкретные направления, и наоборот. */
export function toggleDirection(selected: Direction[], value: Direction) {
  if (selected.includes(value)) return selected.filter((item) => item !== value)
  if (value === 'UNSURE') return ['UNSURE'] as Direction[]
  return [...selected.filter((item) => item !== 'UNSURE'), value]
}

export function toggleValue<T>(selected: T[], value: T) {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value]
}

/** Возраст — целое число; ограничения по возрасту фонд ещё не задал. */
export function ageError(age: string) {
  if (!age) return ''
  const value = Number(age)
  return Number.isInteger(value) && value >= 1 && value <= 120
    ? ''
    : 'Укажите возраст целым числом.'
}

const storageKey = (owner: string) => `dm-profile-mock:${owner}`

function only<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  return Array.isArray(value)
    ? value.filter((item): item is T => allowed.includes(item as T))
    : []
}

export function loadExtras(owner: string): ProfileExtras {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(storageKey(owner)) ?? 'null',
    )
    if (!raw || typeof raw !== 'object') return { ...emptyExtras }
    const value = raw as Record<string, unknown>
    const text = (key: string) =>
      typeof value[key] === 'string' ? (value[key] as string) : ''
    const contact = contactOptions.find(
      (option) => option.value === value.contactMethod,
    )
    return {
      age: text('age'),
      experience: text('experience'),
      place: text('place'),
      directions: only(
        value.directions,
        directionOptions.map((option) => option.value),
      ),
      formats: only(
        value.formats,
        formatOptions.map((option) => option.value),
      ),
      contactMethod: contact?.value ?? '',
      periodic: value.periodic === true,
      consent: value.consent === true,
    }
  } catch {
    return { ...emptyExtras }
  }
}

export function saveExtras(owner: string, extras: ProfileExtras) {
  try {
    localStorage.setItem(storageKey(owner), JSON.stringify(extras))
  } catch {
    // Без доступа к хранилищу мок-поля просто не переживут перезагрузку.
  }
}
