import { useEffect, useState } from 'react'
import { getSystemInfo } from './shared/api/system'

type ConnectionState = 'loading' | 'connected' | 'unavailable'

const connectionLabels: Record<ConnectionState, string> = {
  loading: 'Подключаемся к пространству…',
  connected: 'Соединение установлено',
  unavailable: 'Сейчас не удалось подключиться. Попробуйте обновить страницу.',
}

export default function App() {
  const [connection, setConnection] = useState<ConnectionState>('loading')

  useEffect(() => {
    const controller = new AbortController()
    void getSystemInfo(controller.signal)
      .then(() => {
        if (!controller.signal.aborted) setConnection('connected')
      })
      .catch(() => {
        if (!controller.signal.aborted) setConnection('unavailable')
      })
    return () => controller.abort()
  }, [])

  return (
    <div className="page">
      <header className="header">
        <a className="brand" href="/" aria-label="Дети Марии — главная">
          Дети Марии<span>Благотворительный фонд</span>
        </a>
        <span className="preview-label">Прототип</span>
      </header>
      <main>
        <p className="eyebrow">Помощь начинается со знакомства</p>
        <h1>Пространство волонтёров</h1>
        <p className="intro">
          Готовим место, где удобно находить своё дело, учиться новому и видеть
          свой вклад в жизнь фонда.
        </p>
        <div className="journey" aria-label="Путь волонтёра">
          <span>Знакомство</span>
          <span>Подготовка</span>
          <span>Участие</span>
        </div>
        <p className={`connection connection--${connection}`} role="status">
          <span className="connection-dot" aria-hidden="true" />
          {connectionLabels[connection]}
        </p>
      </main>
      <footer>Дети Марии · Вместе создаём пространство заботы</footer>
    </div>
  )
}
