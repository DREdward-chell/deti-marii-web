import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

const account = {
  id: 'staff-1',
  email: 'staff@example.org',
  roles: ['COORDINATOR', 'VOLUNTEER'],
}
const verification = {
  verificationRequired: true,
  expiresAt: '2099-10-21T12:05:00Z',
  resendAfterSeconds: 0,
}
const card = {
  id: 'profile-1',
  displayName: 'Анна',
  email: 'anna@example.org',
  phone: '',
  interests: 'Рисование',
  skills: 'Фотография',
  regularity: 'REGULAR',
  availability: 'По субботам',
  createdAt: '2026-10-21T12:00:00Z',
  updatedAt: '2026-10-21T12:01:00Z',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
function mockStaffApi(
  options: {
    signedIn?: boolean
    pending?: boolean
    listFailure?: number
    missingCard?: boolean
  } = {},
) {
  let signedIn = options.signedIn ?? false
  let pending = options.pending ?? false
  let failList = options.listFailure
  const requests: string[] = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(url)
    if (url === '/api/v1/auth/session')
      return response({
        account: signedIn ? account : null,
        verification: pending ? verification : null,
      })
    if (url === '/api/v1/auth/csrf')
      return response({ headerName: 'X-CSRF-TOKEN', token: 'test-csrf' })
    if (init?.method)
      expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe('test-csrf')
    if (url === '/api/v1/auth/login') {
      pending = true
      return response(verification, 202)
    }
    if (url === '/api/v1/auth/email-code/resend')
      return response({ ...verification, resendAfterSeconds: 60 })
    if (url === '/api/v1/auth/email-code/verify') {
      if (JSON.parse(String(init?.body)).code !== '123456')
        return response({ detail: 'Код неверен или больше не действует.' }, 401)
      signedIn = true
      pending = false
      return response(account)
    }
    if (url === '/api/v1/auth/logout') {
      signedIn = false
      pending = false
      return new Response(null, { status: 204 })
    }
    if (url.startsWith('/api/v1/coordination/volunteers?')) {
      if (failList)
        return response({ detail: 'Не удалось загрузить анкеты.' }, failList)
      const params = new URL(url, 'http://localhost').searchParams
      const page = Number(params.get('page'))
      return response({ items: [card], total: 21, page, size: 20 })
    }
    if (url === '/api/v1/coordination/volunteers/profile-1')
      return options.missingCard
        ? response({ detail: 'Анкета не найдена.' }, 404)
        : response(card)
    if (url === '/api/v1/coordination/volunteer-roles') return response([])
    if (url === '/api/v1/coordination/volunteers/profile-1/paperwork')
      return response({
        current: {
          fields: { status: 'NOT_CONFIRMED', message: '', internalNote: '' },
          version: 0,
          updatedAt: null,
          actorId: null,
          actorEmail: null,
        },
        history: [],
      })
    if (url === '/api/v1/coordination/volunteers/profile-1/review')
      return response({
        current: {
          version: 0,
          updatedAt: null,
          actorId: null,
          actorEmail: null,
          fields: {
            status: 'NEW',
            message: '',
            nextStep: '',
            nextStepOwner: null,
            nextStepDate: null,
            internalNote: '',
          },
        },
        history: [],
      })
    throw new Error('Unexpected request: ' + url)
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    requests,
    recover: () => {
      failList = undefined
    },
    fetchMock,
  }
}

describe('staff login and coordinator workspace', () => {
  it('opens login directly when the saved session was revoked before page load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({ detail: 'Доступ изменился. Войдите снова.' }, 401),
      ),
    )
    render(<App />)
    expect(
      await screen.findByRole('button', { name: 'Войти' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Доступ изменился')
    expect(
      screen.queryByRole('button', { name: 'Попробовать снова' }),
    ).not.toBeInTheDocument()
  })
  it('keeps staff anonymous until a correct email code and then opens a read-only card', async () => {
    const api = mockStaffApi()
    render(<App />)
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: account.email },
    })
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'long staff passphrase' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    const code = await screen.findByLabelText('Код из письма')
    expect(api.requests.some((url) => url.includes('/coordination/'))).toBe(
      false,
    )
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument()
    fireEvent.change(code, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить вход' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Код неверен')
    expect(api.requests.some((url) => url.includes('/coordination/'))).toBe(
      false,
    )
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить вход' }))
    fireEvent.click(await screen.findByRole('button', { name: /Анна/ }))
    expect(await screen.findByText(card.email)).toBeInTheDocument()
    expect(screen.getByText('Фотография')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Сохранить анкету' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '← К списку анкет' }))
    expect(
      await screen.findByRole('button', { name: /Анна/ }),
    ).toBeInTheDocument()
  })

  it('restores a pending email step after reload and allows a resend with cooldown', async () => {
    mockStaffApi({ pending: true })
    render(<App />)
    expect(await screen.findByLabelText('Код из письма')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Отправить код повторно' }),
    )
    expect(await screen.findByText(/Новый код отправлен/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Отправить повторно через/ }),
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Начать вход заново' }))
    expect(await screen.findByLabelText('Пароль')).toBeInTheDocument()
  })

  it('resets pagination when applying a new name and regularity filter', async () => {
    const api = mockStaffApi({ signedIn: true })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Далее' }))
    expect(await screen.findByText('Страница 2')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Поиск по имени'), {
      target: { value: 'Анна' },
    })
    fireEvent.change(screen.getByLabelText('Ритм участия'), {
      target: { value: 'REGULAR' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }))
    expect(await screen.findByText('Страница 1')).toBeInTheDocument()
    const query = new URL(api.requests.at(-1)!, 'http://localhost').searchParams
    expect(Object.fromEntries(query)).toMatchObject({
      q: 'Анна',
      regularity: 'REGULAR',
      page: '0',
      size: '20',
    })
  })

  it('distinguishes a failed list load from an empty list and supports retry', async () => {
    const api = mockStaffApi({ signedIn: true, listFailure: 500 })
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить',
    )
    expect(screen.queryByText('Пока нет анкет')).not.toBeInTheDocument()
    api.recover()
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    expect(
      await screen.findByRole('button', { name: /Анна/ }),
    ).toBeInTheDocument()
  })

  it('removes the staff workspace when the server revokes the session', async () => {
    mockStaffApi({ signedIn: true, listFailure: 401 })
    render(<App />)
    expect(
      await screen.findByRole('button', { name: 'Войти' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Анкеты волонтёров' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('shows a missing profile without displaying stale private fields', async () => {
    mockStaffApi({ signedIn: true, missingCard: true })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Анна/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Анкета не найдена',
    )
    expect(screen.queryByText(card.email)).not.toBeInTheDocument()
  })
})
