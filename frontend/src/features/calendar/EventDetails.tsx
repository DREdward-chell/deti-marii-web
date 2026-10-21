import { useEffect, useRef, useState } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import { Button } from '../../shared/ui/Button'
import { CalendarIcon } from './CalendarIcon'
import {
  canApply,
  canWithdraw,
  dayKey,
  directions,
  downloadIcs,
  eventTime,
  formatDay,
  overlaps,
  statusLabel,
  type CalendarEvent,
  type CalendarRepository,
} from './model'

export function EventDetails({
  event,
  events,
  repository,
  demo,
  onClose,
  onUpdate,
  onRefresh,
  onSessionExpired,
}: {
  event: CalendarEvent
  events: CalendarEvent[]
  repository: CalendarRepository
  demo: boolean
  onClose: () => void
  onUpdate: (event: CalendarEvent) => void
  onRefresh: () => void
  onSessionExpired: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [confirm, setConfirm] = useState<'apply' | 'withdraw' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState('')
  const active = useRef(true)
  const pending = useRef(false)
  const confirmHeading = useRef<HTMLHeadingElement>(null)
  const actionButton = useRef<HTMLButtonElement>(null)
  const resultNotice = useRef<HTMLParagraphElement>(null)
  const conflicts = events.filter(
    (other) =>
      other.status === 'scheduled' &&
      other.participation === 'confirmed' &&
      overlaps(event, other),
  )
  useEffect(() => {
    active.current = true
    const returnTo = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      active.current = false
      element?.close()
      document.body.style.overflow = overflow
      returnTo?.focus()
    }
  }, [])
  useEffect(() => {
    if (confirm) confirmHeading.current?.focus()
  }, [confirm])
  useEffect(() => {
    if (notice) resultNotice.current?.focus()
  }, [notice])
  async function submit() {
    if (!confirm || pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const updated = await repository.respond(event, confirm)
      if (!active.current) return
      onUpdate(updated)
      setNotice(
        confirm === 'apply'
          ? 'Отклик отправлен. Участие подтвердит координатор.'
          : 'Участие отменено. Ваш отклик отозван.',
      )
      setConfirm(null)
    } catch (reason) {
      if (!active.current) return
      if (reason instanceof ApiError && reason.status === 401) {
        onSessionExpired()
        return
      }
      setConflict(reason instanceof ApiError && reason.status === 409)
      setError(errorMessage(reason))
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="cal-dialog"
      aria-labelledby="event-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="cal-detail-inner">
        <div className="cal-detail-top">
          <span className={`cal-direction-pill cal-event--${event.direction}`}>
            {directions[event.direction].short}
          </span>
          <button
            className="cal-icon-button"
            disabled={busy}
            onClick={onClose}
            aria-label="Закрыть мероприятие"
          >
            <CalendarIcon name="close" />
          </button>
        </div>
        <h2 id="event-title">{event.title}</h2>
        <span className={`cal-status-pill cal-status--${event.participation}`}>
          {statusLabel(event)}
        </span>
        {event.status === 'cancelled' && (
          <p className="cal-warning">
            Мероприятие отменено. Приходить не нужно.
          </p>
        )}
        <dl className="cal-detail-facts">
          <div>
            <dt>
              <CalendarIcon name="calendar" />
              <span className="visually-hidden">Дата</span>
            </dt>
            <dd>
              {formatDay(dayKey(event.startsAt), {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              {dayKey(event.startsAt) !==
                dayKey(new Date(Date.parse(event.endsAt) - 1)) && (
                <>
                  {' '}
                  —{' '}
                  {formatDay(dayKey(new Date(Date.parse(event.endsAt) - 1)), {
                    day: 'numeric',
                    month: 'long',
                  })}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>
              <CalendarIcon name="clock" />
              <span className="visually-hidden">Время</span>
            </dt>
            <dd>
              {eventTime(event)}
              <small>Московское время · UTC+3</small>
            </dd>
          </div>
          <div>
            <dt>
              <CalendarIcon name="pin" />
              <span className="visually-hidden">Место</span>
            </dt>
            <dd>{event.location}</dd>
          </div>
        </dl>
        <h3>Что будем делать</h3>
        <p>{event.description}</p>
        <div className="cal-role-card">
          <h3>Ваша роль</h3>
          <strong>{event.role}</strong>
          <p>{event.requirements}</p>
        </div>
        <div className="cal-detail-capacity">
          <span>Координатор</span>
          <strong>{event.coordinator}</strong>
        </div>
        {event.availablePlaces !== null && (
          <div className="cal-detail-capacity">
            <span>Свободных мест</span>
            <strong>{event.availablePlaces}</strong>
          </div>
        )}
        {event.registration === 'restricted' && (
          <p className="cal-warning">
            {event.restrictionReason ||
              'Для участия требуется допуск координатора.'}
          </p>
        )}
        {conflicts.length > 0 && canApply(event) && (
          <div className="cal-warning">
            <strong>Пересекается с вашими планами</strong>
            <p>
              {conflicts
                .map((item) => `${item.title} (${eventTime(item)})`)
                .join(', ')}
              . Перед откликом проверьте, сможете ли участвовать.
            </p>
          </div>
        )}
        <div className="cal-detail-actions">
          {notice && (
            <p
              className="cal-success"
              role="status"
              ref={resultNotice}
              tabIndex={-1}
            >
              {demo ? 'Демо: ' : ''}
              {notice}
            </p>
          )}
          {error && (
            <p className="cal-error" role="alert">
              {error}
            </p>
          )}
          {conflict ? (
            <Button onClick={onRefresh} block>
              Обновить данные
            </Button>
          ) : confirm ? (
            <div className="cal-confirm">
              <h3 ref={confirmHeading} tabIndex={-1}>
                {confirm === 'apply'
                  ? 'Отправить отклик?'
                  : 'Отменить участие?'}
              </h3>
              <p>
                {confirm === 'apply'
                  ? 'Координатор рассмотрит отклик. До подтверждения место за вами не закреплено.'
                  : 'Координатор увидит, что вы не сможете прийти. Если планы изменятся, можно откликнуться снова, пока запись открыта.'}
              </p>
              <Button block disabled={busy} onClick={() => void submit()}>
                {busy
                  ? 'Сохраняем…'
                  : confirm === 'apply'
                    ? 'Отправить отклик'
                    : 'Да, отменить участие'}
              </Button>
              <Button
                variant="quiet"
                block
                disabled={busy}
                onClick={() => {
                  setConfirm(null)
                  requestAnimationFrame(() => actionButton.current?.focus())
                }}
              >
                Вернуться
              </Button>
            </div>
          ) : (
            <>
              {canApply(event) && (
                <button
                  ref={actionButton}
                  className="btn btn--primary btn--block"
                  onClick={() => {
                    setConfirm('apply')
                    setNotice('')
                  }}
                >
                  Хочу участвовать <CalendarIcon name="arrow" />
                </button>
              )}
              {canWithdraw(event) && (
                <button
                  ref={actionButton}
                  className="btn btn--secondary btn--block"
                  onClick={() => {
                    setConfirm('withdraw')
                    setNotice('')
                  }}
                >
                  {event.participation === 'pending'
                    ? 'Отозвать отклик'
                    : 'Отменить участие'}
                </button>
              )}
              {event.participation === 'pending' && (
                <p className="cal-action-hint">
                  Отклик получен. Дождитесь подтверждения координатора.
                </p>
              )}
              <Button
                variant="quiet"
                block
                onClick={() => downloadIcs([event])}
              >
                <CalendarIcon name="download" />
                Скачать в свой календарь
              </Button>
            </>
          )}
          {demo && (
            <p className="cal-demo-hint">
              Демонстрационный пример. Отклики не отправляются в фонд и
              сбрасываются после перезагрузки.
            </p>
          )}
        </div>
      </div>
    </dialog>
  )
}
