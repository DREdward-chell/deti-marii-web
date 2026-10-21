import type { ReactNode } from 'react'
import { cx } from './cx'

/**
 * Короткий статус или метка. Тон передаёт смысл, а не украшение:
 * success — сделано, waiting — ждёт действия, info — канал связи, muted — не начато.
 */
export function Chip({
  tone = 'neutral',
  icon,
  className,
  children,
}: {
  tone?: 'neutral' | 'success' | 'waiting' | 'info' | 'muted'
  icon?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <span className={cx('chip', `chip--${tone}`, className)}>
      {icon}
      {children}
    </span>
  )
}
