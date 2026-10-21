import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

function systemPrefersDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: dark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('theme toggle', () => {
  it('starts from the system theme when nothing was chosen', () => {
    systemPrefersDark(true)
    render(<ThemeToggle />)
    expect(screen.getByRole('switch', { name: 'Тёмная тема' })).toBeChecked()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('switches the theme and remembers the choice', () => {
    systemPrefersDark(true)
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('switch', { name: 'Тёмная тема' }))
    expect(
      screen.getByRole('switch', { name: 'Тёмная тема' }),
    ).not.toBeChecked()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('dm-theme')).toBe('light')
  })

  it('prefers the saved choice over the system theme', () => {
    systemPrefersDark(false)
    localStorage.setItem('dm-theme', 'dark')
    render(<ThemeToggle />)
    expect(screen.getByRole('switch', { name: 'Тёмная тема' })).toBeChecked()
  })
})
