import { useEffect, useState } from 'react'
import type { Account } from '../../shared/api/auth'
import { ApiError, errorMessage } from '../../shared/api/client'
import { getMyProfile, type Profile } from '../../shared/api/profile'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { MonthCalendar } from '../../shared/ui/MonthCalendar'
import { AccountPhoto } from './AccountPhoto'
import { ProfileDetails } from './ProfileDetails'

/** Личный кабинет волонтёра: фото, данные анкеты с правкой на месте и календарь. */
export function AccountPage({
  account,
  onOpenQuestionnaire,
  onSessionExpired,
}: {
  account: Account
  onOpenQuestionnaire: () => void
  onSessionExpired: () => void
}) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void getMyProfile(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setProfile(next)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) {
          onSessionExpired()
          return
        }
        setLoadError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [reload, onSessionExpired])

  function reloadProfile() {
    setProfile(undefined)
    setLoadError('')
    setReload((value) => value + 1)
  }

  if (loadError)
    return (
      <Card tone="raised">
        <p role="alert">{loadError}</p>
        <Button variant="secondary" onClick={reloadProfile}>
          Попробовать снова
        </Button>
      </Card>
    )
  if (profile === undefined)
    return (
      <p className="notice" role="status">
        Открываем личный кабинет…
      </p>
    )

  const name = profile?.displayName || account.email.split('@')[0]

  return (
    <div className="account appear">
      <div className="account-photo-area">
        <AccountPhoto accountId={account.id} name={name} />
      </div>

      <section className="account-main" aria-labelledby="account-heading">
        <header className="account-header">
          <h1 id="account-heading">
            {profile ? profile.displayName : 'Личный кабинет'}
          </h1>
          <p className="account-meta">{account.email}</p>
        </header>

        {profile ? (
          <>
            <ProfileDetails
              profile={profile}
              onSaved={setProfile}
              onReload={reloadProfile}
              onSessionExpired={onSessionExpired}
            />
            <Button variant="secondary" size="sm" onClick={onOpenQuestionnaire}>
              Открыть анкету
            </Button>
          </>
        ) : (
          <div className="account-empty">
            <p>
              Расскажите, чем вам интересно помогать и когда удобно. Координатор
              увидит анкету и предложит подходящее дело.
            </p>
            <Button onClick={onOpenQuestionnaire}>Заполнить анкету</Button>
          </div>
        )}
      </section>

      <Card tone="plain" className="account-calendar-area">
        <MonthCalendar />
      </Card>
    </div>
  )
}
