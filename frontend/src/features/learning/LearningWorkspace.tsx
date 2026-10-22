import { useEffect, useRef, useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  getEnrollment,
  listCourses,
  startCourse,
  submitAnswer,
  type AnswerData,
  type AvailableCourse,
  type EnrollmentView,
  type LearnerLesson,
} from '../../shared/api/learning'
import { move } from './demo'

export function LearningWorkspace({
  onSessionExpired,
}: {
  onSessionExpired: () => void
}) {
  const [courses, setCourses] = useState<AvailableCourse[] | null>(null)
  const [view, setView] = useState<EnrollmentView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const pending = useRef<{ signature: string; id: string } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void listCourses(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setCourses(value)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired()
        else setError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [reload, onSessionExpired])
  function fail(cause: unknown) {
    if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
      setView(null)
      setCourses(null)
      setReviewId(null)
      pending.current = null
    }
    if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
    else setError(errorMessage(cause))
  }
  async function open(course: AvailableCourse, enrollmentId?: string) {
    setBusy(true)
    setError('')
    setReviewId(null)
    pending.current = null
    try {
      setView(
        enrollmentId
          ? await getEnrollment(enrollmentId)
          : await startCourse(course.id, course.version),
      )
    } catch (cause) {
      fail(cause)
    } finally {
      setBusy(false)
    }
  }
  async function refresh() {
    if (!view) {
      setError('')
      setCourses(null)
      setReload((x) => x + 1)
      return
    }
    setBusy(true)
    setError('')
    try {
      setView(await getEnrollment(view.summary.id))
      pending.current = null
    } catch (cause) {
      fail(cause)
    } finally {
      setBusy(false)
    }
  }
  async function answer(data: AnswerData) {
    if (!view) return
    const signature = JSON.stringify([view.summary.id, data])
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: crypto.randomUUID() }
    setBusy(true)
    setError('')
    try {
      const next = await submitAnswer(view.summary.id, pending.current.id, data)
      setView(next)
      setReviewId(data.lessonId)
      pending.current = null
    } catch (cause) {
      fail(cause)
    } finally {
      setBusy(false)
    }
  }
  const active =
    view?.lessons.find((item) => item.id === reviewId && item.available) ??
    view?.lessons.find((item) => !item.completed && item.available) ??
    view?.lessons.at(-1)
  return (
    <section className="learning-workspace">
      <p className="eyebrow">Пространство волонтёра</p>
      <h1>Моё обучение</h1>
      <p className="muted">
        Проходите шаги в удобном темпе. Прогресс сохраняется после каждого
        ответа. Обучение само по себе не подтверждает оформление и допуск.
      </p>
      <div className="learning-actions">
        {view && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setView(null)
              setReviewId(null)
              setError('')
              setCourses(null)
              setReload((x) => x + 1)
            }}
          >
            ← Все маршруты
          </button>
        )}
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Обновить обучение
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {view ? (
        <>
          <article className="form-card">
            {view.demo && (
              <p className="preview-label">Демонстрационный материал</p>
            )}
            <h2>{view.summary.title}</h2>
            <p>{view.description}</p>
            <p role="status">
              Версия {view.summary.version} · Пройдено{' '}
              {view.summary.completedLessons} из {view.summary.totalLessons}
            </p>
            <progress
              aria-label="Прогресс маршрута"
              max={view.summary.totalLessons}
              value={view.summary.completedLessons}
            />
            {view.summary.completedAt && (
              <p className="notice">
                Маршрут завершён. Вы можете вернуться к любому уроку.
              </p>
            )}
            <ol className="lesson-nav">
              {view.lessons.map((lesson, i) => (
                <li key={lesson.id}>
                  <button
                    className="text-button"
                    disabled={busy || !lesson.available}
                    aria-current={active?.id === lesson.id ? 'step' : undefined}
                    onClick={() => {
                      setReviewId(lesson.id)
                      setError('')
                    }}
                  >
                    {i + 1}. {lesson.title}{' '}
                    {lesson.completed
                      ? '✓'
                      : !lesson.available
                        ? '· Позже'
                        : ''}
                  </button>
                </li>
              ))}
            </ol>
          </article>
          {active && (
            <LessonPlayer
              key={`${view.summary.id}:${active.id}:${JSON.stringify(active.feedback)}`}
              lesson={active}
              busy={busy}
              onAnswer={(data) => void answer(data)}
              onNext={() => setReviewId(null)}
              hasNext={view.lessons.some(
                (item) => item.available && !item.completed,
              )}
            />
          )}
        </>
      ) : courses ? (
        courses.length ? (
          <div className="course-grid">
            {courses.map((course) => (
              <article className="form-card" key={course.id}>
                {course.demo && (
                  <p className="preview-label">Демонстрационный материал</p>
                )}
                <h2>{course.title}</h2>
                <p>{course.description}</p>
                <p className="muted">
                  Версия {course.version} · Уроков: {course.totalLessons}
                </p>
                {!course.enrollments.some(
                  (item) => item.version === course.version,
                ) && (
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void open(course)}
                  >
                    {course.enrollments.length
                      ? 'Начать новую версию'
                      : 'Начать обучение'}
                  </button>
                )}
                {course.enrollments.map((item) => (
                  <div className="enrollment-row" key={item.id}>
                    <span>
                      Версия {item.version}: {item.completedLessons} из{' '}
                      {item.totalLessons}
                    </span>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void open(course, item.id)}
                    >
                      {item.completedAt
                        ? 'Посмотреть пройденное'
                        : 'Продолжить'}
                    </button>
                  </div>
                ))}
              </article>
            ))}
          </div>
        ) : (
          <p className="notice">
            Пока нет доступных маршрутов. Они появятся после публикации
            координатором; для части материалов требуется подтверждение
            оформления.
          </p>
        )
      ) : (
        !error && <p role="status">Загружаем обучение…</p>
      )}
    </section>
  )
}
function LessonPlayer({
  lesson,
  busy,
  onAnswer,
  onNext,
  hasNext,
}: {
  lesson: LearnerLesson
  busy: boolean
  onAnswer: (data: AnswerData) => void
  onNext: () => void
  hasNext: boolean
}) {
  const [optionId, setOptionId] = useState<string | null>(
    lesson.feedback?.optionId ?? null,
  )
  const [order, setOrder] = useState(
    lesson.feedback?.order.length
      ? lesson.feedback.order
      : lesson.options.map((item) => item.id),
  )
  return (
    <article className="form-card lesson-player">
      <h2>{lesson.title}</h2>
      <p className="lesson-body">{lesson.body}</p>
      <fieldset className="learning-fields" disabled={busy || lesson.completed}>
        {lesson.type === 'SINGLE_CHOICE' && (
          <>
            <legend>Выберите один ответ</legend>
            {lesson.options.map((option) => (
              <label key={option.id} className="answer-option">
                <input
                  type="radio"
                  name={`answer-${lesson.id}`}
                  checked={optionId === option.id}
                  onChange={() => setOptionId(option.id)}
                />
                {option.text}
              </label>
            ))}
          </>
        )}
        {lesson.type === 'ORDERING' && (
          <>
            <legend>Расположите действия по порядку</legend>
            <ol className="ordering-options">
              {order.map((id, index) => (
                <li key={id}>
                  <span>
                    {lesson.options.find((option) => option.id === id)?.text}
                  </span>
                  <div className="learning-actions">
                    <button
                      className="secondary-button"
                      aria-label={`Шаг ${index + 1} выше`}
                      disabled={index === 0}
                      onClick={() => setOrder(move(order, index, -1))}
                    >
                      ↑
                    </button>
                    <button
                      className="secondary-button"
                      aria-label={`Шаг ${index + 1} ниже`}
                      disabled={index === order.length - 1}
                      onClick={() => setOrder(move(order, index, 1))}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
        {!lesson.completed && (
          <button
            className="primary-button"
            disabled={busy || (lesson.type === 'SINGLE_CHOICE' && !optionId)}
            onClick={() =>
              onAnswer({
                lessonId: lesson.id,
                optionId: lesson.type === 'SINGLE_CHOICE' ? optionId : null,
                order: lesson.type === 'ORDERING' ? order : [],
              })
            }
          >
            {busy
              ? 'Сохраняем…'
              : lesson.type === 'READ'
                ? 'Прочитано, продолжить'
                : 'Проверить ответ'}
          </button>
        )}
      </fieldset>
      {lesson.feedback && (
        <div role="status" className="notice">
          <strong>
            {lesson.feedback.correct
              ? 'Шаг завершён.'
              : 'Пока не совсем так. Попробуйте ещё раз.'}
          </strong>
          {lesson.feedback.explanation && <p>{lesson.feedback.explanation}</p>}
        </div>
      )}
      {lesson.completed && hasNext && (
        <button className="primary-button" disabled={busy} onClick={onNext}>
          К следующему шагу
        </button>
      )}
    </article>
  )
}
