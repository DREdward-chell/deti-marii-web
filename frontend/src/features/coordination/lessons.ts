import { ApiError } from '../../shared/api/client'
import { demoId, readDemo, writeDemo } from './demoStore'

/*
 * Уроки учебного маршрута из готовых типов блоков (docs 15, 19 в репозитории
 * с описанием кейса): черновик → предпросмотр → публикация. Универсальный
 * конструктор не нужен. Серверного API пока нет (BE-03), поэтому данные демо.
 */

export const blockLabels = {
  TEXT: 'Текст',
  CARDS: 'Карточки',
  ORDER: 'Порядок шагов',
  CHOICE: 'Ситуация с выбором',
} as const
export type BlockType = keyof typeof blockLabels

export interface TextBlock {
  id: string
  type: 'TEXT'
  text: string
}
export interface CardsBlock {
  id: string
  type: 'CARDS'
  cards: { title: string; text: string }[]
}
export interface OrderBlock {
  id: string
  type: 'ORDER'
  prompt: string
  /** Шаги в правильном порядке; волонтёр получит их перемешанными. */
  steps: string[]
}
export interface ChoiceBlock {
  id: string
  type: 'CHOICE'
  question: string
  options: { text: string; correct: boolean; explanation: string }[]
}
export type LessonBlock = TextBlock | CardsBlock | OrderBlock | ChoiceBlock
type NewBlock =
  | Omit<TextBlock, 'id'>
  | Omit<CardsBlock, 'id'>
  | Omit<OrderBlock, 'id'>
  | Omit<ChoiceBlock, 'id'>

export const lessonStatusLabels = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Опубликован',
} as const
export type LessonStatus = keyof typeof lessonStatusLabels

export interface LessonFields {
  title: string
  goal: string
  source: string
  blocks: LessonBlock[]
}
export interface Lesson extends LessonFields {
  id: string
  status: LessonStatus
  version: number
  /** Есть несохранённые в публикации правки: волонтёры видят прежнюю версию. */
  changedSincePublish: boolean
}

export function newBlock(type: BlockType): LessonBlock {
  const id = demoId('block')
  if (type === 'TEXT') return { id, type, text: '' }
  if (type === 'CARDS')
    return {
      id,
      type,
      cards: [
        { title: '', text: '' },
        { title: '', text: '' },
      ],
    }
  if (type === 'ORDER') return { id, type, prompt: '', steps: ['', '', ''] }
  return {
    id,
    type,
    question: '',
    options: [
      { text: '', correct: true, explanation: '' },
      { text: '', correct: false, explanation: '' },
    ],
  }
}

/** Что мешает публикации; пустой список — урок можно публиковать. */
export function lessonProblems(lesson: LessonFields): string[] {
  const problems: string[] = []
  if (!lesson.title.trim()) problems.push('Назовите урок.')
  if (!lesson.goal.trim())
    problems.push('Опишите, что человек поймёт после урока.')
  if (lesson.blocks.length === 0) problems.push('Добавьте хотя бы один блок.')
  if (!lesson.blocks.some((block) => block.type !== 'TEXT'))
    problems.push(
      'Добавьте интерактивный блок: карточки, порядок шагов или ситуацию.',
    )
  lesson.blocks.forEach((block, index) => {
    const at = `Блок ${index + 1} (${blockLabels[block.type].toLowerCase()})`
    if (block.type === 'TEXT' && !block.text.trim())
      problems.push(`${at}: впишите текст.`)
    if (block.type === 'CARDS') {
      const filled = block.cards.filter((card) => card.title.trim())
      if (filled.length < 2) problems.push(`${at}: нужно минимум две карточки.`)
    }
    if (block.type === 'ORDER') {
      if (!block.prompt.trim()) problems.push(`${at}: сформулируйте задание.`)
      if (block.steps.filter((step) => step.trim()).length < 3)
        problems.push(`${at}: нужно минимум три шага.`)
    }
    if (block.type === 'CHOICE') {
      const filled = block.options.filter((option) => option.text.trim())
      if (!block.question.trim()) problems.push(`${at}: опишите ситуацию.`)
      if (filled.length < 2) problems.push(`${at}: нужно минимум два варианта.`)
      if (!filled.some((option) => option.correct))
        problems.push(`${at}: отметьте подходящий вариант.`)
      if (filled.some((option) => !option.explanation.trim()))
        problems.push(`${at}: добавьте объяснение к каждому варианту.`)
    }
  })
  return problems
}

