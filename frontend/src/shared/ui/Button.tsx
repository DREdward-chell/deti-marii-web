import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary — главное действие экрана; secondary — второстепенное; quiet — ссылка-кнопка в шапке и тексте. */
  variant?: 'primary' | 'secondary' | 'quiet'
  size?: 'md' | 'sm'
  /** Растянуть на всю ширину контейнера. */
  block?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        'btn',
        `btn--${variant}`,
        size === 'sm' && 'btn--sm',
        block && 'btn--block',
        className,
      )}
      {...props}
    />
  )
}
