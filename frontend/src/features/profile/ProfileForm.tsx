import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
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
import { ArrowIcon, CheckIcon } from '../../shared/ui/icons'
import { TextArea } from '../../shared/ui/TextArea'
import { PhoneInput } from './PhoneInput'
import { isPhoneComplete } from './phone'
import {
  ageError,
  contactOptions,
  directionOptions,
  formatOptions,
  loadExtras,
  saveExtras,
  toggleDirection,
  toggleValue,
  type ProfileExtras,
} from './profileMock'

/** Политика фонда, на которую ссылается подвал mariaschildren.ru. */
const privacyPolicyUrl = encodeURI(
  'https://mariaschildren.ru/uploads/archive/uploads/archive/Политика_в_отношении_обработки_ПД_23.06.25.pdf',
)

export function ProfileForm({
  email,
  onSessionExpired,
  onSaved,
}: {
  email: string
  onSessionExpired: () => void
  /** Вызывается после успешного сохранения анкеты на сервере. */
  onSaved?: () => void
}) {
  const [draft, setDraft] = useState<ProfileDraft>({ ...emptyProfile })
  const [extras, setExtras] = useState<ProfileExtras>(() => loadExtras(email))
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

  function changeExtras(patch: Partial<ProfileExtras>) {
    setExtras((previous) => ({ ...previous, ...patch }))
    setSaved(false)
  }

  // «Периодически» живёт в моке; сервер в это время хранит REGULAR.
  const rhythm: Rhythm =
    extras.periodic && draft.regularity === 'REGULAR'
      ? 'PERIODIC'
      : draft.regularity

  function changeRhythm(value: Rhythm) {
    change('regularity', value === 'PERIODIC' ? 'REGULAR' : value)
    changeExtras({ periodic: value === 'PERIODIC' })
  }

  function validate() {
    const problems: Record<string, string> = {}
    if (!draft.displayName.trim())
      problems.displayName = 'Укажите, как к вам обращаться.'
    if (!isPhoneComplete(draft.phone))
      problems.phone = 'Допишите номер полностью или оставьте поле пустым.'
    else if (extras.contactMethod === 'PHONE' && !draft.phone)
      problems.phone = 'Чтобы мы могли позвонить, укажите телефон.'
    const age = ageError(extras.age)
    if (age) problems.age = age
    if (!extras.consent)
      problems.consent =
        'Без согласия на обработку персональных данных анкету не сохранить.'
    return problems
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setError('')
    setSaved(false)
    setConflict(false)
    const problems = validate()
    setFields(problems)
    if (Object.keys(problems).length > 0) return
    setSaving(true)
    try {
      setDraft(await saveMyProfile(draft))
      saveExtras(email, extras)
      setSaved(true)
      onSaved?.()
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
    <section className="profile appear" aria-labelledby="profile-heading">
      <header className="profile-intro">
        <p className="profile-eyebrow">Ваша анкета</p>
        <h1 id="profile-heading">Расскажите о себе</h1>
        <p className="profile-lead">
          Что вам интересно и в каком ритме удобно помогать? Анкету можно
          дополнять и менять.
        </p>
        <p className="profile-account">
          Email аккаунта: <strong>{email}</strong>
        </p>
      </header>
      <form
        className="profile-form"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <fieldset disabled={saving}>
          <ProfileSection
            number={1}
            tint="sun"
            title="Знакомство"
            hint="Как к вам обращаться и как с вами связаться."
          >
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
                  onChange={(event) =>
                    change('displayName', event.target.value)
                  }
                  placeholder="Например, Анна"
                  aria-invalid={!!fields.displayName}
                  aria-describedby={
                    fields.displayName ? 'displayName-error' : undefined
                  }
                />
                <FieldError
                  id="displayName-error"
                  message={fields.displayName}
                />
              </div>
              <div>
                <label htmlFor="age">
                  Возраст <span className="optional-label">необязательно</span>
                </label>
                <input
                  id="age"
                  name="age"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={3}
                  value={extras.age}
                  onChange={(event) =>
                    changeExtras({ age: event.target.value.replace(/\D/g, '') })
                  }
                  placeholder="Например, 27"
                  aria-invalid={!!fields.age}
                  aria-describedby={fields.age ? 'age-error' : undefined}
                />
                <FieldError id="age-error" message={fields.age} />
              </div>
              <div>
                <label htmlFor="phone">
                  Телефон <span className="optional-label">необязательно</span>
                </label>
                <PhoneInput
                  id="phone"
                  name="phone"
                  maxLength={40}
                  value={draft.phone}
                  onChange={(value) => change('phone', value)}
                  aria-invalid={!!fields.phone}
                  aria-describedby={fields.phone ? 'phone-error' : undefined}
                />
                <FieldError id="phone-error" message={fields.phone} />
              </div>
              <fieldset className="profile-choices">
                <legend>Как с вами удобнее связаться?</legend>
                <div className="profile-pills">
                  {contactOptions.map((option) => (
                    <Pill
                      key={option.value}
                      type="radio"
                      name="contactMethod"
                      checked={extras.contactMethod === option.value}
                      onChange={() =>
                        changeExtras({ contactMethod: option.value })
                      }
                    >
                      {option.title}
                    </Pill>
                  ))}
                </div>
              </fieldset>
            </div>
          </ProfileSection>

          <ProfileSection
            number={2}
            tint="sky"
            title="Чем хотите заниматься"
            hint="Можно выбрать несколько направлений или написать своими словами."
          >
            <fieldset className="profile-choices">
              <legend>Какие направления фонда вам интересны?</legend>
              <div className="profile-choices-grid profile-choices-grid--three">
                {directionOptions.map((option) => (
                  <ChoiceCard
                    key={option.value}
                    type="checkbox"
                    name="directions"
                    title={option.title}
                    description={option.description}
                    checked={extras.directions.includes(option.value)}
                    onChange={() =>
                      changeExtras({
                        directions: toggleDirection(
                          extras.directions,
                          option.value,
                        ),
                      })
                    }
                  />
                ))}
              </div>
            </fieldset>
            <label htmlFor="interests">Что вам интересно?</label>
            <TextArea
              id="interests"
              name="interests"
              maxLength={1000}
              value={draft.interests}
              onChange={(event) => change('interests', event.target.value)}
              placeholder="Например, творчество, общение или помощь в организации событий"
              aria-invalid={!!fields.interests}
            />
            <FieldError message={fields.interests} />
            <label htmlFor="skills">Какими навыками хотите поделиться?</label>
            <TextArea
              id="skills"
              name="skills"
              maxLength={1000}
              value={draft.skills}
              onChange={(event) => change('skills', event.target.value)}
              placeholder="Расскажите о том, что умеете или чему хотели бы научиться"
              aria-invalid={!!fields.skills}
            />
            <FieldError message={fields.skills} />
            <label htmlFor="experience">
              Был ли у вас похожий опыт?{' '}
              <span className="optional-label">необязательно</span>
            </label>
            <TextArea
              id="experience"
              name="experience"
              maxLength={1000}
              value={extras.experience}
              onChange={(event) =>
                changeExtras({ experience: event.target.value })
              }
              placeholder="Волонтёрство, работа с детьми или взрослыми, наставничество — всё, что кажется важным"
            />
          </ProfileSection>

          <ProfileSection
            number={3}
            tint="berry"
            title="Как и где участвовать"
            hint="Ритм и формат можно поменять, когда захочется."
          >
            <fieldset className="profile-choices">
              <legend>Какой ритм вам подходит?</legend>
              <div className="profile-choices-grid">
                {rhythmOptions.map((option) => (
                  <ChoiceCard
                    key={option.value}
                    type="radio"
                    name="regularity"
                    title={option.title}
                    description={option.description}
                    checked={rhythm === option.value}
                    onChange={() => changeRhythm(option.value)}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset className="profile-choices">
              <legend>Какой формат вам ближе?</legend>
              <div className="profile-pills">
                {formatOptions.map((option) => (
                  <Pill
                    key={option.value}
                    type="checkbox"
                    name="formats"
                    checked={extras.formats.includes(option.value)}
                    onChange={() =>
                      changeExtras({
                        formats: toggleValue(extras.formats, option.value),
                      })
                    }
                  >
                    {option.title}
                  </Pill>
                ))}
              </div>
            </fieldset>
            <div className="form-grid">
              <div>
                <label htmlFor="availability">Когда вам удобно?</label>
                <input
                  id="availability"
                  name="availability"
                  maxLength={500}
                  value={draft.availability}
                  onChange={(event) =>
                    change('availability', event.target.value)
                  }
                  placeholder="Например, по субботам"
                  aria-invalid={!!fields.availability}
                />
                <FieldError message={fields.availability} />
              </div>
              <div>
                <label htmlFor="place">Где вам удобно?</label>
                <input
                  id="place"
                  name="place"
                  maxLength={200}
                  value={extras.place}
                  onChange={(event) =>
                    changeExtras({ place: event.target.value })
                  }
                  placeholder="Город, район или метро"
                />
              </div>
            </div>
          </ProfileSection>

          <div className="profile-footer">
            <label className="profile-consent">
              <input
                type="checkbox"
                name="consent"
                checked={extras.consent}
                onChange={(event) =>
                  changeExtras({ consent: event.target.checked })
                }
                aria-invalid={!!fields.consent}
                aria-describedby={fields.consent ? 'consent-error' : undefined}
              />
              <span className="profile-consent-box" aria-hidden="true">
                <CheckIcon />
              </span>
              <span>
                Согласен(на) на обработку персональных данных по{' '}
                <a href={privacyPolicyUrl} target="_blank" rel="noreferrer">
                  политике фонда
                </a>{' '}
                <span className="required-label">*</span>
              </span>
            </label>
            <FieldError id="consent-error" message={fields.consent} />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {conflict && (
              <div className="conflict">
                <p>
                  Ваши правки остаются в форме. Загрузка актуальной анкеты
                  заменит их сохранёнными данными.
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
            <div className="profile-submit">
              <Button className="profile-submit-button" type="submit">
                {saving ? 'Сохраняем…' : 'Сохранить анкету'}
                {!saving && <ArrowIcon />}
              </Button>
              <p className="field-hint">
                * Обязательные поля. Остальное можно заполнить позже.
              </p>
            </div>
          </div>
        </fieldset>
      </form>
    </section>
  )
}

type Rhythm = Regularity | 'PERIODIC'

const rhythmOptions: Array<{
  value: Rhythm
  title: string
  description: string
}> = [
  {
    value: 'UNSURE',
    title: 'Пока присматриваюсь',
    description: 'Познакомлюсь с фондом и решу позже',
  },
  {
    value: 'ONE_OFF',
    title: 'Разовая помощь',
    description: 'Отдельные события и мастер-классы',
  },
  {
    value: 'PERIODIC',
    title: 'Периодически',
    description: 'Время от времени, когда получается',
  },
  {
    value: 'REGULAR',
    title: 'Регулярное участие',
    description: 'Приходить в мастерские по расписанию',
  },
]

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="field-error">
      {message}
    </p>
  )
}

type ChoiceProps = {
  type: 'radio' | 'checkbox'
  name: string
  checked: boolean
  onChange: () => void
}

/** Карточка выбора с заголовком и пояснением: радио или флажок. */
function ChoiceCard({
  title,
  description,
  ...input
}: ChoiceProps & { title: string; description: string }) {
  return (
    <label className="profile-choice">
      <input className="visually-hidden" {...input} />
      {input.type === 'checkbox' && (
        <span className="profile-choice-check" aria-hidden="true">
          <CheckIcon />
        </span>
      )}
      <span className="profile-choice-title">{title}</span>
      <span className="profile-choice-text">{description}</span>
    </label>
  )
}

/** Короткий вариант выбора в виде «пилюли», как вкладки на сайте фонда. */
function Pill({ children, ...input }: ChoiceProps & { children: ReactNode }) {
  return (
    <label className="profile-pill">
      <input className="visually-hidden" {...input} />
      {input.type === 'checkbox' && (
        <span className="profile-pill-mark" aria-hidden="true">
          {input.checked ? <CheckIcon /> : '+'}
        </span>
      )}
      {children}
    </label>
  )
}

/** Смысловая группа полей анкеты с номером на цветном круге, как цифры на сайте фонда. */
function ProfileSection({
  number,
  tint,
  title,
  hint,
  children,
}: {
  number: number
  tint: 'sun' | 'sky' | 'berry'
  title: string
  hint: string
  children: ReactNode
}) {
  const headingId = `profile-section-${number}`
  return (
    <section className="profile-section" aria-labelledby={headingId}>
      <div className="profile-section-head">
        <span
          className={`profile-section-number profile-section-number--${tint}`}
          aria-hidden="true"
        >
          {number}
        </span>
        <div>
          <h2 id={headingId}>{title}</h2>
          <p className="profile-section-hint">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
