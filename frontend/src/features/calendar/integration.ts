import { useEffect } from 'react'

/** The widget and the full calendar must switch to the API in the same build. */
export const calendarApiEnabled = () =>
  import.meta.env.VITE_CALENDAR_API_ENABLED === 'true'

export function calendarHref(day: string, demo = false) {
  const params = new URLSearchParams({ date: day, view: 'day' })
  if (demo) params.set('demo', '1')
  return `/calendar?${params}`
}

/** Refresh current access/participation after another tab or the coordinator changed it. */
export function useCalendarRefresh(enabled: boolean, onRefresh: () => void) {
  useEffect(() => {
    if (!enabled) return
    const refresh = () => {
      if (document.visibilityState === 'visible') onRefresh()
    }
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) refresh()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', restored)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', restored)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [enabled, onRefresh])
}
