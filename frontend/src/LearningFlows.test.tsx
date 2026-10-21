import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { CourseWorkspace } from './features/learning/CourseWorkspace'
import { LearningWorkspace } from './features/learning/LearningWorkspace'
import { VolunteerLearningProgress } from './features/learning/VolunteerLearningProgress'
import type {
  AnswerData,
  CourseDraft,
  EnrollmentView,
} from './shared/api/learning'

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
function authorApi(conflict = false, saveFailure?: number) {
  let draft: CourseDraft = {
    id: 'course',
    revision: 0,
    publishedRevision: null,
    publishedVersion: null,
    content: {
      title: 'Новый маршрут',
      description: '',
      audience: 'ALL_VOLUNTEERS',
      demo: false,
      lessons: [],
    },
  }
  const writes: { path: string; body: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/session'))
        return response({
          account: {
            id: 'coordinator',
            email: 'staff@example.org',
            roles: ['COORDINATOR', 'VOLUNTEER'],
          },
        })
      if (path.includes('/coordination/volunteers?'))
        return response({ items: [], total: 0, page: 0, size: 20 })
      if (path.endsWith('/auth/csrf'))
        return response({ headerName: 'X-CSRF-TOKEN', token: 'learning-csrf' })
      if (init?.method) {
        expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe(
          'learning-csrf',
        )
        const body: unknown = init.body
          ? JSON.parse(String(init.body))
          : undefined
        writes.push({ path, body })
        if (path.endsWith('/publish'))
          draft = {
            ...draft,
            publishedRevision: draft.revision,
            publishedVersion: 1,
          }
        else if (path.endsWith('/withdraw'))
          draft = { ...draft, publishedRevision: null, publishedVersion: null }
        else if (init.method === 'PUT') {
          if (saveFailure)
            return response(
              { detail: 'Доступ к маршруту закрыт.' },
              saveFailure,
            )
          if (conflict)
            return response({ detail: 'Черновик уже изменён.' }, 409)
          draft = {
            ...draft,
            revision: draft.revision + 1,
            content: (body as CourseDraft).content,
          }
        }
        return response(draft, path.endsWith('/courses') ? 201 : 200)
      }
      return response(path.endsWith('/courses') ? [] : draft)
    }),
  )
  return writes
}
function learnerApi({
  failure,
  networkOnce,
  completed = false,
}: { failure?: number; networkOnce?: boolean; completed?: boolean } = {}) {
  let view: EnrollmentView = {
    summary: {
      id: 'enrollment',
      courseId: 'course',
      title: 'Знакомство',
      version: 1,
      completedLessons: completed ? 1 : 0,
      totalLessons: 2,
      startedAt: '2026-10-21T12:00:00Z',
      completedAt: null,
    },
    description: 'Демонстрационный маршрут',
    demo: true,
    lessons: [
      {
        id: 'choice',
        title: 'Выберите раздел',
        body: 'Приватный учебный материал',
        type: 'SINGLE_CHOICE',
        options: [
          { id: 'yes', text: 'Моя анкета' },
          { id: 'no', text: 'Регистрация' },
        ],
        available: true,
        completed,
        feedback: completed
          ? {
              correct: true,
              explanation: 'Следующий шаг — рядом с анкетой.',
              optionId: 'yes',
              order: [],
            }
          : null,
      },
      {
        id: 'order',
        title: 'Соберите порядок',
        body: completed ? 'Сначала изменить, затем сохранить.' : '',
        type: 'ORDERING',
        options: completed
          ? [
              { id: 'save', text: 'Сохранить' },
              { id: 'edit', text: 'Изменить' },
            ]
          : [],
        available: completed,
        completed: false,
        feedback: null,
      },
    ],
  }
  const writes: (AnswerData & { requestId: string })[] = []
  let loseResponse = networkOnce
  let getFailure: number | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/auth/csrf'))
        return response({ headerName: 'X-CSRF-TOKEN', token: 'fresh' })
      if (path.endsWith('/learning/courses'))
        return response([
          {
            id: 'course',
            title: 'Знакомство',
            description: 'Демонстрационный маршрут',
            demo: true,
            version: 2,
            totalLessons: 2,
            enrollments: [view.summary],
          },
        ])
      if (path.endsWith('/answers')) {
        expect(new Headers(init?.headers).get('X-CSRF-TOKEN')).toBe('fresh')
        const body = JSON.parse(String(init?.body)) as AnswerData & {
          requestId: string
        }
        writes.push(body)
        if (failure)
          return response({ detail: 'Доступ к материалу закрыт.' }, failure)
        const index = body.lessonId === 'choice' ? 0 : 1
        const correct =
          index === 0
            ? body.optionId === 'yes'
            : body.order.join(',') === 'edit,save'
        // Persist before simulating a lost response: retry must use the same request key.
        view = structuredClone(view)
        view.lessons[index].feedback = {
          correct,
          explanation:
            index === 0
              ? 'Следующий шаг — рядом с анкетой.'
              : 'Сначала изменить, затем сохранить.',
          optionId: body.optionId,
          order: body.order,
        }
        view.lessons[index].completed = correct
        if (index === 0 && correct)
          view.lessons[1] = {
            ...view.lessons[1],
            available: true,
            body: 'Сначала изменить, затем сохранить.',
            options: [
              { id: 'save', text: 'Сохранить' },
              { id: 'edit', text: 'Изменить' },
            ],
          }
        view.summary.completedLessons = view.lessons.filter(
          (item) => item.completed,
        ).length
        if (view.summary.completedLessons === 2)
          view.summary.completedAt = '2026-10-21T12:05:00Z'
        if (loseResponse) {
          loseResponse = false
          throw new TypeError('Lost response')
        }
        return response(view)
      }
      if (path.includes('/enrollments/'))
        return getFailure
          ? response({ detail: 'Доступ к материалу закрыт.' }, getFailure)
          : response(view)
      if (path.endsWith('/learning')) return response([view.summary])
      throw new Error('Unexpected ' + path)
    }),
  )
  return {
    writes,
    revoke: () => {
      getFailure = 403
    },
  }
}

