import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('connection to the platform', () => {
  it('shows success only after receiving a valid API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ name: 'volunteer-platform', version: '0.1.0' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )
    render(<App />)
    expect(
      await screen.findByText('Соединение установлено'),
    ).toBeInTheDocument()
  })

  it('does not report success when the API is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Network error')),
    )
    render(<App />)
    expect(
      await screen.findByText(/Сейчас не удалось подключиться/),
    ).toBeInTheDocument()
  })

  it('does not treat the SPA fallback HTML as a successful API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('<html>Not an API response</html>', { status: 200 }),
        ),
    )
    render(<App />)
    expect(
      await screen.findByText(/Сейчас не удалось подключиться/),
    ).toBeInTheDocument()
  })
})
