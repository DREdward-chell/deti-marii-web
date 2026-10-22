/** Склеивает имена классов, пропуская пустые значения. */
export function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}
