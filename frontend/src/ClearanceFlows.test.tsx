import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ClearancePanel } from './features/coordination/ClearancePanel'
import { RoleCatalogPanel } from './features/coordination/RoleCatalogPanel'
import { MyClearance } from './features/onboarding/MyClearance'
import type {
  DecisionFields,
  DecisionHistory,
  DecisionStatus,
  VolunteerRole,
} from './shared/api/clearance'

const firstRole: VolunteerRole = {
  id: 'photo',
  name: 'Фотография',
  description: 'Съёмка мероприятий',
  version: 0,
}
const secondRole: VolunteerRole = {
  id: 'creative',
  name: 'Творческие занятия',
  description: 'Помощь на занятиях',
  version: 0,
}
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
function empty(status: DecisionStatus): DecisionHistory {
  return {
    current: {
      fields: { status, message: '', internalNote: '' },
      version: 0,
      updatedAt: null,
      actorId: null,
      actorEmail: null,
    },
    history: [],
  }
}
function mockApi(
  options: {
    saveFailure?: number
    loadFailure?: number
    ownFailure?: number
    delayFirstRole?: boolean
    noRoles?: boolean
  } = {},
) {
  const records: Record<string, DecisionHistory> = {
    paperwork: empty('NOT_CONFIRMED'),
    photo: empty('NOT_GRANTED'),
    creative: empty('NOT_GRANTED'),
  }
  let roles = options.noRoles ? [] : [firstRole, secondRole]
  let loadFailure = options.loadFailure
  let ownFailure = options.ownFailure
  const writes: { url: string; body: Record<string, unknown> }[] = []
  let resolveFirst: ((value: Response) => void) | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/auth/csrf')
        return response({
          headerName: 'X-CSRF-TOKEN',
          token: 'clearance-token',
        })
      if (init?.method)
        expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe(
          'clearance-token',
        )
      if (url === '/api/v1/onboarding/me/clearance') {
        if (ownFailure)
          return response(
            { detail: 'Решения временно недоступны.' },
            ownFailure,
          )
        return response({
          paperwork: {
            status: records.paperwork.current.fields.status,
            message: records.paperwork.current.fields.message,
            updatedAt: records.paperwork.current.updatedAt,
          },
          admissions: roles
            .filter((role) => records[role.id]?.current.version > 0)
            .map((role) => ({
              role,
              status: records[role.id].current.fields.status,
              message: records[role.id].current.fields.message,
              updatedAt: records[role.id].current.updatedAt,
            })),
        })
      }
      if (url.startsWith('/api/v1/coordination/volunteer-roles')) {
        if (!init?.method) return response(roles)
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        writes.push({ url, body })
        if (options.saveFailure)
          return response(
            { detail: 'Вид помощи уже изменён.' },
            options.saveFailure,
          )
        const fields = (init.method === 'POST' ? body : body.fields) as {
          name: string
          description: string
        }
        const id = init.method === 'POST' ? 'new-role' : url.split('/').at(-1)!
        const result = {
          id,
          ...fields,
          version: init.method === 'POST' ? 0 : Number(body.version) + 1,
        }
        roles = [...roles.filter((item) => item.id !== id), result]
        return response(result, init.method === 'POST' ? 201 : 200)
      }
      if (url.startsWith('/api/v1/coordination/volunteers/profile-1/')) {
        const key = url.split('/').at(-1)!
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as {
            version: number
            fields: DecisionFields
          }
          writes.push({ url, body })
          if (options.saveFailure)
            return response(
              { detail: 'Решение уже изменено.' },
              options.saveFailure,
            )
          const current = {
            fields: body.fields,
            version: body.version + 1,
            updatedAt: '2026-10-21T12:00:00Z',
            actorId: 'staff-1',
            actorEmail: 'staff@example.org',
          }
          records[key] = {
            current,
            history: [current, ...records[key].history],
          }
        } else if (loadFailure && key === 'paperwork')
          return response(
            { detail: 'Не удалось загрузить оформление.' },
            loadFailure,
          )
        else if (key === 'photo' && options.delayFirstRole)
          return new Promise<Response>((resolve) => {
            resolveFirst = resolve
          })
        return response(records[key])
      }
      throw new Error('Unexpected request ' + url)
    }),
  )
  return {
    writes,
    records,
    recover: () => {
      loadFailure = undefined
      ownFailure = undefined
    },
    completeFirst: () =>
      resolveFirst?.(
        response({
          ...empty('GRANTED'),
          current: {
            ...empty('GRANTED').current,
            fields: {
              status: 'GRANTED',
              message: 'Устаревшая фотография',
              internalNote: '',
            },
          },
        }),
      ),
  }
}

