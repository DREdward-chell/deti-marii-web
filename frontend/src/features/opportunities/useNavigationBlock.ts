import { useEffect } from 'react'

export function useNavigationBlock(
  blocked: boolean,
  onChange?: (blocked: boolean) => void,
) {
  useEffect(() => {
    onChange?.(blocked)
    return () => onChange?.(false)
  }, [blocked, onChange])
  useEffect(() => {
    if (!blocked) return
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [blocked])
}
