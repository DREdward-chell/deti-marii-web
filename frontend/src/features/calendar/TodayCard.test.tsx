import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/api/client'
import type { CalendarEvent, CalendarRepository } from './model'
import { TodayCard } from './TodayCard'

function event(
  id: string,
  title: string,
  startsAt: string,
  endsAt: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    title,
    description: '',
    startsAt,
    endsAt,
    allDay: false,
    direction: 'creative',
    location: 'Мастерская фонда',
    role: 'Помощник ведущего',
    requirements: '',
    coordinator: 'Координатор фонда',
    status: 'scheduled',
    participation: 'none',
    registration: 'open',
    availablePlaces: 2,
    version: 0,
    ...extra,
  }
}

function repository(events: CalendarEvent[]): CalendarRepository {
  return {
    load: async () => ({ access: 'granted', events }),
    respond: async (item) => item,
  }
}

describe('today card', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T12:30:00+03:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows only today’s events in time order with the current moment', async () => {
    render(
      <TodayCard
        onSessionExpired={vi.fn()}
        repository={repository([
          event(
            'late',
            'Встреча волонтёров',
            '2026-10-21T15:00:00+03:00',
            '2026-10-21T16:30:00+03:00',
            { participation: 'pending' },
          ),
          event(
            'early',
            'Открытая мастерская',
            '2026-10-21T10:00:00+03:00',
            '2026-10-21T12:00:00+03:00',
          ),
          event(
            'now',
            'Обед вместе',
            '2026-10-21T12:00:00+03:00',
            '2026-10-21T13:00:00+03:00',
            { direction: 'community' },
          ),
          event(
            'tomorrow',
            'Прогулка',
            '2026-10-22T11:00:00+03:00',
            '2026-10-22T13:00:00+03:00',
          ),
        ])}
      />,
    )
    expect(screen.getByRole('heading', { name: '21 октября' })).toBeVisible()
    const timeline = await screen.findByRole('list', {
      name: 'События сегодня',
    })
    const titles = within(timeline)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('strong')?.textContent)
      .filter(Boolean)
    expect(titles).toEqual([
      'Открытая мастерская',
      'Обед вместе',
      'Встреча волонтёров',
    ])
    expect(screen.queryByText('Прогулка')).not.toBeInTheDocument()
    expect(screen.getByText('Идёт сейчас')).toBeInTheDocument()
    expect(screen.getByText('Ждёт подтверждения')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Открыть календарь/ }),
    ).toHaveAttribute('href', '/calendar?date=2026-10-21&view=day')
  })

  it('points to the next event when today is free', async () => {
    render(
      <TodayCard
        onSessionExpired={vi.fn()}
        repository={repository([
          event(
            'next',
            'Керамика',
            '2026-10-23T11:00:00+03:00',
            '2026-10-23T13:00:00+03:00',
          ),
        ])}
      />,
    )
    expect(await screen.findByText('Сегодня событий нет.')).toBeInTheDocument()
    expect(screen.getByText(/Ближайшее.*Керамика/)).toBeInTheDocument()
  })

  it('hides the catalogue until the coordinator opens access', async () => {
    render(
      <TodayCard
        onSessionExpired={vi.fn()}
        repository={{
          load: async () => {
            throw new ApiError(403, 'Нет доступа')
          },
          respond: async (item) => item,
        }}
      />,
    )
    expect(
      await screen.findByText(/Расписание откроется после того/),
    ).toBeInTheDocument()
  })

  it('returns to login when the session has expired', async () => {
    const expired = vi.fn()
    render(
      <TodayCard
        onSessionExpired={expired}
        repository={{
          load: async () => {
            throw new ApiError(401, 'Сессия завершилась')
          },
          respond: async (item) => item,
        }}
      />,
    )
    await vi.waitFor(() => expect(expired).toHaveBeenCalled())
  })
})
