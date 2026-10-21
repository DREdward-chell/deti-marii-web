import { useState, type ReactNode } from 'react'
import { Button } from '../../shared/ui/Button'
import { CheckIcon } from '../../shared/ui/icons'
import type {
  ChoiceQuestion,
  OrderQuestion,
  PreferenceQuestion,
} from './content'

/** Выбор одного варианта. Ошибка не штрафуется: объяснение и новая попытка. */
export function ChoiceView({
  question,
  solved,
  onSolved,
}: {
  question: ChoiceQuestion
  solved: boolean
  onSolved: () => void
}) {
  const [wrong, setWrong] = useState<string[]>([])
  const [picked, setPicked] = useState<string | null>(
    solved ? question.answer : null,
  )
  const correct = picked === question.answer
  const lastWrong = picked && !correct ? picked : null

  function pick(id: string) {
    if (correct) return
    setPicked(id)
    if (id === question.answer) onSolved()
    else setWrong((previous) => [...previous, id])
  }

  return (
    <>
      <div className="quiz-options" role="group" aria-label="Варианты ответа">
        {question.options.map((option) => {
          const state =
            correct && option.id === question.answer
              ? 'correct'
              : wrong.includes(option.id)
                ? 'wrong'
                : undefined
          return (
            <button
              key={option.id}
              type="button"
              className="quiz-option"
              data-state={state}
              aria-pressed={picked === option.id}
              disabled={correct && option.id !== question.answer}
              onClick={() => pick(option.id)}
            >
              <span className="quiz-option-mark" aria-hidden="true">
                {state === 'correct' ? (
                  <CheckIcon />
                ) : state === 'wrong' ? (
                  '×'
                ) : (
                  ''
                )}
              </span>
              {option.label}
            </button>
          )
        })}
      </div>
      {correct ? (
        <Feedback tone="correct" title="Верно!">
          {question.explanation}
        </Feedback>
      ) : lastWrong ? (
        <Feedback tone="wrong" title="Не совсем">
          «{question.options.find((o) => o.id === lastWrong)?.label}» — тоже
          важно, но в этой ситуации главное другое. Попробуйте ещё раз.
        </Feedback>
      ) : null}
    </>
  )
}

/** Перемешать шаги так, чтобы исходный порядок точно не совпал с верным. */
function shuffled<T>(items: T[]): T[] {
  const result = items
    .map((item, index) => ({ item, key: (index * 5 + 2) % items.length }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item)
  return result.every((item, index) => item === items[index])
    ? [...items].reverse()
    : result
}

/** Расставить шаги по порядку кнопками «выше» и «ниже» — без перетаскивания. */
export function OrderView({
  question,
  solved,
  onSolved,
}: {
  question: OrderQuestion
  solved: boolean
  onSolved: () => void
}) {
  const [order, setOrder] = useState(() =>
    solved ? question.steps : shuffled(question.steps),
  )
  const [checked, setChecked] = useState(solved)
  const correct = order.every((step, index) => step === question.steps[index])
  const done = checked && correct

  function move(index: number, delta: number) {
    setChecked(false)
    setOrder((previous) => {
      const next = [...previous]
      const [step] = next.splice(index, 1)
      next.splice(index + delta, 0, step)
      return next
    })
  }

  function check() {
    setChecked(true)
    if (correct) onSolved()
  }

  return (
    <>
      <ol className="quiz-order">
        {order.map((step, index) => {
          const placed = checked && step === question.steps[index]
          return (
            <li
              key={step.id}
              data-state={checked ? (placed ? 'correct' : 'wrong') : undefined}
            >
              <span className="quiz-order-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="quiz-order-label">
                {step.label}
                {checked && (
                  <span className="visually-hidden">
                    {placed ? ', на своём месте' : ', не на своём месте'}
                  </span>
                )}
              </span>
              <span className="quiz-order-buttons">
                <button
                  type="button"
                  disabled={done || index === 0}
                  aria-label={`Поднять «${step.label}» выше`}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={done || index === order.length - 1}
                  aria-label={`Опустить «${step.label}» ниже`}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          )
        })}
      </ol>
      {done ? (
        <Feedback tone="correct" title="Верно!">
          {question.explanation}
        </Feedback>
      ) : checked ? (
        <Feedback tone="wrong" title="Почти">
          Шаги, отмеченные зелёным, уже на месте. Поменяйте остальные и
          проверьте ещё раз.
        </Feedback>
      ) : null}
      {!done && (
        <Button
          variant="secondary"
          className="quiz-check"
          onClick={check}
          type="button"
        >
          Проверить порядок
        </Button>
      )}
    </>
  )
}

/** Личный выбор: верного ответа нет, ничего не оценивается. */
export function PreferenceView({
  question,
  solved,
  onSolved,
  onSave,
}: {
  question: PreferenceQuestion
  solved: boolean
  onSolved: () => void
  /** Перенести выбор в анкету; возвращает true, если получилось. */
  onSave?: (selected: string[]) => boolean
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [done, setDone] = useState(solved)
  const [saved, setSaved] = useState(false)

  function toggle(id: string) {
    setSaved(false)
    setSelected((previous) => {
      if (previous.includes(id)) return previous.filter((item) => item !== id)
      if (id === question.exclusive) return [id]
      return [...previous.filter((item) => item !== question.exclusive), id]
    })
  }

  return (
    <>
      <div className="quiz-pills" role="group" aria-label="Варианты">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="quiz-pill"
            aria-pressed={selected.includes(option.id)}
            onClick={() => toggle(option.id)}
          >
            <span className="quiz-pill-mark" aria-hidden="true">
              {selected.includes(option.id) ? <CheckIcon /> : '+'}
            </span>
            {option.label}
          </button>
        ))}
      </div>
      {done && (
        <Feedback tone="neutral" title="Спасибо!">
          {question.explanation}
        </Feedback>
      )}
      <div className="quiz-actions">
        {!done && (
          <Button
            variant="secondary"
            type="button"
            disabled={selected.length === 0}
            onClick={() => {
              setDone(true)
              onSolved()
            }}
          >
            Готово
          </Button>
        )}
        {done && onSave && selected.length > 0 && (
          <Button
            variant="secondary"
            type="button"
            disabled={saved}
            onClick={() => setSaved(onSave(selected))}
          >
            {saved ? 'Сохранено в анкету' : 'Сохранить выбор в анкету'}
          </Button>
        )}
      </div>
    </>
  )
}

function Feedback({
  tone,
  title,
  children,
}: {
  tone: 'correct' | 'wrong' | 'neutral'
  title: string
  children: ReactNode
}) {
  return (
    <div className="quiz-feedback" data-tone={tone} role="status">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  )
}
