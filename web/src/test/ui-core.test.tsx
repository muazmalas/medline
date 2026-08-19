import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../echo', () => ({ createMedlineEcho: () => ({ private: () => ({ listen: () => undefined }), disconnect: () => undefined }) }))
import RootApp, { AdminSettingsPage, AdminTwoFactorPanel, api, ComplaintDetailPanel, ConsentSettings, Dashboard, DashboardAlerts, DeliveryDetailPanel, LiveDashboard, LoginPage, NotificationHealthPanel, notificationText, OperationsPage, OrderDetailPanel, PartnerAccessGuard, PartnerManagementPanel, PrescriptionReviewPanel, ProcurementCreatePanel, ProcurementDetailPanel, RatingQueue, SettingsPage, UserRolePanel, WebNotifications } from '../App'
import { captureWebError } from '../telemetry'

describe('MedLine UI core behavior', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders safe notification text without exposing sensitive fields', () => {
    expect(notificationText({ id: '1', type: 'delivery.completed', data: { message: 'Delivered', pin: '123456' }, read_at: null })).toBe('Delivered')
    expect(notificationText({ id: '2', type: 'order.created', data: { order_id: 'ORD-1', token: 'secret-token' }, read_at: null })).toBe('order_id: ORD-1')
    expect(notificationText({ id: '3', type: 'system', data: { title: 'System update' }, read_at: null })).toBe('System update')
    expect(notificationText({ id: '4', type: 'system', data: 'Plain update', read_at: null })).toBe('Plain update')
    expect(notificationText({ id: '5', type: 'system', data: null, read_at: null })).toBe('MedLine has a new update.')
    expect(notificationText({ id: '6', type: 'system', data: {}, read_at: null })).toBe('')
    expect(() => captureWebError(new Error('safe test error'), 'ui-test')).not.toThrow()
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

  it('renders the dashboard shell and loads catalog/metric data', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [], metrics: { orders: 12 } } } as never)
    render(<Dashboard role="admin" />)

    expect(screen.getByText('Medicine search')).toBeInTheDocument()
    expect(screen.getByText('Recent activity')).toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/dashboard'))
  })

  it('refreshes the notification inbox when a live notification event arrives', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [] } } as never)
    render(<WebNotifications locale="en" />)
    await waitFor(() => expect(get).toHaveBeenCalledWith('/notifications', expect.anything()))
    const callsBeforeEvent = get.mock.calls.length
    window.dispatchEvent(new CustomEvent('medline:notification'))
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(callsBeforeEvent))
  })

  it('opens the notification inbox and marks an unread item as read', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [{ id: 'notice-1', type: 'order.created', data: { message: 'New order received' }, read_at: null }] } } as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'read' } } as never)
    render(<WebNotifications locale="en" />)
    await waitFor(() => expect(get).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByText('New order received')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/notifications/notice-1/read', {}, expect.anything()))
  })

  it('renders live catalog results and operational metrics', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/medicines') return { data: { data: [{ id: 1, name_en: 'Paracetamol', name_ar: 'باراسيتامول', manufacturer: 'MedLine', prescription_required: false }], suggested_queries: [] } } as never
      if (url === '/admin/dashboard') return { data: { metrics: { orders: 12, active_deliveries: 3, pending_orders: 2, low_stock_items: 1 } } } as never
      return { data: { data: [] } } as never
    })
    render(<LiveDashboard role="admin" locale="en" />)

    await waitFor(() => expect(screen.getByText('Paracetamol')).toBeInTheDocument(), { timeout: 1000 })
    expect(screen.getByText('12 orders in scope')).toBeInTheDocument()
  })

  it('renders administrator alerts and notification delivery health', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/admin/dashboard') return { data: { alerts: [{ key: 'stock', count: 2, severity: 'critical', message: 'Low stock requires review.' }] } } as never
      return { data: { totals: { attempts: 8, by_status: { failed: 1 } }, recent_failures: [{ notification_type: 'delivery.failed', channel: 'email', provider: 'local-log', http_status: 500 }] } } as never
    })
    render(<><DashboardAlerts role="admin" locale="en" /><NotificationHealthPanel role="admin" locale="en" /></>)

    await waitFor(() => expect(screen.getByText('Low stock requires review.')).toBeInTheDocument())
    expect(screen.getByText('delivery.failed')).toBeInTheDocument()
  })

  it('renders operational rows and settings preferences', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/orders') return { data: { data: [{ id: 7, public_id: 'ORD-7', status: 'pending_pharmacy_review', delivery_address_snapshot: 'Damascus' }] } } as never
      if (url === '/notification-preferences') return { data: { preferences: { in_app_enabled: true, push_enabled: true, email_enabled: false, sms_enabled: false } } } as never
      if (url === '/privacy/consents') return { data: { data: [] } } as never
      return { data: { data: [] } } as never
    })
    render(<><OperationsPage section="orders" role="admin" locale="en" /><SettingsPage role="admin" locale="en" onLocaleChange={vi.fn()} /></>)

    await waitFor(() => expect(screen.getByText('ORD-7')).toBeInTheDocument())
    expect(screen.getByText('Delivery preferences')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')[2]).not.toBeChecked()
  })

  it('supports administrator two-factor setup from the settings surface', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { enabled: false } } as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { secret: 'LOCAL-SECRET' } } as never)
    render(<AdminSettingsPage locale="en" onLocaleChange={vi.fn()} />)

    await waitFor(() => expect(get).toHaveBeenCalledWith('/auth/2fa/status'))
    fireEvent.click(screen.getByRole('button', { name: 'Generate setup secret' }))
    await waitFor(() => expect(screen.getByText('Secret: LOCAL-SECRET')).toBeInTheDocument())
    expect(post).toHaveBeenCalledWith('/auth/2fa/setup', {}, expect.anything())
  })

  it('loads consent records and submits a consent choice', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [] } } as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'Saved' } } as never)
    render(<ConsentSettings />)

    await waitFor(() => expect(get).toHaveBeenCalledWith('/privacy/consents'))
    expect(screen.getByText('Consent and policy records')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    await waitFor(() => expect(post).toHaveBeenCalledWith('/privacy/consents', expect.objectContaining({ consented: true }), expect.anything()))
  })

  it('renders the protected order, delivery, complaint, and procurement detail views', () => {
    const { container } = render(<>
      <OrderDetailPanel detail={{ order: { public_id: 'ORD-DETAIL', status: 'accepted', total: 120 }, invoice: { subtotal: 100, delivery_fee: 20, total: 120 }, timeline: [{ id: 1, to_status: 'accepted' }] }} onClose={vi.fn()} locale="en" />
      <DeliveryDetailPanel detail={{ delivery: { id: 4, public_id: 'DEL-DETAIL', status: 'in_transit', order_public_id: 'ORD-DETAIL', delivery_address_snapshot: 'Damascus', total: 120, last_latitude: 33.5, last_longitude: 36.3 }, events: [] }} onClose={vi.fn()} locale="en" />
      <ComplaintDetailPanel detail={{ complaint: { id: 5, subject: 'Missing medicine', status: 'open', category: 'delivery', description: 'A medicine was missing.' }, attachments: [] }} onClose={vi.fn()} locale="en" />
      <ProcurementDetailPanel detail={{ procurement: { public_id: 'PROC-DETAIL', status: 'accepted', total: 400, delivery_address_snapshot: 'Damascus' }, items: [{ id: 1, name_en: 'Paracetamol', quantity: 2, accepted_quantity: 2, line_total: 400 }], delivery: { status: 'available' }, timeline: [] }} onClose={vi.fn()} locale="en" />
    </>)

    expect(container.textContent).toContain('ORD-DETAIL')
    expect(container.textContent).toContain('DEL-DETAIL')
    expect(container.textContent).toContain('Missing medicine')
    expect(container.textContent).toContain('PROC-DETAIL')
  })

  it('renders the ratings moderation queue empty state', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [] } } as never)
    render(<RatingQueue locale="en" />)
    await waitFor(() => expect(screen.getByText('No ratings available.')).toBeInTheDocument())
  })

  it('executes role-specific operational actions with safe mutation requests', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [{ id: 1, business_name: 'Test record', status: 'pending', approval_status: 'pending' }] } } as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'ok' } } as never)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { message: 'ok' } } as never)

    render(<OperationsPage section="verification" role="admin" locale="en" />)
    await waitFor(() => expect(screen.getByText('Test record')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/partners/1/decision', { decision: 'approve' }, expect.anything()))
    cleanup()
    get.mockResolvedValue({ data: { data: [{ id: 2, public_id: 'COMPLAINT-2', subject: 'Complaint', status: 'open' }] } } as never)
    render(<OperationsPage section="complaints" role="admin" locale="en" />)
    await waitFor(() => expect(screen.getByText('COMPLAINT-2')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/complaints/2', { status: 'in_review' }, expect.anything()))
    cleanup()
    get.mockResolvedValue({ data: { data: [{ id: 3, name: 'Suspended user', status: 'suspended' }] } } as never)
    render(<OperationsPage section="users" role="admin" locale="en" />)
    await waitFor(() => expect(screen.getByText('Suspended user')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/admin/users/3/status', expect.objectContaining({ status: 'active' }), expect.anything()))
    cleanup()
    get.mockResolvedValue({ data: { data: [{ id: 4, public_id: 'DEL-4', status: 'failed' }] } } as never)
    render(<OperationsPage section="deliveries" role="admin" locale="en" />)
    await waitFor(() => expect(screen.getByText('DEL-4')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Reassign' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/deliveries/4/reassign', expect.anything(), expect.anything()))
  })

  it('mounts the authenticated administrator workspace and its live panels', async () => {
    localStorage.setItem('medline_token', 'test-token')
    localStorage.setItem('medline_user', JSON.stringify({ id: 1, role: 'admin', locale: 'en' }))
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/auth/me') return { data: { user: { id: 1, role: 'admin', locale: 'en' } } } as never
      if (url === '/admin/dashboard') return { data: { metrics: { orders: 14, active_deliveries: 3, pending_partners: 2 }, alerts: [] } } as never
      if (url === '/admin/notification-delivery-health') return { data: { totals: { attempts: 2, by_status: {} }, recent_failures: [] } } as never
      return { data: { data: [], preferences: {}, user: { id: 1, role: 'admin' } } } as never
    })
    render(<RootApp />)

    await waitFor(() => expect(screen.getByText('Healthcare logistics')).toBeInTheDocument())
    expect(screen.getAllByText('Live data').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('covers partner, user, procurement, and prescription administration workflows', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/admin/partners') return { data: { data: [{ id: 11, business_name: 'Demo Pharmacy', type: 'pharmacy', approval_status: 'pending' }] } } as never
      if (url === '/admin/users') return { data: { data: [{ id: 12, name: 'Demo User', role: 'patient', email: 'demo@example.test' }] } } as never
      if (url === '/partners') return { data: { data: [{ id: 13, business_name: 'Demo Warehouse' }] } } as never
      if (url === '/medicines') return { data: { data: [{ id: 14, name_en: 'Paracetamol', manufacturer: 'MedLine' }] } } as never
      if (url === '/pharmacy/prescriptions') return { data: { data: [{ id: 15, order_public_id: 'ORD-RX-15', status: 'pending_review' }] } } as never
      return { data: { data: [] } } as never
    })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'ok' } } as never)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { message: 'ok' } } as never)

    render(<PartnerManagementPanel section="partners" />)
    await waitFor(() => expect(screen.getByText('Demo Pharmacy')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Correction' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/partners/11/decision', expect.objectContaining({ decision: 'correction' }), expect.anything()))
    cleanup()

    render(<UserRolePanel section="users" />)
    await waitFor(() => expect(screen.getByText('Demo User')).toBeInTheDocument())
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'driver' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save role' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/admin/users/12/role', expect.objectContaining({ role: 'driver' }), expect.anything()))
    cleanup()

    render(<ProcurementCreatePanel section="procurement" />)
    await waitFor(() => expect(screen.getByText('Request warehouse stock')).toBeInTheDocument())
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: '13' } })
    fireEvent.change(selects[1], { target: { value: '14' } })
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '3' } })
    fireEvent.change(screen.getByPlaceholderText('Delivery address'), { target: { value: 'University Gate' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create procurement' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/procurement', expect.objectContaining({ warehouse_id: 13, items: [{ medicine_id: 14, quantity: 3 }] }), expect.anything()))
    cleanup()

    render(<PrescriptionReviewPanel section="orders" />)
    await waitFor(() => expect(screen.getByText('ORD-RX-15')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/pharmacy/prescriptions/15/review', { decision: 'approve' }, expect.anything()))
    expect(get).toHaveBeenCalledWith('/pharmacy/prescriptions', expect.anything())
  })

  it('handles subscription guard and consent save failures safely', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'))
    const onOpen = vi.fn()
    render(<PartnerAccessGuard onOpen={onOpen} />)
    await waitFor(() => expect(screen.getByText('Subscription status unavailable')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Open subscription' }))
    expect(onOpen).toHaveBeenCalled()
    cleanup()

    get.mockResolvedValue({ data: { data: [] } } as never)
    vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'))
    render(<ConsentSettings />)
    await waitFor(() => expect(screen.getByText('Consent and policy records')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    await waitFor(() => expect(screen.getByText('Unable to save this privacy choice.')).toBeInTheDocument())
  })

  it('completes administrator two-factor setup, confirmation, and disable flows', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { enabled: false } } as never)
    const post = vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ data: { secret: 'TWO-FACTOR-SECRET' } } as never)
      .mockResolvedValueOnce({ data: { message: 'enabled' } } as never)
      .mockResolvedValueOnce({ data: { message: 'disabled' } } as never)
    render(<AdminTwoFactorPanel locale="en" />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate setup secret' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Generate setup secret' }))
    await waitFor(() => expect(screen.getByText('Secret: TWO-FACTOR-SECRET')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('6-digit authenticator code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 2FA' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disable 2FA' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('6-digit authenticator code'), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: 'Disable 2FA' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(3))
  })

  it('shows authentication and dashboard recovery states when requests fail', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'))
    render(<LoginPage locale="en" onAuthenticated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'admin@medline.local' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'bad-password' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in to dashboard' }).closest('form')!)
    await waitFor(() => expect(screen.getByText('Unable to sign in.')).toBeInTheDocument())
    cleanup()

    vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'))
    render(<Dashboard role="admin" />)
    await waitFor(() => expect(screen.getByText('No medicines found.')).toBeInTheDocument())
  })
})
