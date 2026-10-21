import { useRef, useState, type ChangeEvent } from 'react'
import { Button } from '../../shared/ui/Button'

/*
 * Фото пока хранится только в этом браузере (localStorage), уменьшенным до 320×320.
 * На сервере для него ещё нет места; когда появится API, заменить чтение и запись здесь.
 */
const storageKey = (accountId: string) => `dm-photo:${accountId}`
const side = 320
const maxFileSize = 15 * 1024 * 1024

const tints = [
  'var(--tint-sun)',
  'var(--tint-sky)',
  'var(--tint-leaf)',
  'var(--tint-berry)',
  'var(--tint-blue)',
  'var(--tint-orange)',
]

function readPhoto(accountId: string) {
  try {
    return localStorage.getItem(storageKey(accountId))
  } catch {
    return null
  }
}

function initials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
  return letters || '?'
}

/** Квадратное фото по центру исходного, сжатое в JPEG. */
async function squarePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const crop = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  context.drawImage(
    bitmap,
    (bitmap.width - crop) / 2,
    (bitmap.height - crop) / 2,
    crop,
    crop,
    0,
    0,
    side,
    side,
  )
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.86)
}

export function AccountPhoto({
  accountId,
  name,
}: {
  accountId: string
  name: string
}) {
  const [photo, setPhoto] = useState(() => readPhoto(accountId))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const tint = tints[(name.codePointAt(0) ?? 0) % tints.length]

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    if (!file.type.startsWith('image/') || file.size > maxFileSize) {
      setError('Выберите фото в формате JPG, PNG или HEIC до 15 МБ.')
      return
    }
    setBusy(true)
    try {
      const data = await squarePhoto(file)
      try {
        localStorage.setItem(storageKey(accountId), data)
      } catch {
        // Без хранилища фото покажется до перезагрузки страницы.
      }
      setPhoto(data)
    } catch {
      setError('Не удалось открыть это фото. Попробуйте другое.')
    } finally {
      setBusy(false)
    }
  }

  function remove() {
    try {
      localStorage.removeItem(storageKey(accountId))
    } catch {
      // Нечего удалять.
    }
    setPhoto(null)
  }

  return (
    <div className="account-photo">
      <div
        className="account-photo-frame"
        style={photo ? undefined : { background: tint }}
      >
        {photo ? (
          <img src={photo} alt={`Фото: ${name}`} />
        ) : (
          <span className="account-photo-initials" aria-hidden="true">
            {initials(name)}
          </span>
        )}
      </div>
      <div className="account-photo-actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Загружаем…' : photo ? 'Сменить фото' : 'Добавить фото'}
        </Button>
        {photo && (
          <Button variant="quiet" size="sm" onClick={remove}>
            Убрать
          </Button>
        )}
      </div>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void choose(event)}
      />
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="field-hint">
          Пока фото сохраняется только в этом браузере.
        </p>
      )}
    </div>
  )
}
