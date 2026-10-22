import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { TelegramSettings } from './TelegramSettings'

it('connects through a one-time link and refreshes the server status', async () => {
  let linked = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const value = url.endsWith('/csrf')
        ? { headerName: 'X-CSRF-TOKEN', token: 'test' }
        : url.endsWith('/link')
          ? {
              url: 'https://t.me/example_bot?start=test',
              expiresInSeconds: 600,
            }
          : { available: true, linked }
      return new Response(JSON.stringify(value), { status: 200 })
    }),
  )
  render(<TelegramSettings onSessionExpired={vi.fn()} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Подключить Telegram' }),
  )
  expect(await screen.findByRole('link')).toHaveAttribute(
    'href',
    'https://t.me/example_bot?start=test',
  )
  linked = true
  fireEvent.click(screen.getByRole('button', { name: 'Проверить подключение' }))
  expect(
    await screen.findByRole('button', { name: 'Отключить Telegram' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
