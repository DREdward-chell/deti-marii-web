import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  admissionLabels,
  paperworkLabels,
  getDecision,
  saveDecision,
  type DecisionFields,
  type DecisionHistory,
  type DecisionSnapshot,
  type DecisionStatus,
} from '../../shared/api/clearance'
import { Button } from '../../shared/ui/Button'
import { TextArea } from '../../shared/ui/TextArea'

type Props = {
  volunteerId: string
  roleId: string | null
  onSessionExpired: () => void
  /** Вызывается после сохранения решения. */
  onChange?: (decision: DecisionHistory) => void
}
export function ClearanceDecision({
  volunteerId,
  roleId,
  onSessionExpired,
  onChange,
}: Props) {
  const [decision, setDecision] = useState<DecisionHistory | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const kind = roleId === null ? 'оформления' : 'допуска'
  const labels: Partial<Record<DecisionStatus, string>> =
    roleId === null ? paperworkLabels : admissionLabels
  useEffect(() => {
    const controller = new AbortController()
    void getDecision(volunteerId, roleId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setDecision(value)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired()
        else setError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [volunteerId, roleId, attempt, onSessionExpired])
  function reload() {
    setDecision(null)
    setError('')
    setAttempt((value) => value + 1)
  }
  if (error)
    return (
      <>
        <p className="form-error" role="alert">
          {error}
        </p>
        <Button variant="secondary" size="sm" onClick={reload}>
          Повторить загрузку {kind}
        </Button>
      </>
    )
  if (!decision) return <p role="status">Загружаем решение…</p>
  return (
    <>
      <DecisionEditor
        initial={decision.current}
        volunteerId={volunteerId}
        roleId={roleId}
        onSessionExpired={onSessionExpired}
        onSaved={(value) => {
          setDecision(value)
          onChange?.(value)
        }}
        onReload={reload}
      />
      <details className="review-history">
        <summary>
          История {kind} ({decision.history.length}
          {decision.current.version > decision.history.length
            ? ' последних'
            : ''}
          )
        </summary>
        {decision.history.length === 0 ? (
          <p>Решений пока нет.</p>
        ) : (
          <ol>
            {decision.history.map((item) => (
              <li key={item.version}>
                <p>
                  <strong>{labels[item.fields.status]}</strong> ·{' '}
                  {new Date(item.updatedAt!).toLocaleString('ru-RU')}
                </p>
                <p className="muted">
                  Автор: {item.actorEmail ?? 'Координатор'}
                </p>
                <p className="preserve-lines">{item.fields.message}</p>
                {item.fields.internalNote && (
                  <p className="preserve-lines">
                    <strong>Внутренняя заметка: </strong>
                    {item.fields.internalNote}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </details>
    </>
  )
}

function DecisionEditor({
  initial,
  volunteerId,
  roleId,
  onSessionExpired,
  onSaved,
  onReload,
}: Props & {
  initial: DecisionSnapshot
  onSaved: (value: DecisionHistory) => void
  onReload: () => void
}) {
  const [draft, setDraft] = useState<DecisionFields>(initial.fields)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const paperwork = roleId === null
  const prefix = paperwork ? 'paperwork' : 'admission'
  const labels = paperwork ? paperworkLabels : admissionLabels
  function change<K extends keyof DecisionFields>(
    key: K,
    value: DecisionFields[K],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setSaved(false)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || conflict) return
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const result = await saveDecision(
        volunteerId,
        roleId,
        initial.version,
        draft,
      )
      setDraft(result.current.fields)
      onSaved(result)
      setSaved(true)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else {
        setError(
          cause instanceof ApiError && Object.keys(cause.fields).length
            ? Object.values(cause.fields).join(' ')
            : errorMessage(cause),
        )
        setConflict(cause instanceof ApiError && cause.status === 409)
      }
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={saving}>
        <label htmlFor={`${prefix}-status`}>
          Состояние {paperwork ? 'оформления' : 'допуска'}
        </label>
        <select
          id={`${prefix}-status`}
          value={draft.status}
          onChange={(event) =>
            change('status', event.target.value as DecisionStatus)
          }
        >
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor={`${prefix}-message`}>
          Пояснение по {paperwork ? 'оформлению' : 'допуску'}
        </label>
        <TextArea
          id={`${prefix}-message`}
          required
          maxLength={2000}
          value={draft.message}
          onChange={(event) => change('message', event.target.value)}
        />
        <p className="field-hint">
          Состояние и пояснение сразу появятся в кабинете волонтёра после
          сохранения.
        </p>
        <div className="internal-note">
          <label htmlFor={`${prefix}-note`}>
            Внутренняя заметка {paperwork ? 'об оформлении' : 'о допуске'}
          </label>
          <p className="field-hint">
            Видна только координаторам. Сохранится в истории.
          </p>
          <TextArea
            id={`${prefix}-note`}
            maxLength={4000}
            value={draft.internalNote}
            onChange={(event) => change('internalNote', event.target.value)}
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {conflict && (
          <div className="conflict">
            <p>
              Ваш текст остаётся в форме. Загрузка актуального решения заменит
              его сохранёнными данными.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onReload}
            >
              Загрузить актуальное решение
            </Button>
          </div>
        )}
        {saved && (
          <p className="success-message" role="status">
            {paperwork ? 'Оформление сохранено.' : 'Допуск сохранён.'}
          </p>
        )}
        <Button type="submit" disabled={conflict}>
          {saving
            ? 'Сохраняем…'
            : paperwork
              ? 'Сохранить оформление'
              : 'Сохранить допуск'}
        </Button>
      </fieldset>
    </form>
  )
}
