import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarPage } from './CalendarPage'
import { ApiError } from '../../shared/api/client'
import { apiCalendarRepository, demoEvents, parseCalendar } from './repository'
import type { CalendarEvent, CalendarRepository } from './model'
const expired = vi.fn()
const event: CalendarEvent = {
  ...demoEvents('2026-10-21')[6],
  startsAt: '2026-10-22T11:00:00+03:00',
  endsAt: '2026-10-22T13:00:00+03:00',
}
function setupRepository(events = [event]) {
  return {
    load: vi
      .fn<CalendarRepository['load']>()
      .mockResolvedValue({ events, access: 'granted' }),
    respond: vi
      .fn<CalendarRepository['respond']>()
      .mockImplementation(async (item) => ({
        ...item,
        participation: 'pending',
        version: item.version + 1,
      })),
  }
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T09:00:00Z'))
  window.history.replaceState(
    null,
    '',
    '/calendar?demo=1&date=2026-10-22&view=day',
  )
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
  vi.clearAllMocks()
})
describe('calendar interaction', () => {
  it('asks for confirmation, waits for the server, and does not duplicate a response', async () => {
    const repository = setupRepository()
    let resolve!: (value: CalendarEvent) => void
    repository.respond.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    render(<CalendarPage repository={repository} onSessionExpired={expired} />)
    fireEvent.click(
      await screen.findByRole('button', { name: /Керамика: простые формы, / }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Хочу участвовать' }))
    expect(repository.respond).not.toHaveBeenCalled()
    const send = screen.getByRole('button', { name: 'Отправить отклик' })
    fireEvent.click(send)
    fireEvent.click(send)
    expect(repository.respond).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled()
    resolve({ ...event, participation: 'pending', version: 1 })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Участие подтвердит координатор',
    )
    expect(
      screen.queryByRole('button', { name: 'Хочу участвовать' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Отозвать отклик' }),
    ).toBeInTheDocument()
  })
  it('preserves the state after a network error and allows retry', async () => {
    const repository = setupRepository()
    repository.respond.mockRejectedValueOnce(new TypeError('offline'))
    render(<CalendarPage repository={repository} onSessionExpired={expired} />)
    fireEvent.click(
      await screen.findByRole('button', { name: /Керамика: простые формы, / }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Хочу участвовать' }))
    fireEvent.click(screen.getByRole('button', { name: 'Отправить отклик' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Проверьте соединение',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Отправить отклик' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Отклик отправлен',
    )
  })
  it('requires refreshing stale event conditions after a conflict', async () => {
    const repository = setupRepository()
    repository.respond.mockRejectedValue(
      new ApiError(409, 'Условия изменились'),
    )
    render(<CalendarPage repository={repository} onSessionExpired={expired} />)
    fireEvent.click(
      await screen.findByRole('button', { name: /Керамика: простые формы, / }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Хочу участвовать' }))
    fireEvent.click(screen.getByRole('button', { name: 'Отправить отклик' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Условия изменились',
    )
    expect(
      screen.queryByRole('button', { name: 'Отправить отклик' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Обновить данные' }))
    await waitFor(() => expect(repository.load).toHaveBeenCalledTimes(2))
  })
  it('warns about confirmed overlapping events even if filtered out', async () => {
    const other = {
      ...event,
      id: 'other',
      title: 'Моё занятие',
      participation: 'confirmed' as const,
      direction: 'community' as const,
    }
    render(
      <CalendarPage
        repository={setupRepository([event, other])}
        onSessionExpired={expired}
      />,
    )
    await screen.findByRole('button', { name: /Керамика: простые формы, / })
    fireEvent.click(screen.getByRole('button', { name: 'Можно записаться' }))
    fireEvent.click(
      screen.getByRole('button', { name: /Керамика: простые формы, / }),
    )
    expect(
      screen.getByText('Пересекается с вашими планами'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('dialog')).getByText(/Моё занятие \(/),
    ).toBeInTheDocument()
  })
  it('withdraws only after confirmation and updates participation', async () => {
    const repository = setupRepository([
      { ...event, participation: 'confirmed' },
    ])
    repository.respond.mockResolvedValue({
      ...event,
      participation: 'withdrawn',
      version: 1,
    })
    render(<CalendarPage repository={repository} onSessionExpired={expired} />)
    fireEvent.click(
      await screen.findByRole('button', { name: /Керамика: простые формы, / }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Отменить участие' }))
    expect(repository.respond).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Да, отменить участие' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('отозван')
    expect(repository.respond.mock.calls[0][1]).toBe('withdraw')
    expect(
      screen.getByRole('button', { name: 'Хочу участвовать' }),
    ).toBeInTheDocument()
  })
  it('combines search, direction and participation filters with an empty state', async () => {
    render(
      <CalendarPage
        repository={setupRepository()}
        onSessionExpired={expired}
      />,
    )
    await screen.findByRole('button', { name: /Керамика: простые формы, / })
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'несуществующее' },
    })
    expect(screen.getByText('Здесь пока нет событий')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Творческие занятия' }),
    )
    expect(screen.getByText('Здесь пока нет событий')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    fireEvent.click(screen.getByRole('button', { name: 'Мои участия' }))
    expect(screen.getByText('Здесь пока нет событий')).toBeInTheDocument()
  })
  it('does not show restricted catalogue data or invent a successful load', async () => {
    const repository = setupRepository()
    repository.load.mockResolvedValue({ access: 'restricted', events: [] })
    render(<CalendarPage repository={repository} onSessionExpired={expired} />)
    expect(
      await screen.findByText('Ваш следующий шаг — знакомство'),
    ).toBeInTheDocument()
    expect(screen.queryByText(event.title)).not.toBeInTheDocument()
  })
  it('handles an expired session on load', async () => {
    const repository = setupRepository()
    repository.load.mockRejectedValue(new ApiError(401, 'Expired'))
    render(<CalendarPage repository={repository} onSessionExpired={expired} />)
    await waitFor(() => expect(expired).toHaveBeenCalledOnce())
  })
  it('restores the day and view from browser navigation', async () => {
    render(
      <CalendarPage
        repository={setupRepository()}
        onSessionExpired={expired}
      />,
    )
    await screen.findByRole('button', { name: /Керамика: простые формы, / })
    fireEvent.click(screen.getByRole('button', { name: 'Месяц' }))
    expect(new URLSearchParams(window.location.search).get('view')).toBe(
      'month',
    )
    window.history.replaceState(null, '', '/calendar?date=2026-10-22&view=day')
    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.getByRole('button', { name: 'День' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
describe('API boundary', () => {
  it('rejects invalid or duplicate event responses', () => {
    expect(() =>
      parseCalendar({
        access: 'granted',
        events: [{ ...event, endsAt: 'bad' }],
      }),
    ).toThrow()
    expect(() =>
      parseCalendar({ access: 'granted', events: [event, event] }),
    ).toThrow()
    expect(() =>
      parseCalendar({
        access: 'granted',
        events: [{ ...event, participation: 'unknown' }],
      }),
    ).toThrow()
    expect(
      parseCalendar({ access: 'restricted', events: [event] }).events,
    ).toEqual([])
  })
  it('sends version and action with a fresh CSRF token and cookies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'fresh' }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...event, participation: 'pending', version: 1 }),
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    const result = await apiCalendarRepository.respond(event, 'apply')
    expect(result.participation).toBe('pending')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'PUT',
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'apply', version: 0 }),
    })
    expect(fetchMock.mock.calls[1][1].headers['X-CSRF-TOKEN']).toBe('fresh')
  })
})

describe('automatic time positioning', () => {
  it('opens at the first existing event and follows filtered events', async () => {
    const earlier = {
      ...event,
      id: 'early',
      title: 'Ранняя встреча',
      direction: 'community' as const,
      startsAt: '2026-10-22T09:00:00+03:00',
      endsAt: '2026-10-22T10:00:00+03:00',
    }
    render(
      <CalendarPage
        repository={setupRepository([earlier, event])}
        onSessionExpired={expired}
      />,
    )
    const grid = await screen.findByRole('region', {
      name: /Расписание по часам/,
    })
    expect(grid.scrollTop).toBe(8 * 60 + 30)
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Встречи и прогулки' }),
    )
    expect(grid.scrollTop).toBe(10 * 60 + 30)
    fireEvent.click(screen.getByRole('button', { name: 'Следующий период' }))
    expect(grid.scrollTop).toBe(7 * 60 + 30)
  })
})
