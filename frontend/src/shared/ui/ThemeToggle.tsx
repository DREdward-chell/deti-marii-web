import { MoonIcon, SunIcon } from './icons'
import { useTheme } from './theme'

/**
 * Переключатель светлой и тёмной темы. Для скринридера — переключатель
 * «Тёмная тема» с состоянием вкл./выкл.; управляется Tab, Enter и пробелом.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const dark = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Тёмная тема"
      title={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className="theme-toggle"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <SunIcon className="theme-toggle-hint theme-toggle-hint--sun" />
      <MoonIcon className="theme-toggle-hint theme-toggle-hint--moon" />
      <span className="theme-toggle-knob" aria-hidden="true">
        {dark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  )
}
