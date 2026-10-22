/** Российский номер: +7 и 10 цифр. */
const RU_DIGITS = 11
/** Максимум цифр в международном номере (E.164). */
const MAX_DIGITS = 15

export function countDigits(value: string) {
  return value.replace(/\D/g, '').length
}

/** Номер с «+» и кодом страны не 7 — международный, его не форматируем по российской маске. */
export function isForeignPhone(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('+') && !/^\+\D*7/.test(trimmed)
}

/**
 * Форматирует номер по мере ввода: «89161234567» → «+7 (916) 123-45-67».
 * 8 в начале заменяется на +7, номер без кода страны получает +7.
 * Разделители добавляются только перед следующей цифрой, чтобы стирать было удобно.
 */
export function formatPhone(value: string) {
  let digits = value.replace(/\D/g, '')
  if (!digits) return ''
  if (isForeignPhone(value)) return `+${digits.slice(0, MAX_DIGITS)}`

  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`
  else if (!digits.startsWith('7')) digits = `7${digits}`
  const local = digits.slice(1, RU_DIGITS)

  let formatted = '+7'
  if (local.length > 0) formatted += ` (${local.slice(0, 3)}`
  if (local.length > 3) formatted += `) ${local.slice(3, 6)}`
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`
  return formatted
}

/** Пустой номер допустим — поле необязательное. */
export function isPhoneComplete(value: string) {
  const digits = countDigits(value)
  if (digits === 0) return true
  if (isForeignPhone(value)) return digits >= 8 && digits <= MAX_DIGITS
  return countDigits(formatPhone(value)) === RU_DIGITS
}

/** Позиция курсора сразу после n-й цифры отформатированного номера. */
export function caretAfterDigits(formatted: string, n: number) {
  if (n <= 0) return 0
  let seen = 0
  for (let index = 0; index < formatted.length; index++) {
    if (/\d/.test(formatted[index]) && ++seen === n) return index + 1
  }
  return formatted.length
}
