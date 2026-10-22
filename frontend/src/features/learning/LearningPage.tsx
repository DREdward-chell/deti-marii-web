import { useEffect, useState, type CSSProperties } from 'react'
import { loadExtras, saveExtras, type Direction } from '../profile/profileMock'
import { course } from './content'
import { ProgressRing } from './LearningCard'
import { LessonPlayer } from './LessonPlayer'
import {
  courseSummary,
  emptyLesson,
  lessonPercent,
  lessonProgress,
  lessonStatus,
  loadProgress,
  saveProgress,
  statusLabels,
  type LearningProgress,
  type LessonProgress,
} from './progress'
import './learning.css'

function lessonFromUrl(fallback: string) {
  const id = new URLSearchParams(window.location.search).get('lesson')
  return course.lessons.some((lesson) => lesson.id === id) ? id! : fallback
}

/** Полноразмерный учебный экран: маршрут из уроков и плеер текущего урока. */
export function LearningPage({
  accountId,
  email,
}: {
  accountId: string
  email: string
}) {
  const [progress, setProgress] = useState<LearningProgress>(() =>
    loadProgress(accountId),
  )
  const summary = courseSummary(progress)
  const [selected, setSelected] = useState(() =>
    lessonFromUrl(summary.next?.id ?? course.lessons[0].id),
  )

  useEffect(() => {
    const pop = () => setSelected(lessonFromUrl(course.lessons[0].id))
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])

  function open(id: string) {
    setSelected(id)
    const url = new URL(window.location.href)
    url.searchParams.set('lesson', id)
    window.history.pushState(null, '', url)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function update(lessonId: string, patch: Partial<LessonProgress>) {
    setProgress((previous) => {
      const next = {
        ...previous,
        [lessonId]: { ...emptyLesson, ...previous[lessonId], ...patch },
      }
      saveProgress(accountId, next)
      return next
    })
  }

  // Выбор направлений из урока переносится в анкету (мок-поля анкеты).
  function saveDirections(selectedDirections: string[]) {
    saveExtras(email, {
      ...loadExtras(email),
      directions: selectedDirections as Direction[],
    })
    return true
  }

  const index = course.lessons.findIndex((lesson) => lesson.id === selected)
  const lesson = course.lessons[index]
  const nextLesson = course.lessons[index + 1]

  return (
    <div className="learning appear">
      <nav className="learning-nav" aria-label="Личный кабинет">
        <a href="/">← Мой профиль</a>
      </nav>
      <header className="learning-header">
        <div>
          <p className="learning-eyebrow">Обучение</p>
          <h1>{course.title}</h1>
          <p className="learning-lead">
            Короткие уроки о фонде: сначала карточки, потом вопросы. Ошибаться
            не страшно — после ответа появится объяснение.
          </p>
        </div>
        <div className="learning-total">
          <ProgressRing percent={summary.percent} size={72} />
          <p>
            Пройдено уроков: <strong>{summary.completed}</strong> из{' '}
            {summary.total}
          </p>
        </div>
      </header>

      <div className="learning-layout">
        <ol className="learning-route" aria-label="Уроки маршрута">
          {course.lessons.map((item, position) => {
            const status = lessonStatus(item, progress)
            const percent = lessonPercent(item, progress)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="route-lesson"
                  data-status={status}
                  aria-current={item.id === selected ? 'step' : undefined}
                  onClick={() => open(item.id)}
                >
                  <span
                    className={`route-number tint--${item.tint}`}
                    aria-hidden="true"
                  >
                    {status === 'completed' ? '✓' : position + 1}
                  </span>
                  <span className="route-text">
                    <strong>{item.title}</strong>
                    <span className="route-meta">
                      {statusLabels[status]} · {item.minutes}
                    </span>
                    <span
                      className="route-bar"
                      style={{ '--fill': `${percent}%` } as CSSProperties}
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <LessonPlayer
          key={lesson.id}
          lesson={lesson}
          number={index + 1}
          state={lessonProgress(progress, lesson.id)}
          hasNext={!!nextLesson}
          onProgress={(patch) => update(lesson.id, patch)}
          onNext={() => nextLesson && open(nextLesson.id)}
          onSaveDirections={
            lesson.id === 'directions' ? saveDirections : undefined
          }
        />
      </div>
    </div>
  )
}
