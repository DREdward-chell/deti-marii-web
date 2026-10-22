import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CalendarPage } from './CalendarPage'
import { TodayCard } from './TodayCard'
import { demoEvents } from './repository'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T08:00:00+03:00'))
  vi.stubEnv('VITE_CALENDAR_API_ENABLED', 'true')
  window.history.replaceState(null, '', '/')
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  window.history.replaceState(null, '', '/')
})

function server() {
  let current = {
    ...demoEvents('2026-10-21')[4],
    participation: 'none' as const,
  } as ReturnType<typeof demoEvents>[number]
  let restricted = false
  const writes: RequestInit[] = []
  const json = (value: unknown) => new Response(JSON.stringify(value))
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/calendar')
      return json({
        access: restricted ? 'restricted' : 'granted',
        events: [current],
      })
    if (url === '/api/v1/auth/csrf')
      return json({ headerName: 'X-CSRF-TOKEN', token: 'calendar-token' })
    if (
      url === `/api/v1/calendar/events/${current.id}/response` &&
      init?.method === 'PUT'
    ) {
      writes.push(init)
      current = {
        ...current,
        participation: 'pending',
        version: current.version + 1,
      }
      return json(current)
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetch)
  return {
    fetch,
    writes,
    restrict: () => {
      restricted = true
    },
  }
}

it('opens the same day, saves a real API response and reads it back in the profile widget', async () => {
  const api = server()
  const expired = vi.fn()
  const widget = render(<TodayCard onSessionExpired={expired} />)
  await screen.findByText('Рисуем осень')
  const href = screen
    .getByRole('link', { name: /Открыть календарь/ })
    .getAttribute('href')!
  expect(href).toBe('/calendar?date=2026-10-21&view=day')
  expect(screen.queryByText('пример')).not.toBeInTheDocument()
  widget.unmount()
  window.history.replaceState(null, '', href)
  const calendar = render(<CalendarPage onSessionExpired={expired} />)
  fireEvent.click(await screen.findByRole('button', { name: /Рисуем осень,/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Хочу участвовать' }))
  fireEvent.click(screen.getByRole('button', { name: 'Отправить отклик' }))
  await screen.findByText(
    'Отклик получен. Дождитесь подтверждения координатора.',
  )
  expect(api.writes).toHaveLength(1)
  expect(api.writes[0].headers).toMatchObject({
    'X-CSRF-TOKEN': 'calendar-token',
  })
  expect(JSON.parse(String(api.writes[0].body))).toEqual({
    action: 'apply',
    version: 0,
  })
  expect(screen.getByRole('link', { name: 'Мой профиль' })).toHaveAttribute(
    'href',
    '/',
  )
  calendar.unmount()
  window.history.replaceState(null, '', '/')
  render(<TodayCard onSessionExpired={expired} />)
  expect(await screen.findByText('Ждёт подтверждения')).toBeInTheDocument()
  expect(expired).not.toHaveBeenCalled()
})

it('rechecks access on return to the profile and hides even an incorrectly included restricted catalogue', async () => {
  const api = server()
  render(<TodayCard onSessionExpired={vi.fn()} />)
  await screen.findByText('Рисуем осень')
  api.restrict()
  fireEvent.focus(window)
  await screen.findByText(/Расписание откроется после того/)
  expect(screen.queryByText('Рисуем осень')).not.toBeInTheDocument()
  await waitFor(() => expect(api.fetch).toHaveBeenCalledTimes(2))
})
