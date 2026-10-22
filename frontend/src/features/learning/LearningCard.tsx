import { useState, type CSSProperties } from 'react'
import { course } from './content'
import {
  courseSummary,
  lessonPercent,
  lessonStatus,
  loadProgress,
  statusLabels,
} from './progress'
import './learning.css'

/** Кольцо прогресса: доля закрашенной окружности равна проценту. */
export function ProgressRing({
  percent,
  size = 56,
}: {
  percent: number
  size?: number
}) {
  const radius = (size - 8) / 2
  const length = 2 * Math.PI * radius
  return (
    <span className="progress-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="progress-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        <circle
          className="progress-ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - percent / 100)}
        />
      </svg>
      <span className="progress-ring-label">{percent}%</span>
    </span>
  )
}

/**
 * Виджет личного кабинета под календарём: прогресс обучения и следующий урок.
 * Нажатие открывает полноразмерный учебный экран.
 */
export function LearningCard({ accountId }: { accountId: string }) {
  const [progress] = useState(() => loadProgress(accountId))
  const summary = courseSummary(progress)
  const finished = summary.next === null
  const nextIndex = summary.next
    ? course.lessons.findIndex((lesson) => lesson.id === summary.next?.id)
    : -1
  const started = summary.percent > 0
  const href = summary.next
    ? `/learning?lesson=${summary.next.id}`
    : '/learning'

  return (
    <section className="learning-card" aria-labelledby="learning-card-heading">
      <header className="learning-card-head">
        <div>
          <p className="learning-card-kicker">Обучение</p>
          <h2 id="learning-card-heading">{course.title}</h2>
        </div>
        <ProgressRing percent={summary.percent} />
      </header>

      <ol className="learning-card-lessons" aria-label="Уроки">
        {course.lessons.map((lesson) => {
          const status = lessonStatus(lesson, progress)
          return (
            <li key={lesson.id} data-status={status}>
              <span
                className="learning-card-bar"
                style={
                  {
                    '--fill': `${lessonPercent(lesson, progress)}%`,
                  } as CSSProperties
                }
                aria-hidden="true"
              />
              <span className="visually-hidden">
                {lesson.title}: {statusLabels[status].toLowerCase()}
              </span>
            </li>
          )
        })}
      </ol>

      <p className="learning-card-status">
        {finished ? (
          <>Все уроки пройдены — можно повторить в любой момент.</>
        ) : (
          <>
            <span>
              Урок {nextIndex + 1} из {summary.total}
            </span>{' '}
            {summary.next?.title}
          </>
        )}
      </p>

      <a className="learning-card-link" href={href}>
        {finished
          ? 'Повторить уроки'
          : started
            ? 'Продолжить обучение'
            : 'Начать обучение'}
        <span aria-hidden="true">→</span>
      </a>
    </section>
  )
}
