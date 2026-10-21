import { describe, expect, it } from 'vitest'
import { caretAfterDigits, formatPhone, isPhoneComplete } from './phone'

describe('phone formatting', () => {
  it('formats a Russian number as it is typed', () => {
    expect(formatPhone('')).toBe('')
    expect(formatPhone('9')).toBe('+7 (9')
    expect(formatPhone('+7916')).toBe('+7 (916')
    expect(formatPhone('+79161')).toBe('+7 (916) 1')
    expect(formatPhone('89161234567')).toBe('+7 (916) 123-45-67')
    expect(formatPhone('+7 916 123 45 67 89')).toBe('+7 (916) 123-45-67')
  })

  it('keeps foreign numbers unmasked', () => {
    expect(formatPhone('+49 151 1234 5678')).toBe('+4915112345678')
  })

  it('accepts only empty or complete numbers', () => {
    expect(isPhoneComplete('')).toBe(true)
    expect(isPhoneComplete('+7 (916) 123-45-67')).toBe(true)
    expect(isPhoneComplete('+7 (916) 123')).toBe(false)
    expect(isPhoneComplete('+4915112345678')).toBe(true)
  })

  it('places the caret after the given digit', () => {
    expect(caretAfterDigits('+7 (916) 123', 4)).toBe(7)
    expect(caretAfterDigits('+7 (916) 123', 5)).toBe(10)
    expect(caretAfterDigits('+7 (916) 123', 0)).toBe(0)
  })
})
