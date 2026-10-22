import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CoordinatorWorkspace } from './CoordinatorWorkspace'

const coordinator = {
  id: 'staff-1',
  email: 'staff@example.test',
  roles: ['COORDINATOR'],
}
const admin = { ...coordinator, roles: ['COORDINATOR', 'ADMIN'] }
const summary = {
  id: 'profile-1',
  displayName: 'Анна',
  regularity: 'REGULAR',
  availability: 'По субботам',
  createdAt: '2026-10-21T12:00:00Z',
}
const card = {
  ...summary,
  email: 'anna@example.test',
  phone: '',
  interests: 'Рисование',
  skills: '',
  updatedAt: '2026-10-21T12:01:00Z',
}
const snapshot = (fields: Record<string, unknown>) => ({
  current: {
    fields,
    version: 0,
    updatedAt: null,
    actorId: null,
    actorEmail: null,
  },
  history: [],
})
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function mockApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/v1/coordination/volunteers?'))
        return json({ items: [summary], total: 1, page: 0, size: 20 })
      if (url === '/api/v1/coordination/volunteers/profile-1') return json(card)
      if (url === '/api/v1/coordination/volunteers/profile-1/review')
        return json(
          snapshot({
            status: 'CONTINUE',
            message: 'Рады познакомиться',
            nextStep: 'Созвон в четверг',
            nextStepOwner: 'COORDINATOR',
            nextStepDate: null,
            internalNote: '',
          }),
        )
      if (url === '/api/v1/coordination/volunteers/profile-1/paperwork')
        return json(
          snapshot({ status: 'NOT_CONFIRMED', message: '', internalNote: '' }),
        )
      if (url === '/api/v1/coordination/volunteer-roles') return json([])
      throw new Error('Unexpected request: ' + url)
    }),
  )
}

beforeEach(() => {
  localStorage.clear()
  mockApi()
})

describe('coordinator panel', () => {
  it('shows staff management only to an administrator', () => {
    const { unmount } = render(
      <CoordinatorWorkspace account={coordinator} onSessionExpired={vi.fn()} />,
    )
    const nav = screen.getByRole('navigation', {
      name: 'Разделы кабинета координатора',
    })
    expect(within(nav).queryByText('Сотрудники')).not.toBeInTheDocument()
    unmount()

    render(<CoordinatorWorkspace account={admin} onSessionExpired={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Сотрудники/ }))
    expect(
      screen.getByRole('heading', { name: 'Сотрудники' }),
    ).toBeInTheDocument()
  })

  it('accepts a volunteer into the team from the card summary', async () => {
    render(
      <CoordinatorWorkspace account={coordinator} onSessionExpired={vi.fn()} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: /Анна/ }))
    const ledger = await screen.findByRole('list', {
      name: 'Где сейчас человек',
    })
    expect(
      await within(ledger).findByText('Продолжаем знакомство'),
    ).toBeInTheDocument()
    expect(within(ledger).getByText('Созвон в четверг')).toBeInTheDocument()
    expect(
      within(ledger).getByText('Откроется после принятия'),
    ).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Принять в команду' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Да, принять' }))

    expect(
      await screen.findByText('Анна в команде. Обучение открыто.'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(within(ledger).getByText('Открыто')).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: 'Отозвать принятие' }),
    ).toBeInTheDocument()
  })

  it('requires an explanation to revoke an acceptance', async () => {
    render(
      <CoordinatorWorkspace account={coordinator} onSessionExpired={vi.fn()} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: /Анна/ }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Принять в команду' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Да, принять' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Отозвать принятие' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Да, отозвать принятие' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Объясните человеку',
    )
  })

  it('creates an event as a draft and publishes it', async () => {
    render(
      <CoordinatorWorkspace account={coordinator} onSessionExpired={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Мероприятия/ }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Новое мероприятие' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    expect(await screen.findByText('Назовите мероприятие.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'Мастерская открыток' },
    })
    fireEvent.change(screen.getByLabelText('Место'), {
      target: { value: 'Мастерская фонда' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))

    const row = await screen.findByRole('button', {
      name: /Мастерская открыток/,
    })
    expect(row).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }))
    await waitFor(() => expect(row).toHaveTextContent('Опубликовано'))
  })

  it('shows what stops a lesson from being published', async () => {
    render(
      <CoordinatorWorkspace account={coordinator} onSessionExpired={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Обучение/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Новый урок' }))
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Назовите урок.')

    fireEvent.click(screen.getByRole('button', { name: '+ Текст' }))
    fireEvent.change(screen.getByLabelText('Название урока'), {
      target: { value: 'Ценности фонда' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Как увидит волонтёр' }))
    expect(
      screen.getByRole('heading', { level: 2, name: 'Ценности фонда' }),
    ).toBeInTheDocument()
  })
})
