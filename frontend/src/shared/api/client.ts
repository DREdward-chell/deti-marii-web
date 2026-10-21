export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string>

  constructor(
    status: number,
    message: string,
    fields: Record<string, string> = {},
  ) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init.headers },
  })
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null)
    const fallback =
      response.status === 401
        ? 'Сессия завершилась. Войдите в аккаунт ещё раз.'
        : 'Не удалось выполнить действие. Попробуйте ещё раз.'
    const fields =
      isRecord(problem) && isRecord(problem.errors)
        ? Object.fromEntries(
            Object.entries(problem.errors).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === 'string',
            ),
          )
        : {}
    throw new ApiError(
      response.status,
      isRecord(problem) && typeof problem.detail === 'string'
        ? problem.detail
        : fallback,
      fields,
    )
  }
  if (response.status === 204) return undefined
  return response.json()
}

export function get(path: string, signal?: AbortSignal): Promise<unknown> {
  return request(path, { signal })
}

export async function write(
  path: string,
  method: 'POST' | 'PUT',
  body?: unknown,
): Promise<unknown> {
  // Authentication and logout invalidate the previous CSRF token.
  const csrf = await get('/auth/csrf')
  if (
    !isRecord(csrf) ||
    typeof csrf.headerName !== 'string' ||
    typeof csrf.token !== 'string'
  ) {
    throw new Error('Unexpected CSRF response')
  }
  return request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      [csrf.headerName]: csrf.token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.'
}
