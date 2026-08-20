import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../echo', () => ({ createMedlineEcho: () => ({ private: () => ({ listen: () => undefined }), disconnect: () => undefined }) }))
import RootApp, { AccountMenu, AdminSettingsPage, AdminSubscriptionReviewPage, api, ComplaintDetailPanel, ConsentSettings, Dashboard, DashboardAlerts, DeliveryDetailPanel, formatMedlineDate, formatMedlineMoney, humanizeNotificationType, LiveDashboard, LoginPage, MedicineDetailPage, NotificationHealthPanel, notificationText, OperationsPage, OrderDetailPanel, PartnerAccessGuard, PartnerManagementPanel, PrescriptionReviewPanel, ProcurementCreatePanel, ProcurementDetailPanel, ProfilePage, RatingQueue, SettingsPage, UserRolePanelWithCompany, WebNotifications } from '../App'
import { captureWebError } from '../telemetry'

describe('MedLine UI core behavior', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders safe notification text without exposing sensitive fields', () => {
    expect(notificationText({ id: '1', type: 'delivery.completed', data: { message: 'Delivered', pin: '123456' }, read_at: null })).toBe('Delivered')
    expect(notificationText({ id: '2', type: 'order.created', data: { order_id: 'ORD-1', token: 'secret-token' }, read_at: null })).toBe('order id: ORD-1')
    expect(notificationText({ id: '3', type: 'system', data: { title: 'System update' }, read_at: null })).toBe('System update')
    expect(notificationText({ id: '4', type: 'system', data: 'Plain update', read_at: null })).toBe('Plain update')
    expect(notificationText({ id: '5', type: 'system', data: null, read_at: null })).toBe('MedLine has a new update.')
    expect(notificationText({ id: '6', type: 'system', data: {}, read_at: null })).toBe('')
    expect(humanizeNotificationType('order.created_patient')).toBe('Order Created Patient')
    expect(() => captureWebError(new Error('safe test error'), 'ui-test')).not.toThrow()
    expect(formatMedlineDate('2026-08-19T17:49:02Z')).toContain('19 Aug 2026')
    expect(formatMedlineMoney(2500)).toContain('SYP')
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
    expect(screen.getByText('Order Created')).toBeInTheDocument()
    expect(screen.queryByText('order.created')).not.toBeInTheDocument()
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
    expect(screen.getByText('Delivery Failed')).toBeInTheDocument()
  })

  it('renders operational rows and settings preferences', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/orders') return { data: { data: [{ id: 7, public_id: 'ORD-7', status: 'pending_pharmacy_review', delivery_address_snapshot: 'Damascus' }] } } as never
      if (url === '/notification-preferences') return { data: { preferences: { in_app_enabled: true, push_enabled: true, email_enabled: false, sms_enabled: false } } } as never
      if (url === '/privacy/consents') return { data: { data: [] } } as never
      return { data: { data: [] } } as never
    })
    render(<><OperationsPage section="orders" role="admin" locale="en" /><SettingsPage role="admin" locale="en" onLocaleChange={vi.fn()} /></>)

    await waitFor(() => expect(screen.getByText('ORD-7')).toBeInTheDocument())
    expect(screen.getByRole('table', { name: 'Orders overview' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Created/i })).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByLabelText('Filter orders by status')).toHaveValue('')
    expect(screen.getByLabelText('Rows per page')).toHaveValue('10')
    expect(screen.getByRole('button', { name: 'ORD-7' })).toHaveAttribute('title', 'Open order ORD-7')
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '25' } })
    await waitFor(() => expect(get).toHaveBeenCalledWith('/orders', { params: expect.objectContaining({ page: 1, per_page: 25 }) }))
    expect(screen.getByText('Delivery preferences')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')[2]).not.toBeChecked()
  })

  it('opens order details from the entire table row with pointer or keyboard', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/orders/7') return { data: { order: { id: 7, public_id: 'ORD-7', status: 'pending_pharmacy_review', items: [] }, invoice: {}, delivery: {}, timeline: [] } } as never
      return { data: { data: [{ id: 7, public_id: 'ORD-7', customer_name: 'Demo Patient', status: 'pending_pharmacy_review', delivery_address_snapshot: 'Damascus' }], last_page: 1 } } as never
    })

    render(<OperationsPage section="orders" role="admin" locale="en" />)

    const row = await screen.findByRole('row', { name: 'Open order ORD-7' })
    fireEvent.click(screen.getByText('Demo Patient'))
    await waitFor(() => expect(get).toHaveBeenCalledWith('/orders/7'))

    cleanup()
    render(<OperationsPage section="orders" role="admin" locale="en" />)
    const keyboardRow = await screen.findByRole('row', { name: 'Open order ORD-7' })
    fireEvent.keyDown(keyboardRow, { key: 'Enter' })
    await waitFor(() => expect(get.mock.calls.filter(([url]) => url === '/orders/7')).toHaveLength(2))
    expect(row).toHaveAttribute('tabindex', '0')
  })

  it('keeps the pharmacy orders page focused on the order list', async () => {
    localStorage.setItem('medline_user', JSON.stringify({ id: 41, role: 'pharmacy' }))
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [{ id: 81, public_id: 'ORD-RX-81', status: 'prescription_review', medicine_names: 'RX One', created_at: '2026-08-20T12:00:00Z' }], last_page: 1 } } as never)

    render(<OperationsPage section="orders" role="pharmacy" locale="en" />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'ORD-RX-81' })).toBeInTheDocument())
    expect(screen.queryByText('Item-specific prescriptions')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View order ORD-RX-81' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('keeps patient order creation on its own route', async () => {
    window.history.replaceState({}, '', '/orders')
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [], last_page: 1 } } as never)

    render(<OperationsPage section="orders" role="patient" locale="en" />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create new order' })).toBeInTheDocument())
    expect(screen.queryByText('Build a multi-medicine order')).not.toBeInTheDocument()
    expect(screen.queryByText('Live data')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Create new order' }))
    expect(window.location.pathname).toBe('/orders/new')
  })

  it('reviews each prescription and supports partial approval inside order details', async () => {
    localStorage.setItem('medline_user', JSON.stringify({ id: 42, role: 'pharmacy' }))
    const detail = { order: { id: 82, public_id: 'ORD-RX-82', status: 'prescription_review', subtotal: 3000, total: 3000, items: [{ id: 821, medicine_id: 1, name_en: 'Pending RX', dosage: '500mg', quantity: 1, accepted_quantity: 0, unit_price: 1000, prescription_required_snapshot: true, prescription: { id: 901, status: 'pending_review' } }, { id: 822, medicine_id: 2, name_en: 'Approved RX', dosage: '200mg', quantity: 1, accepted_quantity: 0, unit_price: 2000, prescription_required_snapshot: true, prescription: { id: 902, status: 'approved' } }] }, invoice: { subtotal: 3000, total: 3000 }, delivery: {}, timeline: [] }
    vi.spyOn(api, 'get').mockResolvedValue({ data: detail } as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'Saved.' } } as never)

    render(<OrderDetailPanel detail={detail} onClose={vi.fn()} locale="en" />)

    expect(screen.getAllByRole('button', { name: 'View document' })).toHaveLength(2)
    expect(screen.getByLabelText('Quantity to fulfil for Pending RX')).toBeDisabled()
    expect(screen.getByLabelText('Quantity to fulfil for Approved RX')).toHaveValue(1)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/pharmacy/prescriptions/901/review', { decision: 'approve' }, expect.anything()))
    fireEvent.click(screen.getByRole('button', { name: 'Approve partially' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/partner/orders/82/decision', expect.objectContaining({ decision: 'partial', items: [{ id: 821, accepted_quantity: 0 }, { id: 822, accepted_quantity: 1 }] }), expect.anything()))
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
      <OrderDetailPanel detail={{ order: { public_id: 'ORD-DETAIL', status: 'accepted', total: 120 }, delivery: { status: 'in_transit', driver: { name: 'Demo Driver', email: 'driver@medline.local', vehicle_type: 'Motorcycle', vehicle_plate: 'ML-2026', is_available: true } }, invoice: { subtotal: 100, delivery_fee: 20, total: 120 }, timeline: [{ id: 1, to_status: 'accepted', created_at: '2026-08-19T12:00:00Z' }] }} onClose={vi.fn()} locale="en" />
      <DeliveryDetailPanel detail={{ delivery: { id: 4, public_id: 'DEL-DETAIL', status: 'in_transit', order_public_id: 'ORD-DETAIL', delivery_address_snapshot: 'Damascus', total: 120, last_latitude: 33.5, last_longitude: 36.3 }, events: [] }} onClose={vi.fn()} locale="en" />
      <ComplaintDetailPanel detail={{ complaint: { id: 5, subject: 'Missing medicine', status: 'open', category: 'delivery', description: 'A medicine was missing.' }, attachments: [] }} onClose={vi.fn()} locale="en" />
      <ProcurementDetailPanel detail={{ procurement: { public_id: 'PROC-DETAIL', status: 'accepted', total: 400, delivery_address_snapshot: 'Damascus' }, items: [{ id: 1, name_en: 'Paracetamol', quantity: 2, accepted_quantity: 2, line_total: 400 }], delivery: { status: 'available' }, timeline: [] }} onClose={vi.fn()} locale="en" />
    </>)

    expect(container.textContent).toContain('ORD-DETAIL')
    expect(container.textContent).toContain('Demo Driver')
    expect(container.textContent).toContain('Delivery progress')
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
      if (url === '/admin/users') return { data: { data: [{ id: 12, name: 'Demo User', role: 'pharmacy', email: 'demo@example.test', company_name: 'Demo Pharmacy Group' }, { id: 16, name: 'Demo Driver', role: 'driver', email: 'driver@example.test' }, { id: 17, name: 'Demo Support', role: 'support', email: 'support@example.test' }, { id: 18, name: 'Demo Patient', role: 'patient', email: 'patient@example.test' }] } } as never
      if (url === '/partners') return { data: { data: [{ id: 13, business_name: 'Demo Warehouse' }] } } as never
      if (url === '/medicines') return { data: { data: [{ id: 14, name_en: 'Paracetamol', manufacturer: 'MedLine' }] } } as never
      if (url === '/pharmacy/prescriptions') return { data: { data: [{ id: 15, order_public_id: 'ORD-RX-15', status: 'pending_review' }] } } as never
      return { data: { data: [] } } as never
    })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'ok' } } as never)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { message: 'ok' } } as never)

    render(<PartnerManagementPanel section="pharmacies" />)
    await waitFor(() => expect(screen.getByText('Demo Pharmacy')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Search pharmacies'), { target: { value: 'Central' } })
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/partners', { params: { type: 'pharmacy', search: 'Central', per_page: 100 } }))
    fireEvent.click(screen.getByRole('button', { name: 'Correction' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/partners/11/decision', expect.objectContaining({ decision: 'correction' }), expect.anything()))
    cleanup()

    render(<UserRolePanelWithCompany section="users" />)
    await waitFor(() => expect(screen.getByText('Demo User')).toBeInTheDocument())
    expect(screen.getByText('Demo Pharmacy Group')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'pharmacy' } })
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/users', { params: { per_page: 100, search: 'pharmacy' } }))
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'driver' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save role' })[0])
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
    await waitFor(() => expect(screen.getByText(/ORD-RX-15/)).toBeInTheDocument())
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

  it('keeps an active partner on the current page while restoring a refreshed session', async () => {
    localStorage.setItem('medline_token', 'active-partner-token')
    localStorage.setItem('medline_user', JSON.stringify({ id: 31, role: 'pharmacy' }))
    window.history.replaceState({}, '', '/orders')
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/auth/me') return { data: { user: { id: 31, role: 'pharmacy' } } } as never
      if (url === '/subscription') return { data: { access_active: true, active_subscription: { status: 'active', starts_at: '2026-08-01', ends_at: '2027-08-01' } } } as never
      if (url === '/partner/orders') return { data: { data: [] } } as never
      return { data: { data: [] } } as never
    })

    render(<RootApp />)

    await waitFor(() => expect(screen.queryByText('Restoring your secure MedLine session...')).not.toBeInTheDocument())
    expect(window.location.pathname).toBe('/orders')
    expect(screen.getByRole('table', { name: 'Orders overview' })).toBeInTheDocument()
  })

  it('opens the account menu and supports profile and password updates', async () => {
    const onProfile = vi.fn()
    const onLogout = vi.fn()
    const onUpdated = vi.fn()
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { message: 'Profile updated.', user: { id: 8, name: 'Maya Ali', email: 'maya@example.test', phone: '+963900222333' } } } as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'Password changed.' } } as never)

    render(<AccountMenu user={{ name: 'Maya Ali', email: 'maya@example.test' }} onProfile={onProfile} onLogout={onLogout} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open user menu' }))
    expect(screen.getByText('maya@example.test')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profile' }))
    expect(onProfile).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open user menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onLogout).toHaveBeenCalled()
    cleanup()

    render(<ProfilePage user={{ id: 8, name: 'Maya Ali', email: 'maya@example.test', phone: '+963900000000' }} onUpdated={onUpdated} />)
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+963900222333' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/profile', expect.objectContaining({ phone: '+963900222333' }), expect.anything()))
    expect(onUpdated).toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'OldPassword123!' } })
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'NewPassword456!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPassword456!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/profile/password', expect.objectContaining({ current_password: 'OldPassword123!', password: 'NewPassword456!' }), expect.anything()))
  })

  it('renders medicine safety details and pharmacy availability', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { medicine: { id: 21, name_en: 'Amoxicillin', name_ar: 'أموكسيسيلين', active_ingredient: 'Amoxicillin trihydrate', dosage: '500mg', form: 'Capsule', administration_route: 'Oral', pack_size: '20 capsules', manufacturer: 'MedLine Labs', description: 'Prescription antibiotic information.', indications: 'For diagnosed bacterial infections.', side_effects: 'Nausea or rash may occur.', warnings: 'Seek help for a severe allergic reaction.', prescription_required: true, is_active: true, available_at: [{ id: 4, business_name: 'Central Pharmacy', address: 'Medical Street', available_quantity: 7, unit_price: 1800 }] } } } as never)

    render(<MedicineDetailPage medicineId={21} onBack={vi.fn()} locale="en" />)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Amoxicillin', level: 1 })).toBeInTheDocument())
    expect(screen.getByText('Amoxicillin trihydrate')).toBeInTheDocument()
    expect(screen.getByText('Nausea or rash may occur.')).toBeInTheDocument()
    expect(screen.getByText('Central Pharmacy')).toBeInTheDocument()
    expect(screen.getByText('Prescription required')).toBeInTheDocument()
  })

  it('shows every partial-order line and waits for patient approval before delivery', async () => {
    localStorage.setItem('medline_user', JSON.stringify({ id: 9, role: 'patient' }))
    const detail = { order: { id: 70, public_id: 'ORD-PARTIAL-70', status: 'partial_approval_required', subtotal: 2000, total: 2000, partial_offer_note: 'One medicine is unavailable.', items: [{ id: 701, medicine_id: 1, name_en: 'Included medicine', quantity: 2, accepted_quantity: 2, unit_price: 1000, requested_line_total: 2000, accepted_line_total: 2000, prescription_required_snapshot: false }, { id: 702, medicine_id: 2, name_en: 'Excluded medicine', quantity: 1, accepted_quantity: 0, unit_price: 500, requested_line_total: 500, accepted_line_total: 0, prescription_required_snapshot: false }] }, invoice: { requested_subtotal: 2500, accepted_subtotal: 2000, subtotal: 2000, delivery_fee: 0, total: 2000 }, delivery: {}, timeline: [] }
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'Partial order approved and sent to delivery.' } } as never)
    vi.spyOn(api, 'get').mockResolvedValue({ data: detail } as never)

    render(<OrderDetailPanel detail={detail} onClose={vi.fn()} locale="en" />)

    expect(screen.getByText('Included medicine')).toBeInTheDocument()
    expect(screen.getByText('Excluded medicine')).toBeInTheDocument()
    expect(screen.getByText('Not included')).toBeInTheDocument()
    expect(screen.getByText(/Delivery starts only if you approve/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve partial order' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/70/partial-offer/decision', { decision: 'approve' }, expect.anything()))
  })

  it('requires an administrator comment before requesting a payment correction', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [{ id: 44, business_name: 'Central Pharmacy', type: 'pharmacy', origin: 'registration', status: 'payment_under_review', amount: 12000, duration_months: 12, plan_code: 'annual_pharmacy', payment_proof_id: 55, created_at: '2026-08-20T10:00:00Z' }], last_page: 1 } } as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'Payment decision saved.' } } as never)

    render(<AdminSubscriptionReviewPage locale="en" />)

    await waitFor(() => expect(screen.getByText('Central Pharmacy')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Request correction' }))
    expect(screen.getByText('Add a clear correction comment before requesting changes.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Review comment'), { target: { value: 'Upload a clearer receipt.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request correction' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/subscriptions/44/decision', { decision: 'correction', note: 'Upload a clearer receipt.' }, expect.anything()))
  })

  it('completes administrator two-factor setup, confirmation, and disable flows', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { enabled: false } } as never)
    const post = vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ data: { secret: 'TWO-FACTOR-SECRET' } } as never)
      .mockResolvedValueOnce({ data: { message: 'enabled' } } as never)
      .mockResolvedValueOnce({ data: { message: 'disabled' } } as never)
    render(<AdminSettingsPage locale="en" onLocaleChange={vi.fn()} />)

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
