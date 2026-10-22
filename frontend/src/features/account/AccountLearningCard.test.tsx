import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import {
  AccountLearningCard,
  type AccountLearning,
} from './AccountLearningCard'

const granted: AccountLearning = {
  access: 'granted',
  title: 'Знакомство с фондом',
  completedLessons: 1,
  totalLessons: 3,
  nextLesson: 'Как устроено участие',
  href: '/learning',
}

it('shows only explicitly granted learning and removes it when admission is withdrawn', () => {
  const view = render(<AccountLearningCard />)
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  view.rerender(<AccountLearningCard learning={{ access: 'restricted' }} />)
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  view.rerender(<AccountLearningCard learning={granted} />)
  expect(
    screen.getByRole('link', { name: 'Продолжить обучение' }),
  ).toHaveAttribute('href', '/learning')
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '1')
  view.rerender(<AccountLearningCard learning={{ access: 'restricted' }} />)
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
})

it('does not offer a broken start action for a course without published lessons', () => {
  render(<AccountLearningCard learning={{ ...granted, totalLessons: 0 }} />)
  expect(
    screen.getByText('Команда готовит материалы. Они появятся здесь.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
