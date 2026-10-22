import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthForm } from './AuthForm'

describe('auth form mode switch', () => {
  it('keeps the password confirmation out of the login form', () => {
    render(<AuthForm onLogin={() => {}} initialVerification={null} />)
    const confirmation = screen.getByLabelText('Повторите пароль')
    expect(confirmation).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Регистрация' }))
    expect(confirmation).toBeEnabled()
    expect(confirmation).toBeRequired()

    fireEvent.click(screen.getByRole('button', { name: 'Вход' }))
    expect(confirmation).toBeDisabled()
  })
})
