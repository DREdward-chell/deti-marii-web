import { ArrowIcon } from '../../shared/ui/icons'

/** UI integration contract, not a new backend endpoint or an admission rule. */
export type AccountLearning =
  | { access: 'restricted' }
  | {
      access: 'granted'
      title: string
      completedLessons: number
      totalLessons: number
      nextLesson?: string
      href: string
    }

export function AccountLearningCard({
  learning,
}: {
  learning?: AccountLearning
}) {
  // No placeholder for candidates, failed requests or a feature not connected yet.
  if (!learning || learning.access !== 'granted') return null

  const total = Number.isFinite(learning.totalLessons)
    ? Math.max(0, Math.floor(learning.totalLessons))
    : 0
  const completed = Number.isFinite(learning.completedLessons)
    ? Math.min(total, Math.max(0, Math.floor(learning.completedLessons)))
    : 0
  const finished = total > 0 && completed === total

  return (
    <section
      className="account-learning"
      aria-labelledby="account-learning-heading"
    >
      <p className="eyebrow">Ваше обучение</p>
      <h2 id="account-learning-heading">{learning.title}</h2>
      <p className="account-learning-description">
        {total === 0
          ? 'Команда готовит материалы. Они появятся здесь.'
          : finished
            ? 'Маршрут пройден. К материалам можно вернуться в любой момент.'
            : learning.nextLesson
              ? `Следующий урок: ${learning.nextLesson}`
              : 'Знакомьтесь с фондом и готовьтесь помогать в своём темпе.'}
      </p>
      {total > 0 && (
        <>
          <div className="account-learning-progress">
            <span id="account-learning-progress-label">
              Пройдено уроков: {completed} из {total}
            </span>
            <progress
              value={completed}
              max={total}
              aria-labelledby="account-learning-progress-label"
            />
          </div>
          <a className="btn btn--primary" href={learning.href}>
            {finished
              ? 'Вернуться к материалам'
              : completed > 0
                ? 'Продолжить обучение'
                : 'Начать обучение'}
            <ArrowIcon />
          </a>
        </>
      )}
    </section>
  )
}
