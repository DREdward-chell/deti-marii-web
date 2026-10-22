import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { Chip } from '../../shared/ui/Chip'
import { DemoNotice } from './DemoNotice'
import {
  demoStaff,
  emailProblem,
  staffRoleLabels,
  type StaffMember,
} from './staffAccess'

const date = (value: string) => new Date(value).toLocaleDateString('ru-RU')

/** Сотрудники: кто координатор. Раздел видит только роль ADMIN. */
export function StaffSection({
  actorEmail,
  onSessionExpired,
}: {
  actorEmail: string
  onSessionExpired: () => void
}) {
  const repository = useMemo(() => demoStaff(actorEmail), [actorEmail])
  const [members, setMembers] = useState<StaffMember[] | null>(null)
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void repository
      .list(controller.signal)
      .then((value) => !controller.signal.aborted && setMembers(value))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired()
        else setError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [repository, onSessionExpired])

  async function run(action: () => Promise<StaffMember[]>, done: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setMembers(await action())
      setNotice(done)
      return true
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else {
        setError(errorMessage(cause))
        if (cause instanceof ApiError && cause.fields.email)
          setFieldError(cause.fields.email)
      }
      return false
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = emailProblem(email)
    setFieldError(problem)
    if (problem) return
    const ok = await run(
      () => repository.grant(email, actorEmail),
      `Роль координатора выдана: ${email.trim().toLowerCase()}. При следующем входе понадобится код из письма.`,
    )
    if (ok) setEmail('')
  }

  return (
    <section className="panel-section" aria-labelledby="staff-heading">
      <header className="coordinator-header">
        <h1 id="staff-heading">Сотрудники</h1>
      </header>
      <DemoNotice>
        Сейчас роль координатора выдаёт оператор скриптом{' '}
        <code>scripts/coordinator-access.sh</code>. Этот экран покажет, как это
        будет выглядеть, когда появится API; пока изменения остаются в браузере.
      </DemoNotice>

      <Card tone="raised" aria-labelledby="grant-heading">
        <h2 id="grant-heading">Добавить координатора</h2>
        <p className="muted">
          Человек должен уже быть зарегистрирован. Сотрудники входят по паролю и
          коду из письма.
        </p>
        <form
          className="staff-grant"
          onSubmit={(e) => void grant(e)}
          noValidate
        >
          <div>
            <label htmlFor="staff-email">Email сотрудника</label>
            <input
              id="staff-email"
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setFieldError('')
              }}
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? 'staff-email-error' : undefined}
            />
            {fieldError && (
              <p className="field-error" id="staff-email-error">
                {fieldError}
              </p>
            )}
          </div>
          <Button type="submit" size="sm" disabled={busy}>
            Выдать роль координатора
          </Button>
        </form>
      </Card>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}

      {!members ? (
        <p className="notice" role="status">
          Загружаем сотрудников…
        </p>
      ) : (
        <ul className="staff-list" aria-label="Сотрудники с доступом">
          {members.map((member) => {
            const self = member.email === actorEmail
            return (
              <li key={member.id} className="staff-row">
                <span className="staff-main">
                  <strong>
                    {member.email}
                    {self && <span className="muted"> · это вы</span>}
                  </strong>
                  <span className="muted">
                    С {date(member.grantedAt)} · выдал {member.grantedBy}
                  </span>
                </span>
                <span className="staff-roles">
                  {member.roles.map((role) => (
                    <Chip
                      key={role}
                      tone={role === 'ADMIN' ? 'info' : 'neutral'}
                    >
                      {staffRoleLabels[role]}
                    </Chip>
                  ))}
                </span>
                {self ? (
                  <span />
                ) : confirm === member.id ? (
                  <span className="staff-confirm">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => repository.revoke(member.id, actorEmail),
                          `Доступ снят: ${member.email}. Открытые сессии закроются при следующем запросе.`,
                        )
                      }
                    >
                      Да, снять
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirm(null)}
                    >
                      Отмена
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="quiet"
                    disabled={busy}
                    aria-label={`Снять доступ: ${member.email}`}
                    onClick={() => setConfirm(member.id)}
                  >
                    Снять доступ
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
