import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountPage } from './AccountPage'

const account = { id: 'account-1', email: 'anna@example.org', roles: [] }
const profile = {
  id: 'profile-1',
  displayName: 'Анна',
  phone: '',
  interests: 'Рисование',
  skills: '',
  availability: 'По субботам',
  regularity: 'REGULAR',
  version: 2,
  updatedAt: '2026-10-21T12:00:00Z',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function mockApi({
  hasProfile = true,
  saveStatus = 200,
}: { hasProfile?: boolean; saveStatus?: number } = {}) {
  const saves: Record<string, unknown>[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/notifications/telegram')
        return json({ available: false, linked: false })
      if (url === '/api/v1/auth/csrf')
        return json({ headerName: 'X-CSRF-TOKEN', token: 't' })
      if (url === '/api/v1/onboarding/me')
        return json({
          status: 'NEW',
          message: '',
          nextStep: '',
          nextStepOwner: null,
          nextStepDate: null,
          updatedAt: null,
        })
      if (url === '/api/v1/onboarding/me/clearance')
        return json({
          paperwork: { status: 'NOT_CONFIRMED', message: '', updatedAt: null },
          admissions: [],
        })
      if (url === '/api/v1/volunteers/me' && !init?.method)
        return hasProfile
          ? json(profile)
          : json({ detail: 'Анкета ещё не заполнена.' }, 404)
      if (url === '/api/v1/volunteers/me' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        saves.push(body)
        if (saveStatus === 409)
          return json({ detail: 'Анкета уже изменена в другом окне.' }, 409)
        return json({ ...profile, ...body, version: profile.version + 1 })
      }
      throw new Error('Unexpected request: ' + url)
    }),
  )
  return saves
}

function renderPage(onOpenQuestionnaire = vi.fn()) {
  render(
    <AccountPage
      account={account}
      onOpenQuestionnaire={onOpenQuestionnaire}
      onSessionExpired={vi.fn()}
    />,
  )
  return onOpenQuestionnaire
}

describe('account page', () => {
  it('shows the saved profile with its regularity', async () => {
    mockApi()
    renderPage()
    expect(
      await screen.findByRole('heading', { name: 'Анна' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Рисование')).toBeInTheDocument()
    expect(screen.getAllByText('Регулярное участие')).not.toHaveLength(0)
    expect(screen.getAllByText('Не указано')).toHaveLength(2)
  })

  it('edits one field in place and saves the whole profile with its version', async () => {
    const saves = mockApi()
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Изменить: Что интересно' }),
    )
    fireEvent.change(screen.getByLabelText('Что интересно'), {
      target: { value: 'Керамика' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(
      await screen.findByText('Керамика', { selector: 'dd' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Сохранено')
    expect(saves).toEqual([
      {
        displayName: 'Анна',
        phone: '',
        interests: 'Керамика',
        skills: '',
        availability: 'По субботам',
        regularity: 'REGULAR',
        version: 2,
      },
    ])
  })

  it('cancels an edit with Escape without saving', async () => {
    const saves = mockApi()
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Изменить: Телефон' }),
    )
    const phone = screen.getByLabelText('Телефон')
    fireEvent.change(phone, { target: { value: '+7 900 000-00-00' } })
    fireEvent.keyDown(phone, { key: 'Escape' })
    expect(screen.queryByLabelText('Телефон')).not.toBeInTheDocument()
    expect(saves).toHaveLength(0)
  })

  it('keeps the edit open and offers a reload on conflict', async () => {
    mockApi({ saveStatus: 409 })
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Изменить: Навыки' }),
    )
    fireEvent.change(screen.getByLabelText('Навыки'), {
      target: { value: 'Фотография' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('другом окне')
    expect(screen.getByLabelText('Навыки')).toHaveValue('Фотография')
    expect(
      screen.getByRole('button', { name: 'Загрузить актуальные данные' }),
    ).toBeInTheDocument()
  })

  it('invites to fill the questionnaire when there is no profile yet', async () => {
    mockApi({ hasProfile: false })
    const open = renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Заполнить анкету' }),
    )
    expect(open).toHaveBeenCalledOnce()
    expect(
      screen.getByRole('heading', { name: 'Личный кабинет' }),
    ).toBeInTheDocument()
  })
})
