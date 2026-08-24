import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as L from 'leaflet'
vi.mock('../echo', () => ({ createMedlineEcho: () => ({ private: () => ({ listen: () => undefined }), disconnect: () => undefined }) }))
import RootApp, { AccountMenu, AdminDeliveryPricingPanel, AdminReviewHub, AdminSettingsPage, AdminSubscriptionReviewPage, api, calculateDeliveryEstimate, ComplaintDetailPanel, ConsentSettings, Dashboard, DashboardAlerts, DELIVERY_FEE_PER_KM_SYP, deliveryRoutePoints, DeliveryDetailPanel, formatMedlineDate, formatMedlineMoney, humanizeNotificationType, LiveDashboard, LoginPage, MedicineAdminPage, MedicineCreateAdminPage, MedicineDetailPage, NotificationHealthPanel, NotificationsPage, notificationText, openMedicineDetail, OperationsPage, OrderDetailPanel, PartnerAccessGuard, PartnerManagementPanel, PatientOrderCreatePanel, PharmacyWorkingHoursPanel, PrescriptionReviewPanel, ProcurementCreatePanel, ProcurementDetailPanel, ProfilePage, RatingQueue, roleCanAccessSection, SettingsPage, UserRolePanelWithCompany, WebNotifications } from '../App'
import { captureWebError } from '../telemetry'

