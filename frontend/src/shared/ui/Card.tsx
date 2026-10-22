import type { HTMLAttributes } from 'react'
import { cx } from './cx'

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'article' | 'div'
  /** plain — серая подложка; raised — белая с тенью (формы); accent — «следующий шаг». */
  tone?: 'plain' | 'raised' | 'accent'
}

export function Card({
  as: Tag = 'section',
  tone = 'plain',
  className,
  ...props
}: CardProps) {
  return <Tag className={cx('card', `card--${tone}`, className)} {...props} />
}
