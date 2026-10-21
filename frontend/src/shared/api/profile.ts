import { ApiError, get, isRecord, write } from './client'

export type Regularity = 'UNSURE' | 'ONE_OFF' | 'REGULAR'

export interface ProfileDraft {
  displayName: string
  phone: string
  interests: string
  skills: string
  availability: string
  regularity: Regularity
  version: number | null
}

export interface Profile extends ProfileDraft {
  id: string
  version: number
  updatedAt: string
}

export const emptyProfile: ProfileDraft = {
  displayName: '',
  phone: '',
  interests: '',
  skills: '',
  availability: '',
  regularity: 'UNSURE',
  version: null,
}

function profile(value: unknown): Profile {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.version !== 'number' ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0 ||
    typeof value.displayName !== 'string' ||
    typeof value.phone !== 'string' ||
    typeof value.interests !== 'string' ||
    typeof value.skills !== 'string' ||
    typeof value.availability !== 'string' ||
    (value.regularity !== 'UNSURE' &&
      value.regularity !== 'ONE_OFF' &&
      value.regularity !== 'REGULAR')
  ) {
    throw new Error('Unexpected profile response')
  }
  return {
    id: value.id,
    updatedAt: value.updatedAt,
    version: value.version,
    displayName: value.displayName,
    phone: value.phone,
    interests: value.interests,
    skills: value.skills,
    availability: value.availability,
    regularity: value.regularity,
  }
}

export async function getMyProfile(
  signal?: AbortSignal,
): Promise<Profile | null> {
  try {
    return profile(await get('/volunteers/me', signal))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function saveMyProfile(draft: ProfileDraft): Promise<Profile> {
  const {
    displayName,
    phone,
    interests,
    skills,
    availability,
    regularity,
    version,
  } = draft
  return profile(
    await write('/volunteers/me', 'PUT', {
      displayName,
      phone,
      interests,
      skills,
      availability,
      regularity,
      version,
    }),
  )
}
