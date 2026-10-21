import { ApiError, get, isRecord, write } from '../../shared/api/client'
import { readDemo, writeDemo } from './demoStore'

/**
 * Приём в команду — отдельный серверный факт: его нельзя выводить из
 * рассмотрения (CONTINUE), документов или допуска. Только после принятия
 * волонтёру открывается обучение (docs 19 в репозитории с описанием кейса).
 */
export const membershipLabels = {
  NOT_ACCEPTED: 'Не принят',
  ACCEPTED: 'Принят в команду',
  PAUSED: 'Приостановлено',
  REVOKED: 'Принятие отозвано',
} as const
export type MembershipStatus = keyof typeof membershipLabels
export const membershipTone = {
  NOT_ACCEPTED: 'muted',
  ACCEPTED: 'success',
  PAUSED: 'waiting',
  REVOKED: 'neutral',
} as const

export interface MembershipFields {
  status: MembershipStatus
  message: string
}
export interface MembershipSnapshot {
  fields: MembershipFields
  version: number
  updatedAt: string | null
  actorEmail: string | null
}
export interface Membership {
  current: MembershipSnapshot
  history: MembershipSnapshot[]
}
export interface MembershipRepository {
  get(volunteerId: string, signal?: AbortSignal): Promise<Membership>
  save(
    volunteerId: string,
    version: number,
    fields: MembershipFields,
    actorEmail: string,
  ): Promise<Membership>
  /** Состояния для списка анкет; API может вернуть их прямо в списке. */
  statuses(ids: string[]): Promise<Record<string, MembershipStatus>>
}

export function membershipProblems(fields: MembershipFields) {
  const message = fields.message.trim()
  if (message.length > 2000)
    return { message: 'Пояснение должно быть не длиннее 2000 символов.' }
  if (
    fields.status !== 'ACCEPTED' &&
    fields.status !== 'NOT_ACCEPTED' &&
    !message
  )
    return { message: 'Объясните человеку, почему изменилось решение.' }
  return {}
}

const initial = (): Membership => ({
  current: {
    fields: { status: 'NOT_ACCEPTED', message: '' },
    version: 0,
    updatedAt: null,
    actorEmail: null,
  },
  history: [],
})

const KEY = 'dm-demo-membership'
type Store = Record<string, Membership>
const store = () => readDemo<Store>(KEY, () => ({}))

export const demoMembership: MembershipRepository = {
  async get(volunteerId) {
    return store()[volunteerId] ?? initial()
  },
  async save(volunteerId, version, fields, actorEmail) {
    const problems = membershipProblems(fields)
    if (problems.message) throw new ApiError(400, problems.message, problems)
    const all = store()
    const current = all[volunteerId] ?? initial()
    const normalized = { status: fields.status, message: fields.message.trim() }
    const same =
      current.current.fields.status === normalized.status &&
      current.current.fields.message === normalized.message
    if (same) return current
    if (current.current.version !== version)
      throw new ApiError(
        409,
        'Решение о приёме уже изменили в другом окне. Загрузите актуальное состояние.',
      )
    const snapshot: MembershipSnapshot = {
      fields: normalized,
      version: version + 1,
      updatedAt: new Date().toISOString(),
      actorEmail,
    }
    const next = {
      current: snapshot,
      history: [snapshot, ...current.history].slice(0, 50),
    }
    writeDemo(KEY, { ...all, [volunteerId]: next })
    return next
  },
  async statuses(ids) {
    const all = store()
    return Object.fromEntries(
      ids.map((id) => [id, all[id]?.current.fields.status ?? 'NOT_ACCEPTED']),
    )
  },
}

function snapshot(value: unknown): MembershipSnapshot {
  if (
    !isRecord(value) ||
    !isRecord(value.fields) ||
    !(String(value.fields.status) in membershipLabels) ||
    typeof value.fields.message !== 'string' ||
    typeof value.version !== 'number' ||
    (value.updatedAt !== null && typeof value.updatedAt !== 'string') ||
    (value.actorEmail !== null && typeof value.actorEmail !== 'string')
  )
    throw new Error('Unexpected membership response')
  return value as unknown as MembershipSnapshot
}
function membership(value: unknown): Membership {
  if (!isRecord(value) || !Array.isArray(value.history))
    throw new Error('Unexpected membership response')
  return {
    current: snapshot(value.current),
    history: value.history.map(snapshot),
  }
}
const path = (id: string) =>
  `/coordination/volunteers/${encodeURIComponent(id)}/membership`

/** Предлагаемый API (BE-02), подключается заменой membershipRepository ниже. */
export const apiMembership: MembershipRepository = {
  async get(volunteerId, signal) {
    return membership(await get(path(volunteerId), signal))
  },
  async save(volunteerId, version, fields) {
    return membership(
      await write(path(volunteerId), 'PUT', { version, fields }),
    )
  },
  async statuses() {
    return {}
  },
}

export const membershipRepository: MembershipRepository = demoMembership
export const membershipIsDemo = true
