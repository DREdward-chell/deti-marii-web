import { useCallback, useEffect, useRef } from 'react'

// Writes cannot be cancelled on the server; their responses must not affect a new screen/session.
export function useCurrentRequest() {
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )
  return useCallback(() => {
    const current = ++generation.current
    return () => generation.current === current
  }, [])
}
