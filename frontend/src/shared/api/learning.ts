import { get, isRecord, write } from './client'

export const lessonTypes = {
  READ: 'Материал для чтения',
  SINGLE_CHOICE: 'Выбор ответа',
  ORDERING: 'Порядок действий',
} as const
export const audiences = {
  ALL_VOLUNTEERS: 'Все волонтёры с анкетой',
  CONFIRMED_PAPERWORK: 'После подтверждения оформления',
} as const
export type LessonType = keyof typeof lessonTypes
export interface LessonOption {
  id: string
  text: string
}
export interface LessonContent {
  id: string
  title: string
  body: string
  type: LessonType
  options: LessonOption[]
  correctOptionId: string | null
  explanation: string
}
export interface CourseContent {
  title: string
  description: string
  audience: keyof typeof audiences
  demo: boolean
  lessons: LessonContent[]
}
export interface CourseListItem {
  id: string
  title: string
  revision: number
  publishedVersion: number | null
  publishedRevision: number | null
}
export interface CourseDraft {
  id: string
  revision: number
  content: CourseContent
  publishedVersion: number | null
  publishedRevision: number | null
}
export interface EnrollmentSummary {
  id: string
  courseId: string
  title: string
  version: number
  completedLessons: number
  totalLessons: number
  startedAt: string
  completedAt: string | null
}
export interface AvailableCourse {
  id: string
  title: string
  description: string
  version: number
  demo: boolean
  totalLessons: number
  enrollments: EnrollmentSummary[]
}
export interface AnswerData {
  lessonId: string
  optionId: string | null
  order: string[]
}
export interface Feedback {
  correct: boolean
  explanation: string
  optionId: string | null
  order: string[]
}
export interface LearnerLesson {
  id: string
  title: string
  body: string
  type: LessonType
  options: LessonOption[]
  available: boolean
  completed: boolean
  feedback: Feedback | null
}
export interface EnrollmentView {
  summary: EnrollmentSummary
  description: string
  demo: boolean
  lessons: LearnerLesson[]
}

function record(v: unknown) {
  if (!isRecord(v)) throw new Error('Unexpected learning object')
  return v
}
function str(v: unknown): string {
  if (typeof v !== 'string') throw new Error('Unexpected learning text')
  return v
}
function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
    throw new Error('Unexpected learning number')
  return v
}
function bool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw new Error('Unexpected learning flag')
  return v
}
function nullable<T>(v: unknown, parse: (v: unknown) => T): T | null {
  return v === null ? null : parse(v)
}
function list<T>(v: unknown, parse: (v: unknown) => T): T[] {
  if (!Array.isArray(v)) throw new Error('Unexpected learning list')
  return v.map(parse)
}
function kind<T extends string>(v: unknown, labels: Record<T, string>): T {
  if (typeof v !== 'string' || !Object.hasOwn(labels, v))
    throw new Error('Unexpected learning kind')
  return v as T
}
function option(v: unknown): LessonOption {
  const x = record(v)
  return { id: str(x.id), text: str(x.text) }
}
function lesson(v: unknown): LessonContent {
  const x = record(v)
  return {
    id: str(x.id),
    title: str(x.title),
    body: str(x.body),
    type: kind(x.type, lessonTypes),
    options: list(x.options, option),
    correctOptionId: nullable(x.correctOptionId, str),
    explanation: str(x.explanation),
  }
}
function draft(v: unknown): CourseDraft {
  const x = record(v)
  const c = record(x.content)
  return {
    id: str(x.id),
    revision: num(x.revision),
    publishedVersion: nullable(x.publishedVersion, num),
    publishedRevision: nullable(x.publishedRevision, num),
    content: {
      title: str(c.title),
      description: str(c.description),
      audience: kind(c.audience, audiences),
      demo: bool(c.demo),
      lessons: list(c.lessons, lesson),
    },
  }
}
function summary(v: unknown): EnrollmentSummary {
  const x = record(v)
  return {
    id: str(x.id),
    courseId: str(x.courseId),
    title: str(x.title),
    version: num(x.version),
    completedLessons: num(x.completedLessons),
    totalLessons: num(x.totalLessons),
    startedAt: str(x.startedAt),
    completedAt: nullable(x.completedAt, str),
  }
}
function feedback(v: unknown): Feedback {
  const x = record(v)
  return {
    correct: bool(x.correct),
    explanation: str(x.explanation),
    optionId: nullable(x.optionId, str),
    order: list(x.order, str),
  }
}
function view(v: unknown): EnrollmentView {
  const x = record(v)
  return {
    summary: summary(x.summary),
    description: str(x.description),
    demo: bool(x.demo),
    lessons: list(x.lessons, (v) => {
      const l = record(v)
      return {
        id: str(l.id),
        title: str(l.title),
        body: str(l.body),
        type: kind(l.type, lessonTypes),
        options: list(l.options, option),
        available: bool(l.available),
        completed: bool(l.completed),
        feedback: nullable(l.feedback, feedback),
      }
    }),
  }
}
const staffPath = '/coordination/learning/courses'
export async function listDrafts(
  signal?: AbortSignal,
): Promise<CourseListItem[]> {
  return list(await get(staffPath, signal), (v) => {
    const x = record(v)
    return {
      id: str(x.id),
      title: str(x.title),
      revision: num(x.revision),
      publishedVersion: nullable(x.publishedVersion, num),
      publishedRevision: nullable(x.publishedRevision, num),
    }
  })
}
export async function createCourse() {
  return draft(await write(staffPath, 'POST'))
}
export async function getCourse(id: string, signal?: AbortSignal) {
  return draft(await get(`${staffPath}/${encodeURIComponent(id)}`, signal))
}
export async function saveCourse(current: CourseDraft, content: CourseContent) {
  return draft(
    await write(`${staffPath}/${encodeURIComponent(current.id)}`, 'PUT', {
      revision: current.revision,
      content,
    }),
  )
}
export async function publishCourse(current: CourseDraft) {
  return draft(
    await write(
      `${staffPath}/${encodeURIComponent(current.id)}/publish`,
      'POST',
      { revision: current.revision },
    ),
  )
}
export async function withdrawCourse(current: CourseDraft) {
  return draft(
    await write(
      `${staffPath}/${encodeURIComponent(current.id)}/withdraw`,
      'POST',
      { publishedVersion: current.publishedVersion },
    ),
  )
}
export async function listCourses(
  signal?: AbortSignal,
): Promise<AvailableCourse[]> {
  return list(await get('/learning/courses', signal), (v) => {
    const x = record(v)
    return {
      id: str(x.id),
      title: str(x.title),
      description: str(x.description),
      version: num(x.version),
      demo: bool(x.demo),
      totalLessons: num(x.totalLessons),
      enrollments: list(x.enrollments, summary),
    }
  })
}
export async function startCourse(id: string, version: number) {
  return view(
    await write(`/learning/courses/${encodeURIComponent(id)}/start`, 'POST', {
      version,
    }),
  )
}
export async function getEnrollment(id: string, signal?: AbortSignal) {
  return view(
    await get(`/learning/enrollments/${encodeURIComponent(id)}`, signal),
  )
}
export async function submitAnswer(
  id: string,
  requestId: string,
  answer: AnswerData,
) {
  return view(
    await write(
      `/learning/enrollments/${encodeURIComponent(id)}/answers`,
      'POST',
      { requestId, ...answer },
    ),
  )
}
export async function volunteerProgress(id: string, signal?: AbortSignal) {
  return list(
    await get(
      `/coordination/volunteers/${encodeURIComponent(id)}/learning`,
      signal,
    ),
    summary,
  )
}
