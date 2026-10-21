import { useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  getMyOnboarding,
  reviewDate,
  reviewLabels,
  type PublicReview,
} from '../../shared/api/onboarding'

export function MyNextStep({
  onSessionExpired,
}: {
  onSessionExpired: () => void
}) {
  const [review, setReview] = useState<PublicReview | null>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void getMyOnboarding(controller.signal)
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
  }, [attempt, onSessionExpired])
  return (
    <section
      className="form-card next-step-card"
      aria-labelledby="next-step-heading"
    >
      <p className="eyebrow">Знакомство с фондом</p>
      <h2 id="next-step-heading">Ваш следующий шаг</h2>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : review === undefined ? (
        <p role="status">Загружаем сообщение координатора…</p>
      ) : review === null ? (
        <p>Сохраните анкету, чтобы координатор мог с вами познакомиться.</p>
      ) : (
        <>
          <p className="review-status">{reviewLabels[review.status]}</p>
          <p className="preserve-lines">
            {review.message ||
              'Координатор посмотрит вашу анкету. Сообщение и договорённости появятся здесь.'}
          </p>
          {review.nextStep && (
            <div className="next-step-summary">
              <h3>{review.nextStep}</h3>
              <p>
                {review.nextStepOwner === 'VOLUNTEER'
                  ? 'Этот шаг за вами'
                  : 'Этот шаг за координатором'}
                {review.nextStepDate && ` · ${reviewDate(review.nextStepDate)}`}
              </p>
            </div>
          )}
        </>
      )}
      <button
        className="text-button"
        onClick={() => {
          setError('')
          setReview(undefined)
          setAttempt((value) => value + 1)
        }}
      >
        Обновить сообщение
      </button>
    </section>
  )
}
