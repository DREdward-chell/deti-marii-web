import { useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  listVolunteerRoles,
  type VolunteerRole,
} from '../../shared/api/clearance'
import {
  createOpportunity,
  getOpportunityDraft,
  listOpportunityDrafts,
  opportunityRegularities,
  publishOpportunity,
  saveOpportunity,
  withdrawOpportunity,
  type OpportunityContent,
  type OpportunityDraft,
  type OpportunityListItem,
} from '../../shared/api/opportunities'
import { useNavigationBlock } from './useNavigationBlock'
import { useCurrentRequest } from './useCurrentRequest'

type Props = {
  onSessionExpired: () => void
  onNavigationBlocked?: (blocked: boolean) => void
}
export function OpportunityWorkspace({
  onSessionExpired,
  onNavigationBlocked,
}: Props) {
  const [data, setData] = useState<{
    items: OpportunityListItem[]
    roles: VolunteerRole[]
  } | null>(null)
  const [selected, setSelected] = useState<OpportunityDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const begin = useCurrentRequest()
  useNavigationBlock(busy, onNavigationBlocked)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      listOpportunityDrafts(controller.signal),
      listVolunteerRoles(controller.signal),
    ])
      .then(([items, roles]) => {
        if (!controller.signal.aborted) setData({ items, roles })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        controller.abort()
        setData(null)
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired()
        else setError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [reload, onSessionExpired])
  async function open(id?: string) {
    const current = begin()
    setBusy(true)
    setError('')
    try {
      const next = id
        ? await getOpportunityDraft(id)
        : await createOpportunity()
      if (current()) setSelected(next)
    } catch (cause) {
      if (!current()) return
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status))
        setData(null)
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else setError(errorMessage(cause))
    } finally {
      if (current()) setBusy(false)
    }
  }
  function refresh() {
    setData(null)
    setError('')
    setReload((x) => x + 1)
  }
  return (
    <section className="learning-workspace">
      <p className="eyebrow">Кабинет координатора</p>
      <h1>Возможности помощи</h1>
      {selected && data ? (
        <OpportunityEditor
          key={selected.id}
          initial={selected}
          roles={data.roles}
          onSessionExpired={onSessionExpired}
          onNavigationBlocked={onNavigationBlocked}
          onBack={() => {
            setSelected(null)
            refresh()
          }}
        />
      ) : (
        <>
          <p className="muted">
            Опишите возможность, сохраните черновик и опубликуйте его в
            каталоге. Запись участников пока не предусмотрена.
          </p>
          <div className="learning-actions">
            <button
              className="primary-button"
              disabled={busy || !data}
              onClick={() => void open()}
            >
              Создать возможность
            </button>
            <button className="text-button" disabled={busy} onClick={refresh}>
              Обновить возможности
            </button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {data ? (
            data.items.length ? (
              <ul className="volunteer-list">
                {data.items.map((item) => (
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
              <p className="notice">Пока нет возможностей помощи.</p>
            )
          ) : (
            !error && <p role="status">Загружаем возможности…</p>
          )}
        </>
      )}
    </section>
  )
}
const textFields = [
  ['title', 'Название возможности', 150],
  ['summary', 'Краткое описание', 500],
  ['description', 'Подробное описание', 6000],
  ['location', 'Где нужна помощь', 500],
  ['schedule', 'Когда нужна помощь', 500],
  ['requirements', 'Условия и требования', 2000],
  ['training', 'Подготовка и обучение', 2000],
] as const
function OpportunityEditor({
  initial,
  roles,
  onSessionExpired,
  onNavigationBlocked,
  onBack,
}: Props & {
  initial: OpportunityDraft
  roles: VolunteerRole[]
  onBack: () => void
}) {
  const [saved, setSaved] = useState(initial)
  const [content, setContent] = useState(initial.content)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [denied, setDenied] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const begin = useCurrentRequest()
  const dirty = JSON.stringify(saved.content) !== JSON.stringify(content)
  useNavigationBlock(!denied && (dirty || busy), onNavigationBlocked)
  function change(patch: Partial<OpportunityContent>) {
    setContent((value) => ({ ...value, ...patch }))
    setNotice('')
  }
  async function perform(action: 'save' | 'publish' | 'withdraw' | 'reload') {
    const current = begin()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const next =
        action === 'save'
          ? await saveOpportunity(saved, content)
          : action === 'publish'
            ? await publishOpportunity(saved)
            : action === 'withdraw'
              ? await withdrawOpportunity(saved)
              : await getOpportunityDraft(saved.id)
      if (!current()) return
      setSaved(next)
      setContent(next.content)
      setConflict(false)
      setNotice(
        action === 'save'
          ? 'Черновик сохранён.'
          : action === 'publish'
            ? `Опубликована версия ${next.publishedVersion}.`
            : action === 'withdraw'
              ? 'Возможность снята с публикации.'
              : 'Загружен актуальный черновик.',
      )
    } catch (cause) {
      if (!current()) return
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status))
        setDenied(true)
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else {
        setError(errorMessage(cause))
        if (cause instanceof ApiError && cause.status === 409) setConflict(true)
      }
    } finally {
      if (current()) setBusy(false)
    }
  }
  if (denied)
    return (
      <div className="form-card">
        <p role="alert" className="form-error">
          {error || 'Доступ к возможности закрыт.'}
        </p>
        <button className="text-button" onClick={onBack}>
          ← К возможностям
        </button>
      </div>
    )
  const empty =
    !content.summary &&
    !content.description &&
    !content.location &&
    !content.schedule &&
    !content.requirements &&
    !content.training
  return (
    <div className="form-card">
      <div className="learning-actions">
        <button
          className="text-button"
          disabled={busy || dirty}
          onClick={onBack}
        >
          ← К возможностям
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
          ? `Опубликована версия ${saved.publishedVersion}. Правки появятся в каталоге после новой публикации.`
          : 'Этот черновик пока не виден волонтёрам.'}
      </p>
      <fieldset className="learning-fields" disabled={busy}>
        {textFields.map(([field, label, max]) => (
          <label key={field}>
            {label}
            {field === 'title' ? (
              <input
                value={content[field]}
                maxLength={max}
                onChange={(e) => change({ [field]: e.target.value })}
              />
            ) : (
              <textarea
                value={content[field]}
                maxLength={max}
                onChange={(e) => change({ [field]: e.target.value })}
              />
            )}
          </label>
        ))}
        <p className="muted">
          Укажите время словами: например, дни недели или удобный ритм. Это
          описание, а не запись на занятие.
        </p>
        <label>
          Вид помощи
          <select
            value={content.roleId ?? ''}
            onChange={(e) => change({ roleId: e.target.value || null })}
          >
            <option value="">Выберите вид помощи</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        {!roles.length && (
          <p className="notice">
            Сначала добавьте вид помощи в справочнике кабинета координатора. Без
            него возможность нельзя опубликовать.
          </p>
        )}
        <label>
          Формат помощи
          <select
            value={content.regularity}
            onChange={(e) =>
              change({
                regularity: e.target.value as OpportunityContent['regularity'],
              })
            }
          >
            {Object.entries(opportunityRegularities).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-choice">
          <input
            type="checkbox"
            checked={content.demo}
            onChange={(e) => change({ demo: e.target.checked })}
          />
          Демонстрационная возможность
        </label>
        {empty && (
          <button
            className="secondary-button"
            disabled={!roles.some((role) => role.id === content.roleId)}
            onClick={() => {
              change({
                title: 'Демонстрация: подготовка творческих материалов',
                summary:
                  'Вымышленный пример возможности помощи для проверки каталога.',
                description:
                  'Учебный пример: разобрать и подготовить материалы для вымышленной творческой встречи. Это не действующая возможность фонда.',
                location: 'Демонстрационная площадка, адрес не назначен',
                schedule: 'Условно раз в неделю; реальных встреч не назначено',
                requirements:
                  'Условия приведены только как пример и не являются правилами фонда.',
                training:
                  'Демонстрационный инструктаж; реальные материалы не подключены.',
                demo: true,
              })
            }}
          >
            Заполнить демопример для выбранного вида помощи
          </button>
        )}
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
          Есть несохранённые изменения. Сохраните их или отмените перед
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
            !content.roleId ||
            saved.publishedRevision === saved.revision
          }
          onClick={() => void perform('publish')}
        >
          Опубликовать возможность
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
