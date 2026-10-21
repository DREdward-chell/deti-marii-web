import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'
import { cx } from './cx'

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string
  value: string
  maxLength: number
}

/** Многострочное поле, которое растёт вместе с текстом, со счётчиком символов. */
export function TextArea({
  id,
  value,
  maxLength,
  className,
  'aria-describedby': describedBy,
  ...props
}: TextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const counterId = `${id}-counter`
  const nearLimit = value.length >= maxLength * 0.9

  useLayoutEffect(() => {
    const field = ref.current
    if (!field) return
    function fit() {
      if (!field) return
      field.style.height = 'auto'
      // scrollHeight не учитывает рамку, а поле считается по border-box.
      const border = field.offsetHeight - field.clientHeight
      field.style.height = `${field.scrollHeight + border}px`
    }
    fit()
    // При смене ширины окна строки переносятся иначе — высоту нужно пересчитать.
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [value])

  return (
    <div className="textarea-field">
      <textarea
        ref={ref}
        id={id}
        rows={3}
        value={value}
        maxLength={maxLength}
        className={cx('textarea', className)}
        aria-describedby={cx(counterId, describedBy) || undefined}
        {...props}
      />
      <span
        id={counterId}
        className={cx('textarea-counter', nearLimit && 'is-near-limit')}
      >
        {value.length} / {maxLength}
      </span>
    </div>
  )
}
