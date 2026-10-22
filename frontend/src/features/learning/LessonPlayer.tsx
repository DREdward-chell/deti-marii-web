import { useEffect, useState } from 'react'
import { Button } from '../../shared/ui/Button'
import { CheckIcon } from '../../shared/ui/icons'
import type { Lesson, Question, Slide } from './content'
import { ChoiceView, OrderView, PreferenceView } from './Questions'
import type { LessonProgress } from './progress'

type Stage = 'cover' | 'slides' | 'questions' | 'done'

function initialStage(lesson: Lesson, state: LessonProgress): Stage {
  if (state.completed) return 'done'
  if (state.solved.length > 0 || state.seenSlides >= lesson.slides.length)
    return 'questions'
  if (state.seenSlides > 0) return 'slides'
  return 'cover'
}

/** Декоративные многоугольники в цветах фонда — как вырезанные работы в презентации. */
function Shapes() {
  return (
    <span className="slide-shapes" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

/**
 * Урок: обложка → презентация из карточек → вопросы с объяснениями → итог.
 * Повторное прохождение не сбрасывает отметку «пройден».
 */
export function LessonPlayer({
  lesson,
  number,
  state,
  hasNext,
  onProgress,
  onNext,
  onSaveDirections,
}: {
  lesson: Lesson
  number: number
  state: LessonProgress
  hasNext: boolean
  onProgress: (patch: Partial<LessonProgress>) => void
  onNext: () => void
  onSaveDirections?: (selected: string[]) => boolean
}) {
  const [stage, setStage] = useState<Stage>(() => initialStage(lesson, state))
  const [slide, setSlide] = useState(() =>
    Math.min(state.slide, lesson.slides.length - 1),
  )
  // При повторе вопросы проходятся заново, но прогресс урока не теряется.
  const [replay, setReplay] = useState(false)
  const solvedNow = replay ? [] : state.solved
  const [question, setQuestion] = useState(() => {
    const first = lesson.questions.findIndex(
      (item) => !state.solved.includes(item.id),
    )
    return first === -1 ? 0 : first
  })
  const [solvedInRun, setSolvedInRun] = useState<string[]>([])

  function goToSlide(index: number) {
    setSlide(index)
    onProgress({
      slide: index,
      seenSlides: Math.max(state.seenSlides, index + 1),
    })
  }

  function startSlides() {
    setStage('slides')
    goToSlide(stage === 'done' ? 0 : slide)
  }

  useEffect(() => {
    if (stage !== 'slides') return
    function onKey(event: KeyboardEvent) {
      // Стрелки в полях ввода не листают карточки; событие может прийти и от window.
      const target = event.target
      if (
        target instanceof Element &&
        target.closest('input, textarea, select')
      )
        return
      if (event.key === 'ArrowRight' && slide < lesson.slides.length - 1)
        goToSlide(slide + 1)
      if (event.key === 'ArrowLeft' && slide > 0) goToSlide(slide - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function solve(item: Question) {
    setSolvedInRun((previous) => [...previous, item.id])
    if (!state.solved.includes(item.id))
      onProgress({ solved: [...state.solved, item.id] })
  }

  function finishQuestions() {
    onProgress({ completed: true })
    setStage('done')
  }

  const current = lesson.questions[question]
  const currentSolved =
    solvedInRun.includes(current.id) || solvedNow.includes(current.id)

  return (
    <article className="lesson" aria-labelledby="lesson-title">
      {stage === 'cover' && (
        <div className={`lesson-cover tint--${lesson.tint} swap-in`}>
          <Shapes />
          <p className="lesson-kicker">Урок {number}</p>
          <h2 id="lesson-title">{lesson.title}</h2>
          <p className="lesson-goal">{lesson.goal}</p>
          <p className="lesson-meta">
            {lesson.minutes} · {lesson.slides.length} карточек ·{' '}
            {lesson.questions.length} вопросов
          </p>
          <Button onClick={startSlides}>
            {state.seenSlides > 0 ? 'Продолжить урок' : 'Начать урок'}
          </Button>
          <p className="lesson-source">Источник: {lesson.source}</p>
        </div>
      )}

      {stage === 'slides' && (
        <div className="lesson-slides">
          <h2 id="lesson-title" className="visually-hidden">
            {lesson.title}
          </h2>
          <ol className="slide-progress" aria-label="Карточки урока">
            {lesson.slides.map((item, index) => (
              <li
                key={item.id}
                data-state={
                  index === slide
                    ? 'current'
                    : index < Math.max(state.seenSlides, slide + 1)
                      ? 'seen'
                      : undefined
                }
              >
                <button
                  type="button"
                  aria-label={`Карточка ${index + 1}: ${item.title}`}
                  aria-current={index === slide ? 'step' : undefined}
                  onClick={() => goToSlide(index)}
                />
              </li>
            ))}
          </ol>
          <SlideCard
            key={lesson.slides[slide].id}
            slide={lesson.slides[slide]}
            index={slide}
            total={lesson.slides.length}
          />
          <div className="slide-controls">
            <Button
              variant="secondary"
              disabled={slide === 0}
              onClick={() => goToSlide(slide - 1)}
            >
              ← Назад
            </Button>
            <span className="slide-counter">
              {slide + 1} / {lesson.slides.length}
            </span>
            {slide < lesson.slides.length - 1 ? (
              <Button onClick={() => goToSlide(slide + 1)}>Дальше →</Button>
            ) : (
              <Button onClick={() => setStage('questions')}>
                К вопросам →
              </Button>
            )}
          </div>
          <p className="slide-hint">Листать можно и стрелками на клавиатуре.</p>
        </div>
      )}

      {stage === 'questions' && (
        <div className="lesson-questions">
          <h2 id="lesson-title" className="visually-hidden">
            {lesson.title}
          </h2>
          <div className="quiz-head">
            <p className="lesson-kicker">
              Вопрос {question + 1} из {lesson.questions.length}
            </p>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setStage('slides')
                goToSlide(0)
              }}
            >
              Пересмотреть карточки
            </Button>
          </div>
          <div className="quiz-card swap-in" key={current.id}>
            <h3>{current.prompt}</h3>
            {current.kind === 'choice' ? (
              <ChoiceView
                question={current}
                solved={currentSolved}
                onSolved={() => solve(current)}
              />
            ) : current.kind === 'order' ? (
              <OrderView
                question={current}
                solved={currentSolved}
                onSolved={() => solve(current)}
              />
            ) : (
              <PreferenceView
                question={current}
                solved={currentSolved}
                onSolved={() => solve(current)}
                onSave={onSaveDirections}
              />
            )}
          </div>
          <div className="quiz-nav">
            <Button
              variant="secondary"
              disabled={question === 0}
              onClick={() => setQuestion(question - 1)}
            >
              ← Назад
            </Button>
            {question < lesson.questions.length - 1 ? (
              <Button
                disabled={!currentSolved}
                onClick={() => setQuestion(question + 1)}
              >
                Следующий вопрос →
              </Button>
            ) : (
              <Button disabled={!currentSolved} onClick={finishQuestions}>
                Завершить урок
              </Button>
            )}
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className={`lesson-done tint--${lesson.tint} swap-in`}>
          <span className="lesson-confetti" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} />
            ))}
          </span>
          <span className="lesson-done-badge" aria-hidden="true">
            <CheckIcon />
          </span>
          <p className="lesson-kicker">Урок {number} пройден</p>
          <h2 id="lesson-title">{lesson.title}</h2>
          <p className="lesson-goal">
            {hasNext
              ? 'Отлично! Можно переходить к следующему уроку или вернуться к карточкам.'
              : 'Вы прошли все уроки маршрута. Спасибо, что узнали фонд ближе!'}
          </p>
          <div className="lesson-done-actions">
            {hasNext ? (
              <Button onClick={onNext}>Следующий урок →</Button>
            ) : (
              <a className="btn btn--primary" href="/">
                Вернуться в профиль
              </a>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setReplay(true)
                setSolvedInRun([])
                setQuestion(0)
                setStage('slides')
                goToSlide(0)
              }}
            >
              Повторить урок
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}

function SlideCard({
  slide,
  index,
  total,
}: {
  slide: Slide
  index: number
  total: number
}) {
  return (
    <section
      className={`slide tint--${slide.tint} swap-in`}
      aria-roledescription="карточка"
      aria-label={`${index + 1} из ${total}`}
    >
      <Shapes />
      <p className="slide-kicker">{slide.kicker}</p>
      <h3>{slide.title}</h3>
      <p className="slide-text">{slide.text}</p>
      {slide.points && (
        <ul className="slide-points">
          {slide.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
