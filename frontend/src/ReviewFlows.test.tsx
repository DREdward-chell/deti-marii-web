import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReviewPanel } from './features/coordination/ReviewPanel'
import { MyNextStep } from './features/onboarding/MyNextStep'
import type { ReviewFields, StaffReview } from './shared/api/onboarding'

const initialFields: ReviewFields = {
  status: 'NEW',
  message: '',
  nextStep: '',
  nextStepOwner: null,
  nextStepDate: null,
  internalNote: '',
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
function mockReviewApi(
  options: { saveFailure?: number; loadFailure?: number } = {},
) {
  let review: StaffReview = {
    current: {
      fields: initialFields,
      version: 0,
      updatedAt: null,
      actorId: null,
      actorEmail: null,
    },
    history: [],
  }
  let loadFailure = options.loadFailure
  const writes: { version: number; fields: ReviewFields }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/auth/csrf')
        return response({ headerName: 'X-CSRF-TOKEN', token: 'review-token' })
      if (url === '/api/v1/onboarding/me') {
        if (loadFailure)
          return response({ detail: 'Сообщение недоступно.' }, loadFailure)
        const { internalNote: _private, ...fields } = review.current.fields
        return response({ ...fields, updatedAt: review.current.updatedAt })
      }
      if (url !== '/api/v1/coordination/volunteers/profile-1/review')
        throw new Error('Unexpected URL ' + url)
      if (init?.method === 'PUT') {
        expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe(
          'review-token',
        )
        const body = JSON.parse(String(init.body)) as {
          version: number
          fields: ReviewFields
        }
        writes.push(body)
        if (options.saveFailure)
          return response(
            { detail: 'Рассмотрение уже изменено.' },
            options.saveFailure,
          )
        const current = {
          fields: body.fields,
          version: review.current.version + 1,
          actorId: 'staff-1',
          actorEmail: 'staff@example.org',
          updatedAt: '2026-10-21T12:00:00Z',
        }
        review = { current, history: [current, ...review.history] }
        return response(review)
      }
      return loadFailure
        ? response(
            { detail: 'Не удалось загрузить рассмотрение.' },
            loadFailure,
          )
        : response(review)
    }),
  )
  return {
    writes,
    recover: () => {
      loadFailure = undefined
    },
  }
}