describe('paperwork, role admissions and volunteer view', () => {
  it('saves paperwork and each admission independently with audit and private notes excluded from volunteer UI', async () => {
    const api = mockApi()
    const staff = render(
      <ClearancePanel volunteerId="profile-1" onSessionExpired={vi.fn()} />,
    )
    fireEvent.change(await screen.findByLabelText('Состояние оформления'), {
      target: { value: 'CONFIRMED' },
    })
    fireEvent.change(screen.getByLabelText('Пояснение по оформлению'), {
      target: { value: 'Документы проверены.' },
    })
    fireEvent.change(
      screen.getByLabelText('Внутренняя заметка об оформлении'),
      { target: { value: 'Внутренняя проверка' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить оформление' }),
    )
    await screen.findByText('Оформление сохранено.')
    fireEvent.change(screen.getByLabelText('Вид помощи для допуска'), {
      target: { value: 'photo' },
    })
    expect(await screen.findByLabelText('Состояние допуска')).toHaveValue(
      'NOT_GRANTED',
    )
    fireEvent.change(screen.getByLabelText('Состояние допуска'), {
      target: { value: 'GRANTED' },
    })
    fireEvent.change(screen.getByLabelText('Пояснение по допуску'), {
      target: { value: 'Готовы к съёмке мероприятий.' },
    })
    fireEvent.change(screen.getByLabelText('Внутренняя заметка о допуске'), {
      target: { value: 'Служебное обсуждение' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить допуск' }))
    await screen.findByText('Допуск сохранён.')
    expect(api.writes.map((item) => item.body.version)).toEqual([0, 0])
    expect(screen.getByText('История допуска (1)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Вид помощи для допуска'), {
      target: { value: 'creative' },
    })
    expect(await screen.findByLabelText('Состояние допуска')).toHaveValue(
      'NOT_GRANTED',
    )
    expect(screen.getByLabelText('Пояснение по допуску')).toHaveValue('')
    staff.unmount()
    render(<MyClearance onSessionExpired={vi.fn()} />)
    expect(await screen.findByText('Документы проверены.')).toBeInTheDocument()
    expect(screen.getByText('Готовы к съёмке мероприятий.')).toBeInTheDocument()
    expect(screen.queryByText('Служебное обсуждение')).not.toBeInTheDocument()
    expect(screen.queryByText('Внутренняя проверка')).not.toBeInTheDocument()
    expect(screen.queryByText(secondRole.name)).not.toBeInTheDocument()
    api.records.photo.current.fields = {
      status: 'REVOKED',
      message: 'Обсудим дальнейшее участие.',
      internalNote: 'Причина для сотрудников',
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Обновить документы и допуски' }),
    )
    expect(await screen.findByText('Допуск отозван')).toBeInTheDocument()
    expect(screen.queryByText('Допуск подтверждён')).not.toBeInTheDocument()
    expect(screen.getByText('Оформление подтверждено')).toBeInTheDocument()
  })

  it('keeps the draft on version conflict until the coordinator requests current data', async () => {
    mockApi({ saveFailure: 409 })
    render(
      <ClearancePanel volunteerId="profile-1" onSessionExpired={vi.fn()} />,
    )
    fireEvent.change(await screen.findByLabelText('Пояснение по оформлению'), {
      target: { value: 'Моя правка' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить оформление' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('уже изменено')
    expect(screen.getByLabelText('Пояснение по оформлению')).toHaveValue(
      'Моя правка',
    )
    expect(
      screen.getByRole('button', { name: 'Сохранить оформление' }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Загрузить актуальное решение' }),
    )
    expect(await screen.findByLabelText('Пояснение по оформлению')).toHaveValue(
      '',
    )
  })

  it('does not display an old admission when switching roles during a slow response', async () => {
    const api = mockApi({ delayFirstRole: true })
    render(
      <ClearancePanel volunteerId="profile-1" onSessionExpired={vi.fn()} />,
    )
    fireEvent.change(await screen.findByLabelText('Вид помощи для допуска'), {
      target: { value: 'photo' },
    })
    await waitFor(() =>
      expect(screen.getByText('Загружаем решение…')).toBeInTheDocument(),
    )
    fireEvent.change(screen.getByLabelText('Вид помощи для допуска'), {
      target: { value: 'creative' },
    })
    expect(await screen.findByLabelText('Состояние допуска')).toHaveValue(
      'NOT_GRANTED',
    )
    api.completeFirst()
    await waitFor(() =>
      expect(screen.getByLabelText('Пояснение по допуску')).toHaveValue(''),
    )
    expect(screen.queryByText('Устаревшая фотография')).not.toBeInTheDocument()
  })

  it('does not replace a failed decision load with a default editable decision', async () => {
    const api = mockApi({ loadFailure: 500 })
    render(
      <ClearancePanel volunteerId="profile-1" onSessionExpired={vi.fn()} />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить',
    )
    expect(
      screen.queryByRole('button', { name: 'Сохранить оформление' }),
    ).not.toBeInTheDocument()
    api.recover()
    fireEvent.click(
      screen.getByRole('button', { name: 'Повторить загрузку оформления' }),
    )
    expect(
      await screen.findByLabelText('Состояние оформления'),
    ).toBeInTheDocument()
  })

  it('distinguishes unavailable volunteer decisions from absence of confirmations and supports refresh', async () => {
    const api = mockApi({ ownFailure: 500 })
    render(<MyClearance onSessionExpired={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'временно недоступны',
    )
    expect(
      screen.queryByText('Оформление не подтверждено'),
    ).not.toBeInTheDocument()
    api.recover()
    fireEvent.click(
      screen.getByRole('button', { name: 'Обновить документы и допуски' }),
    )
    expect(
      await screen.findByText('Оформление не подтверждено'),
    ).toBeInTheDocument()
  })

  it('expires the account instead of reporting a successful decision after access revocation', async () => {
    mockApi({ saveFailure: 401 })
    const expired = vi.fn()
    render(
      <ClearancePanel volunteerId="profile-1" onSessionExpired={expired} />,
    )
    fireEvent.change(await screen.findByLabelText('Пояснение по оформлению'), {
      target: { value: 'Проверено' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить оформление' }),
    )
    await waitFor(() => expect(expired).toHaveBeenCalledOnce())
    expect(screen.queryByText('Оформление сохранено.')).not.toBeInTheDocument()
  })
})

describe('volunteer role catalog', () => {
  it('creates a kind of help and then edits its metadata with the server version', async () => {
    const api = mockApi({ noRoles: true })
    render(<RoleCatalogPanel onSessionExpired={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Виды помощи' }))
    fireEvent.change(await screen.findByLabelText('Название вида помощи'), {
      target: { value: 'Фотография' },
    })
    fireEvent.change(screen.getByLabelText('Описание вида помощи'), {
      target: { value: 'Съёмка мероприятий' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить вид помощи' }))
    expect(await screen.findByText('Вид помощи сохранён.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Описание вида помощи'), {
      target: { value: 'Помощь фотографа на мероприятиях' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить вид помощи' }),
    )
    await screen.findByText('Вид помощи сохранён.')
    expect(api.writes[0].body).toEqual({
      name: 'Фотография',
      description: 'Съёмка мероприятий',
    })
    expect(api.writes[1].body).toEqual({
      version: 0,
      fields: {
        name: 'Фотография',
        description: 'Помощь фотографа на мероприятиях',
      },
    })
  })

  it('preserves catalog edits on conflict and explicitly reloads instead of overwriting', async () => {
    mockApi({ saveFailure: 409 })
    render(<RoleCatalogPanel onSessionExpired={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Виды помощи' }))
    fireEvent.change(
      await screen.findByLabelText('Вид помощи для редактирования'),
      { target: { value: 'photo' } },
    )
    fireEvent.change(screen.getByLabelText('Название вида помощи'), {
      target: { value: 'Новая фотография' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить вид помощи' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('уже изменён')
    expect(screen.getByLabelText('Название вида помощи')).toHaveValue(
      'Новая фотография',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Загрузить актуальный справочник' }),
    )
    const select = await screen.findByLabelText('Вид помощи для редактирования')
    expect(
      within(select).getByRole('option', { name: 'Фотография' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Название вида помощи')).toHaveValue('')
  })
})
