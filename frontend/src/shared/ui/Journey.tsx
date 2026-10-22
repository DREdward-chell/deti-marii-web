import type { CSSProperties, ReactNode } from 'react'
import { cx } from './cx'
import { CheckIcon, LockIcon } from './icons'

export type JourneyStepState = 'done' | 'current' | 'upcoming' | 'locked'

export interface JourneyStep {
  title: string
  description?: ReactNode
  state: JourneyStepState
}

/** Подложки шагов по очереди берут цвета логотипа фонда. */
const tints = [
  'var(--tint-sun)',
  'var(--tint-sky)',
  'var(--tint-leaf)',
  'var(--tint-berry)',
  'var(--tint-blue)',
  'var(--tint-orange)',
]

const stateLabels: Record<JourneyStepState, string> = {
  done: 'выполнено',
  current: 'текущий шаг',
  upcoming: 'впереди',
  locked: 'пока закрыто',
}

/** Путь волонтёра: вертикальная последовательность шагов с отметкой текущего. */
export function Journey({
  steps,
  label,
  className,
}: {
  steps: JourneyStep[]
  label: string
  className?: string
}) {
  return (
    <ol className={cx('journey', className)} aria-label={label}>
      {steps.map((step, index) => (
        <li
          key={step.title}
          className={cx('journey-step', `journey-step--${step.state}`)}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <span
            className="journey-marker"
            style={
              { '--journey-tint': tints[index % tints.length] } as CSSProperties
            }
          >
            {step.state === 'done' ? (
              <CheckIcon />
            ) : step.state === 'locked' ? (
              <LockIcon />
            ) : (
              <span aria-hidden="true">{index + 1}</span>
            )}
          </span>
          <span className="journey-title">
            {step.title}
            <span className="visually-hidden">, {stateLabels[step.state]}</span>
            {step.state === 'current' && (
              <span className="journey-now" aria-hidden="true">
                сейчас
              </span>
            )}
          </span>
          {step.description && (
            <p className="journey-description">{step.description}</p>
          )}
        </li>
      ))}
    </ol>
  )
}
