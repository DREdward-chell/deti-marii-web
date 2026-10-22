import type { Regularity } from '../../shared/api/profile'

/** Подписи ритма участия — те же, что в анкете. */
export const regularityLabels: Record<Regularity, string> = {
  REGULAR: 'Регулярное участие',
  ONE_OFF: 'Разовая помощь',
  UNSURE: 'Пока присматриваюсь',
}
