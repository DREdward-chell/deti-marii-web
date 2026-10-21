import { useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  listVolunteerRoles,
  type VolunteerRole,
} from '../../shared/api/clearance'
import { ClearanceDecision } from './ClearanceDecision'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'

export function ClearancePanel({
  volunteerId,
  onSessionExpired,
}: {
  volunteerId: string
  onSessionExpired: () => void
}) {
  const [roles, setRoles] = useState<VolunteerRole[] | null>(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
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
        else setError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [attempt, onSessionExpired])
  const role = roles?.find((item) => item.id === selected)
  return (
    <Card
      tone="raised"
      className="clearance-panel"
      aria-labelledby="clearance-heading"
    >
      <h2 id="clearance-heading">Оформление и допуски</h2>
      <section aria-labelledby="paperwork-heading">
        <h3 id="paperwork-heading">Оформление документов</h3>
        <p className="muted">
          Отметьте результат проверки документов и договорённостей с волонтёром.
        </p>
        <ClearanceDecision
          volunteerId={volunteerId}
          roleId={null}
          onSessionExpired={onSessionExpired}
        />
      </section>
      <section
        className="admission-section"
        aria-labelledby="admission-heading"
      >
        <h3 id="admission-heading">Допуски к видам помощи</h3>
        <p className="muted">
          Каждый допуск подтверждает готовность к выбранной помощи. Оформление
          документов и участие в конкретном занятии согласуются отдельно.
        </p>
        {error ? (
          <>
            <p role="alert" className="form-error">
              {error}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setError('')
                setAttempt((value) => value + 1)
              }}
            >
              Повторить загрузку видов помощи
            </Button>
          </>
        ) : roles === null ? (
          <p role="status">Загружаем виды помощи…</p>
        ) : roles.length === 0 ? (
          <p>Сначала добавьте виды помощи в справочник над списком анкет.</p>
        ) : (
          <>
            <label htmlFor="admission-role">Вид помощи для допуска</label>
            <select
              id="admission-role"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Выберите вид помощи</option>
              {roles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {role && (
              <>
                <p className="muted preserve-lines">{role.description}</p>
                <ClearanceDecision
                  key={role.id}
                  volunteerId={volunteerId}
                  roleId={role.id}
                  onSessionExpired={onSessionExpired}
                />
              </>
            )}
          </>
        )}
      </section>
    </Card>
  )
}
