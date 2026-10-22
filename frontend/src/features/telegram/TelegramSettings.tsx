import { useEffect, useState } from 'react'
import {
  ApiError,
  errorMessage,
  get,
  isRecord,
  write,
} from '../../shared/api/client'
import { Button } from '../../shared/ui/Button'

export function TelegramSettings({
  onSessionExpired,
}: {
  onSessionExpired: () => void
}) {
  const [status, setStatus] = useState<{
    available: boolean
    linked: boolean
  }>()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function accept(value: unknown) {
    if (
      !isRecord(value) ||
      typeof value.available !== 'boolean' ||
      typeof value.linked !== 'boolean'
    )
      throw new Error('Invalid response')
    setStatus({ available: value.available, linked: value.linked })
    if (value.linked) setUrl('')
  }
  function fail(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
    else setError(errorMessage(cause))
  }
  useEffect(() => {
    const controller = new AbortController()
    void get('/notifications/telegram', controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) accept(value)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401)
            onSessionExpired()
          else setError(errorMessage(cause))
        }
      })
    return () => controller.abort()
  }, [onSessionExpired])
  async function action(kind: 'link' | 'unlink' | 'refresh') {
    setBusy(true)
    setError('')
    try {
      if (kind === 'link') {
        const value = await write('/notifications/telegram/link', 'POST')
        if (
          !isRecord(value) ||
          typeof value.url !== 'string' ||
          !value.url.startsWith('https://t.me/')
        )
          throw new Error('Invalid link')
        setUrl(value.url)
      } else {
        accept(
          kind === 'refresh'
            ? await get('/notifications/telegram')
            : await write('/notifications/telegram/unlink', 'POST'),
        )
        setUrl('')
      }
    } catch (cause) {
      fail(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-labelledby="telegram-title">
      <h2 id="telegram-title">Уведомления в Telegram</h2>
      <p>
        {status?.linked
          ? 'Telegram подключён. Изменения анкеты, документов и допусков придут в бот.'
          : status?.available
            ? 'Получайте сообщения координатора об изменениях в кабинете. Подключение добровольное.'
            : status
              ? 'Бот скоро появится. Все решения доступны в личном кабинете.'
              : 'Проверяем подключение…'}
      </p>
      {error && <p role="alert">{error}</p>}
      {url && (
        <p>
          <a href={url} target="_blank" rel="noreferrer">
            Открыть Telegram и нажать «Запустить»
          </a>
          . Ссылка действует 10 минут.
        </p>
      )}
      {status?.available && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void action(status.linked ? 'unlink' : 'link')}
        >
          {status.linked
            ? 'Отключить Telegram'
            : url
              ? 'Получить новую ссылку'
              : 'Подключить Telegram'}
        </Button>
      )}
      {(url || error) && (
        <Button
          size="sm"
          variant="quiet"
          disabled={busy}
          onClick={() => void action('refresh')}
        >
          Проверить подключение
        </Button>
      )}
    </section>
  )
}
