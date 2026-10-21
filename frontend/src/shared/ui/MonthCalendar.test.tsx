import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MonthCalendar } from './MonthCalendar'

describe('month calendar', () => {
  it('starts weeks on Monday and marks today', () => {
    render(<MonthCalendar today={new Date(2026, 9, 21)} />)
    expect(
      screen.getByRole('heading', { name: 'Октябрь 2026' }),
    ).toBeInTheDocument()
    const firstWeek = screen.getAllByRole('row')[1]
    const cells = within(firstWeek).getAllByRole('cell')
    // 1 октября 2026 — четверг: три пустые ячейки перед ним.
    expect(cells.slice(0, 3).every((cell) => cell.textContent === '')).toBe(
      true,
    )
    expect(cells[3]).toHaveTextContent('1')
    expect(screen.getByText('21')).toHaveAttribute('aria-current', 'date')
    expect(screen.getByText('31')).toHaveAttribute('datetime', '2026-10-31')
  })

  it('switches to the next month', () => {
    render(<MonthCalendar today={new Date(2026, 9, 21)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    expect(
      screen.getByRole('heading', { name: 'Ноябрь 2026' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('31')).not.toBeInTheDocument()
  })
})
