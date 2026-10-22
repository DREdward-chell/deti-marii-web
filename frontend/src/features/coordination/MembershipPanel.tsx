import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { Chip } from '../../shared/ui/Chip'
import { TextArea } from '../../shared/ui/TextArea'
import { DemoNotice } from './DemoNotice'
import {
  membershipIsDemo,
  membershipLabels,
  membershipProblems,
  membershipRepository,
  membershipTone,
  type Membership,
  type MembershipStatus,
} from './membership'

const actionText: Record<MembershipStatus, { button: string; ask: string }> = {
  ACCEPTED: {
    button: 'Принять в команду',
    ask: 'Человеку откроется обучение. Сообщение он увидит в личном кабинете.',
  },
  PAUSED: {
    button: 'Приостановить',
    ask: 'Обучение закроется, пройденное сохранится. Объясните человеку причину.',
  },
  REVOKED: {
    button: 'Отозвать принятие',
    ask: 'Обучение закроется, история сохранится. Объясните человеку причину.',
  },
  NOT_ACCEPTED: { button: '', ask: '' },
}

const defaultMessage: Partial<Record<MembershipStatus, string>> = {
  ACCEPTED:
    'Рады, что вы с нами! Мы открыли для вас обучение — начните с первого урока.',
}

const when = (value: string) =>
  new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Приём в команду: отдельное решение, только после него открывается обучение. */
export function MembershipPanel({
  volunteerId,
  volunteerName,
  actorEmail,
  onChange,
  onSessionExpired,
}: {
  volunteerId: string
  volunteerName: string
  actorEmail: string
  onChange: (membership: Membership) => void
  onSessionExpired: () => void
}) {
  const [membership, setMembership] = useState<Membership | null>(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState<MembershipStatus | null>(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState('')
  // Свежий колбэк без перезапуска загрузки, даже если родитель передаёт новую функцию.
  const report = useRef(onChange)
  useEffect(() => {
    report.current = onChange
  })

  useEffect(() => {
    const controller = new AbortController()
    void membershipRepository
      .get(volunteerId, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return
        setMembership(value)
        report.current(value)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired()
        else setLoadError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [volunteerId, attempt, onSessionExpired])

  function reload() {
    setMembership(null)
    setLoadError('')
    setPending(null)
    setError('')
    setConflict(false)
    setAttempt((value) => value + 1)
  }

  function ask(status: MembershipStatus) {
    setPending(status)
    setMessage(defaultMessage[status] ?? '')
    setError('')
    setConflict(false)
    setSaved('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!membership || !pending || saving) return
    const fields = { status: pending, message }
    const problem = membershipProblems(fields).message
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError('')
    try {
      const next = await membershipRepository.save(
        volunteerId,
        membership.current.version,
        fields,
        actorEmail,
      )
      setMembership(next)
      report.current(next)
      setPending(null)
      setSaved(
        pending === 'ACCEPTED'
          ? `${volunteerName} в команде. Обучение открыто.`
          : 'Решение сохранено.',
      )
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onSessionExpired()
        return
      }
      setError(errorMessage(cause))
      setConflict(cause instanceof ApiError && cause.status === 409)
    } finally {
      setSaving(false)
    }
  }

  const status = membership?.current.fields.status
  const actions: MembershipStatus[] =
    status === 'ACCEPTED' ? ['PAUSED', 'REVOKED'] : ['ACCEPTED']

  return (
    <Card
      tone="raised"
      className="membership-panel"
      aria-labelledby="membership-heading"
    >
      <h2 id="membership-heading">Приём в команду</h2>
      <p className="muted">
        Отдельное решение: рассмотрение, документы и допуски его не заменяют.
        Только после принятия человеку открывается обучение.
      </p>
      {membershipIsDemo && (
        <DemoNotice>
          Решение пока хранится только в этом браузере: серверного API для
          приёма ещё нет.
        </DemoNotice>
      )}
      {loadError ? (
        <div className="coordinator-message">
          <p className="form-error">{loadError}</p>
          <Button variant="secondary" size="sm" onClick={reload}>
            Повторить загрузку
          </Button>
        </div>
      ) : !membership ? (
        <p className="muted">Загружаем решение…</p>
      ) : (
        <>
          <div className="membership-state">
            <Chip tone={membershipTone[membership.current.fields.status]}>
              {membershipLabels[membership.current.fields.status]}
            </Chip>
            {membership.current.updatedAt && (
              <span className="muted">
                {when(membership.current.updatedAt)}
                {membership.current.actorEmail &&
                  ` · ${membership.current.actorEmail}`}
              </span>
            )}
          </div>
          {membership.current.fields.message && (
            <p className="preserve-lines membership-message">
              {membership.current.fields.message}
            </p>
          )}

          {pending ? (
            <form
              className="membership-confirm"
              onSubmit={(e) => void submit(e)}
            >
              <fieldset disabled={saving}>
                <p className="membership-confirm-title">
                  {actionText[pending].button}: {volunteerName}?
                </p>
                <p className="muted">{actionText[pending].ask}</p>
                <label htmlFor="membership-message">
                  Сообщение человеку
                  {pending === 'ACCEPTED' && (
                    <span className="optional-label">необязательно</span>
                  )}
                </label>
                <TextArea
                  id="membership-message"
                  maxLength={2000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  aria-invalid={!!error && !conflict}
                />
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="panel-actions">
                  {conflict ? (
                    <Button type="button" size="sm" onClick={reload}>
                      Загрузить актуальное решение
                    </Button>
                  ) : (
                    <Button type="submit" size="sm">
                      {saving
                        ? 'Сохраняем…'
                        : pending === 'ACCEPTED'
                          ? 'Да, принять'
                          : `Да, ${actionText[pending].button.toLowerCase()}`}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setPending(null)}
                  >
                    Отмена
                  </Button>
                </div>
              </fieldset>
            </form>
          ) : (
            <div className="panel-actions">
              {actions.map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant={action === 'ACCEPTED' ? 'primary' : 'secondary'}
                  onClick={() => ask(action)}
                >
                  {actionText[action].button}
                </Button>
              ))}
            </div>
          )}
          {saved && (
            <p className="success-message" role="status">
              {saved}
            </p>
          )}
          {membership.history.length > 0 && (
            <details className="review-history">
              <summary>История решений ({membership.history.length})</summary>
              <ol>
                {membership.history.map((item) => (
                  <li key={item.version}>
                    <p>
                      <strong>{membershipLabels[item.fields.status]}</strong>
                    </p>
                    <p className="muted">
                      {item.updatedAt && when(item.updatedAt)}
                      {item.actorEmail && ` · ${item.actorEmail}`}
                    </p>
                    {item.fields.message && (
                      <p className="preserve-lines">{item.fields.message}</p>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </Card>
  )
}
