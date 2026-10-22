import { useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  getMyClearance,
  paperworkLabels,
  admissionLabels,
  type MyClearance as Clearance,
} from '../../shared/api/clearance'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'

export function MyClearance({
  onSessionExpired,
}: {
  onSessionExpired: () => void
}) {
  const [clearance, setClearance] = useState<Clearance | null>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void getMyClearance(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setClearance(value)
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
    <Card
      tone="raised"
      className="my-clearance"
      aria-labelledby="my-clearance-heading"
    >
      <h2 id="my-clearance-heading">Документы и допуски</h2>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : clearance === undefined ? (
        <p role="status">Загружаем решения координатора…</p>
      ) : clearance === null ? (
        <p>Сначала сохраните анкету.</p>
      ) : (
        <>
          <h3>{paperworkLabels[clearance.paperwork.status]}</h3>
          <p className="preserve-lines">
            {clearance.paperwork.message ||
              'Координатор подтвердит оформление после проверки документов.'}
          </p>
          <h3>Виды помощи</h3>
          {clearance.admissions.length === 0 ? (
            <p className="muted">Решений по видам помощи пока нет.</p>
          ) : (
            <ul className="admission-list">
              {clearance.admissions.map((item) => (
                <li key={item.role.id}>
                  <h4>{item.role.name}</h4>
                  <p className="review-status">
                    {admissionLabels[item.status]}
                  </p>
                  <p className="preserve-lines">{item.message}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="field-hint">
            Участие в конкретном занятии согласуется отдельно.
          </p>
        </>
      )}
      <Button
        variant="quiet"
        size="sm"
        onClick={() => {
          setClearance(undefined)
          setError('')
          setAttempt((value) => value + 1)
        }}
      >
        Обновить документы и допуски
      </Button>
    </Card>
  )
}
