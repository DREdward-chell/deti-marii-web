import { describe, expect, it } from 'vitest'
import {
  addDays,
  canApply,
  canWithdraw,
  createIcs,
  dayKey,
  layoutDay,
  monthDays,
  moveMonth,
  occursOn,
  overlaps,
  startOfWeek,
  statusLabel,
  validDay,
  type CalendarEvent,
} from './model'
import { demoEvents } from './repository'
const now = new Date('2026-10-21T09:00:00Z')
const event: CalendarEvent = {
  ...demoEvents('2026-10-21')[6],
  startsAt: '2026-10-22T11:00:00+03:00',
  endsAt: '2026-10-22T13:00:00+03:00',
}

describe('calendar dates in Moscow', () => {
  it('uses Moscow date even when UTC is the previous day', () => {
    expect(dayKey('2026-10-20T22:30:00Z')).toBe('2026-10-21')
  })
  it('handles Monday weeks, year boundaries and leap days', () => {
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28')
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(moveMonth('2028-01-31', 1)).toBe('2028-02-29')
    expect(moveMonth('2026-12-31', 1)).toBe('2027-01-31')
    expect(monthDays('2026-11-01')).toHaveLength(42)
    expect(monthDays('2026-11-01')[0]).toBe('2026-10-26')
  })
  it.each(['2026-02-30', 'hello', '2026-13-01', null])(
    'rejects malformed URL dates: %s',
    (value) => expect(validDay(value)).toBe(false),
  )
  it('uses an exclusive end, including overnight events and midnight', () => {
    const overnight = {
      ...event,
      startsAt: '2026-10-21T23:00:00+03:00',
      endsAt: '2026-10-22T01:00:00+03:00',
    }
    expect(occursOn(overnight, '2026-10-21')).toBe(true)
    expect(occursOn(overnight, '2026-10-22')).toBe(true)
    expect(
      occursOn(
        { ...overnight, endsAt: '2026-10-22T00:00:00+03:00' },
        '2026-10-22',
      ),
    ).toBe(false)
    expect(layoutDay([overnight], '2026-10-21')[0]).toMatchObject({
      start: 1380,
      end: 1440,
    })
    expect(layoutDay([overnight], '2026-10-22')[0]).toMatchObject({
      start: 0,
      end: 60,
    })
  })
})
describe('participation rules', () => {
  it('allows an open future event and a previously withdrawn response', () => {
    expect(canApply(event, now)).toBe(true)
    expect(canApply({ ...event, participation: 'withdrawn' }, now)).toBe(true)
  })
  it.each<Partial<CalendarEvent>>([
    { status: 'cancelled' },
    { registration: 'full' },
    { registration: 'closed' },
    { registration: 'restricted' },
    { availablePlaces: 0 },
    { participation: 'pending' },
    { participation: 'confirmed' },
    { participation: 'declined' },
    { startsAt: now.toISOString() },
  ])('does not allow a response when conditions prohibit it: %o', (patch) => {
    expect(canApply({ ...event, ...patch }, now)).toBe(false)
  })
  it('allows withdrawal only for future active participation', () => {
    expect(canWithdraw({ ...event, participation: 'confirmed' }, now)).toBe(
      true,
    )
    expect(canWithdraw({ ...event, participation: 'pending' }, now)).toBe(true)
    expect(
      canWithdraw(
        { ...event, status: 'cancelled', participation: 'confirmed' },
        now,
      ),
    ).toBe(false)
    expect(
      canWithdraw(
        { ...event, startsAt: now.toISOString(), participation: 'confirmed' },
        now,
      ),
    ).toBe(false)
  })
  it('keeps cancellation separate from participation and attendance', () => {
    expect(
      statusLabel(
        { ...event, status: 'cancelled', participation: 'confirmed' },
        now,
      ),
    ).toBe('Мероприятие отменено')
    expect(statusLabel({ ...event, participation: 'pending' }, now)).toBe(
      'Ждёт подтверждения',
    )
    expect(
      statusLabel(
        { ...event, participation: 'confirmed' },
        new Date('2027-01-01'),
      ),
    ).toBe('Мероприятие завершено')
  })
})
describe('overlap layout', () => {
  it('places overlaps side by side and reuses columns for adjacent events', () => {
    const items = [
      event,
      {
        ...event,
        id: 'b',
        startsAt: '2026-10-22T12:00:00+03:00',
        endsAt: '2026-10-22T14:00:00+03:00',
      },
      {
        ...event,
        id: 'c',
        startsAt: '2026-10-22T13:00:00+03:00',
        endsAt: '2026-10-22T15:00:00+03:00',
      },
    ]
    expect(
      layoutDay(items, '2026-10-22').map(({ column, columns }) => [
        column,
        columns,
      ]),
    ).toEqual([
      [0, 2],
      [1, 2],
      [0, 2],
    ])
    expect(overlaps(items[0], items[2])).toBe(false)
    expect(overlaps(items[0], items[1])).toBe(true)
    expect(overlaps(event, event)).toBe(false)
  })
  it('gives non-overlapping groups full width and excludes all-day events', () => {
    const later = {
      ...event,
      id: 'later',
      startsAt: '2026-10-22T16:00:00+03:00',
      endsAt: '2026-10-22T17:00:00+03:00',
    }
    const result = layoutDay(
      [event, later, { ...event, id: 'all', allDay: true }],
      '2026-10-22',
    )
    expect(result).toHaveLength(2)
    expect(result.every((item) => item.columns === 1)).toBe(true)
  })
})
describe('calendar export', () => {
  it('exports UTC, stable identity, status and escapes text without injecting ICS fields', () => {
    const text = createIcs(
      [{ ...event, title: 'Урок, 1;\nBEGIN:VEVENT', status: 'cancelled' }],
      now,
    )
    expect(text).toContain('DTSTART:20261022T080000Z\r\n')
    expect(text).toContain('SUMMARY:Урок\\, 1\\;\\nBEGIN:VEVENT')
    expect(text).toContain('STATUS:CANCELLED')
    expect(text.match(/\r\nBEGIN:VEVENT\r\n/g)).toHaveLength(1)
    expect(
      text
        .split('\r\n')
        .every((line) => new TextEncoder().encode(line).length <= 75),
    ).toBe(true)
  })
  it('exports all-day boundaries without timezone shifts', () => {
    const text = createIcs(
      [
        {
          ...event,
          allDay: true,
          startsAt: '2026-10-22T00:00:00+03:00',
          endsAt: '2026-10-23T00:00:00+03:00',
        },
      ],
      now,
    )
    expect(text).toContain('DTSTART;VALUE=DATE:20261022')
    expect(text).toContain('DTEND;VALUE=DATE:20261023')
    expect(text).toContain('STATUS:TENTATIVE')
  })
})
