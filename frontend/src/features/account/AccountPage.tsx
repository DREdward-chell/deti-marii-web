import { useEffect, useState } from 'react'
import type { Account } from '../../shared/api/auth'
import { ApiError, errorMessage } from '../../shared/api/client'
import { getMyProfile, type Profile } from '../../shared/api/profile'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { TodayCard } from '../calendar/TodayCard'
import { LearningCard } from '../learning/LearningCard'
import { MyClearance } from '../onboarding/MyClearance'
import { MyNextStep } from '../onboarding/MyNextStep'
import { AccountPhoto } from './AccountPhoto'
import { ProfileDetails } from './ProfileDetails'
import {
  AccountLearningCard,
  type AccountLearning,
} from './AccountLearningCard'
import { TelegramSettings } from '../telegram/TelegramSettings'
import './account.css'

/** Личный кабинет волонтёра: фото, данные анкеты с правкой на месте и календарь. */
export function AccountPage({
  account,
  onOpenQuestionnaire,
  onSessionExpired,
  learning,
}: {
  account: Account
  onOpenQuestionnaire: () => void
  onSessionExpired: () => void
  /** Supplied by the learning feature after checking current server access. */
  learning?: AccountLearning
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
    <div className="account account--compact appear">
      <aside className="account-sidebar" aria-label="Фото и события дня">
        <div className="account-photo-area">
          <AccountPhoto accountId={account.id} name={name} />
        </div>
        <div className="account-calendar-area">
          <TodayCard onSessionExpired={onSessionExpired} />
          <LearningCard accountId={account.id} />
        </div>
      </aside>

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
            <AccountLearningCard learning={learning} />
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

      {profile && (
        <div className="account-followup">
          <MyNextStep onSessionExpired={onSessionExpired} />
          <TelegramSettings onSessionExpired={onSessionExpired} />
          <details className="account-clearance">
            <summary>Документы и допуски</summary>
            <MyClearance onSessionExpired={onSessionExpired} />
          </details>
        </div>
      )}
    </div>
  )
}
