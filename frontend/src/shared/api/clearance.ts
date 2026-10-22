import { ApiError, get, isRecord, write } from './client'

export const paperworkLabels = {
  NOT_CONFIRMED: 'Оформление не подтверждено',
  CONFIRMED: 'Оформление подтверждено',
  NEEDS_UPDATE: 'Нужно уточнить оформление',
} as const
export const admissionLabels = {
  NOT_GRANTED: 'Допуск не выдан',
  GRANTED: 'Допуск подтверждён',
  SUSPENDED: 'Допуск приостановлен',
  REVOKED: 'Допуск отозван',
} as const
export type PaperworkStatus = keyof typeof paperworkLabels
export type AdmissionStatus = keyof typeof admissionLabels
export type DecisionStatus = PaperworkStatus | AdmissionStatus
export interface VolunteerRole {
  id: string
  name: string
  description: string
  version: number
}
export interface RoleFields {
  name: string
  description: string
}
export interface DecisionFields {
  status: DecisionStatus
  message: string
  internalNote: string
}
export interface DecisionSnapshot {
  fields: DecisionFields
  version: number
  updatedAt: string | null
  actorId: string | null
  actorEmail: string | null
}
export interface DecisionHistory {
  current: DecisionSnapshot
  history: DecisionSnapshot[]
}
export interface MyClearance {
  paperwork: {
    status: PaperworkStatus
    message: string
    updatedAt: string | null
  }
  admissions: {
    role: VolunteerRole
    status: AdmissionStatus
    message: string
    updatedAt: string
  }[]
}

function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Unexpected version')
  return value
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Unexpected string')
  return value
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value)
}
function status<S extends string>(
  value: unknown,
  labels: Record<S, string>,
): S {
  if (typeof value !== 'string' || !Object.hasOwn(labels, value))
    throw new Error('Unexpected decision status')
  return value as S
}
function role(value: unknown): VolunteerRole {
  if (!isRecord(value)) throw new Error('Unexpected volunteer role')
  return {
    id: text(value.id),
    name: text(value.name),
    description: text(value.description),
    version: version(value.version),
  }
}
function snapshot(value: unknown, roleId: string | null): DecisionSnapshot {
  if (!isRecord(value) || !isRecord(value.fields))
    throw new Error('Unexpected decision')
  return {
    fields: {
      status:
        roleId === null
          ? status(value.fields.status, paperworkLabels)
          : status(value.fields.status, admissionLabels),
      message: text(value.fields.message),
      internalNote: text(value.fields.internalNote),
    },
    version: version(value.version),
    updatedAt: nullableText(value.updatedAt),
    actorId: nullableText(value.actorId),
    actorEmail: nullableText(value.actorEmail),
  }
}
function history(value: unknown, roleId: string | null): DecisionHistory {
  if (!isRecord(value) || !Array.isArray(value.history))
    throw new Error('Unexpected decision history')
  return {
    current: snapshot(value.current, roleId),
    history: value.history.map((item) => snapshot(item, roleId)),
  }
}
function path(volunteerId: string, roleId: string | null) {
  return `/coordination/volunteers/${encodeURIComponent(volunteerId)}/${roleId === null ? 'paperwork' : `admissions/${encodeURIComponent(roleId)}`}`
}
export async function getDecision(
  volunteerId: string,
  roleId: string | null,
  signal?: AbortSignal,
): Promise<DecisionHistory> {
  return history(await get(path(volunteerId, roleId), signal), roleId)
}
export async function saveDecision(
  volunteerId: string,
  roleId: string | null,
  version: number,
  fields: DecisionFields,
): Promise<DecisionHistory> {
  return history(
    await write(path(volunteerId, roleId), 'PUT', { version, fields }),
    roleId,
  )
}
export async function listVolunteerRoles(
  signal?: AbortSignal,
): Promise<VolunteerRole[]> {
  const value = await get('/coordination/volunteer-roles', signal)
  if (!Array.isArray(value)) throw new Error('Unexpected volunteer roles')
  return value.map(role)
}
export async function saveVolunteerRole(
  current: VolunteerRole | null,
  fields: RoleFields,
): Promise<VolunteerRole> {
  return role(
    current
      ? await write(
          `/coordination/volunteer-roles/${encodeURIComponent(current.id)}`,
          'PUT',
          { version: current.version, fields },
        )
      : await write('/coordination/volunteer-roles', 'POST', fields),
  )
}
export async function getMyClearance(
  signal?: AbortSignal,
): Promise<MyClearance | null> {
  try {
    const value = await get('/onboarding/me/clearance', signal)
    if (
      !isRecord(value) ||
      !isRecord(value.paperwork) ||
      !Array.isArray(value.admissions)
    )
      throw new Error('Unexpected clearance')
    return {
      paperwork: {
        status: status(value.paperwork.status, paperworkLabels),
        message: text(value.paperwork.message),
        updatedAt: nullableText(value.paperwork.updatedAt),
      },
      admissions: value.admissions.map((item: unknown) => {
        if (!isRecord(item)) throw new Error('Unexpected admission')
        return {
          role: role(item.role),
          status: status(item.status, admissionLabels),
          message: text(item.message),
          updatedAt: text(item.updatedAt),
        }
      }),
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}
