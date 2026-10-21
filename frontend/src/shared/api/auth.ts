import { get, isRecord, write } from './client'

export interface Account {
  id: string
  email: string
  roles: string[]
}

function account(value: unknown): Account {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.email !== 'string' ||
    !Array.isArray(value.roles) ||
    !value.roles.every((role) => typeof role === 'string')
  ) {
    throw new Error('Unexpected account response')
  }
  return { id: value.id, email: value.email, roles: value.roles }
}

export async function getSession(
  signal?: AbortSignal,
): Promise<Account | null> {
  const data = await get('/auth/session', signal)
  if (!isRecord(data) || !('account' in data))
    throw new Error('Unexpected session response')
  return data.account === null ? null : account(data.account)
}

export async function register(email: string, password: string): Promise<void> {
  account(await write('/auth/register', 'POST', { email, password }))
}

export async function login(email: string, password: string): Promise<Account> {
  return account(await write('/auth/login', 'POST', { email, password }))
}

export async function logout(): Promise<void> {
  await write('/auth/logout', 'POST')
}
