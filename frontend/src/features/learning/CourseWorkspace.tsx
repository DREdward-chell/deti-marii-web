import { useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  audiences,
  createCourse,
  getCourse,
  listDrafts,
  publishCourse,
  saveCourse,
  withdrawCourse,
  type CourseContent,
  type CourseDraft,
  type CourseListItem,
} from '../../shared/api/learning'
import { demoCourse, move, newLesson } from './demo'
import { LessonEditor } from './LessonEditor'

export function CourseWorkspace({
  onSessionExpired,
  onNavigationBlocked,
}: {
  onSessionExpired: () => void
  onNavigationBlocked?: (blocked: boolean) => void
}) {
  const [items, setItems] = useState<CourseListItem[] | null>(null)
  const [selected, setSelected] = useState<CourseDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void listDrafts(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setItems(value)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired()
        else setError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [reload, onSessionExpired])
  async function open(id?: string) {
    setBusy(true)
    setError('')
    try {
      setSelected(id ? await getCourse(id) : await createCourse())
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="learning-workspace">
      <p className="eyebrow">Кабинет координатора · Обучение</p>
      <h1>Учебные маршруты</h1>
      {selected ? (
        <CourseEditor
          key={selected.id}
          initial={selected}
          onSessionExpired={onSessionExpired}
          onNavigationBlocked={onNavigationBlocked}
          onBack={() => {
            setSelected(null)
            setItems(null)
            setReload((x) => x + 1)
          }}
        />
      ) : (
        <>
          <p className="muted">
            Соберите уроки, сохраните черновик и опубликуйте маршрут. Волонтёры
            продолжат начатую версию после обновления курса.
          </p>
          <div className="learning-actions">
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void open()}
            >
              Создать маршрут
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setError('')
                setItems(null)
                setReload((x) => x + 1)
              }}
            >
              Обновить маршруты
            </button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {items ? (
            items.length ? (
              <ul className="volunteer-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      className="volunteer-row"
                      disabled={busy}
                      onClick={() => void open(item.id)}
                    >
                      <strong>{item.title || 'Без названия'}</strong>
                      <span>
                        {item.publishedVersion
                          ? `Опубликована версия ${item.publishedVersion}`
                          : 'Черновик'}
                        {item.publishedVersion &&
                        item.publishedRevision !== item.revision
                          ? ' · Есть правки'
                          : ''}{' '}
                        →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice">Пока нет учебных маршрутов.</p>
            )
          ) : (
            !error && <p role="status">Загружаем маршруты…</p>
          )}
        </>
      )}
    </section>
  )
}
function CourseEditor({
  initial,
  onSessionExpired,
  onBack,
  onNavigationBlocked,
}: {
  initial: CourseDraft
  onSessionExpired: () => void
  onBack: () => void
  onNavigationBlocked?: (blocked: boolean) => void
}) {
  const [saved, setSaved] = useState(initial)
  const [content, setContent] = useState(initial.content)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [accessDenied, setAccessDenied] = useState(false)
  const dirty = JSON.stringify(saved.content) !== JSON.stringify(content)
  const navigationBlocked = !accessDenied && (dirty || busy)
  useEffect(() => {
    onNavigationBlocked?.(navigationBlocked)
    return () => onNavigationBlocked?.(false)
  }, [navigationBlocked, onNavigationBlocked])
  useEffect(() => {
    if (!navigationBlocked) return
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [navigationBlocked])
  const change = (patch: Partial<CourseContent>) => {
    setContent((value) => ({ ...value, ...patch }))
    setNotice('')
  }
  async function perform(action: 'save' | 'publish' | 'withdraw' | 'reload') {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const next =
        action === 'save'
          ? await saveCourse(saved, content)
          : action === 'publish'
            ? await publishCourse(saved)
            : action === 'withdraw'
              ? await withdrawCourse(saved)
              : await getCourse(saved.id)
      setSaved(next)
      setContent(next.content)
      setConflict(false)
      setNotice(
        action === 'save'
          ? 'Черновик сохранён.'
          : action === 'publish'
            ? `Опубликована версия ${next.publishedVersion}.`
            : action === 'withdraw'
              ? 'Маршрут снят с публикации. История прохождений сохранена.'
              : 'Загружен актуальный черновик.',
      )
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else {
        setError(errorMessage(cause))
        if (cause instanceof ApiError && [403, 404].includes(cause.status))
          setAccessDenied(true)
        if (cause instanceof ApiError && cause.status === 409) setConflict(true)
      }
    } finally {
      setBusy(false)
    }
  }
  if (accessDenied)
    return (
      <div className="form-card">
        <p role="alert" className="form-error">
          {error}
        </p>
        <button className="text-button" onClick={onBack}>
          ← К маршрутам
        </button>
      </div>
    )
  return (
    <div className="form-card course-editor">
      <div className="learning-actions">
        <button
          className="text-button"
          disabled={busy || dirty}
          onClick={onBack}
        >
          ← К маршрутам
        </button>
        {dirty && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setContent(saved.content)
              setNotice('Локальные правки отменены.')
            }}
          >
            Отменить несохранённые правки
          </button>
        )}
      </div>
      <p className="muted">
        {saved.publishedVersion
          ? `Опубликована версия ${saved.publishedVersion}. Правки попадут в отдельную версию после публикации.`
          : 'Этот черновик пока не виден волонтёрам.'}
      </p>
      <fieldset disabled={busy} className="learning-fields">
        <label>
          Название маршрута
          <input
            value={content.title}
            maxLength={150}
            onChange={(e) => change({ title: e.target.value })}
          />
        </label>
        <label>
          Описание маршрута
          <textarea
            value={content.description}
            maxLength={2000}
            onChange={(e) => change({ description: e.target.value })}
          />
        </label>
        <label>
          Кому доступен маршрут
          <select
            value={content.audience}
            onChange={(e) =>
              change({ audience: e.target.value as CourseContent['audience'] })
            }
          >
            {Object.entries(audiences).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Если ограничить доступ, подтверждение оформления потребуется и для
          ранее начатых версий. Снятие с публикации закроет маршрут для всех
          волонтёров.
        </p>
        <label className="inline-choice">
          <input
            type="checkbox"
            checked={content.demo}
            onChange={(e) => change({ demo: e.target.checked })}
          />
          Демонстрационный материал
        </label>
        {content.lessons.length === 0 && (
          <button
            className="secondary-button"
            onClick={() => {
              setContent(demoCourse())
              setNotice(
                'Демопример добавлен в черновик. Сохраните его перед публикацией.',
              )
            }}
          >
            Заполнить демопример
          </button>
        )}
        {content.lessons.map((lesson, index) => (
          <LessonEditor
            key={lesson.id}
            lesson={lesson}
            index={index}
            count={content.lessons.length}
            onChange={(value) =>
              change({
                lessons: content.lessons.map((item) =>
                  item.id === value.id ? value : item,
                ),
              })
            }
            onRemove={() =>
              change({
                lessons: content.lessons.filter(
                  (item) => item.id !== lesson.id,
                ),
              })
            }
            onMove={(delta) =>
              change({ lessons: move(content.lessons, index, delta) })
            }
          />
        ))}
        <button
          className="secondary-button"
          disabled={content.lessons.length >= 40}
          onClick={() => change({ lessons: [...content.lessons, newLesson()] })}
        >
          Добавить урок
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {dirty && (
        <p className="muted">
          Есть несохранённые изменения. Сохраните их перед публикацией и
          переходом в другой раздел.
        </p>
      )}
      {conflict && (
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void perform('reload')}
        >
          Загрузить актуальный черновик и заменить локальные правки
        </button>
      )}
      <div className="learning-actions">
        <button
          className="primary-button"
          disabled={busy || conflict || !dirty}
          onClick={() => void perform('save')}
        >
          Сохранить черновик
        </button>
        <button
          className="secondary-button"
          disabled={
            busy ||
            conflict ||
            dirty ||
            saved.publishedRevision === saved.revision
          }
          onClick={() => void perform('publish')}
        >
          Опубликовать маршрут
        </button>
        {saved.publishedVersion !== null && (
          <button
            className="text-button"
            disabled={busy || conflict || dirty}
            onClick={() => void perform('withdraw')}
          >
            Снять с публикации
          </button>
        )}
      </div>
    </div>
  )
}
