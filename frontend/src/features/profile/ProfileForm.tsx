import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import {
  emptyProfile,
  getMyProfile,
  saveMyProfile,
  type ProfileDraft,
  type Regularity,
} from '../../shared/api/profile'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'

export function ProfileForm({
  email,
  onSessionExpired,
}: {
  email: string
  onSessionExpired: () => void
}) {
  const [draft, setDraft] = useState<ProfileDraft>({ ...emptyProfile })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [conflict, setConflict] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void getMyProfile(controller.signal)
      .then((profile) => {
        if (controller.signal.aborted) return
        setDraft(profile ?? { ...emptyProfile })
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) {
          onSessionExpired()
          return
        }
        setLoadError(errorMessage(cause))
        setLoading(false)
      })
    return () => controller.abort()
  }, [reload, onSessionExpired])

  function reloadProfile() {
    setLoading(true)
    setLoadError('')
    setError('')
    setFields({})
    setSaved(false)
    setConflict(false)
    setReload((value) => value + 1)
  }

  function change(field: keyof Omit<ProfileDraft, 'version'>, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }))
    setSaved(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setFields({})
    setSaved(false)
    setConflict(false)
    try {
      setDraft(await saveMyProfile(draft))
      setSaved(true)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onSessionExpired()
        return
      }
      setError(errorMessage(cause))
      if (cause instanceof ApiError) {
        setFields(cause.fields)
        setConflict(cause.status === 409)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading)
    return (
      <p className="notice" role="status">
        Загружаем вашу анкету…
      </p>
    )
  if (loadError)
    return (
      <Card tone="raised">
        <p role="alert">{loadError}</p>
        <Button variant="secondary" onClick={reloadProfile}>
          Попробовать снова
        </Button>
      </Card>
    )

  return (
    <Card
      tone="raised"
      className="profile-card"
      aria-labelledby="profile-heading"
    >
      <p className="eyebrow">Ваша анкета</p>
      <h1 id="profile-heading">Расскажите о себе</h1>
      <p className="muted">
        Что вам интересно и в каком ритме удобно помогать? Анкету можно
        дополнять и менять.
      </p>
      <p className="account-email">
        Email аккаунта: <strong>{email}</strong>
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={saving}>
          <div className="form-grid">
            <div>
              <label htmlFor="displayName">
                Как к вам обращаться <span className="required-label">*</span>
              </label>
              <input
                id="displayName"
                name="displayName"
                autoComplete="name"
                required
                maxLength={100}
                value={draft.displayName}
                onChange={(event) => change('displayName', event.target.value)}
                aria-invalid={!!fields.displayName}
                aria-describedby={
                  fields.displayName ? 'displayName-error' : undefined
                }
              />
              {fields.displayName && (
                <p id="displayName-error" className="field-error">
                  {fields.displayName}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="phone">
                Телефон <span className="optional-label">необязательно</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                value={draft.phone}
                onChange={(event) => change('phone', event.target.value)}
                aria-invalid={!!fields.phone}
              />
              {fields.phone && <p className="field-error">{fields.phone}</p>}
            </div>
          </div>
          <label htmlFor="interests">Что вам интересно?</label>
          <textarea
            id="interests"
            name="interests"
            rows={3}
            maxLength={1000}
            value={draft.interests}
            onChange={(event) => change('interests', event.target.value)}
            placeholder="Например, творчество, общение или помощь в организации событий"
            aria-invalid={!!fields.interests}
          />
          {fields.interests && (
            <p className="field-error">{fields.interests}</p>
          )}
          <label htmlFor="skills">Какими навыками хотите поделиться?</label>
          <textarea
            id="skills"
            name="skills"
            rows={3}
            maxLength={1000}
            value={draft.skills}
            onChange={(event) => change('skills', event.target.value)}
            placeholder="Расскажите о том, что умеете или чему хотели бы научиться"
            aria-invalid={!!fields.skills}
          />
          {fields.skills && <p className="field-error">{fields.skills}</p>}
          <div className="form-grid">
            <div>
              <label htmlFor="regularity">Какой ритм вам подходит?</label>
              <select
                id="regularity"
                name="regularity"
                value={draft.regularity}
                onChange={(event) =>
                  change('regularity', event.target.value as Regularity)
                }
              >
                <option value="UNSURE">Пока присматриваюсь</option>
                <option value="ONE_OFF">Разовая помощь</option>
                <option value="REGULAR">Регулярное участие</option>
              </select>
            </div>
            <div>
              <label htmlFor="availability">Когда вам удобно?</label>
              <input
                id="availability"
                name="availability"
                maxLength={500}
                value={draft.availability}
                onChange={(event) => change('availability', event.target.value)}
                placeholder="Например, по субботам"
                aria-invalid={!!fields.availability}
              />
              {fields.availability && (
                <p className="field-error">{fields.availability}</p>
              )}
            </div>
          </div>
          <p className="field-hint">
            * Обязательное поле. Остальное можно заполнить позже.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {conflict && (
            <div className="conflict">
              <p>
                Ваши правки остаются в форме. Загрузка актуальной анкеты заменит
                их сохранёнными данными.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={reloadProfile}
              >
                Загрузить актуальную анкету
              </Button>
            </div>
          )}
          {saved && (
            <p className="success-message" role="status">
              Анкета сохранена. Вы можете вернуться к ней в любой момент.
            </p>
          )}
          <Button className="form-submit" type="submit">
            {saving ? 'Сохраняем…' : 'Сохранить анкету'}
          </Button>
        </fieldset>
      </form>
    </Card>
  )
}
