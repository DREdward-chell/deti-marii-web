import { describe, expect, it } from 'vitest'
import { course } from './content'
import {
  courseSummary,
  lessonPercent,
  lessonStatus,
  loadProgress,
  saveProgress,
} from './progress'

const [values, participation] = course.lessons

describe('learning progress', () => {
  it('moves a lesson from not started to completed', () => {
    expect(lessonStatus(values, {})).toBe('not_started')
    const started = {
      values: { slide: 2, seenSlides: 3, solved: [], completed: false },
    }
    expect(lessonStatus(values, started)).toBe('in_progress')
    expect(lessonPercent(values, started)).toBeGreaterThan(0)
    const done = { values: { ...started.values, completed: true } }
    expect(lessonStatus(values, done)).toBe('completed')
    expect(lessonPercent(values, done)).toBe(100)
  })

  it('keeps 100% for a finished lesson only', () => {
    const allSteps = {
      participation: {
        slide: 4,
        seenSlides: participation.slides.length,
        solved: participation.questions.map((question) => question.id),
        completed: false,
      },
    }
    expect(lessonPercent(participation, allSteps)).toBe(99)
  })

  it('summarises the route and points to the next lesson', () => {
    const progress = {
      values: { slide: 0, seenSlides: 11, solved: [], completed: true },
    }
    const summary = courseSummary(progress)
    expect(summary.completed).toBe(1)
    expect(summary.total).toBe(3)
    expect(summary.next?.id).toBe('participation')
    expect(courseSummary({}).percent).toBe(0)
  })

  it('stores progress per account and ignores broken data', () => {
    saveProgress('a', {
      values: { slide: 1, seenSlides: 2, solved: ['photo'], completed: false },
    })
    expect(loadProgress('a').values?.solved).toEqual(['photo'])
    expect(loadProgress('b')).toEqual({})
    localStorage.setItem('dm-learning:c', '{"values":{"slide":-3,"solved":[1]}')
    expect(loadProgress('c')).toEqual({})
    localStorage.setItem(
      'dm-learning:d',
      '{"values":{"slide":-3,"solved":[1,"x"]},"unknown":{}}',
    )
    expect(loadProgress('d')).toEqual({
      values: { slide: 0, seenSlides: 0, solved: ['x'], completed: false },
    })
  })
})
