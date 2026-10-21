import { get, isRecord } from './client'
import type { Regularity } from './profile'

export interface VolunteerSummary {
  id: string
  displayName: string
  regularity: Regularity
  availability: string
  createdAt: string
}
export interface VolunteerCard extends VolunteerSummary {
  email: string | null
  phone: string
  interests: string
  skills: string
  updatedAt: string
}
export interface VolunteerPage {
  items: VolunteerSummary[]
  total: number
  page: number
  size: number
}
export const regularityLabels: Record<Regularity, string> = {
  UNSURE: 'Пока присматривается',
  ONE_OFF: 'Разовая помощь',
  REGULAR: 'Регулярное участие',
}

function summary(value: unknown): VolunteerSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.availability !== 'string' ||
    typeof value.createdAt !== 'string' ||
    (value.regularity !== 'UNSURE' &&
      value.regularity !== 'ONE_OFF' &&
      value.regularity !== 'REGULAR')
  ) {
    throw new Error('Unexpected volunteer response')
  }
  return {
    id: value.id,
    displayName: value.displayName,
    availability: value.availability,
    createdAt: value.createdAt,
    regularity: value.regularity,
  }
}

export async function listVolunteers(
  q: string,
  regularity: string,
  page: number,
  signal?: AbortSignal,
): Promise<VolunteerPage> {
  const params = new URLSearchParams({ q, page: String(page), size: '20' })
  if (regularity) params.set('regularity', regularity)
  const value = await get(`/coordination/volunteers?${params}`, signal)
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    typeof value.total !== 'number' ||
    typeof value.page !== 'number' ||
    typeof value.size !== 'number'
  )
    throw new Error('Unexpected directory response')
  return {
    items: value.items.map(summary),
    total: value.total,
    page: value.page,
    size: value.size,
  }
}

export async function getVolunteer(
  id: string,
  signal?: AbortSignal,
): Promise<VolunteerCard> {
  const value = await get(
    `/coordination/volunteers/${encodeURIComponent(id)}`,
    signal,
  )
  const base = summary(value)
  if (
    !isRecord(value) ||
    (value.email !== null && typeof value.email !== 'string') ||
    typeof value.phone !== 'string' ||
    typeof value.interests !== 'string' ||
    typeof value.skills !== 'string' ||
    typeof value.updatedAt !== 'string'
  )
    throw new Error('Unexpected volunteer card')
  return {
    ...base,
    email: value.email,
    phone: value.phone,
    interests: value.interests,
    skills: value.skills,
    updatedAt: value.updatedAt,
  }
}