describe('application review and volunteer next step', () => {
  it('publishes the message and action, keeps the internal note in staff history and saves subsequent revisions', async () => {
    const api = mockReviewApi()
    const staff = render(
      <ReviewPanel volunteerId="profile-1" onSessionExpired={vi.fn()} />,
    )
    fireEvent.change(await screen.findByLabelText('Результат рассмотрения'), {
      target: { value: 'CONTINUE' },
    })
    fireEvent.change(screen.getByLabelText('Сообщение волонтёру'), {
      target: { value: 'Рады познакомиться!' },
    })
    fireEvent.change(screen.getByLabelText(/Следующий шаг/), {
      target: { value: 'Договориться о звонке' },
    })
    fireEvent.change(screen.getByLabelText('Кто делает шаг'), {
      target: { value: 'COORDINATOR' },
    })
    fireEvent.change(screen.getByLabelText(/Дата/), {
      target: { value: '2026-11-03' },
    })
    fireEvent.change(screen.getByLabelText('Внутренняя заметка'), {
      target: { value: 'Только для координатора' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить рассмотрение' }),
    )
    expect(
      await screen.findByText('Рассмотрение сохранено.'),
    ).toBeInTheDocument()
    expect(api.writes[0]).toMatchObject({
      version: 0,
      fields: {
        status: 'CONTINUE',
        nextStepOwner: 'COORDINATOR',
        nextStepDate: '2026-11-03',
      },
    })
    expect(screen.getByText('История изменений (1)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Внутренняя заметка'), {
      target: { value: 'Уточнение для координатора' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить рассмотрение' }),
    )
    expect(await screen.findByText('История изменений (2)')).toBeInTheDocument()
    expect(api.writes[1].version).toBe(1)
    staff.unmount()
    render(<MyNextStep onSessionExpired={vi.fn()} />)
    expect(await screen.findByText('Рады познакомиться!')).toBeInTheDocument()
    expect(screen.getByText('Договориться о звонке')).toBeInTheDocument()
    expect(
      screen.getByText('Этот шаг за координатором · 03.11.2026'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Уточнение для координатора/),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Внутренняя заметка'),
    ).not.toBeInTheDocument()
  })

  it('preserves the draft on conflict until the coordinator explicitly loads the current review', async () => {
    mockReviewApi({ saveFailure: 409 })
    render(<ReviewPanel volunteerId="profile-1" onSessionExpired={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Сообщение волонтёру'), {
      target: { value: 'Моя правка' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить рассмотрение' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('уже изменено')
    expect(screen.getByLabelText('Сообщение волонтёру')).toHaveValue(
      'Моя правка',
    )
    expect(
      screen.getByRole('button', { name: 'Сохранить рассмотрение' }),
    ).toBeDisabled()
    expect(
      screen.queryByText('Рассмотрение сохранено.'),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Загрузить актуальное рассмотрение' }),
    )
    expect(await screen.findByLabelText('Сообщение волонтёру')).toHaveValue('')
  })

  it('clears the responsible person and date when removing the next step', async () => {
    const api = mockReviewApi()
    render(<ReviewPanel volunteerId="profile-1" onSessionExpired={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Сообщение волонтёру'), {
      target: { value: 'На связи' },
    })
    fireEvent.change(screen.getByLabelText(/Следующий шаг/), {
      target: { value: 'Звонок' },
    })
    fireEvent.change(screen.getByLabelText('Кто делает шаг'), {
      target: { value: 'VOLUNTEER' },
    })
    fireEvent.change(screen.getByLabelText(/Дата/), {
      target: { value: '2026-11-03' },
    })
    fireEvent.change(screen.getByLabelText(/Следующий шаг/), {
      target: { value: '' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить рассмотрение' }),
    )
    await screen.findByText('Рассмотрение сохранено.')
    expect(api.writes[0].fields).toMatchObject({
      nextStep: '',
      nextStepOwner: null,
      nextStepDate: null,
    })
  })

  it('does not offer an empty editable review on load failure and supports retry', async () => {
    const api = mockReviewApi({ loadFailure: 500 })
    render(<ReviewPanel volunteerId="profile-1" onSessionExpired={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить',
    )
    expect(
      screen.queryByLabelText('Сообщение волонтёру'),
    ).not.toBeInTheDocument()
    api.recover()
    fireEvent.click(
      screen.getByRole('button', { name: 'Повторить загрузку рассмотрения' }),
    )
    expect(
      await screen.findByLabelText('Сообщение волонтёру'),
    ).toBeInTheDocument()
  })

  it('distinguishes an unavailable volunteer message from an unreviewed application', async () => {
    const api = mockReviewApi({ loadFailure: 500 })
    render(<MyNextStep onSessionExpired={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сообщение недоступно',
    )
    expect(screen.queryByText('Анкета получена')).not.toBeInTheDocument()
    api.recover()
    fireEvent.click(screen.getByRole('button', { name: 'Обновить сообщение' }))
    expect(await screen.findByText('Анкета получена')).toBeInTheDocument()
  })

  it('reports a revoked session without claiming that the review was saved', async () => {
    mockReviewApi({ saveFailure: 401 })
    const expired = vi.fn()
    render(<ReviewPanel volunteerId="profile-1" onSessionExpired={expired} />)
    fireEvent.change(await screen.findByLabelText('Сообщение волонтёру'), {
      target: { value: 'Сообщение' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить рассмотрение' }),
    )
    await waitFor(() => expect(expired).toHaveBeenCalledOnce())
    expect(
      screen.queryByText('Рассмотрение сохранено.'),
    ).not.toBeInTheDocument()
  })
})
