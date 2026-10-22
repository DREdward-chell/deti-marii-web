import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  getDecision,
  paperworkLabels,
  type DecisionHistory,
} from '../../shared/api/clearance'
import {
  regularityLabels,
  type VolunteerCard,
} from '../../shared/api/coordination'
import {
  getReview,
  reviewLabels,
  type StaffReview,
} from '../../shared/api/onboarding'
import { Card } from '../../shared/ui/Card'
import { Chip } from '../../shared/ui/Chip'
import { ClearancePanel } from './ClearancePanel'
import { MembershipPanel } from './MembershipPanel'
import { ReviewPanel } from './ReviewPanel'
import { membershipLabels, membershipTone, type Membership } from './membership'

type Tone = 'neutral' | 'success' | 'waiting' | 'info' | 'muted'

const reviewTone: Record<keyof typeof reviewLabels, Tone> = {
  NEW: 'muted',
  IN_REVIEW: 'info',
  CONTINUE: 'success',
  PAUSED: 'waiting',
  DECLINED: 'neutral',
}
const paperworkTone: Record<keyof typeof paperworkLabels, Tone> = {
  NOT_CONFIRMED: 'muted',
  CONFIRMED: 'success',
  NEEDS_UPDATE: 'waiting',
}

const date = (value: string) => new Date(value).toLocaleDateString('ru-RU')

function goTo(id: string) {
  const target = document.getElementById(id)
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  target?.focus({ preventScroll: true })
}

/**
 * Карточка волонтёра для координатора: сводка по независимым направлениям
 * (знакомство, приём, документы, допуски, обучение, связь) и панели решений.
 */
export function PersonCard({
  card,
  actorEmail,
  onMembershipChange,
  onSessionExpired,
}: {
  card: VolunteerCard
  actorEmail: string
  onMembershipChange: (id: string, membership: Membership) => void
  onSessionExpired: () => void
}) {
  const [review, setReview] = useState<StaffReview | null>(null)
  const [paperwork, setPaperwork] = useState<DecisionHistory | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)

  // Сводка не показывает ошибок сама: подробные панели ниже покажут их и дадут повторить.
  useEffect(() => {
    const controller = new AbortController()
    getReview(card.id, controller.signal)
      .then((value) => !controller.signal.aborted && setReview(value))
      .catch(() => {})
    getDecision(card.id, null, controller.signal)
      .then((value) => !controller.signal.aborted && setPaperwork(value))
      .catch(() => {})
    return () => controller.abort()
  }, [card.id])

  const membershipChanged = useCallback(
    (value: Membership) => {
      setMembership(value)
      onMembershipChange(card.id, value)
    },
    [card.id, onMembershipChange],
  )

  const accepted = membership?.current.fields.status === 'ACCEPTED'
  const reviewStatus = review?.current.fields.status
  // У оформления документов свои состояния — подмножество DecisionStatus.
  const paperworkStatus = paperwork?.current.fields.status as
    keyof typeof paperworkLabels | undefined

  return (
    <div className="volunteer-details">
      <Card tone="raised" as="article" className="volunteer-card">
        <div className="volunteer-card-head">
          <span className="volunteer-avatar" aria-hidden="true">
            {card.displayName.charAt(0).toUpperCase()}
          </span>
          <div>
            <h2>{card.displayName}</h2>
            <p className="muted">
              Анкета создана {date(card.createdAt)} · Обновлена{' '}
              {date(card.updatedAt)}
            </p>
          </div>
        </div>

        <ul className="status-ledger" aria-label="Где сейчас человек">
          <LedgerRow
            title="Знакомство"
            status={
              reviewStatus ? (
                <Chip tone={reviewTone[reviewStatus]}>
                  {reviewLabels[reviewStatus]}
                </Chip>
              ) : (
                <span className="muted">Загружаем…</span>
              )
            }
            detail={review?.current.fields.nextStep || undefined}
            action="К рассмотрению"
            target="review-heading"
          />
          <LedgerRow
            title="Приём в команду"
            status={
              membership ? (
                <Chip tone={membershipTone[membership.current.fields.status]}>
                  {membershipLabels[membership.current.fields.status]}
                </Chip>
              ) : (
                <span className="muted">Загружаем…</span>
              )
            }
            action={accepted ? 'Изменить решение' : 'Принять'}
            target="membership-heading"
            emphasis={!accepted}
          />
          <LedgerRow
            title="Документы"
            status={
              paperworkStatus ? (
                <Chip tone={paperworkTone[paperworkStatus]}>
                  {paperworkLabels[paperworkStatus]}
                </Chip>
              ) : (
                <span className="muted">Загружаем…</span>
              )
            }
            action="К оформлению"
            target="paperwork-heading"
          />
          <LedgerRow
            title="Допуски"
            status={<span className="muted">По каждому виду помощи</span>}
            action="К допускам"
            target="admission-heading"
          />
          <LedgerRow
            title="Обучение"
            status={
              accepted ? (
                <Chip tone="info">Открыто</Chip>
              ) : (
                <span className="muted">Откроется после принятия</span>
              )
            }
            detail={
              accepted
                ? 'Прогресс по урокам появится вместе с API обучения.'
                : undefined
            }
          />
          <LedgerRow
            title="Telegram"
            status={<span className="muted">Появится вместе с ботом</span>}
          />
        </ul>

        <details className="volunteer-facts-toggle">
          <summary>Анкета: контакты, интересы, время</summary>
          <dl className="volunteer-facts">
            <dt>Email</dt>
            <dd>{card.email || 'Не указан'}</dd>
            <dt>Телефон</dt>
            <dd>{card.phone || 'Не указан'}</dd>
            <dt>Интересы</dt>
            <dd className="preserve-lines">
              {card.interests || 'Пока не указаны'}
            </dd>
            <dt>Навыки</dt>
            <dd className="preserve-lines">
              {card.skills || 'Пока не указаны'}
            </dd>
            <dt>Ритм участия</dt>
            <dd>{regularityLabels[card.regularity]}</dd>
            <dt>Удобное время</dt>
            <dd>{card.availability || 'Пока не указано'}</dd>
          </dl>
        </details>
      </Card>

      <MembershipPanel
        key={`membership:${card.id}`}
        volunteerId={card.id}
        volunteerName={card.displayName}
        actorEmail={actorEmail}
        onChange={membershipChanged}
        onSessionExpired={onSessionExpired}
      />
      <ReviewPanel
        key={card.id}
        volunteerId={card.id}
        onSessionExpired={onSessionExpired}
        onChange={setReview}
      />
      <ClearancePanel
        key={`clearance:${card.id}`}
        volunteerId={card.id}
        onSessionExpired={onSessionExpired}
        onPaperworkChange={setPaperwork}
      />
    </div>
  )
}

function LedgerRow({
  title,
  status,
  detail,
  action,
  target,
  emphasis,
}: {
  title: string
  status: ReactNode
  detail?: string
  action?: string
  target?: string
  emphasis?: boolean
}) {
  return (
    <li className="status-ledger-row">
      <span className="status-ledger-title">{title}</span>
      <span className="status-ledger-status">
        {status}
        {detail && <span className="status-ledger-detail">{detail}</span>}
      </span>
      {action && target ? (
        <button
          type="button"
          className={
            emphasis ? 'ledger-link ledger-link--primary' : 'ledger-link'
          }
          onClick={() => goTo(target)}
        >
          {action}
        </button>
      ) : (
        <span />
      )}
    </li>
  )
}
