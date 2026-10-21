import { ApiError, get, isRecord, write } from './client'

export const reviewLabels = {
  NEW: 'Анкета получена',
  IN_REVIEW: 'Знакомимся',
  CONTINUE: 'Продолжаем знакомство',
  PAUSED: 'Знакомство на паузе',
  DECLINED: 'Знакомство завершено',
} as const
export type ReviewStatus = keyof typeof reviewLabels
export type NextStepOwner = 'VOLUNTEER' | 'COORDINATOR'
export const ownerLabels = { VOLUNTEER: 'Волонтёр', COORDINATOR: 'Координатор' }

export interface PublicReview {
  status: ReviewStatus
  message: string
  nextStep: string
  nextStepOwner: NextStepOwner | null
  nextStepDate: string | null
  updatedAt: string | null
}
export interface ReviewFields extends Omit<PublicReview, 'updatedAt'> {
  internalNote: string
}
export interface ReviewSnapshot {
  fields: ReviewFields
  version: number
  updatedAt: string | null
  actorId: string | null
  actorEmail: string | null
}
export interface StaffReview {
  current: ReviewSnapshot
  history: ReviewSnapshot[]
}

function publicFields(value: unknown): Omit<PublicReview, 'updatedAt'> {
  if (
    !isRecord(value) ||
    typeof value.status !== 'string' ||
    !Object.hasOwn(reviewLabels, value.status) ||
    typeof value.message !== 'string' ||
    typeof value.nextStep !== 'string' ||
    (value.nextStepOwner !== null &&
      value.nextStepOwner !== 'VOLUNTEER' &&
      value.nextStepOwner !== 'COORDINATOR') ||
    (value.nextStepDate !== null &&
      (typeof value.nextStepDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.nextStepDate)))
  )
    throw new Error('Unexpected review fields')
  return {
    status: value.status as ReviewStatus,
    message: value.message,
    nextStep: value.nextStep,
    nextStepOwner: value.nextStepOwner,
    nextStepDate: value.nextStepDate,
  }
}
function nullableString(value: unknown): string | null {
  if (value === null || typeof value === 'string') return value
  throw new Error('Unexpected nullable string')
}
function snapshot(value: unknown): ReviewSnapshot {
  if (
    !isRecord(value) ||
    !isRecord(value.fields) ||
    typeof value.fields.internalNote !== 'string' ||
    typeof value.version !== 'number' ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0
  )
    throw new Error('Unexpected review snapshot')
  return {
    fields: {
      ...publicFields(value.fields),
      internalNote: value.fields.internalNote,
    },
    version: value.version,
    updatedAt: nullableString(value.updatedAt),
    actorId: nullableString(value.actorId),
    actorEmail: nullableString(value.actorEmail),
  }
}
function staffReview(value: unknown): StaffReview {
  if (!isRecord(value) || !Array.isArray(value.history))
    throw new Error('Unexpected staff review')
  return {
    current: snapshot(value.current),
    history: value.history.map(snapshot),
  }
}
export async function getMyOnboarding(
  signal?: AbortSignal,
): Promise<PublicReview | null> {
  try {
    const value = await get('/onboarding/me', signal)
    if (!isRecord(value)) throw new Error('Unexpected onboarding response')
    return {
      ...publicFields(value),
      updatedAt: nullableString(value.updatedAt),
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}
export async function getReview(
  id: string,
  signal?: AbortSignal,
): Promise<StaffReview> {
  return staffReview(
    await get(
      `/coordination/volunteers/${encodeURIComponent(id)}/review`,
      signal,
    ),
  )
}
export async function saveReview(
  id: string,
  version: number,
  fields: ReviewFields,
): Promise<StaffReview> {
  return staffReview(
    await write(
      `/coordination/volunteers/${encodeURIComponent(id)}/review`,
      'PUT',
      { version, fields },
    ),
  )
}

// A date is a calendar day, not an instant. Avoid timezone shifts when rendering it.
export function reviewDate(value: string): string {
  return value.split('-').reverse().join('.')
}
