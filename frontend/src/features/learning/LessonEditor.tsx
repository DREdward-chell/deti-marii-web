import {
  lessonTypes,
  type LessonContent,
  type LessonType,
} from '../../shared/api/learning'
import { move, newLesson } from './demo'
export function LessonEditor({
  lesson,
  index,
  onChange,
  onRemove,
  onMove,
  count,
}: {
  lesson: LessonContent
  index: number
  onChange: (value: LessonContent) => void
  onRemove: () => void
  onMove: (delta: number) => void
  count: number
}) {
  const change = (patch: Partial<LessonContent>) =>
    onChange({ ...lesson, ...patch })
  return (
    <fieldset className="lesson-editor">
      <legend>Урок {index + 1}</legend>
      <div className="learning-actions">
        <button
          type="button"
          className="text-button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
        >
          Урок выше
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => onMove(1)}
          disabled={index === count - 1}
        >
          Урок ниже
        </button>
        <button type="button" className="text-button" onClick={onRemove}>
          Удалить урок
        </button>
      </div>
      <label>
        Название урока
        <input
          maxLength={150}
          value={lesson.title}
          onChange={(e) => change({ title: e.target.value })}
        />
      </label>
      <label>
        Тип урока
        <select
          value={lesson.type}
          onChange={(e) => {
            const type = e.target.value as LessonType
            const defaults = newLesson(type)
            change({
              type,
              options: defaults.options,
              correctOptionId: null,
              explanation: '',
            })
          }}
        >
          {Object.entries(lessonTypes).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Материал или задание
        <textarea
          rows={5}
          maxLength={10000}
          value={lesson.body}
          onChange={(e) => change({ body: e.target.value })}
        />
      </label>
      {lesson.type !== 'READ' && (
        <>
          <p className="muted">
            {lesson.type === 'ORDERING'
              ? 'Расположите варианты в правильном порядке. Волонтёр должен будет восстановить этот порядок.'
              : 'Добавьте варианты и отметьте один правильный ответ.'}
          </p>
          {lesson.options.map((option, position) => (
            <div key={option.id} className="option-editor">
              <label>
                Вариант {position + 1}
                <input
                  maxLength={500}
                  value={option.text}
                  onChange={(e) =>
                    change({
                      options: lesson.options.map((item) =>
                        item.id === option.id
                          ? { ...item, text: e.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              {lesson.type === 'SINGLE_CHOICE' ? (
                <label className="inline-choice">
                  <input
                    type="radio"
                    name={`key-${lesson.id}`}
                    checked={lesson.correctOptionId === option.id}
                    onChange={() => change({ correctOptionId: option.id })}
                  />
                  Правильный вариант {position + 1}
                </label>
              ) : (
                <div className="learning-actions">
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Вариант ${position + 1} выше`}
                    disabled={position === 0}
                    onClick={() =>
                      change({ options: move(lesson.options, position, -1) })
                    }
                  >
                    ↑ Выше
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Вариант ${position + 1} ниже`}
                    disabled={position === lesson.options.length - 1}
                    onClick={() =>
                      change({ options: move(lesson.options, position, 1) })
                    }
                  >
                    ↓ Ниже
                  </button>
                </div>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  change({
                    options: lesson.options.filter(
                      (item) => item.id !== option.id,
                    ),
                    correctOptionId:
                      lesson.correctOptionId === option.id
                        ? null
                        : lesson.correctOptionId,
                  })
                }
              >
                Удалить вариант {position + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            disabled={lesson.options.length >= 8}
            onClick={() =>
              change({
                options: [
                  ...lesson.options,
                  { id: crypto.randomUUID(), text: '' },
                ],
              })
            }
          >
            Добавить вариант
          </button>
          <label>
            Объяснение после ответа
            <textarea
              maxLength={2000}
              value={lesson.explanation}
              onChange={(e) => change({ explanation: e.target.value })}
            />
          </label>
        </>
      )}
    </fieldset>
  )
}
