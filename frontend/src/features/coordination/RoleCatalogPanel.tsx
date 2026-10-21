import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  listVolunteerRoles,
  saveVolunteerRole,
  type RoleFields,
  type VolunteerRole,
} from '../../shared/api/clearance'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { TextArea } from '../../shared/ui/TextArea'

export function RoleCatalogPanel({
  onSessionExpired,
}: {
  onSessionExpired: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="role-catalog">
      <Button
        variant="secondary"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Закрыть справочник видов помощи' : 'Виды помощи'}
      </Button>
      {open && <RoleCatalogEditor onSessionExpired={onSessionExpired} />}
    </div>
  )
}
/** Справочник видов помощи без кнопки-переключателя: для отдельного раздела. */
export function RoleCatalogEditor({
  onSessionExpired,
}: {
  onSessionExpired: () => void
}) {
  const [roles, setRoles] = useState<VolunteerRole[] | null>(null)
  const [current, setCurrent] = useState<VolunteerRole | null>(null)
  const [draft, setDraft] = useState<RoleFields>({ name: '', description: '' })
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void listVolunteerRoles(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setRoles(value)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired()
        else setLoadError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [attempt, onSessionExpired])
  function select(id: string) {
    const next = roles?.find((item) => item.id === id) ?? null
    setCurrent(next)
    setDraft(next ?? { name: '', description: '' })
    setSaved(false)
    setError('')
    setConflict(false)
  }
  function reload() {
    setRoles(null)
    setCurrent(null)
    setDraft({ name: '', description: '' })
    setError('')
    setLoadError('')
    setConflict(false)
    setSaved(false)
    setAttempt((value) => value + 1)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || conflict) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const result = await saveVolunteerRole(current, {
        name: draft.name,
        description: draft.description,
      })
      setCurrent(result)
      setDraft(result)
      setSaved(true)
      setRoles((previous) =>
        [
          ...(previous ?? []).filter((item) => item.id !== result.id),
          result,
        ].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      )
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else {
        setError(errorMessage(cause))
        setConflict(
          cause instanceof ApiError && cause.status === 409 && current !== null,
        )
      }
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card tone="raised" aria-labelledby="roles-heading">
      <h2 id="roles-heading">Справочник видов помощи</h2>
      <p className="muted">
        Добавьте направления, для которых координатор подтверждает готовность
        волонтёра.
      </p>
      {loadError ? (
        <>
          <p role="alert" className="form-error">
            {loadError}
          </p>
          <Button variant="secondary" size="sm" onClick={reload}>
            Повторить загрузку справочника
          </Button>
        </>
      ) : roles === null ? (
        <p role="status">Загружаем справочник…</p>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <fieldset disabled={saving}>
            <label htmlFor="catalog-role">Вид помощи для редактирования</label>
            <select
              id="catalog-role"
              value={current?.id ?? ''}
              onChange={(event) => select(event.target.value)}
            >
              <option value="">Добавить новый</option>
              {roles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <label htmlFor="role-name">Название вида помощи</label>
            <input
              id="role-name"
              required
              maxLength={100}
              value={draft.name}
              onChange={(event) => {
                setDraft((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
                setSaved(false)
              }}
            />
            <label htmlFor="role-description">Описание вида помощи</label>
            <TextArea
              id="role-description"
              maxLength={1000}
              value={draft.description}
              onChange={(event) => {
                setDraft((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
                setSaved(false)
              }}
            />
            {current && (
              <p className="field-hint">
                Название и описание изменятся во всех карточках. Решения по
                допускам сохранятся. Для другого вида помощи создайте новую
                запись.
              </p>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {conflict && (
              <div className="conflict">
                <p>
                  Ваши правки остаются в форме. Повторная загрузка заменит их
                  сохранёнными данными.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={reload}
                >
                  Загрузить актуальный справочник
                </Button>
              </div>
            )}
            {saved && (
              <p role="status" className="success-message">
                Вид помощи сохранён.
              </p>
            )}
            <Button type="submit" disabled={conflict}>
              {saving
                ? 'Сохраняем…'
                : current
                  ? 'Сохранить вид помощи'
                  : 'Добавить вид помощи'}
            </Button>
          </fieldset>
        </form>
      )}
    </Card>
  )
}
