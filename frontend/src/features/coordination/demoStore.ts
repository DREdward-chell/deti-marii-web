/*
 * Демо-хранилище кабинета координатора. Для приёма в команду, мероприятий,
 * уроков и сотрудников серверного API пока нет (docs/coordinator-panel.md),
 * поэтому эти разделы хранят данные только в этом браузере. Когда API
 * появится, меняется репозиторий раздела, а экраны остаются прежними.
 */

export function readDemo<T>(key: string, seed: () => T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) {
      const initial = seed()
      writeDemo(key, initial)
      return initial
    }
    return JSON.parse(raw) as T
  } catch {
    return seed()
  }
}

export function writeDemo<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Без хранилища демо-данные просто не переживут перезагрузку.
  }
}

export function demoId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}