describe('MedLine UI core behavior', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
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
    expect(DELIVERY_FEE_PER_KM_SYP).toBe(100)
    expect(calculateDeliveryEstimate(0, 0, 0, 1, DELIVERY_FEE_PER_KM_SYP, 111.19)).toEqual({ distanceKm: 111.19, feeSyp: 11119 })
    expect(calculateDeliveryEstimate(Number.NaN, 0, 0, 1)).toBeNull()
    expect(deliveryRoutePoints({ latitude: 33.51, longitude: 36.27 }, { latitude: 33.53, longitude: 36.31 })).toEqual([[33.51, 36.27], [33.53, 36.31]])
    expect(deliveryRoutePoints({ latitude: 'missing', longitude: 36.27 }, { latitude: 33.53, longitude: 36.31 })).toBeNull()
  })

  it('blocks driver navigation to inventory and administrator workspaces', () => {
    expect(roleCanAccessSection('driver', 'deliveries')).toBe(true)
    expect(roleCanAccessSection('driver', 'settings')).toBe(true)
    expect(roleCanAccessSection('driver', 'inventory')).toBe(false)
    expect(roleCanAccessSection('driver', 'users')).toBe(false)
    expect(roleCanAccessSection('admin', 'inventory')).toBe(true)
  })

  it('opens medicine details in a separate secure browser tab', () => {
    const openedWindow = { opener: window } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(openedWindow)

    openMedicineDetail(44)

    expect(open).toHaveBeenCalledWith('/medicines/44', '_blank', 'noopener,noreferrer')
    expect(openedWindow.opener).toBeNull()
  })

  it('submits the login form and stores the access token', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { token: 'local-token', user: { id: 1, role: 'admin' } } } as never)
    const onAuthenticated = vi.fn()
    render(<LoginPage locale="en" onLocaleChange={vi.fn()} onAuthenticated={onAuthenticated} />)

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'admin@medline.local' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ChangeMe123!' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in to dashboard' }).closest('form')!)

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith({ id: 1, role: 'admin' }))
    expect(post).toHaveBeenCalledWith('/auth/login', expect.objectContaining({ email: 'admin@medline.local', password: 'ChangeMe123!', transport: 'cookie' }))
    expect(localStorage.getItem('medline_token')).toBe('local-token')
  })

  it('switches from sign-in to password recovery mode', () => {
    render(<LoginPage locale="en" onLocaleChange={vi.fn()} onAuthenticated={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('button', { name: 'Send recovery instructions' })).toBeInTheDocument()
    expect(screen.getByText('Recover your password')).toBeInTheDocument()
  })

  it('persists the login language and exposes the matching RTL interface', () => {
    const onLocaleChange = vi.fn()
    const { rerender } = render(<LoginPage locale="en" onLocaleChange={onLocaleChange} onAuthenticated={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Arabic' }))

    expect(onLocaleChange).toHaveBeenCalledWith('ar')
    expect(localStorage.getItem('medline_locale')).toBe('ar')
    expect(localStorage.getItem('medline_locale_explicit')).toBe('true')
    expect(document.documentElement).toHaveAttribute('lang', 'ar')
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')

    rerender(<LoginPage locale="ar" onLocaleChange={onLocaleChange} onAuthenticated={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'مرحباً بعودتك' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'التبديل إلى الإنجليزية' })).toHaveTextContent('English')
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
    const bell = screen.getByRole('button', { name: 'Notifications' })
    await waitFor(() => expect(bell).toHaveClass('has-unread'))
    expect(within(bell).getByText('1')).toBeInTheDocument()
    expect(within(bell).getByText('1 unread notification')).toHaveClass('sr-only')
    fireEvent.click(bell)
    expect(screen.getByText('Order Created')).toBeInTheDocument()
    expect(screen.queryByText('order.created')).not.toBeInTheDocument()
    expect(screen.getByText('New order received')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/notifications/notice-1/read', {}, expect.anything()))
  })

  it('closes the notification inbox when focus moves outside the popover', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [{ id: 'notice-2', type: 'system.update', data: { message: 'Outside click test' }, read_at: null }] } } as never)
    render(<WebNotifications locale="en" />)

    const bell = screen.getByRole('button', { name: 'Notifications' })
    await waitFor(() => expect(bell).toHaveClass('has-unread'))
    fireEvent.click(bell)
    expect(screen.getByText('Outside click test')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByText('Outside click test')).not.toBeInTheDocument()
    expect(bell).toHaveAttribute('aria-expanded', 'false')
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

  it('lets a warehouse stock only an existing catalog medicine without an item approval step', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/medicines') return { data: { data: [{ id: 73, name_en: 'Amoxicillin 500mg', name_ar: 'Amoxicillin', dosage: '500mg', manufacturer: 'MedLine Labs', is_active: true }] } } as never
      if (url === '/partner/inventory') return { data: { data: [], total: 0, last_page: 1 } } as never
      return { data: { data: [] } } as never
    })
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { inventory: { id: 9 } } } as never)

    render(<OperationsPage section="inventory" role="warehouse" locale="en" />)

    const medicineSearch = screen.getByRole('combobox', { name: 'Search medicine catalog' })
    fireEvent.focus(medicineSearch)
    const medicineOption = await screen.findByRole('option', { name: /Amoxicillin 500mg/ })
    fireEvent.pointerDown(medicineOption)
    fireEvent.click(medicineOption)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Batch quantity' }), { target: { value: '120' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Warehouse unit price' }), { target: { value: '1850' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Low-stock level' }), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Batch or lot number'), { target: { value: 'LOT-AMOX-26' } })
    fireEvent.change(screen.getByLabelText('Expiry date'), { target: { value: '2027-12-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save stock' }))

    await waitFor(() => expect(put).toHaveBeenCalledWith('/partner/inventory', expect.objectContaining({ medicine_id: 73, quantity: 120, unit_price: 1850, low_stock_threshold: 15, batch_number: 'LOT-AMOX-26', expires_at: '2027-12-31' }), expect.anything()))
    expect(await screen.findByText(/separate warehouse stock record/)).toHaveAttribute('role', 'status')
    expect(get).toHaveBeenCalledWith('/medicines', { params: expect.objectContaining({ per_page: 50 }) })
  })

  it('lets a warehouse hide and restore one stocked medicine for pharmacy selection', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/partner/inventory') return { data: { data: [{ id: 9, medicine_id: 73, name_en: 'Amoxicillin 500mg', owner_name: 'Demo Warehouse', quantity: 120, reserved_quantity: 5, unit_price: 1850, low_stock_threshold: 15, is_active: true }], total: 1, last_page: 1 } } as never
      return { data: { data: [] } } as never
    })
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { message: 'Warehouse medicine deactivated.' } } as never)

    render(<OperationsPage section="inventory" role="warehouse" locale="en" />)

    const deactivate = await screen.findByRole('button', { name: 'Deactivate Amoxicillin 500mg in warehouse inventory' })
    fireEvent.click(deactivate)
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/partner/inventory/9/status', { is_active: false }, expect.anything()))
    expect(await screen.findByText('Amoxicillin 500mg is hidden from new pharmacy requests.')).toBeInTheDocument()
  })

  it('shows the created-order confirmation and requests newest orders first', async () => {
    sessionStorage.setItem('medline_order_created', JSON.stringify({ id: 92, publicId: 'ORD-NEW-92' }))
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [
      { id: 92, public_id: 'ORD-NEW-92', status: 'pending_pharmacy_review', created_at: '2026-08-20T15:00:00Z' },
      { id: 91, public_id: 'ORD-OLD-91', status: 'completed', created_at: '2026-08-20T14:00:00Z' },
    ], last_page: 1 } } as never)

    render(<OperationsPage section="orders" role="patient" locale="en" />)

    expect(await screen.findByRole('status')).toHaveTextContent('ORD-NEW-92 was created successfully')
    await waitFor(() => expect(get).toHaveBeenCalledWith('/orders', { params: expect.objectContaining({ sort_by: 'created_at', sort_direction: 'desc', page: 1 }) }))
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('ORD-NEW-92')
    expect(rows[0]).toHaveClass('newly-created-order')
    expect(sessionStorage.getItem('medline_order_created')).toBeNull()
  })

  it('uses custom search controls and explicit navigation through collapsible order steps', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/partners') return { data: { data: [{ id: 21, business_name: 'Demo Central Pharmacy', address: 'Damascus', license_number: 'RX-21', latitude: 33.51, longitude: 36.27 }] } } as never
      if (url === '/medicines') return { data: { data: [{ id: 31, name_en: 'Amoxicillin 500mg', name_ar: 'Amoxicillin', dosage: '500mg', manufacturer: 'MedLine Labs', prescription_required: false, unit_price: 1250 }] } } as never
      if (url === '/delivery-pricing/current') return { data: { rate_per_km: 100, tax_rate_percent: 5 } } as never
      return { data: { data: [] } } as never
    })
    const flyTo = vi.spyOn(L.Map.prototype, 'flyTo')

    const { container } = render(<PatientOrderCreatePanel locale="en" />)
    const stepOne = container.querySelector('#order-step-1') as HTMLElement
    expect(stepOne.querySelector('.order-flow-toggle')).toHaveAttribute('aria-expanded', 'true')

    await waitFor(() => expect(get).toHaveBeenCalledWith('/partners', expect.anything()))
    const pharmacySearch = within(stepOne).getByRole('combobox', { name: 'Search pharmacies' })
    fireEvent.change(pharmacySearch, { target: { value: 'Demo' } })
    const pharmacyList = within(stepOne).getByRole('listbox', { name: 'Pharmacy suggestions' })
    expect(within(pharmacyList).getByRole('option')).toHaveTextContent('Demo Central Pharmacy')
    fireEvent.pointerDown(within(pharmacyList).getByRole('option'))

    await waitFor(() => expect(get).toHaveBeenCalledWith('/medicines', expect.objectContaining({ params: expect.objectContaining({ partner_id: 21 }) })))
    await waitFor(() => expect(flyTo).toHaveBeenCalledWith([33.51, 36.27], 16, expect.objectContaining({ duration: .45 })))
    expect(pharmacySearch).toHaveValue('Demo Central Pharmacy')
    const stepTwo = container.querySelector('#order-step-2') as HTMLElement
    expect(stepOne.querySelector('.order-flow-toggle')).toHaveAttribute('aria-expanded', 'true')
    expect(stepTwo.querySelector('.order-flow-toggle')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(within(stepOne).getByRole('button', { name: /Next: Select Medicine/i }))
    expect(stepOne.querySelector('.order-flow-toggle')).toHaveAttribute('aria-expanded', 'false')
    expect(stepTwo.querySelector('.order-flow-toggle')).toHaveAttribute('aria-expanded', 'true')

    const combobox = within(stepTwo).getByRole('combobox', { name: 'Search and select medicine' })
    fireEvent.focus(combobox)
    const listbox = within(stepTwo).getByRole('listbox', { name: 'Medicine suggestions' })
    expect(listbox).toHaveClass('medicine-suggestion-list')
    expect(stepTwo.querySelector('datalist')).toBeNull()
    fireEvent.pointerDown(within(listbox).getByRole('option'))
    fireEvent.click(within(stepTwo).getByRole('button', { name: 'Add medicine' }))
    expect(within(stepTwo).getAllByText(/SYP\s*1,250\.00/).length).toBeGreaterThanOrEqual(2)
    const deliveryButton = within(stepTwo).getByRole('button', { name: /Next: Select Delivery Address/i })
    expect(deliveryButton.closest('.medicine-step-actions')).not.toBeNull()
    fireEvent.click(deliveryButton)

    const stepThree = container.querySelector('#order-step-3') as HTMLElement
    expect(stepTwo.querySelector('.order-flow-toggle')).toHaveAttribute('aria-expanded', 'false')
    expect(stepThree.querySelector('.order-flow-toggle')).toHaveAttribute('aria-expanded', 'true')
    expect(within(stepThree).getByText('Order total')).toBeInTheDocument()
    expect(within(stepThree).getByText('Tax (5%)')).toBeInTheDocument()
    expect(within(stepThree).getByText('Pending delivery address')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Select Pharmacy, completed' }))
    expect(stepOne.querySelector('.order-flow-toggle')).toHaveAttribute('aria-expanded', 'true')
    expect(stepThree.querySelector('.order-flow-toggle')).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens a delivery job detail before allowing a driver to accept it', async () => {
    localStorage.setItem('medline_user', JSON.stringify({ id: 55, role: 'driver' }))
    const job = { id: 87, public_id: 'DEL-JOB-87', order_public_id: 'ORD-87', status: 'available', delivery_address_snapshot: 'Damascus, Mezzeh', scheduled_for: '2030-01-02 10:30:00', job_price: '875.00', total: '4875.00', created_at: '2026-08-20 10:00:00' }
    let claimed = false
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/deliveries/available') return { data: { data: [job], total: 1, last_page: 1 } } as never
      if (url === '/deliveries/87') return { data: { delivery: claimed ? { ...job, status: 'claimed', can_accept_order: false, driver_id: 12, driver: { driver_id: 12, name: 'Demo Driver' } } : { ...job, can_accept_order: true, delivery_vehicle_type: 'motorcycle', delivery_distance_km: 8.75, delivery_rate_per_km: 100 }, items: [{ id: 1, name_en: 'Paracetamol 500mg', pickup_quantity: 2 }], route: {}, events: [] } } as never
      return { data: { data: [] } } as never
    })
    const post = vi.spyOn(api, 'post').mockImplementation(async () => { claimed = true; return { data: { delivery: { ...job, status: 'claimed' } } } as never })

    render(<OperationsPage section="deliveries" role="driver" locale="en" />)

    expect(await screen.findByRole('heading', { name: 'Available delivery jobs' })).toBeInTheDocument()
    const row = await screen.findByRole('row', { name: /DEL-JOB-87/i })
    expect(row).toHaveTextContent('Damascus, Mezzeh')
    expect(row).toHaveTextContent('875.00')
    fireEvent.click(row)

    await waitFor(() => expect(get).toHaveBeenCalledWith('/deliveries/87'))
    expect(await screen.findByText('Paracetamol 500mg')).toBeInTheDocument()
    expect(screen.getByText('Motorcycle')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accept this order' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/deliveries/87/accept-order', {}, expect.anything()))
    expect(await screen.findByText('Order accepted. It is now assigned to you for delivery.')).toBeInTheDocument()
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
    fireEvent.change(screen.getByRole('textbox', { name: /Note to patient/i }), { target: { value: 'The first medicine is not available.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve partially' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/partner/orders/82/decision', expect.objectContaining({ decision: 'partial', note: 'The first medicine is not available.', items: [{ id: 821, accepted_quantity: 0 }, { id: 822, accepted_quantity: 1 }] }), expect.anything()))
  })

  it('enables partial approval only after quantities are reduced and a patient note is provided', () => {
    localStorage.setItem('medline_user', JSON.stringify({ id: 42, role: 'pharmacy' }))
    const detail = { order: { id: 83, public_id: 'ORD-83', status: 'pending_pharmacy_review', subtotal: 1500, total: 1500, items: [{ id: 831, medicine_id: 1, name_en: 'Ibuprofen 400mg', quantity: 2, accepted_quantity: 0, unit_price: 750, prescription_required_snapshot: false }] }, invoice: { subtotal: 1500, total: 1500 }, delivery: {}, timeline: [] }
    vi.spyOn(api, 'get').mockResolvedValue({ data: detail } as never)

    render(<OrderDetailPanel detail={detail} onClose={vi.fn()} locale="en" />)

    const quantity = screen.getByLabelText('Quantity to fulfil for Ibuprofen 400mg')
    const partialButton = screen.getByRole('button', { name: 'Approve partially' })
    const rejectButton = screen.getByRole('button', { name: 'Reject order' })
    const note = screen.getByRole('textbox', { name: /Note to patient/i })

    expect(partialButton).toBeDisabled()
    expect(rejectButton).toBeDisabled()
    expect(screen.getByText('Reduce at least one quantity below the amount requested to enable partial approval.')).toBeInTheDocument()

    fireEvent.change(quantity, { target: { value: '3' } })
    expect(quantity).toHaveValue(2)
    expect(partialButton).toBeDisabled()

    fireEvent.change(quantity, { target: { value: '1' } })
    expect(partialButton).toBeDisabled()
    fireEvent.change(note, { target: { value: 'Only one pack is currently available.' } })
    expect(partialButton).toBeEnabled()
    expect(rejectButton).toBeEnabled()

    fireEvent.change(quantity, { target: { value: '0' } })
    expect(partialButton).toBeDisabled()
    expect(screen.getByText(/Use Reject order if nothing can be fulfilled/i)).toBeInTheDocument()
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

  it('lets administrators change delivery pricing while preserving its visible history', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { current: { id: 1, rate_per_km: 100, reason: 'Initial system delivery rate', effective_at: '2026-08-20T10:00:00Z' }, history: [{ id: 1, rate_per_km: 100, reason: 'Initial system delivery rate', effective_at: '2026-08-20T10:00:00Z' }], currency: 'SYP' } } as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { current: { id: 2, rate_per_km: 125, reason: 'Operating cost review', effective_at: '2026-08-20T11:00:00Z' }, history: [{ id: 2, rate_per_km: 125, reason: 'Operating cost review', effective_at: '2026-08-20T11:00:00Z', changed_by_name: 'Admin User' }, { id: 1, rate_per_km: 100, reason: 'Initial system delivery rate', effective_at: '2026-08-20T10:00:00Z' }], currency: 'SYP' } } as never)

    render(<AdminDeliveryPricingPanel locale="en" />)

    await waitFor(() => expect(screen.getAllByText('SYP 100 / km').length).toBeGreaterThan(0))
    fireEvent.change(screen.getByLabelText('New rate per kilometre (SYP)'), { target: { value: '125' } })
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Operating cost review' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update Motorcycle rate' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/delivery-pricing', { vehicle_type: 'motorcycle', rate_per_km: 125, reason: 'Operating cost review' }, expect.anything()))
    expect(await screen.findByText(/existing orders remain unchanged/i)).toBeInTheDocument()
    expect(screen.getByText('Admin User')).toBeInTheDocument()
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
      <OrderDetailPanel detail={{ order: { public_id: 'ORD-DETAIL', status: 'accepted', total: 120 }, delivery: { status: 'in_transit', driver: { name: 'Demo Driver', email: 'driver@medline.local', vehicle_type: 'Motorcycle', vehicle_plate: 'ML-2026', is_available: true } }, invoice: { subtotal: 100, delivery_distance_km: 1.5, delivery_rate_per_km: 100, delivery_fee: 20, total: 120 }, timeline: [{ id: 1, to_status: 'accepted', created_at: '2026-08-19T12:00:00Z' }] }} onClose={vi.fn()} locale="en" />
      <DeliveryDetailPanel detail={{ delivery: { id: 4, public_id: 'DEL-DETAIL', status: 'in_transit', order_public_id: 'ORD-DETAIL', delivery_address_snapshot: 'Damascus', total: 120, last_latitude: 33.5, last_longitude: 36.3 }, events: [] }} onClose={vi.fn()} locale="en" />
      <ComplaintDetailPanel detail={{ complaint: { id: 5, subject: 'Missing medicine', status: 'open', category: 'delivery', description: 'A medicine was missing.' }, attachments: [] }} onClose={vi.fn()} locale="en" />
      <ProcurementDetailPanel detail={{ procurement: { public_id: 'PROC-DETAIL', status: 'accepted', total: 400, delivery_address_snapshot: 'Damascus' }, items: [{ id: 1, name_en: 'Paracetamol', quantity: 2, accepted_quantity: 2, line_total: 400 }], delivery: { status: 'available' }, timeline: [] }} onClose={vi.fn()} locale="en" />
    </>)

    expect(container.textContent).toContain('ORD-DETAIL')
    expect(container.textContent).toContain('Demo Driver')
    expect(container.textContent).toContain('Delivery progress')
    expect(container.textContent).toContain('Rate at order time')
    expect(container.textContent).toContain('1.50 km')
    expect(container.textContent).toContain('DEL-DETAIL')
    expect(container.textContent).toContain('Missing medicine')
    expect(container.textContent).toContain('PROC-DETAIL')
  })

  it('requires changed bounded quantities and a warehouse comment for partial procurement approval', async () => {
    localStorage.setItem('medline_user', JSON.stringify({ id: 31, role: 'warehouse' }))
    const pending = { procurement: { id: 44, public_id: 'PROC-PARTIAL-44', status: 'pending_warehouse_review', total: 5000, delivery_address_snapshot: 'Damascus' }, items: [{ id: 401, name_en: 'Amoxicillin', quantity: 10, accepted_quantity: 0, unit_price: 500, line_total: 5000, batch_options: [{ id: 901, batch_number: 'AMOX-A', allocated_quantity: 10, allocatable_quantity: 10, unit_price: 500, expires_at: '2027-08-20' }] }], delivery: null, timeline: [] }
    const completed = { ...pending, procurement: { ...pending.procurement, status: 'partial_approval_required', warehouse_note: 'Only six units are available.', subtotal: 3000, total: 3000 }, items: [{ ...pending.items[0], accepted_quantity: 6 }], delivery: null }
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'saved' } } as never)
    vi.spyOn(api, 'get').mockResolvedValue({ data: completed } as never)

    render(<ProcurementDetailPanel detail={pending} onClose={vi.fn()} locale="en" />)

    const stockHeading = screen.getByRole('heading', { name: 'Adjust requested stock' })
    const scheduleHeading = screen.getByRole('heading', { name: 'As soon as possible' })
    expect(stockHeading.compareDocumentPosition(scheduleHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Approve partially' }))
    expect(screen.getByText('Add a clear comment for the pharmacy before partially approving or rejecting this request.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Quantity to fulfill for Amoxicillin'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Warehouse comment to pharmacy'), { target: { value: 'Only six units are available.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve partially' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/procurement/44/decision', { decision: 'partial', note: 'Only six units are available.', items: [{ id: 401, accepted_quantity: 6, batches: [{ inventory_id: 901, quantity: 6 }] }] }, expect.anything()))
    expect(await screen.findByText('The adjusted offer was sent to the pharmacy for confirmation before delivery.')).toBeInTheDocument()
    expect(screen.getByText('Warehouse comment')).toBeInTheDocument()
  })

  it('waits for pharmacy confirmation before delivering a partial procurement offer', async () => {
    localStorage.setItem('medline_user', JSON.stringify({ id: 32, role: 'pharmacy' }))
    const offered = { procurement: { id: 45, public_id: 'PROC-OFFER-45', status: 'partial_approval_required', warehouse_note: 'Six units are available.', subtotal: 3000, total: 3000, delivery_address_snapshot: 'Damascus' }, items: [{ id: 451, name_en: 'Amoxicillin', quantity: 10, accepted_quantity: 6, unit_price: 500, line_total: 5000 }], delivery: null, timeline: [] }
    const approved = { ...offered, procurement: { ...offered.procurement, status: 'partially_accepted' }, delivery: { status: 'available' } }
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'approved' } } as never)
    vi.spyOn(api, 'get').mockResolvedValue({ data: approved } as never)

    render(<ProcurementDetailPanel detail={offered} onClose={vi.fn()} locale="en" />)

    expect(screen.getByText(/Delivery will be created only after you approve/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve partial supply' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/procurement/45/partial-offer/decision', { decision: 'approve' }, expect.anything()))
    expect(await screen.findByText('The partial supply was approved and sent to delivery.')).toBeInTheDocument()
  })

  it('renders the ratings moderation queue empty state', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [] } } as never)
    render(<RatingQueue locale="en" />)
    await waitFor(() => expect(screen.getByText('No ratings available.')).toBeInTheDocument())
  })

  it('uses the shared sortable and clickable table experience for ratings', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/orders/9') return { data: { order: { id: 9, public_id: 'ORD-RATE-9', status: 'completed', total: 500 }, invoice: {}, delivery: {}, timeline: [] } } as never
      return { data: { data: [{ id: 3, order_id: 9, public_id: 'ORD-RATE-9', creator_name: 'Demo Patient', comment: 'Helpful service', score: 5, hidden_at: null, created_at: '2026-08-20T12:00:00Z' }], total: 1, last_page: 1 } } as never
    })
    render(<RatingQueue locale="en" />)

    expect(await screen.findByRole('table', { name: 'Ratings moderation' })).toBeInTheDocument()
    expect(screen.getByLabelText('Filter ratings by status')).toBeInTheDocument()
    expect(screen.getByLabelText('Rows per page for ratings')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Sort by Score'))
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/ratings', { params: expect.objectContaining({ sort_by: 'score', sort_direction: 'asc' }) }))
    expect(screen.getByRole('row', { name: 'Open order ORD-RATE-9' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Demo Patient'))
    await waitFor(() => expect(get).toHaveBeenCalledWith('/orders/9'))
    expect(await screen.findByText('ORD-RATE-9')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to queue' })).toBeInTheDocument()
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
    expect(screen.queryByText('Live data')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subscription reviews' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verification' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Documents' })).not.toBeInTheDocument()
    expect(roleCanAccessSection('admin', 'documents')).toBe(false)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('returns from an order detail when Orders is selected again in the menu', async () => {
    window.history.replaceState({}, '', '/orders')
    localStorage.setItem('medline_token', 'test-token')
    localStorage.setItem('medline_user', JSON.stringify({ id: 1, role: 'admin', locale: 'en' }))
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/auth/me') return { data: { user: { id: 1, role: 'admin', locale: 'en' } } } as never
      if (url === '/orders/7') return { data: { order: { id: 7, public_id: 'ORD-7', status: 'pending_pharmacy_review', items: [] }, invoice: {}, delivery: {}, timeline: [] } } as never
      if (url === '/orders') return { data: { data: [{ id: 7, public_id: 'ORD-7', customer_name: 'Demo Patient', status: 'pending_pharmacy_review', delivery_address_snapshot: 'Damascus' }], last_page: 1 } } as never
      return { data: { data: [] } } as never
    })

    render(<RootApp />)

    await screen.findByRole('row', { name: 'Open order ORD-7' })
    fireEvent.click(screen.getByText('Demo Patient'))
    await screen.findByRole('button', { name: 'Back to queue' })
    expect(screen.queryByRole('table', { name: 'Orders overview' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Orders' }))
    await screen.findByRole('table', { name: 'Orders overview' })
    expect(screen.getByRole('row', { name: 'Open order ORD-7' })).toBeInTheDocument()
  })

  it('lets administrators deactivate partner and ordinary user access from their management tables', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/admin/partners') return { data: { data: [{ id: 61, user_id: 161, business_name: 'Active Pharmacy', type: 'pharmacy', approval_status: 'approved', subscription_status: 'active' }], total: 1, last_page: 1 } } as never
      return { data: { data: [{ id: 71, name: 'Active User', role: 'patient', status: 'active', email: 'active@example.test' }], total: 1, last_page: 1 } } as never
    })
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { message: 'Access updated.' } } as never)

    render(<PartnerManagementPanel section="pharmacies" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate pharmacy' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/admin/users/161/status', expect.objectContaining({ status: 'suspended' }), expect.anything()))
    cleanup()

    render(<UserRolePanelWithCompany section="users" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate Active User' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/admin/users/71/status', expect.objectContaining({ status: 'suspended' }), expect.anything()))
    expect(get).toHaveBeenCalledWith('/admin/users', expect.anything())
  })

  it('covers partner, user, procurement, and prescription administration workflows', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/admin/partners') return { data: { data: [{ id: 11, business_name: 'Demo Pharmacy', type: 'pharmacy', approval_status: 'pending' }] } } as never
      if (url === '/admin/users') return { data: { data: [{ id: 12, name: 'Demo User', role: 'pharmacy', email: 'demo@example.test', company_name: 'Demo Pharmacy Group' }, { id: 16, name: 'Demo Driver', role: 'driver', email: 'driver@example.test' }, { id: 17, name: 'Demo Support', role: 'support', email: 'support@example.test' }, { id: 18, name: 'Demo Patient', role: 'patient', email: 'patient@example.test' }] } } as never
      if (url === '/auth/me') return { data: { user: { id: 12, role: 'pharmacy' }, partner: { id: 11, business_name: 'Demo Pharmacy', address: 'University Gate', latitude: 33.5138, longitude: 36.2765 } } } as never
      if (url === '/partners') return { data: { data: [{ id: 13, business_name: 'Demo Warehouse', address: 'Industrial district', latitude: 33.5401, longitude: 36.3102 }] } } as never
      if (url === '/delivery-pricing/current') return { data: { rate_per_km: 100 } } as never
      if (url === '/medicines') return { data: { data: [{ id: 14, name_en: 'Paracetamol', manufacturer: 'MedLine', available_quantity: 20, unit_price: 500 }] } } as never
      if (url === '/pharmacy/prescriptions') return { data: { data: [{ id: 15, order_public_id: 'ORD-RX-15', status: 'pending_review' }] } } as never
      return { data: { data: [] } } as never
    })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'ok' } } as never)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { message: 'ok' } } as never)

    render(<PartnerManagementPanel section="pharmacies" />)
    await waitFor(() => expect(screen.getByText('Demo Pharmacy')).toBeInTheDocument())
    expect(screen.getByRole('table', { name: 'Pharmacies overview' })).toBeInTheDocument()
    expect(screen.getByLabelText('Rows per page for pharmacies')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search pharmacies'), { target: { value: 'Central' } })
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/partners', { params: expect.objectContaining({ type: 'pharmacy', search: 'Central', status: '', per_page: 10, page: 1, sort_by: 'created_at', sort_direction: 'desc' }) }))
    fireEvent.click(screen.getByTitle('Sort by Pharmacy'))
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/partners', { params: expect.objectContaining({ sort_by: 'business_name', sort_direction: 'asc' }) }))
    fireEvent.click(screen.getByRole('button', { name: 'Correction' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/partners/11/decision', expect.objectContaining({ decision: 'correction' }), expect.anything()))
    cleanup()

    render(<UserRolePanelWithCompany section="users" />)
    await waitFor(() => expect(screen.getByText('Demo User')).toBeInTheDocument())
    expect(screen.getByRole('table', { name: 'Role assignments' })).toBeInTheDocument()
    expect(screen.getByLabelText('Rows per page for users')).toBeInTheDocument()
    expect(screen.getByText('Demo Pharmacy Group')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Demo Pharmacy Group'))
    expect(await screen.findByRole('button', { name: 'Back to users' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to users' }))
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'pharmacy' } })
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/users', { params: expect.objectContaining({ per_page: 10, page: 1, search: 'pharmacy', role: '', status: '', sort_by: 'created_at', sort_direction: 'desc' }) }))
    fireEvent.change(screen.getByLabelText('Role for Demo User'), { target: { value: 'driver' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save role for Demo User' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/admin/users/12/role', expect.objectContaining({ role: 'driver' }), expect.anything()))
    cleanup()

    render(<ProcurementCreatePanel section="procurement" />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Replenish inventory' })).toBeInTheDocument())
    fireEvent.click(await screen.findByRole('option', { name: /Demo Warehouse/ }))
    fireEvent.click(screen.getByRole('button', { name: /Next: Select medicines/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Search warehouse medicines' }), { target: { value: 'Para' } })
    fireEvent.click(await screen.findByRole('option', { name: /Paracetamol/ }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Replenishment quantity' }), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add medicine' }))
    fireEvent.click(screen.getByRole('button', { name: /Next: Review delivery/ }))
    expect(screen.getAllByText('Delivery fee')).toHaveLength(2)
    fireEvent.click(screen.getByRole('radio', { name: /Schedule date & time/i }))
    fireEvent.change(screen.getByLabelText(/Delivery date and time/i), { target: { value: '2030-01-02T10:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create replenishment order' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/procurement', expect.objectContaining({ warehouse_id: 13, delivery_preference: 'scheduled', scheduled_delivery_at: new Date('2030-01-02T10:30').toISOString(), items: [{ medicine_id: 14, quantity: 3 }] }), expect.anything()))
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

  it('keeps replenishment as a procurement-page action instead of a duplicate sidebar destination', async () => {
    localStorage.setItem('medline_token', 'active-pharmacy-token')
    localStorage.setItem('medline_user', JSON.stringify({ id: 32, role: 'pharmacy' }))
    window.history.replaceState({}, '', '/procurement')
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/auth/me') return { data: { user: { id: 32, role: 'pharmacy' } } } as never
      if (url === '/subscription') return { data: { access_active: true, active_subscription: { status: 'active' } } } as never
      return { data: { data: [], total: 0, last_page: 1 } } as never
    })

    render(<RootApp />)

    const replenishActions = await screen.findAllByRole('button', { name: 'Replenish inventory' })
    expect(replenishActions).toHaveLength(1)
    expect(replenishActions[0].closest('.orders-panel-heading')).not.toBeNull()
    const sidebar = document.querySelector('aside.sidebar')
    expect(sidebar).not.toBeNull()
    expect(within(sidebar as HTMLElement).getByRole('button', { name: 'Procurement' })).toBeInTheDocument()
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

  it('renders the profile page and account menu in Arabic with RTL direction', () => {
    render(<AccountMenu user={{ name: 'Maya Ali', email: 'maya@example.test' }} locale="ar" onProfile={vi.fn()} onLogout={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '\u0641\u062a\u062d \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645' }))
    expect(screen.getByRole('menuitem', { name: '\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a' })).toBeInTheDocument()
    cleanup()

    render(<ProfilePage user={{ id: 8, name: 'Maya Ali', email: 'maya@example.test', phone: '+963900000000' }} locale="ar" onUpdated={vi.fn()} />)
    expect(screen.getByRole('heading', { name: '\u0645\u0644\u0641\u0643 \u0627\u0644\u0634\u062e\u0635\u064a' })).toBeInTheDocument()
    expect(screen.getByLabelText('\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644')).toBeInTheDocument()
    expect(screen.getByLabelText('\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641')).toHaveAttribute('dir', 'ltr')
    expect(document.querySelector('.profile-page')).toHaveAttribute('dir', 'rtl')
  })

  it('shows registered working hours in the administrator pharmacy profile', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/admin/partners/61') return { data: { partner: { id: 61, user_id: 161, business_name: 'Hours Pharmacy', type: 'pharmacy', approval_status: 'approved', subscription_status: 'active', working_hours: [{ day_of_week: 1, opens_at: '08:00:00', closes_at: '12:00:00' }, { day_of_week: 1, opens_at: '16:00:00', closes_at: '21:00:00' }] } } } as never
      return { data: { data: [{ id: 61, user_id: 161, business_name: 'Hours Pharmacy', type: 'pharmacy', approval_status: 'approved', subscription_status: 'active' }], total: 1, last_page: 1 } } as never
    })

    render(<PartnerManagementPanel section="pharmacies" />)
    fireEvent.click(await screen.findByRole('button', { name: 'View Hours Pharmacy' }))
    expect(await screen.findByRole('heading', { name: 'Working hours' })).toBeInTheDocument()
    const monday = screen.getByText('Monday').closest('.partner-working-day') as HTMLElement
    expect(within(monday).getByText('08:00\u201312:00')).toBeInTheDocument()
    expect(within(monday).getByText('16:00\u201321:00')).toBeInTheDocument()
    expect(screen.getByText('Saturday').closest('.partner-working-day')).toHaveTextContent('Closed')
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

  it('uses an Orders-style medicine catalog with lifecycle actions and pagination', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [{ id: 71, name_en: 'Amoxicillin 500mg', name_ar: 'Amoxicillin', manufacturer: 'MedLine Labs', form: 'Tablet', dosage: '500mg', code: 'AMOX-500', prescription_required: true, is_active: true, created_at: '2026-08-20T10:00:00Z' }], total: 1, last_page: 1 } } as never)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { message: 'Medicine deactivated.' } } as never)
    const open = vi.spyOn(window, 'open').mockReturnValue(null)

    render(<MedicineAdminPage locale="en" onCreate={vi.fn()} />)

    expect(await screen.findByRole('table', { name: 'Medicine catalog' })).toBeInTheDocument()
    expect(screen.getByLabelText('Rows per page for medicines')).toHaveValue('10')
    expect(screen.getByLabelText('Filter medicines by status')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter medicines by prescription requirement')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage categories' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Amoxicillin 500mg' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search medicines'), { target: { value: 'Amox' } })
    await waitFor(() => expect(get).toHaveBeenCalledWith('/medicines', { params: expect.objectContaining({ include_inactive: true, search: 'Amox', per_page: 10 }) }))
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Amoxicillin 500mg' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/medicines/71/status', { is_active: false }, expect.anything()))
    fireEvent.click(screen.getByRole('button', { name: 'View Amoxicillin 500mg' }))
    expect(open).toHaveBeenCalledWith('/medicines/71', '_blank', 'noopener,noreferrer')
  })

  it('creates one medicine or imports a multi-record Excel workbook on its dedicated page', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [] } } as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: '2 medicines imported successfully.', rows: 2 } } as never)
    render(<MedicineCreateAdminPage locale="en" onBack={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Add medicine' })).toBeInTheDocument()
    expect(screen.getByLabelText(/English name/)).toBeRequired()
    expect(screen.getByLabelText(/Arabic name/)).toBeRequired()
    fireEvent.click(screen.getByRole('tab', { name: /Bulk spreadsheet/ }))
    const workbook = new File(['xlsx-content'], 'catalog.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    fireEvent.change(screen.getByLabelText(/Choose Excel or CSV file/), { target: { files: [workbook] } })
    expect(screen.getByText('catalog.xlsx')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Import medicines' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/medicines/import', expect.any(FormData), expect.anything()))
    expect(await screen.findByText('2 medicines imported successfully.')).toBeInTheDocument()
  })

  it('uses the standardized notification table with server filters and clickable detail rows', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [{ id: 'notice-8', type: 'order.created_patient', data: { message: 'Your order was submitted.' }, read_at: null, created_at: '2026-08-20T10:00:00Z' }], total: 1, last_page: 1 } } as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { message: 'Notification marked as read.' } } as never)
    render(<NotificationsPage locale="en" />)

    expect(await screen.findByRole('table', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.getByLabelText('Rows per page for notifications')).toHaveValue('10')
    fireEvent.change(screen.getByLabelText('Filter notifications by status'), { target: { value: 'unread' } })
    await waitFor(() => expect(get).toHaveBeenCalledWith('/notifications', { params: expect.objectContaining({ status: 'unread', sort_by: 'created_at', sort_direction: 'desc' }) }))
    fireEvent.click(screen.getByText('Your order was submitted.'))
    expect(await screen.findByRole('button', { name: 'Back to notifications' })).toBeInTheDocument()
    await waitFor(() => expect(post).toHaveBeenCalledWith('/notifications/notice-8/read', {}, expect.anything()))
  })

  it('does not show the mark-as-read action for an already read notification', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [{ id: 'notice-read', type: 'order.created_patient', data: { message: 'Already reviewed.' }, read_at: '2026-08-20T10:05:00Z', created_at: '2026-08-20T10:00:00Z' }], total: 1, last_page: 1 } } as never)
    render(<NotificationsPage locale="en" />)

    expect(await screen.findByText('Already reviewed.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mark .* as read/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument()
  })

  it('supports multiple pharmacist shifts on the same day and merges partner review navigation', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/partner/working-hours') return { data: { data: [{ day_of_week: 1, opens_at: '08:00:00', closes_at: '12:00:00' }] } } as never
      if (url === '/admin/subscriptions') return { data: { data: [], last_page: 1 } } as never
      return { data: { data: [], total: 0, last_page: 1 } } as never
    })
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { message: 'Working hours updated.' } } as never)
    render(<PharmacyWorkingHoursPanel />)
    const monday = (await screen.findByText('Monday')).closest('.working-day') as HTMLElement
    fireEvent.click(within(monday).getByRole('button', { name: 'Add shift' }))
    expect(within(monday).getByText('2 shifts')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save working hours' }))
    await waitFor(() => expect(put).toHaveBeenCalledWith('/partner/working-hours', { shifts: expect.arrayContaining([expect.objectContaining({ day_of_week: 1, opens_at: '08:00' }), expect.objectContaining({ day_of_week: 1, opens_at: '09:00' })]) }, expect.anything()))
    cleanup()

    render(<AdminReviewHub locale="en" />)
    expect(screen.getByRole('tab', { name: /Subscription payments/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Pharmacy & warehouse verification/ }))
    expect(await screen.findByRole('heading', { name: 'Pharmacy & warehouse verification' })).toBeInTheDocument()
  })

  it('shows authentication and dashboard recovery states when requests fail', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'))
    render(<LoginPage locale="en" onLocaleChange={vi.fn()} onAuthenticated={vi.fn()} />)
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
