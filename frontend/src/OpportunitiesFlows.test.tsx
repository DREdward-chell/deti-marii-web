import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { OpportunityWorkspace } from './features/opportunities/OpportunityWorkspace'
import { OpportunityCatalog } from './features/opportunities/OpportunityCatalog'
import type {
  OpportunityContent,
  OpportunityDraft,
} from './shared/api/opportunities'

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
const role = {
  id: 'role',
  name: 'Творческие встречи',
  description: 'Описание вида помощи',
  version: 0,
}
const card = {
  id: 'opportunity',
  title: 'Встреча',
  summary: 'Приватное краткое описание',
  regularity: 'ONE_OFF',
  location: 'Мастерская',
  schedule: 'По договорённости',
  role,
  demo: true,
  version: 1,
  admissionStatus: 'NOT_GRANTED',
}
const detail = {
  ...card,
  description: 'Приватное подробное описание',
  requirements: 'Условия примера',
  training: 'Инструктаж примера',
  publishedAt: '2026-10-22T10:00:00Z',
}
function authorApi(saveStatus?: number) {
  let draft: OpportunityDraft = {
    id: 'opportunity',
    revision: 0,
    publishedVersion: null,
    publishedRevision: null,
    content: {
      title: 'Новая возможность',
      summary: '',
      description: '',
      roleId: null,
      regularity: 'FLEXIBLE',
      location: '',
      schedule: '',
      requirements: '',
      training: '',
      demo: false,
    },
  }
  const writes: { path: string; body: Record<string, unknown> }[] = []
  let csrfCount = 0
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/auth/session'))
      return response({
        account: {
          id: 'staff',
          email: 'staff@example.org',
          roles: ['COORDINATOR', 'VOLUNTEER'],
        },
      })
    if (path.includes('/coordination/volunteers?'))
      return response({ items: [], total: 0, page: 0, size: 20 })
    if (path.endsWith('/auth/csrf')) {
      csrfCount++
      return response({ headerName: 'X-CSRF-TOKEN', token: String(csrfCount) })
    }
    if (path.endsWith('/volunteer-roles')) return response([role])
    if (init?.method) {
      expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe(
        String(csrfCount),
      )
      const body = init.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {}
      writes.push({ path, body })
      if (init.method === 'PUT') {
        if (saveStatus)
          return response(
            { detail: 'Черновик недоступен или изменён.' },
            saveStatus,
          )
        draft = {
          ...draft,
          revision: draft.revision + 1,
          content: body.content as OpportunityContent,
        }
      } else if (path.endsWith('/publish'))
        draft = {
          ...draft,
          publishedVersion: 1,
          publishedRevision: draft.revision,
        }
      else if (path.endsWith('/withdraw'))
        draft = { ...draft, publishedVersion: null, publishedRevision: null }
      return response(draft)
    }
    return response(path.endsWith('/opportunities') ? [] : draft)
  })
  vi.stubGlobal('fetch', fetch)
  return { writes, fetch, csrfCount: () => csrfCount }
}
async function create() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Создать возможность' }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Создать возможность' }))
  await screen.findByLabelText('Название возможности')
}
function catalogApi() {
  let status = 200
  const fetch = vi.fn(async (path: string) => {
    if (status !== 200)
      return response({ detail: 'Просмотр возможностей закрыт.' }, status)
    if (path.endsWith('/filters')) return response({ roles: [role] })
    if (path.includes('/opportunities?')) {
      const page = Number(
        new URL(path, 'http://local').searchParams.get('page'),
      )
      return response({
        items: [{ ...card, title: page ? 'Вторая страница' : card.title }],
        total: 21,
        page,
        size: 20,
      })
    }
    return response(detail)
  })
  vi.stubGlobal('fetch', fetch)
  return {
    fetch,
    revoke: (next: number) => {
      status = next
    },
  }
}

