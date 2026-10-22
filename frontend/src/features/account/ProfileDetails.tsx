import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  saveMyProfile,
  type Profile,
  type Regularity,
} from '../../shared/api/profile'
import { Button } from '../../shared/ui/Button'
import { regularityLabels } from './labels'

type Field = Exclude<keyof Profile, 'id' | 'version' | 'updatedAt'>

const fields: {
  key: Field
  label: string
  control: 'text' | 'tel' | 'textarea' | 'regularity'
  maxLength?: number
  required?: boolean
}[] = [
  {
    key: 'displayName',
    label: 'Как к вам обращаться',
    control: 'text',
    maxLength: 100,
    required: true,
  },
  { key: 'phone', label: 'Телефон', control: 'tel', maxLength: 40 },
  {
    key: 'interests',
    label: 'Что интересно',
    control: 'textarea',
    maxLength: 1000,
  },
  { key: 'skills', label: 'Навыки', control: 'textarea', maxLength: 1000 },
  { key: 'regularity', label: 'Ритм участия', control: 'regularity' },
  {
    key: 'availability',
    label: 'Когда удобно',
    control: 'text',
    maxLength: 500,
  },
]

function shown(profile: Profile, key: Field) {
  return key === 'regularity'
    ? regularityLabels[profile.regularity]
    : profile[key].trim()
}

/**
 * Данные анкеты в кабинете: каждое поле правится на месте.
 * Сохраняется вся анкета с текущей версией, как требует API.
 */
export function ProfileDetails({
  profile,
  onSaved,
  onReload,
  onSessionExpired,
}: {
  profile: Profile
  onSaved: (profile: Profile) => void
  onReload: () => void
  onSessionExpired: () => void
}) {
  const [editing, setEditing] = useState<Field | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState<Field | null>(null)
  const [expanded, setExpanded] = useState<Partial<Record<Field, boolean>>>({})
  const control = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const returnFocus = useRef<Field | null>(null)

  useEffect(() => {
    if (editing) control.current?.focus()
    else if (returnFocus.current) {
      document.getElementById(`edit-${returnFocus.current}`)?.focus()
      returnFocus.current = null
    }
  }, [editing])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(null), 2500)
    return () => clearTimeout(timer)
  }, [saved])

  function open(key: Field) {
    setEditing(key)
    setDraft(profile[key])
    setError('')
    setConflict(false)
    setSaved(null)
  }

  function close() {
    returnFocus.current = editing
    setEditing(null)
    setError('')
    setConflict(false)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || saving) return
    setSaving(true)
    setError('')
    setConflict(false)
    try {
      const next = await saveMyProfile({
        ...profile,
        [editing]: draft,
      } as Profile)
      onSaved(next)
      setSaved(editing)
      close()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onSessionExpired()
        return
      }
      setError(
        (cause instanceof ApiError && cause.fields[editing]) ||
          errorMessage(cause),
      )
      setConflict(cause instanceof ApiError && cause.status === 409)
    } finally {
      setSaving(false)
    }
  }

  return (
    <dl className="details">
      {fields.map((field) => {
        const value = shown(profile, field.key)
        const long = value.length > 100
        if (editing === field.key)
          return (
            <div className="details-row details-row--editing" key={field.key}>
              <dt className="visually-hidden">{field.label}</dt>
              <dd className="details-edit-cell">
                <form
                  className="details-edit"
                  onSubmit={(event) => void save(event)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') close()
                  }}
                >
                  <fieldset disabled={saving}>
                    {field.control === 'regularity' ? (
                      <>
                        <legend className="details-label">{field.label}</legend>
                        <div className="choice-group">
                          {(Object.keys(regularityLabels) as Regularity[]).map(
                            (option) => (
                              <label key={option} className="choice">
                                <input
                                  type="radio"
                                  name="regularity"
                                  value={option}
                                  checked={draft === option}
                                  onChange={() => setDraft(option)}
                                  ref={draft === option ? control : undefined}
                                />
                                <span>{regularityLabels[option]}</span>
                              </label>
                            ),
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <label
                          className="details-label"
                          htmlFor={`field-${field.key}`}
                        >
                          {field.label}
                        </label>
                        {field.control === 'textarea' ? (
                          <textarea
                            id={`field-${field.key}`}
                            ref={control}
                            rows={3}
                            maxLength={field.maxLength}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            aria-invalid={!!error}
                          />
                        ) : (
                          <input
                            id={`field-${field.key}`}
                            ref={control}
                            type={field.control}
                            autoComplete={
                              field.key === 'displayName'
                                ? 'name'
                                : field.key === 'phone'
                                  ? 'tel'
                                  : 'off'
                            }
                            required={field.required}
                            maxLength={field.maxLength}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            aria-invalid={!!error}
                          />
                        )}
                      </>
                    )}
                    {error && (
                      <p className="form-error" role="alert">
                        {error}
                      </p>
                    )}
                    <div className="details-edit-actions">
                      {conflict ? (
                        <Button type="button" size="sm" onClick={onReload}>
                          Загрузить актуальные данные
                        </Button>
                      ) : (
                        <Button type="submit" size="sm">
                          {saving ? 'Сохраняем…' : 'Сохранить'}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={close}
                      >
                        Отмена
                      </Button>
                    </div>
                  </fieldset>
                </form>
              </dd>
            </div>
          )

        return (
          <div className="details-row" key={field.key}>
            <dt className="details-label">{field.label}</dt>
            <dd className="details-value">
              {value ? (
                long && !expanded[field.key] ? (
                  `${value.slice(0, 96).trimEnd()}…`
                ) : (
                  value
                )
              ) : (
                <span className="details-empty">Не указано</span>
              )}
              {long && (
                <button
                  type="button"
                  className="details-expand"
                  aria-expanded={!!expanded[field.key]}
                  aria-label={`${expanded[field.key] ? 'Свернуть' : 'Показать полностью'}: ${field.label}`}
                  onClick={() =>
                    setExpanded((previous) => ({
                      ...previous,
                      [field.key]: !previous[field.key],
                    }))
                  }
                >
                  {expanded[field.key] ? 'Свернуть' : 'Показать полностью'}
                </button>
              )}
            </dd>
            <dd className="details-action">
              {saved === field.key && (
                <span className="details-saved" role="status">
                  Сохранено
                </span>
              )}
              <Button
                id={`edit-${field.key}`}
                variant="quiet"
                size="sm"
                className="details-edit-button"
                disabled={editing !== null}
                aria-label={`Изменить: ${field.label}`}
                onClick={() => open(field.key)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z" />
                </svg>
              </Button>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
