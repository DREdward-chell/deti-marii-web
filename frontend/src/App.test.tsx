import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

const account = {
  id: 'account-1',
  email: 'anna@example.org',
  roles: ['VOLUNTEER'],
}
const profile = {
  id: 'profile-1',
  displayName: 'Анна',
  phone: '',
  interests: 'Рисование',
  skills: '',
  availability: 'По субботам',
  regularity: 'REGULAR',
  version: 2,
  updatedAt: '2026-10-21T12:00:00Z',
}
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function mockApi(
  options: {
    signedIn?: boolean
    hasProfile?: boolean
    saveStatus?: number
    profileUnavailable?: boolean
    loginStatus?: number
  } = {},
) {
  const writes: { url: string; body: Record<string, unknown> }[] = []
  let signedIn = options.signedIn ?? false
  let currentProfile = options.hasProfile ? { ...profile } : null
  let profileUnavailable = options.profileUnavailable ?? false
  const fetchMock = vi.fn(
    async (url: string, init?: RequestInit): Promise<Response> => {
      if (url === '/api/v1/auth/session')
        return response({ account: signedIn ? account : null })
      if (url === '/api/v1/auth/csrf')
        return response({ headerName: 'X-CSRF-TOKEN', token: 'fresh-token' })
      if (!init?.method && url === '/api/v1/volunteers/me') {
        if (profileUnavailable)
          return response({ detail: 'Временная ошибка загрузки.' }, 500)
        return currentProfile
          ? response(currentProfile)
          : response({ detail: 'Анкета ещё не заполнена.' }, 404)
      }
      expect(new Headers(init?.headers).get('X-CSRF-TOKEN')).toBe('fresh-token')
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {}
      writes.push({ url, body })
      if (url === '/api/v1/auth/register') return response(account, 201)
      if (url === '/api/v1/auth/login') {
        if (options.loginStatus === 401)
          return response(
            { detail: 'Не удалось войти. Проверьте email и пароль.' },
            401,
          )
        signedIn = true
        return response(account)
      }
      if (url === '/api/v1/auth/logout') {
        signedIn = false
        return new Response(null, { status: 204 })
      }
      if (url === '/api/v1/volunteers/me' && init?.method === 'PUT') {
        if (options.saveStatus === 409)
          return response({ detail: 'Анкета уже изменена в другом окне.' }, 409)
        if (options.saveStatus === 401)
          return response({ detail: 'Сессия завершилась.' }, 401)
        currentProfile = {
          ...profile,
          ...body,
          version: (currentProfile?.version ?? -1) + 1,
        }
        return response(currentProfile)
      }
      throw new Error('Unexpected request: ' + url)
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  return {
    writes,
    fetchMock,
    recoverProfile: () => {
      profileUnavailable = false
    },
  }
}

describe('volunteer account and own profile', () => {
  it('registers, logs in and saves a profile only after successful server responses', async () => {
    const api = mockApi()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Регистрация' }))
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: account.email },
    })
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'a long test passphrase' },
    })
    fireEvent.change(screen.getByLabelText('Повторите пароль'), {
      target: { value: 'a long test passphrase' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }))
    fireEvent.change(await screen.findByLabelText(/Как к вам обращаться/), {
      target: { value: 'Анна' },
    })
    fireEvent.change(screen.getByLabelText('Что вам интересно?'), {
      target: { value: 'Рисование' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить анкету' }))
    expect(
      await screen.findByText(/Без согласия на обработку/),
    ).toBeInTheDocument()
    expect(api.writes).toHaveLength(2)
    fireEvent.click(screen.getByRole('checkbox', { name: /Согласен/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить анкету' }))
    expect(await screen.findByText(/Анкета сохранена/)).toBeInTheDocument()
    expect(api.writes.map((request) => request.url)).toEqual([
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/volunteers/me',
    ])
    expect(api.writes[2].body).toMatchObject({
      displayName: 'Анна',
      interests: 'Рисование',
      version: null,
    })
    expect(api.writes[2].body).not.toHaveProperty('accountId')
    expect(api.writes[2].body).not.toHaveProperty('id')
  })

  it('keeps draft edits on conflict until the user explicitly reloads the profile', async () => {
    mockApi({ signedIn: true, hasProfile: true, saveStatus: 409 })
    render(<App />)
    const name = await screen.findByLabelText(/Как к вам обращаться/)
    expect(name).toHaveValue('Анна')
    fireEvent.change(name, { target: { value: 'Моя правка' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Согласен/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить анкету' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('другом окне')
    expect(name).toHaveValue('Моя правка')
    expect(screen.queryByText(/Анкета сохранена/)).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Загрузить актуальную анкету' }),
    )
    expect(await screen.findByLabelText(/Как к вам обращаться/)).toHaveValue(
      'Анна',
    )
  })

  it('returns to login when a session expires instead of claiming a successful save', async () => {
    mockApi({ signedIn: true, hasProfile: true, saveStatus: 401 })
    render(<App />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Согласен/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить анкету' }))
    expect(
      await screen.findByRole('button', { name: 'Войти' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Несохранённые изменения не отправлены/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Анкета сохранена/)).not.toBeInTheDocument()
  })

  it('does not replace an unavailable saved profile with a blank editable form', async () => {
    const api = mockApi({
      signedIn: true,
      hasProfile: true,
      profileUnavailable: true,
    })
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ошибка загрузки',
    )
    expect(
      screen.queryByRole('button', { name: 'Сохранить анкету' }),
    ).not.toBeInTheDocument()
    api.recoverProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    expect(await screen.findByLabelText(/Как к вам обращаться/)).toHaveValue(
      'Анна',
    )
    expect(api.writes).toHaveLength(0)
  })

  it('logs out and removes the private profile from the screen', async () => {
    const api = mockApi({ signedIn: true, hasProfile: true })
    render(<App />)
    await screen.findByLabelText(/Как к вам обращаться/)
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(
      await screen.findByRole('button', { name: 'Войти' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText(/Как к вам обращаться/),
    ).not.toBeInTheDocument()
    expect(api.writes[0].url).toBe('/api/v1/auth/logout')
  })

  it('shows rejected credentials without opening the profile', async () => {
    mockApi({ loginStatus: 401 })
    render(<App />)
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: account.email },
    })
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'incorrect password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Проверьте email и пароль',
    )
    expect(
      screen.queryByLabelText(/Как к вам обращаться/),
    ).not.toBeInTheDocument()
  })

  it.each(['offline', 'html', 'wrong-json'])(
    'does not treat a %s response as an anonymous session',
    async (failure) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => {
          if (failure === 'offline')
            return Promise.reject(new TypeError('Network error'))
          return Promise.resolve(
            failure === 'html'
              ? new Response('<html>SPA fallback</html>')
              : response({ unexpected: true }),
          )
        }),
      )
      render(<App />)
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
      expect(
        screen.queryByRole('button', { name: 'Войти' }),
      ).not.toBeInTheDocument()
    },
  )
})
