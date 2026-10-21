import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

/** Ключ и логика совпадают со скриптом в index.html, который ставит тему до запуска React. */
const storageKey = 'dm-theme'
const darkQuery = '(prefers-color-scheme: dark)'
const themeColors: Record<Theme, string> = {
  light: '#fffefa',
  dark: '#131519',
}

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(storageKey)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.(darkQuery).matches ? 'dark' : 'light'
}

function initialTheme(): Theme {
  const current = document.documentElement.dataset.theme
  if (current === 'light' || current === 'dark') return current
  return savedTheme() ?? systemTheme()
}

/**
 * Текущая тема и функция выбора. Пока человек не выбрал тему сам,
 * она следует за системной; выбор запоминается в браузере.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', themeColors[theme])
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia?.(darkQuery)
    if (!media) return
    const follow = (event: MediaQueryListEvent) => {
      if (!savedTheme()) setTheme(event.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', follow)
    return () => media.removeEventListener('change', follow)
  }, [])

  function choose(next: Theme) {
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      // Без доступа к хранилищу тема всё равно переключится до перезагрузки.
    }
    setTheme(next)
  }

  return [theme, choose]
}
