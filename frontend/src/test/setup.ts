import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // Мок-поля анкеты живут в localStorage — тесты не должны видеть данные друг друга.
  localStorage.clear()
})
