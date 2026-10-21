import { get, isRecord, write } from './client'

export interface Account {
  id: string
  email: string
  roles: string[]
}

export interface EmailVerification {
  verificationRequired: true
  expiresAt: string
  resendAfterSeconds: number
}

export interface AuthSession {
  account: Account | null
  verification: EmailVerification | null
}

function verification(value: unknown): EmailVerification {
  if (
    !isRecord(value) ||
    value.verificationRequired !== true ||
    typeof value.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    typeof value.resendAfterSeconds !== 'number' ||
    value.resendAfterSeconds < 0
  ) {
    throw new Error('Unexpected verification response')
  }
  return {
    verificationRequired: true,
    expiresAt: value.expiresAt,
    resendAfterSeconds: value.resendAfterSeconds,
  }
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

export async function getSession(signal?: AbortSignal): Promise<AuthSession> {
  const data = await get('/auth/session', signal)
  if (!isRecord(data) || !('account' in data))
    throw new Error('Unexpected session response')
  return {
    account: data.account === null ? null : account(data.account),
    verification:
      data.verification == null ? null : verification(data.verification),
  }
}

export async function register(email: string, password: string): Promise<void> {
  account(await write('/auth/register', 'POST', { email, password }))
}

export async function login(
  email: string,
  password: string,
): Promise<Account | EmailVerification> {
  const result = await write('/auth/login', 'POST', { email, password })
  return isRecord(result) && result.verificationRequired === true
    ? verification(result)
    : account(result)
}

export async function verifyEmailCode(code: string): Promise<Account> {
  return account(await write('/auth/email-code/verify', 'POST', { code }))
}

export async function resendEmailCode(): Promise<EmailVerification> {
  return verification(await write('/auth/email-code/resend', 'POST'))
}

export async function logout(): Promise<void> {
  await write('/auth/logout', 'POST')
}