describe('opportunity authoring', () => {
  it('blocks App tabs and sign-out until the opportunity draft is discarded', async () => {
    authorApi()
    render(<App />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Возможности помощи' }),
    )
    await create()
    fireEvent.change(screen.getByLabelText('Название возможности'), {
      target: { value: 'Несохранённая возможность' },
    })
    const navigation = [
      'Кабинет координатора',
      'Учебные маршруты',
      'Возможности помощи',
      'Моя анкета',
      'Моё обучение',
      'Найти дело',
      'Выйти',
    ]
    for (const name of navigation) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name }))
    }
    expect(screen.getByLabelText('Название возможности')).toHaveValue(
      'Несохранённая возможность',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Отменить несохранённые правки' }),
    )
    for (const name of navigation)
      expect(screen.getByRole('button', { name })).toBeEnabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Кабинет координатора' }),
    )
    expect(
      screen.queryByLabelText('Название возможности'),
    ).not.toBeInTheDocument()
  })
  it('requires an existing role for the synthetic example, saves, publishes and withdraws with fresh CSRF', async () => {
    const api = authorApi()
    const blocked = vi.fn()
    render(
      <OpportunityWorkspace
        onSessionExpired={vi.fn()}
        onNavigationBlocked={blocked}
      />,
    )
    await create()
    expect(
      screen.getByRole('button', { name: /Заполнить демопример/ }),
    ).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Вид помощи'), {
      target: { value: role.id },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /Заполнить демопример/ }),
    )
    expect(screen.getByLabelText('Демонстрационная возможность')).toBeChecked()
    expect(
      screen.getByRole('button', { name: 'Опубликовать возможность' }),
    ).toBeDisabled()
    expect(blocked).toHaveBeenLastCalledWith(true)
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await screen.findByText('Черновик сохранён.')
    expect(blocked).toHaveBeenLastCalledWith(false)
    fireEvent.click(
      screen.getByRole('button', { name: 'Опубликовать возможность' }),
    )
    await screen.findByText('Опубликована версия 1.')
    expect(api.writes.at(-1)?.body).toEqual({ revision: 1 })
    fireEvent.change(screen.getByLabelText('Название возможности'), {
      target: { value: 'Новая редакция' },
    })
    expect(
      screen.getByRole('button', { name: 'Снять с публикации' }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Отменить несохранённые правки' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Снять с публикации' }))
    await screen.findByText('Возможность снята с публикации.')
    expect(api.writes.at(-1)?.body).toEqual({ publishedVersion: 1 })
    expect(api.csrfCount()).toBe(api.writes.length)
  })
  it('preserves edits after conflict until explicit reload', async () => {
    authorApi(409)
    render(<OpportunityWorkspace onSessionExpired={vi.fn()} />)
    await create()
    fireEvent.change(screen.getByLabelText('Название возможности'), {
      target: { value: 'Мои правки' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Название возможности')).toHaveValue(
      'Мои правки',
    )
    expect(
      screen.getByRole('button', { name: 'Сохранить черновик' }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Загрузить актуальный черновик и заменить локальные правки',
      }),
    )
    await screen.findByText('Загружен актуальный черновик.')
    expect(screen.getByLabelText('Название возможности')).toHaveValue(
      'Новая возможность',
    )
  })
  it.each([401, 403, 404])('clears editor content after %s', async (status) => {
    authorApi(status)
    const expired = vi.fn()
    const blocked = vi.fn()
    render(
      <OpportunityWorkspace
        onSessionExpired={expired}
        onNavigationBlocked={blocked}
      />,
    )
    await create()
    fireEvent.change(screen.getByLabelText('Название возможности'), {
      target: { value: 'Мои правки' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await screen.findByRole('alert')
    expect(
      screen.queryByLabelText('Название возможности'),
    ).not.toBeInTheDocument()
    expect(blocked).toHaveBeenLastCalledWith(false)
    expect(expired).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
  })
  it('ignores a late write failure after leaving the editor', async () => {
    const api = authorApi()
    let resolve!: (value: Response) => void
    const original = api.fetch.getMockImplementation()!
    api.fetch.mockImplementation((path, init) =>
      init?.method === 'PUT'
        ? new Promise((done) => {
            resolve = done
          })
        : original(path, init),
    )
    const expired = vi.fn()
    const mounted = render(<OpportunityWorkspace onSessionExpired={expired} />)
    await create()
    fireEvent.change(screen.getByLabelText('Название возможности'), {
      target: { value: 'Мои правки' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await waitFor(() => expect(resolve).toBeDefined())
    mounted.unmount()
    await act(async () => resolve(response({ detail: 'Expired' }, 401)))
    expect(expired).not.toHaveBeenCalled()
  })
})
describe('opportunity catalog', () => {
  it('searches and filters, resets pagination, opens full details without suggesting registration', async () => {
    const api = catalogApi()
    render(<OpportunityCatalog onSessionExpired={vi.fn()} />)
    await screen.findByText('Приватное краткое описание')
    expect(screen.getByText('Допуск не выдан')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }))
    await screen.findByText('Страница 2')
    fireEvent.change(screen.getByLabelText('Поиск возможностей'), {
      target: { value: '  встреча%  ' },
    })
    fireEvent.change(screen.getByLabelText('Формат помощи'), {
      target: { value: 'ONE_OFF' },
    })
    fireEvent.change(screen.getByLabelText('Вид помощи'), {
      target: { value: role.id },
    })
    fireEvent.submit(
      screen.getByRole('button', { name: 'Найти' }).closest('form')!,
    )
    await screen.findByText('Страница 1')
    expect(
      api.fetch.mock.calls.some(([path]) => {
        const url = new URL(path, 'http://local')
        return (
          url.searchParams.get('q') === 'встреча%' &&
          url.searchParams.get('regularity') === 'ONE_OFF' &&
          url.searchParams.get('roleId') === role.id &&
          url.searchParams.get('page') === '0'
        )
      }),
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Подробнее: Встреча' }))
    await screen.findByText('Приватное подробное описание')
    expect(screen.getByText('Инструктаж примера')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Записаться|Откликнуться/ }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '← К возможностям' }))
    await screen.findByText('Страница 1')
    expect(screen.getByLabelText('Вид помощи')).toHaveValue(role.id)
  })
  it.each([401, 403, 404])(
    'clears details and filter metadata on %s',
    async (status) => {
      const api = catalogApi()
      const expired = vi.fn()
      render(<OpportunityCatalog onSessionExpired={expired} />)
      fireEvent.click(
        await screen.findByRole('button', { name: 'Подробнее: Встреча' }),
      )
      await screen.findByText('Приватное подробное описание')
      api.revoke(status)
      fireEvent.click(
        screen.getByRole('button', { name: 'Обновить возможности' }),
      )
      await waitFor(() =>
        status === 401
          ? expect(expired).toHaveBeenCalledOnce()
          : expect(screen.getByRole('alert')).toBeInTheDocument(),
      )
      expect(
        screen.queryByText('Приватное подробное описание'),
      ).not.toBeInTheDocument()
      expect(screen.queryByText(role.name)).not.toBeInTheDocument()
    },
  )
  it('does not restore stale private data after a newer refresh loses access', async () => {
    let resolve!: (value: Response) => void
    let count = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path.endsWith('/filters')) return response({ roles: [role] })
        count++
        if (count === 1)
          return new Promise<Response>((done) => {
            resolve = done
          })
        return response({ detail: 'Доступ закрыт.' }, 403)
      }),
    )
    render(<OpportunityCatalog onSessionExpired={vi.fn()} />)
    await waitFor(() => expect(resolve).toBeDefined())
    fireEvent.click(
      screen.getByRole('button', { name: 'Обновить возможности' }),
    )
    await screen.findByRole('alert')
    await act(async () =>
      resolve(response({ items: [card], total: 1, page: 0, size: 20 })),
    )
    expect(
      screen.queryByText('Приватное краткое описание'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(role.name)).not.toBeInTheDocument()
  })
})
