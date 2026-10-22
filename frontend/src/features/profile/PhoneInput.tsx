import {
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type InputHTMLAttributes,
} from 'react'
import {
  caretAfterDigits,
  countDigits,
  formatPhone,
  isForeignPhone,
} from './phone'

type PhoneInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  value: string
  onChange: (value: string) => void
}

/** Поле телефона с маской «+7 (916) 123-45-67», которая не мешает править номер в середине. */
export function PhoneInput({ value, onChange, ...props }: PhoneInputProps) {
  const ref = useRef<HTMLInputElement>(null)
  const pendingCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    const caret = pendingCaret.current
    if (caret === null || ref.current !== document.activeElement) return
    pendingCaret.current = null
    ref.current?.setSelectionRange(caret, caret)
  })

  function change(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    const caret = event.target.selectionStart ?? raw.length
    let digitsBeforeCaret = countDigits(raw.slice(0, caret))
    let source = raw

    // Стёрли разделитель — цифры не изменились, поэтому стираем цифру перед ним.
    const erasedSeparator =
      raw.length < value.length && countDigits(raw) === countDigits(value)
    if (erasedSeparator && digitsBeforeCaret > 0) {
      const digits = raw.replace(/\D/g, '')
      source =
        (isForeignPhone(value) ? '+' : '') +
        digits.slice(0, digitsBeforeCaret - 1) +
        digits.slice(digitsBeforeCaret)
      digitsBeforeCaret -= 1
    }

    const formatted = formatPhone(source)
    // Если маска сама дописала код страны, курсор сдвигается на эту цифру.
    const prefixed = countDigits(formatted) > countDigits(source)
    pendingCaret.current = caretAfterDigits(
      formatted,
      digitsBeforeCaret + (prefixed ? 1 : 0),
    )
    onChange(formatted)
  }

  return (
    <input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="+7 (900) 000-00-00"
      {...props}
      value={value}
      onChange={change}
    />
  )
}
