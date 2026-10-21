import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  getReview,
  saveReview,
  ownerLabels,
  reviewDate,
  reviewLabels,
  type NextStepOwner,
  type ReviewFields,
  type ReviewSnapshot,
  type ReviewStatus,
  type StaffReview,
} from '../../shared/api/onboarding'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { TextArea } from '../../shared/ui/TextArea'

export function ReviewPanel({
  volunteerId,
  onSessionExpired,
}: {
  volunteerId: string
  onSessionExpired: () => void
}) {
  const [review, setReview] = useState<StaffReview | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void getReview(volunteerId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setReview(value)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired()
        else setError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [volunteerId, attempt, onSessionExpired])
  function reload() {
    setReview(null)
    setError('')
    setAttempt((value) => value + 1)
  }
  return (
    <Card
      tone="raised"
      className="review-panel"
      aria-labelledby="review-heading"
    >
      <h2 id="review-heading">Рассмотрение анкеты</h2>
      <p className="muted">
        Здесь фиксируем знакомство. Оформление документов и допуск к работе
        подтверждаются отдельно.
      </p>
      {error ? (
        <>
          <p className="form-error" role="alert">
            {error}
          </p>
          <Button variant="secondary" size="sm" onClick={reload}>
            Повторить загрузку рассмотрения
          </Button>
        </>
      ) : review ? (
        <>
          <ReviewEditor
            key={volunteerId}
            initial={review.current}
            volunteerId={volunteerId}
            onSaved={setReview}
            onReload={reload}
            onSessionExpired={onSessionExpired}
          />
          <details className="review-history">
            <summary>
              История изменений ({review.history.length}
              {review.current.version > review.history.length
                ? ' последних'
                : ''}
              )
            </summary>
            {review.history.length === 0 ? (
              <p>Изменений пока нет.</p>
            ) : (
              <ol>
                {review.history.map((item) => (
                  <li key={item.version}>
                    <p>
                      <strong>{reviewLabels[item.fields.status]}</strong> ·{' '}
                      {new Date(item.updatedAt!).toLocaleString('ru-RU')}
                    </p>
                    <p className="muted">
                      Автор: {item.actorEmail ?? 'Координатор'}
                    </p>
                    <p className="preserve-lines">{item.fields.message}</p>
                    {item.fields.nextStep && (
                      <p>
                        Следующий шаг: {item.fields.nextStep} ·{' '}
                        {ownerLabels[item.fields.nextStepOwner!]}
                        {item.fields.nextStepDate &&
                          ` · ${reviewDate(item.fields.nextStepDate)}`}
                      </p>
                    )}
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
      ) : (
        <p role="status">Загружаем рассмотрение…</p>
      )}
    </Card>
  )
}

function ReviewEditor({
  initial,
  volunteerId,
  onSaved,
  onReload,
  onSessionExpired,
}: {
  initial: ReviewSnapshot
  volunteerId: string
  onSaved: (review: StaffReview) => void
  onReload: () => void
  onSessionExpired: () => void
}) {
  const [draft, setDraft] = useState<ReviewFields>(initial.fields)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [conflict, setConflict] = useState(false)
  function change<K extends keyof ReviewFields>(
    key: K,
    value: ReviewFields[K],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setSaved(false)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || conflict) return
    setSaving(true)
    setError('')
    setSaved(false)
    const hasStep = !!draft.nextStep.trim()
    try {
      const updated = await saveReview(volunteerId, initial.version, {
        ...draft,
        nextStepOwner: hasStep ? draft.nextStepOwner : null,
        nextStepDate: hasStep ? draft.nextStepDate : null,
      })
      setDraft(updated.current.fields)
      setSaved(true)
      onSaved(updated)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else {
        setError(errorMessage(cause))
        setConflict(cause instanceof ApiError && cause.status === 409)
      }
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={saving}>
        <label htmlFor="review-status">Результат рассмотрения</label>
        <select
          id="review-status"
          value={draft.status}
          onChange={(event) =>
            change('status', event.target.value as ReviewStatus)
          }
        >
          {Object.entries(reviewLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor="review-message">Сообщение волонтёру</label>
        <TextArea
          id="review-message"
          required
          maxLength={2000}
          value={draft.message}
          onChange={(event) => change('message', event.target.value)}
        />
        <p className="field-hint">
          Результат, сообщение и следующий шаг сразу появятся в кабинете
          волонтёра после сохранения.
        </p>
        <label htmlFor="review-next-step">
          Следующий шаг <span className="optional-label">необязательно</span>
        </label>
        <input
          id="review-next-step"
          maxLength={500}
          value={draft.nextStep}
          onChange={(event) => change('nextStep', event.target.value)}
          placeholder="Например, договориться о знакомстве по телефону"
        />
        {!!draft.nextStep.trim() && (
          <div className="form-grid">
            <div>
              <label htmlFor="review-owner">Кто делает шаг</label>
              <select
                id="review-owner"
                required
                value={draft.nextStepOwner ?? ''}
                onChange={(event) =>
                  change('nextStepOwner', event.target.value as NextStepOwner)
                }
              >
                <option value="" disabled>
                  Выберите ответственного
                </option>
                {Object.entries(ownerLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="review-date">
                Дата <span className="optional-label">необязательно</span>
              </label>
              <input
                id="review-date"
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                value={draft.nextStepDate ?? ''}
                onChange={(event) =>
                  change('nextStepDate', event.target.value || null)
                }
              />
            </div>
          </div>
        )}
        <div className="internal-note">
          <label htmlFor="review-note">Внутренняя заметка</label>
          <p id="review-note-help" className="field-hint">
            Видна только координаторам. Сохранится в истории изменений.
          </p>
          <TextArea
            id="review-note"
            aria-describedby="review-note-help"
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
              Ваш текст остаётся в форме. Загрузка актуальной версии заменит его
              сохранёнными данными.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onReload}
            >
              Загрузить актуальное рассмотрение
            </Button>
          </div>
        )}
        {saved && (
          <p role="status" className="success-message">
            Рассмотрение сохранено.
          </p>
        )}
        <Button disabled={conflict} type="submit">
          {saving ? 'Сохраняем…' : 'Сохранить рассмотрение'}
        </Button>
      </fieldset>
    </form>
  )
}