async function continueLearning() {
  fireEvent.click(await screen.findByRole('button', { name: 'Продолжить' }))
  await screen.findByRole('progressbar')
}

describe('course authoring', () => {
  it.each(['save', 'discard'])(
    'protects a draft from app navigation and reload until %s',
    async (action) => {
      authorApi()
      render(<App />)
      fireEvent.click(
        await screen.findByRole('button', { name: 'Учебные маршруты' }),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Создать маршрут' }))
      fireEvent.change(await screen.findByLabelText('Название маршрута'), {
        target: { value: 'Несохранённый маршрут' },
      })
      const navigation = [
        'Кабинет координатора',
        'Учебные маршруты',
        'Возможности помощи',
        'Найти дело',
        'Моя анкета',
        'Моё обучение',
        'Выйти',
      ]
      for (const name of navigation) {
        expect(screen.getByRole('button', { name })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name }))
      }
      expect(screen.getByLabelText('Название маршрута')).toHaveValue(
        'Несохранённый маршрут',
      )
      const unload = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(unload)
      expect(unload.defaultPrevented).toBe(true)
      fireEvent.click(
        screen.getByRole('button', {
          name:
            action === 'save'
              ? 'Сохранить черновик'
              : 'Отменить несохранённые правки',
        }),
      )
      await waitFor(() => {
        for (const name of navigation)
          expect(screen.getByRole('button', { name })).toBeEnabled()
      })
      const safeUnload = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(safeUnload)
      expect(safeUnload.defaultPrevented).toBe(false)
      fireEvent.click(
        screen.getByRole('button', { name: 'Кабинет координатора' }),
      )
      expect(
        screen.queryByLabelText('Название маршрута'),
      ).not.toBeInTheDocument()
    },
  )
  it.each([403, 404])(
    'closes the authoring material after access returns %s',
    async (status) => {
      authorApi(false, status)
      const blocked = vi.fn()
      render(
        <CourseWorkspace
          onSessionExpired={vi.fn()}
          onNavigationBlocked={blocked}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Создать маршрут' }))
      fireEvent.change(await screen.findByLabelText('Название маршрута'), {
        target: { value: 'Приватный черновик' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'Сохранить черновик' }),
      )
      await screen.findByRole('alert')
      expect(
        screen.queryByLabelText('Название маршрута'),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Опубликовать маршрут' }),
      ).not.toBeInTheDocument()
      expect(blocked).toHaveBeenLastCalledWith(false)
      fireEvent.click(screen.getByRole('button', { name: '← К маршрутам' }))
      expect(
        screen.getByRole('button', { name: 'Создать маршрут' }),
      ).toBeEnabled()
    },
  )
  it('allows session expiry to close an unsaved editor and removes the unload guard', async () => {
    authorApi(false, 401)
    render(<App />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Учебные маршруты' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Создать маршрут' }))
    fireEvent.change(await screen.findByLabelText('Название маршрута'), {
      target: { value: 'Приватный черновик' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await screen.findByRole('button', { name: 'Войти' })
    expect(screen.queryByLabelText('Название маршрута')).not.toBeInTheDocument()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
  })
  it('creates a marked demo draft, saves before publishing, keeps publication while editing and withdraws', async () => {
    const writes = authorApi()
    render(<CourseWorkspace onSessionExpired={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Создать маршрут' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Заполнить демопример' }),
    )
    expect(screen.getByLabelText('Демонстрационный материал')).toBeChecked()
    expect(
      screen
        .getAllByLabelText('Тип урока')
        .map((input) => (input as HTMLSelectElement).value),
    ).toEqual(['READ', 'SINGLE_CHOICE', 'ORDERING'])
    expect(
      screen.getByRole('button', { name: 'Опубликовать маршрут' }),
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await screen.findByText('Черновик сохранён.')
    fireEvent.click(
      screen.getByRole('button', { name: 'Опубликовать маршрут' }),
    )
    await screen.findByText('Опубликована версия 1.')
    expect(writes.at(-1)?.body).toEqual({ revision: 1 })
    fireEvent.change(screen.getByLabelText('Название маршрута'), {
      target: { value: 'Новая версия' },
    })
    expect(
      screen.getByRole('button', { name: 'Снять с публикации' }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Отменить несохранённые правки' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Снять с публикации' }))
    await screen.findByText(
      'Маршрут снят с публикации. История прохождений сохранена.',
    )
    expect(writes.at(-1)?.body).toEqual({ publishedVersion: 1 })
  })
  it('preserves a conflicting draft until an explicit reload', async () => {
    authorApi(true)
    render(<CourseWorkspace onSessionExpired={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Создать маршрут' }))
    fireEvent.change(await screen.findByLabelText('Название маршрута'), {
      target: { value: 'Мои правки' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('уже изменён')
    expect(screen.getByLabelText('Название маршрута')).toHaveValue('Мои правки')
    expect(
      screen.getByRole('button', { name: 'Сохранить черновик' }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Загрузить актуальный черновик и заменить локальные правки',
      }),
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Название маршрута')).toHaveValue(
        'Новый маршрут',
      ),
    )
  })
})

describe('learning with saved progress', () => {
  it('continues the original version, explains a wrong choice, accepts correction and keyboard-friendly ordering', async () => {
    const api = learnerApi()
    render(<LearningWorkspace onSessionExpired={vi.fn()} />)
    expect(
      await screen.findByRole('button', { name: 'Начать новую версию' }),
    ).toBeInTheDocument()
    await continueLearning()
    expect(screen.getByText('Версия 1 · Пройдено 0 из 2')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /2. Соберите порядок/ }),
    ).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Регистрация'))
    fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }))
    await screen.findByText('Пока не совсем так. Попробуйте ещё раз.')
    expect(
      screen.getByText('Следующий шаг — рядом с анкетой.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Моя анкета'))
    fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'К следующему шагу' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Шаг 2 выше' }))
    fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }))
    await screen.findByText(
      'Маршрут завершён. Вы можете вернуться к любому уроку.',
    )
    expect(api.writes.at(-1)?.order).toEqual(['edit', 'save'])
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '2')
    fireEvent.click(screen.getByRole('button', { name: '← Все маршруты' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Посмотреть пройденное' }),
    )
    expect(
      await screen.findByText('Версия 1 · Пройдено 2 из 2'),
    ).toBeInTheDocument()
  })
  it('reuses the request id after the server persisted an answer but the response was lost', async () => {
    const api = learnerApi({ networkOnce: true })
    render(<LearningWorkspace onSessionExpired={vi.fn()} />)
    await continueLearning()
    fireEvent.click(screen.getByLabelText('Моя анкета'))
    fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }))
    await screen.findByText('Шаг завершён.')
    expect(api.writes).toHaveLength(2)
    expect(api.writes[1]).toEqual(api.writes[0])
  })
  it('clears previously loaded private materials when a write loses access', async () => {
    learnerApi({ failure: 403 })
    render(<LearningWorkspace onSessionExpired={vi.fn()} />)
    await continueLearning()
    fireEvent.click(screen.getByLabelText('Моя анкета'))
    fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }))
    await screen.findByRole('alert')
    expect(
      screen.queryByText('Приватный учебный материал'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
  it('restores the current step and clears materials after read access is revoked', async () => {
    const api = learnerApi({ completed: true })
    render(<LearningWorkspace onSessionExpired={vi.fn()} />)
    await continueLearning()
    expect(screen.getByRole('button', { name: 'Шаг 2 выше' })).toBeEnabled()
    expect(
      screen.queryByText('Приватный учебный материал'),
    ).not.toBeInTheDocument()
    api.revoke()
    fireEvent.click(screen.getByRole('button', { name: 'Обновить обучение' }))
    await screen.findByRole('alert')
    expect(
      screen.queryByText('Сначала изменить, затем сохранить.'),
    ).not.toBeInTheDocument()
  })
  it('requests sign-in when a session expires during submission', async () => {
    learnerApi({ failure: 401 })
    const expired = vi.fn()
    render(<LearningWorkspace onSessionExpired={expired} />)
    await continueLearning()
    fireEvent.click(screen.getByLabelText('Моя анкета'))
    fireEvent.click(screen.getByRole('button', { name: 'Проверить ответ' }))
    await waitFor(() => expect(expired).toHaveBeenCalledOnce())
    expect(
      screen.queryByText('Приватный учебный материал'),
    ).not.toBeInTheDocument()
  })
  it('shows per-version progress in the coordinator card', async () => {
    learnerApi({ completed: true })
    render(
      <VolunteerLearningProgress
        volunteerId="volunteer"
        onSessionExpired={vi.fn()}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Показать прогресс обучения' }),
    )
    const list = await screen.findByRole('list')
    expect(
      within(list).getByText(/Знакомство · Версия 1 · 1 из 2 · В процессе/),
    ).toBeInTheDocument()
  })
})
