import type {
  CourseContent,
  LessonContent,
  LessonType,
} from '../../shared/api/learning'
export function newLesson(type: LessonType = 'READ'): LessonContent {
  return {
    id: crypto.randomUUID(),
    title: '',
    body: '',
    type,
    options:
      type === 'READ'
        ? []
        : [
            { id: crypto.randomUUID(), text: '' },
            { id: crypto.randomUUID(), text: '' },
          ],
    correctOptionId: null,
    explanation: '',
  }
}
export function demoCourse(): CourseContent {
  const read = newLesson()
  const choice = newLesson('SINGLE_CHOICE')
  const order = newLesson('ORDERING')
  return {
    title: 'Демо: знакомство с кабинетом',
    description:
      'Пример для проверки обучения. Это не инструкции фонда и не подготовка к работе с подопечными.',
    audience: 'ALL_VOLUNTEERS',
    demo: true,
    lessons: [
      {
        ...read,
        title: 'Ваше пространство',
        body: 'В разделе «Моя анкета» можно рассказать о себе и увидеть следующий шаг, который предложил координатор. Данные сохраняются после нажатия «Сохранить анкету». Прохождение этого примера не выдаёт допуск к работе.',
      },
      {
        ...choice,
        title: 'Где найти следующий шаг?',
        body: 'Координатор предложил следующий шаг. Где его посмотреть?',
        options: [
          { ...choice.options[0], text: 'В разделе «Моя анкета»' },
          { ...choice.options[1], text: 'В форме регистрации нового аккаунта' },
        ],
        correctOptionId: choice.options[0].id,
        explanation:
          'Следующий шаг отображается рядом с вашей анкетой. Создавать новый аккаунт не нужно.',
      },
      {
        ...order,
        title: 'Как обновить анкету?',
        body: 'Расположите действия по порядку: от открытия анкеты до проверки сохранённых данных.',
        options: [
          'Открыть «Моя анкета»',
          'Внести изменения',
          'Нажать «Сохранить анкету»',
          'Открыть анкету снова и проверить данные',
        ].map((text) => ({ id: crypto.randomUUID(), text })),
        explanation:
          'Сначала откройте анкету, затем измените данные и сохраните их. При следующем открытии можно проверить результат.',
      },
    ],
  }
}
export function move<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items]
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
