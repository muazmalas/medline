import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, LoginPage, notificationText } from '../App'

describe('MedLine UI core behavior', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders safe notification text without exposing sensitive fields', () => {
    expect(notificationText({ id: '1', type: 'delivery.completed', data: { message: 'Delivered', pin: '123456' }, read_at: null })).toBe('Delivered')
    expect(notificationText({ id: '2', type: 'order.created', data: { order_id: 'ORD-1', token: 'secret-token' }, read_at: null })).toBe('order_id: ORD-1')
  })

  it('submits the login form and stores the access token', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { token: 'local-token', user: { id: 1, role: 'admin' } } } as never)
    const onAuthenticated = vi.fn()
    render(<LoginPage locale="en" onAuthenticated={onAuthenticated} />)

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'admin@medline.local' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ChangeMe123!' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in to dashboard' }).closest('form')!)

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith({ id: 1, role: 'admin' }))
    expect(post).toHaveBeenCalledWith('/auth/login', expect.objectContaining({ email: 'admin@medline.local', password: 'ChangeMe123!', transport: 'cookie' }))
    expect(localStorage.getItem('medline_token')).toBe('local-token')
  })

  it('switches from sign-in to password recovery mode', () => {
    render(<LoginPage locale="en" onAuthenticated={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('button', { name: 'Send recovery instructions' })).toBeInTheDocument()
    expect(screen.getByText('Recover your password')).toBeInTheDocument()
  })
})
