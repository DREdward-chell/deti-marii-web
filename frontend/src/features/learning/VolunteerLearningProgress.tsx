import { useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  volunteerProgress,
  type EnrollmentSummary,
} from '../../shared/api/learning'
export function VolunteerLearningProgress({
  volunteerId,
  onSessionExpired,
}: {
  volunteerId: string
  onSessionExpired: () => void
}) {
  const [items, setItems] = useState<EnrollmentSummary[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function load() {
    setBusy(true)
    setError('')
    setItems(null)
    try {
      setItems(await volunteerProgress(volunteerId))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="form-card">
      <h2>Обучение волонтёра</h2>
      <p className="muted">
        История обучения не заменяет решение об оформлении или допуске.
      </p>
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy
          ? 'Загружаем…'
          : items
            ? 'Обновить прогресс обучения'
            : 'Показать прогресс обучения'}
      </button>
      {error && <p role="alert">{error}</p>}
      {items &&
        (items.length ? (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                {item.title} · Версия {item.version} · {item.completedLessons}{' '}
                из {item.totalLessons}
                {item.completedAt ? ' · Завершён' : ' · В процессе'}
              </li>
            ))}
          </ul>
        ) : (
          <p>Волонтёр пока не начинал обучение.</p>
        ))}
    </section>
  )
}
