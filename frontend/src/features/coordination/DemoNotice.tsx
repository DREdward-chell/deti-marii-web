import type { ReactNode } from 'react'

/** Честная пометка, что раздел работает на демо-данных до появления API. */
export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <p className="demo-notice">
      <span className="demo-notice-label">Демо</span>
      <span>{children}</span>
    </p>
  )
}
