import type { MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { MoonIcon, SunIcon } from './icons'
import { useTheme, type Theme } from './theme'

/**
 * Переключатель светлой и тёмной темы. Для скринридера — переключатель
 * «Тёмная тема» с состоянием вкл./выкл.; управляется Tab, Enter и пробелом.
 * Новая тема раскрывается кругом от переключателя там, где браузер умеет
 * View Transitions и человек не просил уменьшить движение; иначе — сразу.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const dark = theme === 'dark'

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const next: Theme = dark ? 'light' : 'dark'
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (calm || !('startViewTransition' in document)) {
      setTheme(next)
      return
    }
    const box = event.currentTarget.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )
    const transition = document.startViewTransition(() => {
      flushSync(() => setTheme(next))
    })
    void transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 520,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    })
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Тёмная тема"
      title={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className="theme-toggle"
      onClick={toggle}
    >
      <SunIcon className="theme-toggle-hint theme-toggle-hint--sun" />
      <MoonIcon className="theme-toggle-hint theme-toggle-hint--moon" />
      <span className="theme-toggle-knob" aria-hidden="true">
        {dark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  )
}
