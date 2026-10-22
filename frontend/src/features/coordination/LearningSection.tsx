import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { Chip } from '../../shared/ui/Chip'
import { TextArea } from '../../shared/ui/TextArea'
import { DemoNotice } from './DemoNotice'
import {
  blockLabels,
  lessonProblems,
  lessonRepository,
  lessonStatusLabels,
  newBlock,
  type BlockType,
  type Lesson,
  type LessonBlock,
  type LessonFields,
} from './lessons'

/** Обучение: маршрут из уроков, редактор готовых блоков, предпросмотр и публикация. */
export function LearningSection({
  onSessionExpired,
}: {
  onSessionExpired: () => void
}) {
  const [lessons, setLessons] = useState<Lesson[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState<'new' | string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void lessonRepository
      .list(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setLessons(value)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired()
        else setLoadError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [attempt, onSessionExpired])

  function put(lesson: Lesson) {
    setLessons((previous) =>
      previous?.some((item) => item.id === lesson.id)
        ? previous.map((item) => (item.id === lesson.id ? lesson : item))
        : [...(previous ?? []), lesson],
    )
  }

  async function move(id: string, direction: -1 | 1) {
    try {
      setLessons(await lessonRepository.move(id, direction))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else setLoadError(errorMessage(cause))
    }
  }

  if (editing !== null)
    return (
      <LessonEditor
        lesson={
          editing === 'new'
            ? null
            : (lessons?.find((item) => item.id === editing) ?? null)
        }
        onSaved={(lesson) => {
          put(lesson)
          setEditing(lesson.id)
        }}
        onClose={() => setEditing(null)}
        onSessionExpired={onSessionExpired}
      />
    )

  const published = lessons?.filter(
    (item) => item.status === 'PUBLISHED',
  ).length

  return (
    <section className="panel-section" aria-labelledby="learning-heading">
      <header className="coordinator-header panel-header-row">
        <h1 id="learning-heading">Обучение</h1>
        <Button size="sm" onClick={() => setEditing('new')}>
          Новый урок
        </Button>
      </header>
      <DemoNotice>
        Уроки пока хранятся только в этом браузере: API обучения ещё нет.
        Содержание примеров — демонстрационное, его заменят материалы фонда.
      </DemoNotice>
      {loadError ? (
        <Card tone="raised" as="div" className="coordinator-message">
          <p className="form-error">{loadError}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setLoadError('')
              setLessons(null)
              setAttempt((value) => value + 1)
            }}
          >
            Попробовать снова
          </Button>
        </Card>
      ) : !lessons ? (
        <p className="notice" role="status">
          Загружаем уроки…
        </p>
      ) : (
        <Card
          tone="raised"
          className="route-card"
          aria-labelledby="route-heading"
        >
          <div className="route-card-head">
            <h2 id="route-heading">Первые шаги в фонде</h2>
            <p className="muted">
              Открывается человеку после принятия в команду. Опубликовано{' '}
              {published} из {lessons.length}. Порядок уроков — порядок
              прохождения.
            </p>
          </div>
          {lessons.length === 0 ? (
            <p className="muted">Уроков пока нет — создайте первый.</p>
          ) : (
            <ol className="lesson-list">
              {lessons.map((lesson, index) => (
                <li key={lesson.id} className="lesson-row">
                  <span className="lesson-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    className="lesson-open"
                    onClick={() => setEditing(lesson.id)}
                  >
                    <strong>{lesson.title || 'Без названия'}</strong>
                    <span className="muted">
                      {lesson.blocks
                        .map((block) => blockLabels[block.type])
                        .join(' · ') || 'Пока без блоков'}
                    </span>
                  </button>
                  <span className="lesson-status">
                    <Chip
                      tone={lesson.status === 'PUBLISHED' ? 'success' : 'muted'}
                    >
                      {lessonStatusLabels[lesson.status]}
                    </Chip>
                    {lesson.changedSincePublish && (
                      <Chip tone="waiting">Есть правки</Chip>
                    )}
                  </span>
                  <span className="lesson-move">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Поднять урок «${lesson.title}»`}
                      disabled={index === 0}
                      onClick={() => void move(lesson.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Опустить урок «${lesson.title}»`}
                      disabled={index === lessons.length - 1}
                      onClick={() => void move(lesson.id, 1)}
                    >
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </section>
  )
}

function LessonEditor({
  lesson,
  onSaved,
  onClose,
  onSessionExpired,
}: {
  lesson: Lesson | null
  onSaved: (lesson: Lesson) => void
  onClose: () => void
  onSessionExpired: () => void
}) {
  const [draft, setDraft] = useState<LessonFields>(() =>
    lesson
      ? {
          title: lesson.title,
          goal: lesson.goal,
          source: lesson.source,
          blocks: lesson.blocks,
        }
      : { title: '', goal: '', source: '', blocks: [] },
  )
  const [dirty, setDirty] = useState(lesson === null)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showProblems, setShowProblems] = useState(false)
  const problems = lessonProblems(draft)

  function change(next: Partial<LessonFields>) {
    setDraft((previous) => ({ ...previous, ...next }))
    setDirty(true)
    setNotice('')
  }
  function changeBlock(id: string, block: LessonBlock) {
    change({
      blocks: draft.blocks.map((item) => (item.id === id ? block : item)),
    })
  }
  function moveBlock(index: number, direction: -1 | 1) {
    const blocks = [...draft.blocks]
    ;[blocks[index], blocks[index + direction]] = [
      blocks[index + direction],
      blocks[index],
    ]
    change({ blocks })
  }

  async function act(kind: 'save' | 'publish' | 'unpublish') {
    if (busy) return
    if (kind === 'publish' && problems.length) {
      setShowProblems(true)
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      let current = lesson
      if (dirty || !current) {
        current = await lessonRepository.save(
          current?.id ?? null,
          current?.version ?? 0,
          draft,
        )
        setDirty(false)
      }
      if (kind === 'publish')
        current = await lessonRepository.publish(current.id, current.version)
      if (kind === 'unpublish')
        current = await lessonRepository.unpublish(current.id, current.version)
      onSaved(current)
      setNotice(
        kind === 'publish'
          ? 'Урок опубликован: принятые волонтёры увидят его в маршруте.'
          : kind === 'unpublish'
            ? 'Урок снят с публикации. История прохождения сохраняется.'
            : current.status === 'PUBLISHED'
              ? 'Сохранено. Волонтёры увидят правки после повторной публикации.'
              : 'Черновик сохранён.',
      )
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void act('save')
  }

  return (
    <section className="panel-section" aria-labelledby="lesson-heading">
      <Button variant="quiet" size="sm" className="back-link" onClick={onClose}>
        ← К маршруту
      </Button>
      <header className="coordinator-header panel-header-row">
        <h1 id="lesson-heading">{draft.title || 'Новый урок'}</h1>
        <span className="lesson-status">
          {lesson && (
            <Chip tone={lesson.status === 'PUBLISHED' ? 'success' : 'muted'}>
              {lessonStatusLabels[lesson.status]}
            </Chip>
          )}
          {dirty && <Chip tone="waiting">Не сохранено</Chip>}
        </span>
      </header>

      <div className="segmented" role="group" aria-label="Режим">
        <button
          type="button"
          aria-pressed={!preview}
          onClick={() => setPreview(false)}
        >
          Редактор
        </button>
        <button
          type="button"
          aria-pressed={preview}
          onClick={() => setPreview(true)}
        >
          Как увидит волонтёр
        </button>
      </div>

      {preview ? (
        <LessonPreview lesson={draft} />
      ) : (
        <form onSubmit={submit} noValidate>
          <fieldset disabled={busy} className="lesson-form">
            <Card tone="raised">
              <label htmlFor="lesson-title">Название урока</label>
              <input
                id="lesson-title"
                maxLength={120}
                value={draft.title}
                onChange={(e) => change({ title: e.target.value })}
              />
              <label htmlFor="lesson-goal">
                Что человек поймёт после урока
              </label>
              <input
                id="lesson-goal"
                maxLength={200}
                value={draft.goal}
                onChange={(e) => change({ goal: e.target.value })}
              />
              <label htmlFor="lesson-source">
                Источник{' '}
                <span className="optional-label">раздел документа фонда</span>
              </label>
              <input
                id="lesson-source"
                maxLength={200}
                value={draft.source}
                onChange={(e) => change({ source: e.target.value })}
              />
            </Card>

            {draft.blocks.map((block, index) => (
              <BlockEditor
                key={block.id}
                block={block}
                index={index}
                last={index === draft.blocks.length - 1}
                onChange={(next) => changeBlock(block.id, next)}
                onMove={(direction) => moveBlock(index, direction)}
                onRemove={() =>
                  change({
                    blocks: draft.blocks.filter((item) => item.id !== block.id),
                  })
                }
              />
            ))}

            <div className="add-block">
              <span className="muted">Добавить блок:</span>
              {(Object.keys(blockLabels) as BlockType[]).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    change({ blocks: [...draft.blocks, newBlock(type)] })
                  }
                >
                  + {blockLabels[type]}
                </Button>
              ))}
            </div>
          </fieldset>
        </form>
      )}

      {(showProblems || lesson?.status === 'PUBLISHED') &&
        problems.length > 0 && (
          <div className="lesson-problems" role="alert">
            <p>
              <strong>Чтобы опубликовать, осталось:</strong>
            </p>
            <ul>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      {lesson?.changedSincePublish && !dirty && (
        <p className="muted">
          Волонтёры видят опубликованную версию. Новые правки они увидят после
          повторной публикации.
        </p>
      )}

      <div className="panel-actions lesson-actions">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || !dirty}
          onClick={() => void act('save')}
        >
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        {lesson?.status === 'PUBLISHED' &&
        !lesson.changedSincePublish &&
        !dirty ? (
          <Button
            type="button"
            size="sm"
            variant="quiet"
            disabled={busy}
            onClick={() => void act('unpublish')}
          >
            Снять с публикации
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void act('publish')}
          >
            {lesson?.status === 'PUBLISHED'
              ? 'Опубликовать правки'
              : 'Опубликовать'}
          </Button>
        )}
      </div>
    </section>
  )
}

function BlockEditor({
  block,
  index,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  block: LessonBlock
  index: number
  last: boolean
  onChange: (block: LessonBlock) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const id = (name: string) => `${block.id}-${name}`
  return (
    <Card
      tone="plain"
      className="block-editor"
      aria-label={`Блок ${index + 1}`}
    >
      <div className="block-editor-head">
        <span className="block-type">
          <span className="block-index">{index + 1}</span>
          {blockLabels[block.type]}
        </span>
        <span className="block-tools">
          <button
            type="button"
            className="icon-button"
            aria-label={`Поднять блок ${index + 1}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Опустить блок ${index + 1}`}
            disabled={last}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <Button type="button" variant="quiet" size="sm" onClick={onRemove}>
            Удалить
          </Button>
        </span>
      </div>

      {block.type === 'TEXT' && (
        <>
          <label htmlFor={id('text')}>Текст</label>
          <TextArea
            id={id('text')}
            maxLength={2000}
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        </>
      )}

      {block.type === 'CARDS' && (
        <>
          <p className="field-hint">
            Каждая карточка отвечает на один вопрос. Волонтёр открывает их по
            очереди.
          </p>
          {block.cards.map((card, cardIndex) => (
            <div key={cardIndex} className="block-item">
              <label htmlFor={id(`card-${cardIndex}-title`)}>
                Карточка {cardIndex + 1}: заголовок
              </label>
              <input
                id={id(`card-${cardIndex}-title`)}
                maxLength={80}
                value={card.title}
                onChange={(e) =>
                  onChange({
                    ...block,
                    cards: block.cards.map((item, i) =>
                      i === cardIndex
                        ? { ...item, title: e.target.value }
                        : item,
                    ),
                  })
                }
              />
              <label htmlFor={id(`card-${cardIndex}-text`)}>
                Текст карточки
              </label>
              <TextArea
                id={id(`card-${cardIndex}-text`)}
                maxLength={400}
                value={card.text}
                onChange={(e) =>
                  onChange({
                    ...block,
                    cards: block.cards.map((item, i) =>
                      i === cardIndex
                        ? { ...item, text: e.target.value }
                        : item,
                    ),
                  })
                }
              />
              {block.cards.length > 2 && (
                <Button
                  type="button"
                  variant="quiet"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...block,
                      cards: block.cards.filter((_, i) => i !== cardIndex),
                    })
                  }
                >
                  Убрать карточку
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                ...block,
                cards: [...block.cards, { title: '', text: '' }],
              })
            }
          >
            Добавить карточку
          </Button>
        </>
      )}

      {block.type === 'ORDER' && (
        <>
          <label htmlFor={id('prompt')}>Задание</label>
          <input
            id={id('prompt')}
            maxLength={200}
            placeholder="Например, расставьте шаги по порядку"
            value={block.prompt}
            onChange={(e) => onChange({ ...block, prompt: e.target.value })}
          />
          <p className="field-hint">
            Впишите шаги в правильном порядке — волонтёр получит их
            перемешанными.
          </p>
          <ol className="order-steps">
            {block.steps.map((step, stepIndex) => (
              <li key={stepIndex}>
                <label
                  className="visually-hidden"
                  htmlFor={id(`step-${stepIndex}`)}
                >
                  Шаг {stepIndex + 1}
                </label>
                <input
                  id={id(`step-${stepIndex}`)}
                  maxLength={120}
                  value={step}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      steps: block.steps.map((item, i) =>
                        i === stepIndex ? e.target.value : item,
                      ),
                    })
                  }
                />
                {block.steps.length > 3 && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Убрать шаг ${stepIndex + 1}`}
                    onClick={() =>
                      onChange({
                        ...block,
                        steps: block.steps.filter((_, i) => i !== stepIndex),
                      })
                    }
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ol>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onChange({ ...block, steps: [...block.steps, ''] })}
          >
            Добавить шаг
          </Button>
        </>
      )}

      {block.type === 'CHOICE' && (
        <>
          <label htmlFor={id('question')}>Ситуация</label>
          <TextArea
            id={id('question')}
            maxLength={600}
            value={block.question}
            onChange={(e) => onChange({ ...block, question: e.target.value })}
          />
          {block.options.map((option, optionIndex) => (
            <div key={optionIndex} className="block-item">
              <label htmlFor={id(`option-${optionIndex}`)}>
                Вариант {optionIndex + 1}
              </label>
              <input
                id={id(`option-${optionIndex}`)}
                maxLength={200}
                value={option.text}
                onChange={(e) =>
                  onChange({
                    ...block,
                    options: block.options.map((item, i) =>
                      i === optionIndex
                        ? { ...item, text: e.target.value }
                        : item,
                    ),
                  })
                }
              />
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={option.correct}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      options: block.options.map((item, i) =>
                        i === optionIndex
                          ? { ...item, correct: e.target.checked }
                          : item,
                      ),
                    })
                  }
                />
                Подходящий вариант
              </label>
              <label htmlFor={id(`explanation-${optionIndex}`)}>
                Объяснение после выбора
              </label>
              <input
                id={id(`explanation-${optionIndex}`)}
                maxLength={300}
                value={option.explanation}
                onChange={(e) =>
                  onChange({
                    ...block,
                    options: block.options.map((item, i) =>
                      i === optionIndex
                        ? { ...item, explanation: e.target.value }
                        : item,
                    ),
                  })
                }
              />
              {block.options.length > 2 && (
                <Button
                  type="button"
                  variant="quiet"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...block,
                      options: block.options.filter(
                        (_, i) => i !== optionIndex,
                      ),
                    })
                  }
                >
                  Убрать вариант
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                ...block,
                options: [
                  ...block.options,
                  { text: '', correct: false, explanation: '' },
                ],
              })
            }
          >
            Добавить вариант
          </Button>
        </>
      )}
    </Card>
  )
}

/** Предпросмотр: так урок увидит волонтёр (интерактив — в полноразмерном учебном экране). */
function LessonPreview({ lesson }: { lesson: LessonFields }) {
  return (
    <Card
      tone="raised"
      className="lesson-preview"
      aria-label="Предпросмотр урока"
    >
      <p className="muted">{lesson.goal}</p>
      <h2>{lesson.title || 'Без названия'}</h2>
      {lesson.blocks.length === 0 && (
        <p className="muted">В уроке пока нет блоков.</p>
      )}
      {lesson.blocks.map((block) => (
        <div key={block.id} className="preview-block">
          {block.type === 'TEXT' && (
            <p className="preserve-lines">{block.text}</p>
          )}
          {block.type === 'CARDS' && (
            <div className="preview-cards">
              {block.cards
                .filter((card) => card.title.trim())
                .map((card, index) => (
                  <div key={index} className="preview-card">
                    <strong>{card.title}</strong>
                    <span>{card.text}</span>
                  </div>
                ))}
            </div>
          )}
          {block.type === 'ORDER' && (
            <>
              <p>
                <strong>{block.prompt}</strong>
              </p>
              <ol className="preview-order">
                {/* волонтёр получит шаги перемешанными */}
                {[...block.steps]
                  .filter((step) => step.trim())
                  .reverse()
                  .map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
              </ol>
              <p className="field-hint">
                Правильный порядок:{' '}
                {block.steps.filter((s) => s.trim()).join(' → ')}
              </p>
            </>
          )}
          {block.type === 'CHOICE' && (
            <>
              <p className="preserve-lines">
                <strong>{block.question}</strong>
              </p>
              <ul className="preview-options">
                {block.options
                  .filter((option) => option.text.trim())
                  .map((option, index) => (
                    <li key={index} data-correct={option.correct}>
                      <span>{option.text}</span>
                      <span className="field-hint">
                        {option.correct ? 'Подходит. ' : 'Не подходит. '}
                        {option.explanation}
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </Card>
  )
}