export interface LessonRepository {
  list(signal?: AbortSignal): Promise<Lesson[]>
  save(
    id: string | null,
    version: number,
    fields: LessonFields,
  ): Promise<Lesson>
  publish(id: string, version: number): Promise<Lesson>
  unpublish(id: string, version: number): Promise<Lesson>
  move(id: string, direction: -1 | 1): Promise<Lesson[]>
}

const KEY = 'dm-demo-lessons'
const demoSource = 'Демо-содержание — заменить материалами фонда'

function seed(): Lesson[] {
  const lesson = (
    title: string,
    goal: string,
    blocks: NewBlock[],
    status: LessonStatus,
  ): Lesson => ({
    id: demoId('lesson'),
    title,
    goal,
    source: demoSource,
    blocks: blocks.map(
      (block) => ({ ...block, id: demoId('block') }) as LessonBlock,
    ),
    status,
    version: 0,
    changedSincePublish: false,
  })
  return [
    lesson(
      'Знакомство с фондом',
      'Кому помогает фонд и зачем нужны его программы.',
      [
        {
          type: 'TEXT',
          text: 'Фонд «Дети Марии» помогает детям и молодым людям, которые растут вне семьи, и людям с особенностями развития.',
        },
        {
          type: 'CARDS',
          cards: [
            {
              title: 'Творческие мастерские',
              text: 'Рисование, керамика, рукоделие — пространство, где можно пробовать новое.',
            },
            {
              title: 'Сопровождение',
              text: 'Поддержка самостоятельности вместе со специалистами фонда.',
            },
          ],
        },
      ],
      'PUBLISHED',
    ),
    lesson(
      'Как устроено участие',
      'Какие шаги нужны до первой помощи.',
      [
        {
          type: 'ORDER',
          prompt: 'Расставьте шаги по порядку.',
          steps: [
            'Заполнить анкету',
            'Созвониться с координатором',
            'Прийти на пробное занятие',
            'Оформить документы',
            'Выбрать задачу и откликнуться',
          ],
        },
      ],
      'PUBLISHED',
    ),
    lesson(
      'Если планы изменились',
      'Как предупредить о пропуске договорённой встречи.',
      [
        {
          type: 'CHOICE',
          question:
            'Вы договорились прийти на занятие в субботу, но заболели. Что сделаете?',
          options: [
            {
              text: 'Напишу координатору как можно раньше',
              correct: true,
              explanation:
                'Координатор успеет предупредить участников и, если нужно, найти замену.',
            },
            {
              text: 'Ничего не буду писать',
              correct: false,
              explanation:
                'Участники ждут знакомого человека и расстраиваются, если он не приходит без предупреждения.',
            },
          ],
        },
      ],
      'DRAFT',
    ),
  ]
}

const all = () => readDemo<Lesson[]>(KEY, seed)
function find(id: string, version: number) {
  const lesson = all().find((item) => item.id === id)
  if (!lesson) throw new ApiError(404, 'Урок не найден. Обновите список.')
  if (lesson.version !== version)
    throw new ApiError(409, 'Урок уже изменили в другом окне. Обновите список.')
  return lesson
}
function replace(lesson: Lesson) {
  writeDemo(
    KEY,
    all().map((item) => (item.id === lesson.id ? lesson : item)),
  )
  return lesson
}

export const demoLessons: LessonRepository = {
  async list() {
    return all()
  },
  async save(id, version, fields) {
    if (!fields.title.trim()) throw new ApiError(400, 'Назовите урок.')
    if (id === null) {
      const created: Lesson = {
        ...fields,
        id: demoId('lesson'),
        status: 'DRAFT',
        version: 0,
        changedSincePublish: false,
      }
      writeDemo(KEY, [...all(), created])
      return created
    }
    const current = find(id, version)
    return replace({
      ...current,
      ...fields,
      version: version + 1,
      changedSincePublish: current.status === 'PUBLISHED',
    })
  },
  async publish(id, version) {
    const current = find(id, version)
    const problems = lessonProblems(current)
    if (problems.length) throw new ApiError(400, problems[0])
    return replace({
      ...current,
      status: 'PUBLISHED',
      version: version + 1,
      changedSincePublish: false,
    })
  },
  async unpublish(id, version) {
    const current = find(id, version)
    return replace({
      ...current,
      status: 'DRAFT',
      version: version + 1,
      changedSincePublish: false,
    })
  },
  async move(id, direction) {
    const lessons = all()
    const index = lessons.findIndex((item) => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= lessons.length) return lessons
    const next = [...lessons]
    ;[next[index], next[target]] = [next[target], next[index]]
    writeDemo(KEY, next)
    return next
  },
}

export const lessonRepository: LessonRepository = demoLessons
