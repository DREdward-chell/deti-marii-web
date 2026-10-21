import { describe, expect, it } from 'vitest'
import {
  ageError,
  loadExtras,
  saveExtras,
  toggleDirection,
  emptyExtras,
} from './profileMock'

describe('profile mock fields', () => {
  it('keeps «Пока не знаю» exclusive', () => {
    expect(toggleDirection(['CREATIVITY'], 'UNSURE')).toEqual(['UNSURE'])
    expect(toggleDirection(['UNSURE'], 'TRIPS')).toEqual(['TRIPS'])
    expect(toggleDirection(['CREATIVITY', 'TRIPS'], 'TRIPS')).toEqual([
      'CREATIVITY',
    ])
  })

  it('accepts an empty or whole-number age', () => {
    expect(ageError('')).toBe('')
    expect(ageError('27')).toBe('')
    expect(ageError('0')).not.toBe('')
    expect(ageError('300')).not.toBe('')
  })

  it('stores fields per account and ignores broken data', () => {
    saveExtras('a@example.test', {
      ...emptyExtras,
      age: '30',
      directions: ['CREATIVITY'],
    })
    expect(loadExtras('a@example.test')).toMatchObject({
      age: '30',
      directions: ['CREATIVITY'],
    })
    expect(loadExtras('b@example.test')).toEqual(emptyExtras)

    localStorage.setItem(
      'dm-profile-mock:c@example.test',
      '{"directions":["HACK"],"age":5}',
    )
    expect(loadExtras('c@example.test')).toEqual(emptyExtras)
  })
})
