import { ApiError } from '../../shared/api/client'
import { demoId, readDemo, writeDemo } from './demoStore'

/*
 * Сотрудники и их роли. Сейчас роль координатора выдаёт оператор скриптом
 * scripts/coordinator-access.sh прямо в базе; публичного API нет. Раздел виден
 * только роли ADMIN и до появления API работает на демо-данных.
 */

export type StaffRole = 'COORDINATOR' | 'ADMIN'
export const staffRoleLabels: Record<StaffRole, string> = {
  COORDINATOR: 'Координатор',
  ADMIN: 'Администратор',
}

export interface StaffMember {
  id: string
  email: string
  roles: StaffRole[]
  grantedAt: string
  grantedBy: string
}

export interface StaffRepository {
  list(signal?: AbortSignal): Promise<StaffMember[]>
  grant(email: string, actorEmail: string): Promise<StaffMember[]>
  revoke(id: string, actorEmail: string): Promise<StaffMember[]>
}

export function emailProblem(email: string) {
  const value = email.trim()
  if (!value) return 'Укажите email сотрудника.'
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return 'Проверьте email: похоже, в нём ошибка.'
  return ''
}

const KEY = 'dm-demo-staff'

export function demoStaff(ownEmail: string): StaffRepository {
  const seed = (): StaffMember[] => [
    {
      id: demoId('staff'),
      email: ownEmail,
      roles: ['COORDINATOR', 'ADMIN'],
      grantedAt: new Date().toISOString(),
      grantedBy: 'scripts/coordinator-access.sh',
    },
    {
      id: demoId('staff'),
      email: 'olga.coordinator@example.test',
      roles: ['COORDINATOR'],
      grantedAt: new Date().toISOString(),
      grantedBy: ownEmail,
    },
  ]
  const all = () => readDemo<StaffMember[]>(KEY, seed)
  return {
    async list() {
      return all()
    },
    async grant(email, actorEmail) {
      const problem = emailProblem(email)
      if (problem) throw new ApiError(400, problem, { email: problem })
      const normalized = email.trim().toLowerCase()
      const members = all()
      if (members.some((member) => member.email === normalized))
        throw new ApiError(409, 'У этого человека уже есть роль координатора.')
      const next = [
        ...members,
        {
          id: demoId('staff'),
          email: normalized,
          roles: ['COORDINATOR'] as StaffRole[],
          grantedAt: new Date().toISOString(),
          grantedBy: actorEmail,
        },
      ]
      writeDemo(KEY, next)
      return next
    },
    async revoke(id, actorEmail) {
      const members = all()
      const target = members.find((member) => member.id === id)
      if (!target)
        throw new ApiError(404, 'Сотрудник не найден. Обновите список.')
      if (target.email === actorEmail)
        throw new ApiError(
          409,
          'Свою роль снять нельзя — попросите другого администратора.',
        )
      const next = members.filter((member) => member.id !== id)
      writeDemo(KEY, next)
      return next
    },
  }
}
