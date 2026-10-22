import { course, type Lesson } from './content'

/**
 * Прогресс по урокам. По плану команды (docs 15, 19) он хранится на сервере
 * в модуле learning; пока API нет, прогресс живёт в браузере по аккаунту.
 * Когда появится BE-03, заменить loadProgress/saveProgress запросами.
 */
export interface LessonProgress {
  /** На каком слайде остановился человек. */
  slide: number
  /** Сколько слайдов уже просмотрено (максимум за все попытки). */
  seenSlides: number
  /** Вопросы, на которые дан верный ответ (или сделан выбор, если верного нет). */
  solved: string[]
  completed: boolean
}

export type LearningProgress = Record<string, LessonProgress>
export type LessonStatus = 'not_started' | 'in_progress' | 'completed'

export const statusLabels: Record<LessonStatus, string> = {
  not_started: 'Не начат',
  in_progress: 'В процессе',
  completed: 'Пройден',
}

export const emptyLesson: LessonProgress = {
  slide: 0,
  seenSlides: 0,
  solved: [],
  completed: false,
}

export function lessonProgress(
  progress: LearningProgress,
  lessonId: string,
): LessonProgress {
  return progress[lessonId] ?? emptyLesson
}

export function lessonStatus(
  lesson: Lesson,
  progress: LearningProgress,
): LessonStatus {
  const state = lessonProgress(progress, lesson.id)
  if (state.completed) return 'completed'
  return state.seenSlides > 0 || state.solved.length > 0
    ? 'in_progress'
    : 'not_started'
}

/** Доля пройденного урока: просмотренные слайды и решённые вопросы. */
export function lessonPercent(lesson: Lesson, progress: LearningProgress) {
  const state = lessonProgress(progress, lesson.id)
  if (state.completed) return 100
  const total = lesson.slides.length + lesson.questions.length
  const done =
    Math.min(state.seenSlides, lesson.slides.length) +
    state.solved.filter((id) => lesson.questions.some((q) => q.id === id))
      .length
  // 100% — только после завершения урока, даже если все шаги уже пройдены.
  return Math.min(99, Math.round((done / total) * 100))
}

export function courseSummary(
  progress: LearningProgress,
  lessons: Lesson[] = course.lessons,
) {
  const completed = lessons.filter(
    (lesson) => lessonStatus(lesson, progress) === 'completed',
  ).length
  const percent = Math.round(
    lessons.reduce((sum, lesson) => sum + lessonPercent(lesson, progress), 0) /
      lessons.length,
  )
  const next =
    lessons.find((lesson) => lessonStatus(lesson, progress) !== 'completed') ??
    null
  return { completed, total: lessons.length, percent, next }
}

const storageKey = (accountId: string) => `dm-learning:${accountId}`

function readLesson(value: unknown): LessonProgress | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const count = (key: string) =>
    Number.isInteger(item[key]) && (item[key] as number) >= 0
      ? (item[key] as number)
      : 0
  return {
    slide: count('slide'),
    seenSlides: count('seenSlides'),
    solved: Array.isArray(item.solved)
      ? item.solved.filter((id): id is string => typeof id === 'string')
      : [],
    completed: item.completed === true,
  }
}

export function loadProgress(accountId: string): LearningProgress {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(storageKey(accountId)) ?? 'null',
    )
    if (!raw || typeof raw !== 'object') return {}
    const result: LearningProgress = {}
    for (const lesson of course.lessons) {
      const value = readLesson((raw as Record<string, unknown>)[lesson.id])
      if (value) result[lesson.id] = value
    }
    return result
  } catch {
    return {}
  }
}

export function saveProgress(accountId: string, progress: LearningProgress) {
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(progress))
  } catch {
    // Без доступа к хранилищу прогресс сохранится только до перезагрузки.
  }
}
