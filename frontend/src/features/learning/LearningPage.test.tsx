import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadExtras } from '../profile/profileMock'
import { LearningCard } from './LearningCard'
import { LearningPage } from './LearningPage'
import { loadProgress, saveProgress } from './progress'

function renderPage() {
  return render(<LearningPage accountId="acc-1" email="anna@example.org" />)
}

describe('learning page', () => {
  beforeEach(() => window.history.replaceState(null, '', '/learning'))

  it('shows slides first, then questions with explanation and retry', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Начать урок' }))
    expect(
      screen.getByRole('heading', { name: 'Для чего фонду Кодекс?' }),
    ).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(
      screen.getByRole('heading', { name: 'Ради кого мы работаем?' }),
    ).toBeInTheDocument()
    expect(loadProgress('acc-1').values.seenSlides).toBe(2)

    for (let i = 0; i < 9; i++)
      fireEvent.click(screen.getByRole('button', { name: 'Дальше →' }))
    fireEvent.click(screen.getByRole('button', { name: 'К вопросам →' }))
    expect(screen.getByText('Вопрос 1 из 6')).toBeInTheDocument()

    const next = screen.getByRole('button', { name: 'Следующий вопрос →' })
    expect(next).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Командная работа/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Не совсем')
    expect(next).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Конфиденциальность/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Верно!')
    expect(next).toBeEnabled()
    expect(loadProgress('acc-1').values.solved).toEqual(['photo'])
  })

  it('orders steps with buttons and checks the result', () => {
    saveProgress('acc-1', {
      participation: { slide: 4, seenSlides: 5, solved: [], completed: false },
    })
    window.history.replaceState(null, '', '/learning?lesson=participation')
    renderPage()
    const order = () =>
      [...document.querySelectorAll('.quiz-order-label')].map(
        (item) => item.firstChild?.textContent,
      )
    const target = [
      'Заполнить анкету',
      'Координатор знакомится с анкетой',
      'Созвон с координатором',
      'Пробное занятие',
    ]
    for (const [index, label] of target.entries()) {
      while (order().indexOf(label) > index)
        fireEvent.click(
          screen.getByRole('button', { name: `Поднять «${label}» выше` }),
        )
    }
    expect(order()).toEqual(target)
    fireEvent.click(screen.getByRole('button', { name: 'Проверить порядок' }))
    expect(screen.getByRole('status')).toHaveTextContent('Верно!')
    expect(loadProgress('acc-1').participation.solved).toEqual(['order'])
  })

  it('saves a personal choice of directions to the questionnaire', () => {
    saveProgress('acc-1', {
      directions: {
        slide: 7,
        seenSlides: 8,
        solved: ['workshop', 'know-more', 'volga', 'tutor'],
        completed: false,
      },
    })
    window.history.replaceState(null, '', '/learning?lesson=directions')
    renderPage()
    expect(screen.getByText('Вопрос 5 из 5')).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Варианты' })
    fireEvent.click(within(group).getByRole('button', { name: /Творчество/ }))
    fireEvent.click(within(group).getByRole('button', { name: /Пока не знаю/ }))
    expect(
      within(group).getByRole('button', { name: /Творчество/ }),
    ).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(group).getByRole('button', { name: /Инклюзия/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(screen.getByRole('status')).toHaveTextContent('нет правильных')
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить выбор в анкету' }),
    )
    expect(loadExtras('anna@example.org').directions).toEqual(['INCLUSION'])
    fireEvent.click(screen.getByRole('button', { name: 'Завершить урок' }))
    expect(screen.getByText('Урок 3 пройден')).toBeInTheDocument()
    expect(loadProgress('acc-1').directions.completed).toBe(true)
  })

  it('shows progress and the next lesson in the account card', () => {
    saveProgress('acc-1', {
      values: { slide: 0, seenSlides: 11, solved: [], completed: true },
    })
    render(<LearningCard accountId="acc-1" />)
    expect(screen.getByText(/Урок 2 из 3/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Продолжить обучение/ }),
    ).toHaveAttribute('href', '/learning?lesson=participation')
  })
})
