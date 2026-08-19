import { Component, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import axios from 'axios'
import { Bell, ChevronRight, ClipboardList, CreditCard, History, LayoutDashboard, LogOut, Menu, MessageSquare, Package, Search, Settings, ShieldCheck, Truck, Users } from 'lucide-react'
import { translate as tr } from './i18n'
import type { DashboardMetrics, Medicine, NotificationRecord } from './api-types'
import { captureWebError } from './telemetry'
import { createMedlineEcho } from './echo'
import './style.css'

type Row = { id: number; primary: string; secondary: string; status: string; raw: Record<string, unknown> }

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api/v1', withCredentials: true })
let dashboardMetrics: Record<string, number> = {}
const mutationConfig = (scope: string, id: number | string, action: string) => ({ headers: { 'Idempotency-Key': `web-${scope}-${id}-${action}` } })
const uniqueMutationId = (scope: string) => typeof window.crypto?.randomUUID === 'function' ? `${scope}-${window.crypto.randomUUID()}` : `${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
const announceAccessibilityMessage = (message: string, assertive = true) => {
  const liveRegion = document.createElement('div')
  liveRegion.className = 'sr-only'
  liveRegion.setAttribute('role', assertive ? 'alert' : 'status')
  liveRegion.setAttribute('aria-live', assertive ? 'assertive' : 'polite')
  liveRegion.textContent = message
  document.body.appendChild(liveRegion)
  window.setTimeout(() => liveRegion.remove(), 5000)
}
let refreshPromise: Promise<string | null> | null = null
const refreshWebSession = async (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = axios.post(`${api.defaults.baseURL}/auth/refresh`, {}, { withCredentials: true, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } })
      .then((response) => {
        const nextToken = String(response.data?.token ?? '')
        if (!nextToken) return null
        localStorage.setItem('medline_token', nextToken)
        if (response.data?.user) localStorage.setItem('medline_user', JSON.stringify(response.data.user))
        return nextToken
      })
      .catch(() => null)
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('medline_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['X-Request-ID'] = typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return config
})
api.interceptors.response.use((response) => response, async (error) => {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data
    if (payload && typeof payload === 'object' && payload.request_id && payload.message) payload.message = `${String(payload.message)} (Reference: ${String(payload.request_id)})`
    const requestId = typeof payload === 'object' && payload?.request_id ? String(payload.request_id) : error.response?.headers?.['x-request-id']
    captureWebError(error, 'api_error', requestId)
    const endpoint = error.config?.url ?? ''
    const requestConfig = error.config as any
    const canRefresh = error.response?.status === 401 && !requestConfig?._medlineRetried && !endpoint.includes('/auth/')
    if (canRefresh) {
      requestConfig._medlineRetried = true
      const nextToken = await refreshWebSession()
      if (nextToken) {
        requestConfig.headers = requestConfig.headers ?? {}
        requestConfig.headers.Authorization = `Bearer ${nextToken}`
        return api.request(requestConfig)
      }
    }
    if (error.response?.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/forgot-password') && !endpoint.includes('/auth/reset-password') && !endpoint.includes('/auth/refresh')) window.dispatchEvent(new Event('medline:unauthorized'))
  }
  return Promise.reject(error)
})

function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(localStorage.getItem('medline_token')))
  const [role, setRole] = useState(() => { try { return JSON.parse(localStorage.getItem('medline_user') ?? '{}').role ?? 'admin' } catch { return 'admin' } })
  const [sessionReady, setSessionReady] = useState(!localStorage.getItem('medline_token'))
  const [locale, setLocale] = useState(() => localStorage.getItem('medline_locale') ?? 'en')
  const [section, setSection] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useEffect(() => {
    const handleUnauthorized = () => { localStorage.removeItem('medline_token'); localStorage.removeItem('medline_refresh_token'); localStorage.removeItem('medline_user'); setAuthenticated(false) }
    window.addEventListener('medline:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('medline:unauthorized', handleUnauthorized)
  }, [])
  useEffect(() => { if (!authenticated) { setSessionReady(true); return } setSessionReady(false); api.get('/auth/me').then((response) => { const user = response.data.user ?? {}; localStorage.setItem('medline_user', JSON.stringify(user)); setRole(user.role ?? 'admin'); if (user.locale === 'ar' || user.locale === 'en') setLocale(user.locale) }).catch(() => { localStorage.removeItem('medline_token'); localStorage.removeItem('medline_user'); setAuthenticated(false) }).finally(() => setSessionReady(true)) }, [authenticated])
  useEffect(() => { document.documentElement.lang = locale; document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'; localStorage.setItem('medline_locale', locale) }, [locale])
  useEffect(() => {
    if (!authenticated) return
    const token = localStorage.getItem('medline_token')
    let echo: ReturnType<typeof createMedlineEcho> | null = null
    try {
      const user = JSON.parse(localStorage.getItem('medline_user') ?? '{}')
      if (token && user.id) {
        echo = createMedlineEcho(token)
        echo.private(`users.${user.id}`).listen('.notification.created', (payload: unknown) => {
          window.dispatchEvent(new CustomEvent('medline:notification', { detail: payload }))
        })
      }
    } catch { /* Realtime is optional; polling remains available if Reverb is stopped. */ }
    return () => { if (echo) echo.disconnect() }
  }, [authenticated])
  if (!sessionReady) return <div className="session-loading">Restoring your secure MedLine session...</div>
  if (!authenticated) return <LoginPage locale={locale} onAuthenticated={(user) => { localStorage.setItem('medline_user', JSON.stringify(user)); setRole(user.role ?? 'admin'); if (user.locale === 'ar' || user.locale === 'en') setLocale(user.locale); setAuthenticated(true) }} />
  const logout = async () => { try { await api.post('/auth/logout', {}) } catch { /* Continue local cleanup if the API is unavailable. */ } finally { localStorage.removeItem('medline_token'); localStorage.removeItem('medline_refresh_token'); localStorage.removeItem('medline_user'); setAuthenticated(false) } }
  const nav = (value: string) => { setSection(value); setSidebarOpen(false) }
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">M</div><div><strong>MedLine</strong><span>Healthcare logistics</span></div></div>
      <nav>
        <p className="nav-label">{tr('workspace', locale)}</p>
        <NavItem active={section === 'dashboard'} onClick={() => nav('dashboard')} icon={<LayoutDashboard size={18} />} label={tr('dashboard', locale)} />
        {role !== 'warehouse' && <NavItem active={section === 'orders'} onClick={() => nav('orders')} icon={<ClipboardList size={18} />} label={tr('orders', locale)} />}
        <NavItem active={section === 'inventory'} onClick={() => nav('inventory')} icon={<Package size={18} />} label={tr('inventory', locale)} />
        <NavItem active={section === 'procurement'} onClick={() => nav('procurement')} icon={<Package size={18} />} label={tr('procurement', locale)} />
        {(role === 'admin' || role === 'patient' || role === 'driver' || role === 'pharmacy' || role === 'warehouse') && <NavItem active={section === 'deliveries'} onClick={() => nav('deliveries')} icon={<Truck size={18} />} label={tr('deliveries', locale)} />}
        <NavItem active={section === 'subscriptions'} onClick={() => nav('subscriptions')} icon={<CreditCard size={18} />} label={tr('subscriptions', locale)} />
        {role === 'admin' && <><NavItem active={section === 'complaints'} onClick={() => nav('complaints')} icon={<MessageSquare size={18} />} label={tr('complaints', locale)} /><NavItem active={section === 'ratings'} onClick={() => nav('ratings')} icon={<History size={18} />} label={tr('ratings', locale)} /><NavItem active={section === 'audit'} onClick={() => nav('audit')} icon={<History size={18} />} label={tr('audit', locale)} /></>}
        {role === 'admin' && <><p className="nav-label">{tr('management', locale)}</p>
        <NavItem active={section === 'partners'} onClick={() => nav('partners')} icon={<Users size={18} />} label={tr('partners', locale)} />
        <NavItem active={section === 'users'} onClick={() => nav('users')} icon={<Users size={18} />} label={tr('users', locale)} />
        <NavItem active={section === 'documents'} onClick={() => nav('documents')} icon={<ShieldCheck size={18} />} label={tr('documents', locale)} />
        <NavItem active={section === 'verification'} onClick={() => nav('verification')} icon={<ShieldCheck size={18} />} label={tr('verification', locale)} /></>}
        <NavItem active={section === 'settings'} onClick={() => nav('settings')} icon={<Settings size={18} />} label={tr('settings', locale)} />
      </nav>
      <button className="sidebar-footer" onClick={logout}><div className="avatar">{role.slice(0, 2).toUpperCase()}</div><div><strong>MedLine {tr(`role_${role}`, locale)}</strong><span>{tr('signOut', locale)}</span></div><LogOut size={16} /></button>
    </aside>
    {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
    <main className="main-content">
      {(role === 'pharmacy' || role === 'warehouse') && <PartnerAccessGuard onOpen={() => nav('subscriptions')} />}
      {role === 'pharmacy' && <ProcurementCreatePanel section={section} />}
      {role === 'pharmacy' && <PrescriptionReviewPanel section={section} />}
      {role === 'admin' && <UserRolePanel section={section} />}
      {role === 'admin' && <PartnerManagementPanel section={section} />}
      <header className="topbar"><button className="icon-button menu-button" aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={22} /></button><div className="breadcrumb"><span>{tr('workspace', locale)}</span><ChevronRight size={15} /><strong>{tr(section, locale) || title(section)}</strong></div><div className="top-actions"><WebNotifications locale={locale} /><div className="top-avatar" aria-label="Signed-in user">MA</div></div></header>
      {section === 'dashboard' ? <><LiveDashboard role={role} locale={locale} /><DashboardAlerts role={role} locale={locale} /><NotificationHealthPanel role={role} locale={locale} /></> : section === 'subscriptions' && role !== 'admin' ? <PartnerSubscriptionPage locale={locale} /> : section === 'settings' ? <>{role === 'admin' ? <><SettingsPage role="patient" locale={locale} onLocaleChange={setLocale} /><AdminTwoFactorPanel locale={locale} /></> : <SettingsPage role={role} locale={locale} onLocaleChange={setLocale} />}<ConsentSettings /></> : section === 'inventory' && role === 'admin' ? <><MedicineAdminPage locale={locale} /><MedicineEditAdminPage locale={locale} /><MedicineCategoryAdmin locale={locale} /></> : <OperationsPage section={section} role={role} locale={locale} />}
    </main>
  </div>
}

function NavItem({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; badge?: string }) { return <button type="button" className={active ? 'active' : ''} onClick={onClick} aria-current={active ? 'page' : undefined}>{icon}<span>{label}</span>{badge && <b>{badge}</b>}</button> }
function title(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }

async function downloadPrivate(path: string, filename: string) {
  let response
  try {
    const ticket = await api.get(path.replace(/\/download$/, '/download-url'));
    response = await api.get(ticket.data.url, { responseType: 'blob' });
  } catch {
    response = await api.get(path, { responseType: 'blob' });
  }
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

function WebNotifications({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<NotificationRecord[]>([])
  const busyNotificationIds = useRef(new Set<string>())
  const load = async () => { try { const response = await api.get('/notifications', { params: { per_page: 5 } }); setRows(response.data.data ?? []) } catch { setRows([]) } }
  useEffect(() => { void load(); const onNotification = () => { void load() }; window.addEventListener('medline:notification', onNotification); const interval = window.setInterval(() => { void load() }, open ? 30000 : 60000); return () => { window.clearInterval(interval); window.removeEventListener('medline:notification', onNotification) } }, [open])
  const toggle = () => { const next = !open; setOpen(next); if (next) void load() }
  const markRead = async (id: string) => { if (busyNotificationIds.current.has(id)) return; busyNotificationIds.current.add(id); try { await api.post(`/notifications/${id}/read`, {}, mutationConfig('notification-read', id, 'read')); await load() } finally { busyNotificationIds.current.delete(id) } }
  return <div className="notification-wrap"><button className="icon-button" type="button" onClick={toggle} aria-label={tr('notifications', locale)} aria-expanded={open}><Bell size={19} />{rows.some((row) => row.read_at == null) && <i aria-hidden="true" />}</button>{open && <div className="notification-popover" role="region" aria-label={tr('notifications', locale)}><div className="notification-header"><strong>{tr('notifications', locale)}</strong><button type="button" onClick={() => void load()}>{tr('notificationsRefresh', locale)}</button></div>{rows.length === 0 ? <div className="state" role="status">{tr('noNotifications', locale)}</div> : rows.map((row) => <div className={`notification-row ${row.read_at == null ? 'unread' : ''}`} key={String(row.id)}><div><strong>{String(row.type ?? 'MedLine update')}</strong><span>{notificationText(row)}</span></div>{row.read_at == null && <button type="button" onClick={() => void markRead(String(row.id))}>{tr('read', locale)}</button>}</div>)}</div>}</div>
}

function notificationText(row: NotificationRecord): string {
  const data = row.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>
    if (typeof payload.message === 'string') return payload.message
    if (typeof payload.title === 'string') return payload.title
    return Object.entries(payload).filter(([key]) => !['token', 'pin', 'prescription', 'document'].some((blocked) => key.toLowerCase().includes(blocked))).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')
  }
  return 'MedLine has a new update.'
}

function ConsentSettings() {
  const [consents, setConsents] = useState<Record<string, boolean>>({ terms_of_service: false, privacy_policy: false, marketing: false })
  const [message, setMessage] = useState('')
  const busyConsentKeys = useRef(new Set<string>())
  useEffect(() => { api.get('/privacy/consents').then((response) => { const next = { ...consents }; for (const item of response.data.data ?? []) next[String(item.consent_type)] = true; setConsents(next) }).catch(() => setMessage('Unable to load consent choices.')) }, [])
  const update = async (type: string, value: boolean) => { if (busyConsentKeys.current.has(type)) return; busyConsentKeys.current.add(type); const previous = consents[type]; setConsents((current) => ({ ...current, [type]: value })); try { const key = mutationConfig('privacy-consent', type, value ? 'grant' : 'revoke'); if (value) await api.post('/privacy/consents', { consent_type: type, policy_version: '2026-08-18', consented: true }, key); else await api.delete(`/privacy/consents/${type}`, key); setMessage('Privacy choices saved.') } catch { setConsents((current) => ({ ...current, [type]: previous })); setMessage('Unable to save this privacy choice.') } finally { busyConsentKeys.current.delete(type) } }
  return <section className="content"><section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">PRIVACY</p><h2>Consent and policy records</h2></div></div>{[['terms_of_service', 'Terms of service', 'Required to use MedLine.'], ['privacy_policy', 'Privacy policy', 'How MedLine handles account and medical data.'], ['marketing', 'Optional product updates', 'Non-essential MedLine communications.']].map(([key, label, description]) => <label className="setting-row" key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={Boolean(consents[key])} onChange={(event) => void update(key, event.target.checked)} /></label>)}{message && <div className="form-success">{message}</div>}</section></section>
}

function PartnerAccessGuard({ onOpen }: { onOpen: () => void }) {
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => { api.get('/subscription').then((response) => setStatus(String(response.data.subscription?.status ?? 'inactive'))).catch(() => setStatus('unavailable')) }, [])
  if (status === null || status === 'active') return null
  return <div className="access-banner"><div><strong>{status === 'unavailable' ? 'Subscription status unavailable' : 'Partner operations require an active subscription'}</strong><span>{status === 'unavailable' ? 'Check your connection or retry before processing operational work.' : 'Submit or review your annual payment proof to continue.'}</span></div><button className="ghost-button" onClick={onOpen}>Open subscription</button></div>
}

function UserRolePanel({ section }: { section: string }) {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([])
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const load = async () => { try { const response = await api.get('/admin/users', { params: { per_page: 100 } }); const data = response.data.data ?? []; setUsers(data); setRoles(Object.fromEntries(data.map((user: Record<string, unknown>) => [String(user.id), String(user.role ?? 'patient')]))) } catch { setUsers([]) } }
  useEffect(() => { if (section === 'users') void load() }, [section])
  const update = async (id: number) => { try { await api.patch(`/admin/users/${id}/role`, { role: roles[String(id)], reason: 'Administrative role review.' }, mutationConfig('user-role', id, roles[String(id)])); setMessage('User role updated.'); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update user role.' : 'Unable to update user role.') } }
  if (section !== 'users') return null
  return <section className="content"><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">IDENTITY MANAGEMENT</p><h2>Role assignments</h2><p className="muted">Partner and driver roles require a matching approved profile on the server.</p></div></div>{message && <div className="form-success">{message}</div>}<div className="operations-table"><div className="table-row table-head"><span>User</span><span>Email</span><span>Role</span><span>Action</span></div>{users.map((user) => <div className="table-row" key={String(user.id)}><strong>{String(user.name ?? `User ${user.id}`)}</strong><span>{String(user.email ?? '')}</span><select value={roles[String(user.id)] ?? 'patient'} onChange={(event) => setRoles((current) => ({ ...current, [String(user.id)]: event.target.value }))}><option value="patient">Patient</option><option value="pharmacy">Pharmacy</option><option value="warehouse">Warehouse</option><option value="driver">Driver</option><option value="admin">Admin</option></select><button className="ghost-button" onClick={() => void update(Number(user.id))}>Save role</button></div>)}</div></section></section>
}

function PartnerManagementPanel({ section }: { section: string }) {
  const [partners, setPartners] = useState<Array<Record<string, unknown>>>([])
  const [message, setMessage] = useState('')
  const load = async () => { try { const response = await api.get('/admin/partners', { params: { per_page: 100 } }); setPartners(response.data.data ?? []) } catch { setPartners([]) } }
  useEffect(() => { if (section === 'partners') void load() }, [section])
  const decide = async (id: number, decision: 'approve' | 'reject' | 'correction') => { try { await api.post(`/admin/partners/${id}/decision`, { decision, note: decision === 'correction' ? 'Please provide corrected partner documentation.' : undefined }, mutationConfig('partner-decision', id, decision)); setMessage(`Partner ${decision === 'correction' ? 'sent for correction' : `${decision}d`}.`); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update partner.' : 'Unable to update partner.') } }
  if (section !== 'partners') return null
  return <section className="content"><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">PARTNER OPERATIONS</p><h2>Partner management</h2><p className="muted">Review pharmacy, warehouse, and driver applications before operational access.</p></div></div>{message && <div className="form-success">{message}</div>}<div className="operations-table"><div className="table-row table-head"><span>Partner</span><span>Type and license</span><span>Status</span><span>Action</span></div>{partners.length === 0 ? <div className="state">No partner applications available.</div> : partners.map((partner) => <div className="table-row" key={String(partner.id)}><strong>{String(partner.business_name ?? `Partner ${partner.id}`)}</strong><span>{String(partner.type ?? '')} · {String(partner.license_number ?? 'License pending')}</span><span className="status-pill">{String(partner.approval_status ?? 'pending')}</span><div className="row-actions">{partner.approval_status === 'pending' && <><button className="approve-button" onClick={() => void decide(Number(partner.id), 'approve')}>Approve</button><button className="reject-button" onClick={() => void decide(Number(partner.id), 'reject')}>Reject</button><button className="ghost-button" onClick={() => void decide(Number(partner.id), 'correction')}>Correction</button></>}</div></div>)}</div></section></section>
}

function ProcurementCreatePanel({ section }: { section: string }) {
  const [warehouses, setWarehouses] = useState<Array<Record<string, unknown>>>([])
  const [medicines, setMedicines] = useState<Array<Record<string, unknown>>>([])
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKey = useRef<string | null>(null)
  useEffect(() => { if (section !== 'procurement') return; Promise.all([api.get('/partners', { params: { type: 'warehouse', per_page: 100 } }), api.get('/medicines', { params: { available_only: true, inventory_type: 'warehouse', per_page: 100 } })]).then(([partnerResponse, medicineResponse]) => { setWarehouses(partnerResponse.data.data ?? []); setMedicines(medicineResponse.data.data ?? []) }).catch(() => { setWarehouses([]); setMedicines([]) }) }, [section])
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (submitting) return; const formElement = event.currentTarget; const form = new FormData(formElement); const key = idempotencyKey.current ?? (typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : `web-procurement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`); idempotencyKey.current = key; setSubmitting(true); try { await api.post('/procurement', { warehouse_id: Number(form.get('warehouse_id')), delivery_address_snapshot: String(form.get('delivery_address_snapshot')), items: [{ medicine_id: Number(form.get('medicine_id')), quantity: Number(form.get('quantity')) }] }, { headers: { 'Idempotency-Key': key } }); setMessage('Procurement order submitted.'); formElement.reset(); idempotencyKey.current = null } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to create procurement order.' : 'Unable to create procurement order.') } finally { setSubmitting(false) } }
  if (section !== 'procurement') return null
  return <section className="content"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">PHARMACY PROCUREMENT</p><h2>Request warehouse stock</h2><p className="muted">Stock is validated and reserved transactionally by the API.</p></div></div><form className="inline-form" onSubmit={submit}><select name="warehouse_id" required><option value="">Choose warehouse</option>{warehouses.map((warehouse) => <option key={String(warehouse.id)} value={String(warehouse.id)}>{String(warehouse.business_name ?? warehouse.name ?? `Warehouse ${warehouse.id}`)}</option>)}</select><select name="medicine_id" required><option value="">Choose medicine</option>{medicines.map((medicine) => <option key={String(medicine.id)} value={String(medicine.id)}>{String(medicine.name_en)} · {String(medicine.manufacturer ?? '')}</option>)}</select><input name="quantity" type="number" min="1" placeholder="Quantity" required /><input name="delivery_address_snapshot" placeholder="Delivery address" required /><button className="primary-button" type="submit">Create procurement</button></form>{message && <div className="form-success">{message}</div>}</section></section>
}

function PrescriptionReviewPanel({ section }: { section: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [message, setMessage] = useState('')
  const load = async () => { try { const response = await api.get('/pharmacy/prescriptions', { params: { status: 'pending_review', per_page: 50 } }); setRows(response.data.data ?? []) } catch { setRows([]) } }
  useEffect(() => { if (section === 'orders') void load() }, [section])
  const review = async (id: number, decision: 'approve' | 'reject') => { try { await api.post(`/pharmacy/prescriptions/${id}/review`, { decision }, mutationConfig('prescription-review', id, decision)); setMessage(`Prescription ${decision === 'approve' ? 'approved' : 'rejected'}.`); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to review prescription.' : 'Unable to review prescription.') } }
  if (section !== 'orders') return null
  return <section className="content"><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">PHARMACY SAFETY REVIEW</p><h2>Prescription queue</h2><p className="muted">Review private prescription evidence before accepting the patient order.</p></div><span className="live-status"><i /> Restricted access</span></div>{message && <div className="form-success">{message}</div>}<div className="operations-table"><div className="table-row table-head"><span>Order</span><span>Submitted</span><span>Status</span><span>Action</span></div>{rows.length === 0 ? <div className="state">No prescriptions awaiting review.</div> : rows.map((row) => <div className="table-row" key={String(row.id)}><strong>{String(row.order_public_id ?? `Order ${row.order_id}`)}</strong><span>{String(row.created_at ?? '')}</span><span className="status-pill">{String(row.status)}</span><div className="row-actions"><button className="ghost-button" onClick={() => void downloadPrivate(`/prescriptions/${Number(row.id)}/download`, `medline-prescription-${row.id}`)}>View file</button><button className="approve-button" onClick={() => void review(Number(row.id), 'approve')}>Approve</button><button className="reject-button" onClick={() => void review(Number(row.id), 'reject')}>Reject</button></div></div>)}</div></section></section>
}

function SettingsPage({ role, locale, onLocaleChange }: { role: string; locale: string; onLocaleChange: (locale: string) => void }) {
  const [preferences, setPreferences] = useState<Record<string, boolean>>({ in_app_enabled: true, push_enabled: true, email_enabled: true, sms_enabled: false })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [twoFactorSecret, setTwoFactorSecret] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const busyPreferenceKeys = useRef(new Set<string>())
  useEffect(() => { api.get('/notification-preferences').then((response) => setPreferences((current) => ({ ...current, ...(response.data.preferences ?? {}) }))).catch(() => setMessage('Unable to load notification preferences.')).finally(() => setLoading(false)); if (role === 'admin') api.get('/auth/2fa/status').then((response) => setTwoFactorEnabled(Boolean(response.data.enabled))).catch(() => undefined) }, [role])
  const update = async (key: string, value: boolean) => { if (busyPreferenceKeys.current.has(key)) return; busyPreferenceKeys.current.add(key); const previous = preferences[key]; setPreferences((current) => ({ ...current, [key]: value })); setMessage(''); try { await api.patch('/notification-preferences', { [key]: value }, mutationConfig('notification-preference', key, value ? 'on' : 'off')); setMessage('Notification preferences saved.') } catch { setPreferences((current) => ({ ...current, [key]: previous })); setMessage('Unable to save this preference.') } finally { busyPreferenceKeys.current.delete(key) } }
  const setupTwoFactor = async () => { if (twoFactorEnabled) { setMessage('Two-factor authentication is already enabled.'); return } try { const response = await api.post('/auth/2fa/setup', {}, mutationConfig('2fa', 'self', 'setup')); setTwoFactorSecret(response.data.secret ?? ''); setMessage('Scan or save the secret, then enter a current authenticator code to confirm.') } catch { setMessage('Unable to start two-factor setup.') } }
  const confirmTwoFactor = async () => { try { await api.post('/auth/2fa/confirm', { code: twoFactorCode }, mutationConfig('2fa', 'self', 'confirm')); setMessage('Two-factor authentication enabled.'); setTwoFactorEnabled(true); setTwoFactorSecret(''); setTwoFactorCode('') } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Invalid authenticator code.' : 'Invalid authenticator code.') } }
  const disableTwoFactor = async () => { try { await api.post('/auth/2fa/disable', { code: twoFactorCode }, mutationConfig('2fa', 'self', 'disable')); setMessage('Two-factor authentication disabled.'); setTwoFactorEnabled(false); setTwoFactorCode('') } catch { setMessage('Unable to disable two-factor authentication.') } }
  const changeLocale = async (next: string) => { onLocaleChange(next); try { await api.patch('/profile', { locale: next }, mutationConfig('profile-locale', 'self', next)) } catch { setMessage(tr('localePending', locale)) } }
  const text = (key: string) => tr(key, locale)
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('account')}</p><h1>{text('settings')}</h1><p className="muted">{text('settingsDescription')}</p></div></div><section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">{text('language')}</p><h2>{text('interfaceDirection')}</h2></div></div><div className="setting-row"><span><strong>{text('language')}</strong><small>{text('languageHint')}</small></span><select aria-label={text('language')} value={locale} onChange={(event) => void changeLocale(event.target.value)}><option value="en">English · LTR</option><option value="ar">{'\\u0627\\u0644\\u0639\\u0631\\u0628\\u064a\\u0629'} · RTL</option></select></div><div className="panel-heading"><div><p className="eyebrow">{text('notifications')}</p><h2>{text('deliveryPreferences')}</h2></div></div>{loading ? <div className="state">{text('loadingPreferences')}</div> : Object.entries({ in_app_enabled: text('inAppNotifications'), push_enabled: text('pushNotifications'), email_enabled: text('emailNotifications'), sms_enabled: text('smsNotifications') }).map(([key, label]) => <label className="setting-row" key={key}><span><strong>{label}</strong><small>{text('channelHint')}</small></span><input type="checkbox" checked={Boolean(preferences[key])} onChange={(event) => void update(key, event.target.checked)} /></label>)}{role === 'admin' && <div className="two-factor-box"><div className="panel-heading"><div><p className="eyebrow">{text('adminSecurity')}</p><h2>{text('authenticatorProtection')}</h2></div></div><button className="primary-button" onClick={() => void setupTwoFactor()}>{text('generateSetupSecret')}</button>{twoFactorSecret && <><p className="muted">Secret: {twoFactorSecret}</p><input aria-label={text('authenticatorCode')} inputMode="numeric" maxLength={6} value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value)} placeholder={text('authenticatorCode')} /><div className="row-actions"><button className="approve-button" onClick={() => void confirmTwoFactor()}>{text('confirmTwoFactor')}</button><button className="reject-button" onClick={() => void disableTwoFactor()}>{text('disableTwoFactor')}</button></div></>}{message && <div className="form-success">{message}</div>}</div>}</section></section>
}

function AdminTwoFactorPanel({ locale }: { locale: string }) {
  const [enabled, setEnabled] = useState(false)
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const text = (key: string) => tr(key, locale)
  useEffect(() => { api.get('/auth/2fa/status').then((response) => setEnabled(Boolean(response.data.enabled))).catch(() => setMessage(text('securityLoadFailed'))) }, [])
  const setup = async () => { try { const response = await api.post('/auth/2fa/setup', {}, mutationConfig('2fa', 'self', 'setup')); setSecret(String(response.data.secret ?? '')); setMessage(text('twoFactorSecretHint')) } catch { setMessage(text('twoFactorSetupFailed')) } }
  const confirm = async () => { try { await api.post('/auth/2fa/confirm', { code }, mutationConfig('2fa', 'self', 'confirm')); setEnabled(true); setSecret(''); setCode(''); setMessage(text('twoFactorEnabledMessage')) } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? text('invalidAuthenticator') : text('invalidAuthenticator')) } }
  const disable = async () => { try { await api.post('/auth/2fa/disable', { code }, mutationConfig('2fa', 'self', 'disable')); setEnabled(false); setCode(''); setMessage(text('twoFactorDisabledMessage')) } catch { setMessage(text('twoFactorDisableFailed')) } }
  return <section className="content"><section className="panel settings-panel two-factor-box"><div className="panel-heading"><div><p className="eyebrow">{text('adminSecurity')}</p><h2>{text('authenticatorProtection')}</h2></div></div>{enabled ? <><p className="muted">{text('twoFactorDisableHint')}</p><input aria-label={text('authenticatorCode')} inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder={text('authenticatorCode')} /><button className="reject-button" type="button" onClick={() => void disable()}>{text('disableTwoFactor')}</button></> : secret ? <><p className="muted">{text('twoFactorSecretHint')}</p><p className="muted">Secret: {secret}</p><input aria-label={text('authenticatorCode')} inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder={text('authenticatorCode')} /><button className="approve-button" type="button" onClick={() => void confirm()}>{text('confirmTwoFactor')}</button></> : <button className="primary-button" type="button" onClick={() => void setup()}>{text('generateSetupSecret')}</button>}{message && <div className="form-success" role="status">{message}</div>}</section></section>
}

export function AdminSettingsPage({ locale, onLocaleChange }: { locale: string; onLocaleChange: (locale: string) => void }) {
  const [enabled, setEnabled] = useState(false)
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.get('/auth/2fa/status').then((response) => setEnabled(Boolean(response.data.enabled))).catch(() => setMessage('Unable to load administrator security status.')).finally(() => setLoading(false)) }, [])
  const setup = async () => { try { const response = await api.post('/auth/2fa/setup', {}, mutationConfig('2fa', 'self', 'setup')); setSecret(String(response.data.secret ?? '')); setMessage('Save the secret and enter a current authenticator code.') } catch { setMessage('Unable to start two-factor setup.') } }
  const confirm = async () => { try { await api.post('/auth/2fa/confirm', { code }, mutationConfig('2fa', 'self', 'confirm')); setEnabled(true); setSecret(''); setCode(''); setMessage('Two-factor authentication enabled.') } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Invalid authenticator code.' : 'Invalid authenticator code.') } }
  const disable = async () => { try { await api.post('/auth/2fa/disable', { code }, mutationConfig('2fa', 'self', 'disable')); setEnabled(false); setCode(''); setMessage('Two-factor authentication disabled.') } catch { setMessage('Unable to disable two-factor authentication.') } }
  const text = (key: string) => tr(key, locale)
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('account')}</p><h1>{text('settings')}</h1><p className="muted">{text('settingsDescription')}</p></div></div><section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">{text('language')}</p><h2>{text('interfaceDirection')}</h2></div></div><div className="setting-row"><span><strong>{text('language')}</strong><small>{text('languageHint')}</small></span><select aria-label={text('language')} value={locale} onChange={(event) => void onLocaleChange(event.target.value)}><option value="en">English · LTR</option><option value="ar">العربية · RTL</option></select></div><div className="panel-heading"><div><p className="eyebrow">{text('adminSecurity')}</p><h2>{text('authenticatorProtection')}</h2></div></div>{loading ? <div className="state">{text('loading')}</div> : <><p className="muted">{enabled ? 'Two-factor authentication is enabled.' : 'Two-factor authentication is not enabled.'}</p>{!enabled && <button className="primary-button" type="button" onClick={() => void setup()}>{text('generateSetupSecret')}</button>}{(secret || enabled) && <><p className="muted">{secret ? `Secret: ${secret}` : 'Enter your current authenticator code to disable 2FA.'}</p><input aria-label={text('authenticatorCode')} inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder={text('authenticatorCode')} /><div className="row-actions">{secret && <button className="approve-button" type="button" onClick={() => void confirm()}>{text('confirmTwoFactor')}</button>}{enabled && <button className="reject-button" type="button" onClick={() => void disable()}>{text('disableTwoFactor')}</button>}</div></>}</>}{message && <div className="form-success" role="status">{message}</div>}</section></section>
}

function LoginPage({ locale, onAuthenticated }: { locale: string; onAuthenticated: (user: Record<string, unknown>) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [resetRequested, setResetRequested] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirmation, setResetConfirmation] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const text = (key: string) => tr(key, locale)
  const login = async (event: FormEvent) => { event.preventDefault(); setError(''); setLoading(true); try { const response = await api.post('/auth/login', { email, password, transport: 'cookie', ...(twoFactorCode ? { two_factor_code: twoFactorCode } : {}) }); localStorage.setItem('medline_token', response.data.token); localStorage.removeItem('medline_refresh_token'); onAuthenticated(response.data.user ?? {}) } catch (requestError) { setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to sign in.' : 'Unable to sign in.') } finally { setLoading(false) } }
  const requestReset = async (event: FormEvent) => { event.preventDefault(); setError(''); setLoading(true); try { const response = await api.post('/auth/forgot-password', { email }); setRecoveryMessage(response.data.message ?? 'Recovery instructions have been sent if the account exists.'); setResetRequested(true) } catch (requestError) { setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to request password recovery.' : 'Unable to request password recovery.') } finally { setLoading(false) } }
  const completeReset = async (event: FormEvent) => { event.preventDefault(); setError(''); setLoading(true); try { const response = await api.post('/auth/reset-password', { email, token: resetToken, password: resetPassword, password_confirmation: resetConfirmation }); setRecoveryMessage(response.data.message ?? 'Password reset successfully.'); setRecoveryMode(false); setResetToken(''); setResetPassword(''); setResetConfirmation('') } catch (requestError) { setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to reset password.' : 'Unable to reset password.') } finally { setLoading(false) } }
  return <div className="login-page"><div className="login-card"><div className="brand login-brand"><div className="brand-mark">M</div><div><strong>MedLine</strong><span>{text('healthcareLogistics')}</span></div></div><p className="eyebrow">{text('secureOperations')}</p><h1>{recoveryMode ? (resetRequested ? text('resetYourPassword') : text('recoverPassword')) : text('welcomeBack')}</h1><p className="muted">{recoveryMode ? (resetRequested ? text('resetHint') : text('recoveryHint')) : text('signInWorkspace')}</p>{recoveryMode ? (resetRequested ? <form onSubmit={completeReset}><label>{text('emailAddress')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>{text('resetToken')}<input value={resetToken} onChange={(event) => setResetToken(event.target.value)} minLength={64} required /></label><label>{text('newPassword')}<input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={8} required /></label><label>{text('confirmPassword')}<input type="password" value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} minLength={8} required /></label>{recoveryMessage && <div className="form-success">{recoveryMessage}</div>}{error && <div className="form-error">{error}</div>}<button className="primary-button login-button" disabled={loading}>{loading ? text('resetting') : text('resetPassword')}</button><button type="button" className="text-button" onClick={() => { setRecoveryMode(false); setResetRequested(false); setError(''); setRecoveryMessage('') }}>{text('backToSignIn')}</button></form> : <form onSubmit={requestReset}><label>{text('emailAddress')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{recoveryMessage && <div className="form-success">{recoveryMessage}</div>}{error && <div className="form-error">{error}</div>}<button className="primary-button login-button" disabled={loading}>{loading ? text('sending') : text('sendRecovery')}</button><button type="button" className="text-button" onClick={() => { setRecoveryMode(false); setError(''); setRecoveryMessage('') }}>{text('backToSignIn')}</button></form>) : <form onSubmit={login}><label>{text('emailAddress')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@medline.local" required /></label><label>{text('password')}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" required /></label><label>{text('authCodeLabel')}<input inputMode="numeric" maxLength={6} value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value)} placeholder={text('optionalCode')} /></label>{recoveryMessage && <div className="form-success">{recoveryMessage}</div>}{error && <div className="form-error">{error}</div>}<button className="primary-button login-button" disabled={loading}>{loading ? text('signingIn') : text('signIn')}</button><button type="button" className="text-button" onClick={() => { setRecoveryMode(true); setResetRequested(false); setError(''); setRecoveryMessage('') }}>{text('forgotPassword')}</button></form>}</div></div>
}

export function Dashboard({ role }: { role: string }) {
  const roleTitle = role === 'pharmacy' ? 'Pharmacy workspace' : role === 'warehouse' ? 'Warehouse workspace' : role === 'driver' ? 'Driver workspace' : role === 'patient' ? 'Patient workspace' : 'Admin workspace'
  useEffect(() => { document.title = `MedLine · ${roleTitle}` }, [roleTitle])
  const [query, setQuery] = useState('')
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [loading, setLoading] = useState(false)
  const [metrics, setMetrics] = useState<DashboardMetrics>({})
  useEffect(() => { const timer = window.setTimeout(async () => { setLoading(true); try { const response = await api.get('/medicines', { params: { search: query, per_page: 6 } }); setMedicines(response.data.data ?? []) } finally { setLoading(false) } }, 300); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => {
    let active = true
    let inFlight = false
    const loadMetrics = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const response = await api.get(role === 'admin' ? '/admin/dashboard' : '/dashboard')
        if (active) { dashboardMetrics = response.data.metrics ?? {}; setMetrics(dashboardMetrics) }
      } catch {
        if (active) { dashboardMetrics = {}; setMetrics({}) }
      } finally { inFlight = false }
    }
    void loadMetrics()
    const timer = window.setInterval(() => void loadMetrics(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [role])
  const metric = (key: string) => String(metrics[key] ?? 0)
  useEffect(() => { if (role === 'admin' && metrics.orders !== undefined) document.title = `MedLine · ${metric('orders')} orders` }, [metrics, role])
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">TUESDAY, 18 AUGUST 2026</p><h1>Good afternoon, Admin</h1><p className="muted">Here is what is happening across MedLine today.</p></div><button className="primary-button"><ClipboardList size={17} /> View orders</button></div><div className="metric-grid"><Metric label="Active orders" value="128" change="12.5%" icon={<ClipboardList />} tone="blue" /><Metric label="Pending verification" value="14" change="3.2%" icon={<ShieldCheck />} tone="violet" /><Metric label="In delivery" value="36" change="8.1%" icon={<Truck />} tone="orange" /><Metric label="Registered partners" value="284" change="14.8%" icon={<Users />} tone="green" /></div><div className="dashboard-grid"><section className="panel search-panel"><div className="panel-heading"><div><p className="eyebrow">CATALOG</p><h2>Medicine search</h2></div></div><div className="search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by medicine, manufacturer, or code..." /></div><div className="medicine-list">{loading ? <div className="state">Searching the catalog...</div> : medicines.length === 0 ? <div className="state">No medicines found.</div> : medicines.map((medicine) => <div className="medicine-card" key={medicine.id}><div className="medicine-icon">Rx</div><div className="medicine-info"><strong>{medicine.name_en}</strong><span>{medicine.name_ar} · {medicine.manufacturer ?? 'Manufacturer pending'}</span></div><div className="medicine-tag">{medicine.prescription_required ? 'Prescription' : 'No prescription'}</div><ChevronRight size={17} className="chevron" /></div>)}</div></section><section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">OPERATIONS</p><h2>Recent activity</h2></div></div><Activity icon="OK" title="Order ML-2048 completed" detail="Central Pharmacy · 8 min ago" tone="green" /><Activity icon="!" title="New partner verification" detail="Al-Shifa Warehouse · 21 min ago" tone="orange" /><Activity icon="→" title="Driver claimed delivery" detail="Order ML-2045 · 42 min ago" tone="blue" /><Activity icon="OK" title="Subscription renewed" detail="CarePoint Pharmacy · 1 hr ago" tone="violet" /></section></div><section className="panel workflow-panel"><div className="panel-heading"><div><p className="eyebrow">WORKFLOW HEALTH</p><h2>Today at a glance</h2></div><span className="live-status"><i /> Live data</span></div><div className="workflow"><Workflow label="New orders" value="42" percent={72} color="blue" /><Workflow label="Pharmacy review" value="18" percent={43} color="violet" /><Workflow label="Ready for delivery" value="27" percent={58} color="orange" /><Workflow label="Completed today" value="91" percent={84} color="green" /></div></section></section>
}

function LiveDashboard({ role, locale }: { role: string; locale: string }) {
  const [query, setQuery] = useState('')
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [suggestions, setSuggestions] = useState<Array<Record<string, unknown>>>([])
  const [emptySuggestions, setEmptySuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [metrics, setMetrics] = useState<Record<string, number>>({})
  const searchGeneration = useRef(0)
  const roleTitle = `${tr(`role_${role}`, locale)} ${tr('workspace', locale)}`
  useEffect(() => { const generation = ++searchGeneration.current; const timer = window.setTimeout(async () => { setLoading(true); try { const response = await api.get('/medicines', { params: { search: query, per_page: 6 } }); if (generation !== searchGeneration.current) return; setMedicines(response.data.data ?? []); setEmptySuggestions(response.data.suggested_queries ?? []); if (query.trim().length >= 2) { const suggestionResponse = await api.get('/medicines/suggestions', { params: { search: query } }); if (generation !== searchGeneration.current) return; setSuggestions(suggestionResponse.data.data ?? []) } else setSuggestions([]) } catch { if (generation !== searchGeneration.current) return; setMedicines([]); setSuggestions([]); setEmptySuggestions([]) } finally { if (generation === searchGeneration.current) setLoading(false) } }, 300); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => {
    let active = true
    let inFlight = false
    const loadMetrics = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const response = await api.get(role === 'admin' ? '/admin/dashboard' : '/dashboard')
        if (active) { dashboardMetrics = response.data.metrics ?? {}; setMetrics(dashboardMetrics) }
      } catch {
        if (active) { dashboardMetrics = {}; setMetrics({}) }
      } finally { inFlight = false }
    }
    void loadMetrics()
    const timer = window.setInterval(() => void loadMetrics(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [role])
  useEffect(() => { document.title = `MedLine · ${roleTitle}` }, [roleTitle])
  const selectSuggestion = (value: string) => setQuery(value)
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">MEDLINE OPERATIONS</p><h1>{roleTitle}</h1><p className="muted">{tr('guidance', locale)}</p></div></div><div className="metric-grid"><Metric label="Active orders" value="0" change="Live" icon={<ClipboardList />} tone="blue" /><Metric label="Pending verification" value="0" change="Live" icon={<ShieldCheck />} tone="violet" /><Metric label="In delivery" value="0" change="Live" icon={<Truck />} tone="orange" /><Metric label="Registered partners" value="0" change="Live" icon={<Users />} tone="green" /></div><div className="dashboard-grid"><section className="panel search-panel"><div className="panel-heading"><div><p className="eyebrow">{tr('catalog', locale)}</p><h2>{tr('medicineSearch', locale)}</h2></div></div><div className="search-box"><Search size={19} aria-hidden="true" /><input aria-label={tr('medicineSearch', locale)} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('searchPlaceholder', locale)} /></div>{suggestions.length > 0 && <div className="suggestion-list" aria-label={tr('medicineSearch', locale)}>{suggestions.slice(0, 5).map((suggestion) => <button type="button" className="suggestion-chip" key={String(suggestion.id)} onClick={() => selectSuggestion(String(suggestion.name_en ?? ''))}>{String(suggestion.name_en ?? suggestion.name_ar ?? tr('medicineSearch', locale))}<small>{String(suggestion.match_score ?? '')}</small></button>)}</div>}<div className="medicine-list" aria-busy={loading}>{loading ? <div className="state" role="status">{tr('searching', locale)}</div> : medicines.length === 0 ? <div className="state" role="status">{tr('noMedicines', locale)}</div> : medicines.map((medicine) => <div className="medicine-card" key={medicine.id}><div className="medicine-icon" aria-hidden="true">Rx</div><div className="medicine-info"><strong>{medicine.name_en}</strong><span>{medicine.name_ar} · {medicine.manufacturer ?? tr('manufacturerPending', locale)}</span></div><div className="medicine-tag">{medicine.prescription_required ? tr('prescription', locale) : tr('noPrescription', locale)}</div><ChevronRight size={17} aria-hidden="true" className="chevron" /></div>)}</div>{medicines.length === 0 && emptySuggestions.length > 0 && <div className="empty-suggestions"><span>{tr('tryInstead', locale)}</span>{emptySuggestions.map((suggestion) => <button type="button" className="text-button" key={suggestion} onClick={() => selectSuggestion(suggestion)}>{suggestion}</button>)}</div>}</section><section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">{tr('operations', locale)}</p><h2>{tr('roleMetrics', locale)}</h2></div><span className="live-status" role="status"><i aria-hidden="true" /> {tr('liveData', locale)}</span></div><Activity icon="OK" title={`${String(metrics.orders ?? 0)} ${tr('ordersInScope', locale)}`} detail={`${String(metrics.active_deliveries ?? 0)} ${tr('activeDeliveries', locale)}`} tone="green" /><Activity icon="!" title={`${String(metrics.pending_orders ?? metrics.pending_procurement ?? 0)} ${tr('itemsPending', locale)}`} detail={`${String(metrics.low_stock_items ?? 0)} ${tr('lowStockItems', locale)}`} tone="orange" /></section></div></section>
}

function DashboardAlerts({ role, locale }: { role: string; locale: string }) {
  const [alerts, setAlerts] = useState<Array<Record<string, unknown>>>([])
  useEffect(() => {
    if (role !== 'admin') return
    let active = true
    let inFlight = false
    const loadAlerts = async () => {
      if (inFlight) return
      inFlight = true
      try { const response = await api.get('/admin/dashboard'); if (active) setAlerts(response.data.alerts ?? []) }
      catch { if (active) setAlerts([]) }
      finally { inFlight = false }
    }
    void loadAlerts()
    const timer = window.setInterval(() => void loadAlerts(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [role])
  if (role !== 'admin') return null
  return <section className="content"><section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">{tr('operationalAlerts', locale)}</p><h2>{tr('itemsAttention', locale)}</h2></div><span className="live-status" role="status"><i aria-hidden="true" /> {tr('liveData', locale)}</span></div>{alerts.length === 0 ? <div className="state" role="status">{tr('noActiveAlerts', locale)}</div> : alerts.map((alert) => { const severity = String(alert.severity ?? 'info').toLowerCase(); return <div className="activity-item" key={String(alert.key)}><div className={`activity-icon ${severity === 'critical' ? 'orange' : 'blue'}`} aria-hidden="true">{String(alert.count ?? 0)}</div><div><strong>{String(alert.message ?? tr('operationalAlert', locale))}</strong><span>{severity === 'critical' ? tr('critical', locale) : tr('info', locale)}</span></div></div> })}</section></section>
}

function NotificationHealthPanel({ role, locale }: { role: string; locale: string }) {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    if (role !== 'admin') return
    let active = true
    let inFlight = false
    const loadHealth = async () => {
      if (inFlight) return
      inFlight = true
      try { const response = await api.get('/admin/notification-delivery-health'); if (active) setHealth(response.data) }
      catch { /* Preserve the last successful health snapshot during transient outages. */ }
      finally { inFlight = false }
    }
    void loadHealth()
    const timer = window.setInterval(() => void loadHealth(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [role])
  if (role !== 'admin' || !health) return null
  const totals = (health.totals ?? {}) as Record<string, unknown>
  const byStatus = (totals.by_status ?? {}) as Record<string, unknown>
  const failures = Array.isArray(health.recent_failures) ? health.recent_failures : []
  return <section className="content"><section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">{tr('notificationHealth', locale)}</p><h2>{tr('last24Hours', locale)}</h2></div><span className="live-status" role="status"><i aria-hidden="true" /> {tr('operationalView', locale)}</span></div><div className="metric-grid"><Metric label={tr('notificationAttempts', locale)} value={String(totals.attempts ?? 0)} change="Live" icon={<Bell />} tone="blue" /><Metric label={tr('notificationFailures', locale)} value={String(byStatus.failed ?? 0)} change="Live" icon={<Bell />} tone="orange" /></div>{failures.length === 0 ? <div className="state" role="status">{tr('noNotificationFailures', locale)}</div> : failures.slice(0, 5).map((failure, index) => { const row = failure as Record<string, unknown>; return <div className="activity-item" key={`${String(row.notification_id ?? index)}-${String(row.channel ?? '')}`}><div className="activity-icon orange" aria-hidden="true">!</div><div><strong>{String(row.notification_type ?? tr('notificationDelivery', locale))}</strong><span>{String(row.channel ?? 'unknown')} · {String(row.provider ?? tr('provider', locale))} · {String(row.http_status ?? tr('deliveryFailure', locale))}</span></div></div> })}</section></section>
}

function MedicineAdminPage({ locale }: { locale: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  useEffect(() => { document.title = `MedLine · ${tr('medicineCatalog', locale)}` }, [locale])
  const text = (key: string) => tr(key, locale)
  const load = async () => { setLoading(true); try { const response = await api.get('/medicines', { params: { per_page: 50 } }); setRows(response.data.data ?? []) } catch { setRows([]) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api.post('/medicines', form, { headers: mutationConfig('medicine', uniqueMutationId('medicine'), 'create').headers }); setMessage('Medicine created.'); event.currentTarget.reset(); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to create medicine.' : 'Unable to create medicine.') } }
  const deactivate = async (id: number) => { try { await api.delete(`/medicines/${id}`, mutationConfig('medicine', id, 'deactivate')); setMessage('Medicine deactivated.'); await load() } catch { setMessage('Unable to deactivate medicine.') } }
  const importCatalog = async () => { if (!importFile) return; const form = new FormData(); form.append('file', importFile); try { const response = await api.post('/medicines/import', form, { headers: mutationConfig('medicine-import', 'catalog', 'upload').headers }); setMessage(response.data.message ?? 'Catalog imported.'); setImportFile(null); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to import catalog.' : 'Unable to import catalog.') } }
  const exportCatalog = async () => { try { const response = await api.get('/medicines/export', { responseType: 'blob' }); const url = window.URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'medline-medicine-catalog.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.URL.revokeObjectURL(url); setMessage('Catalog export downloaded.') } catch { setMessage('Unable to export catalog.') } }
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('catalogAdministration')}</p><h1>{text('medicineCatalog')}</h1><p className="muted">{text('bilingualRecords')}</p></div><div className="row-actions"><button className="ghost-button" type="button" onClick={() => void exportCatalog()}>{text('exportCatalog')}</button><label className="file-field">{text('chooseCsv')}<input type="file" accept=".csv,text/csv" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} /></label><button className="primary-button" type="button" disabled={!importFile} onClick={() => void importCatalog()}>{text('importCsv')}</button></div></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('newRecord')}</p><h2>{text('addMedicine')}</h2></div></div><form className="inline-form" onSubmit={create}><input name="name_en" placeholder={text('englishName')} required /><input name="name_ar" placeholder={text('arabicName')} required /><input name="manufacturer" placeholder={text('manufacturer')} /><input name="form" placeholder={text('form')} /><input name="dosage" placeholder={text('dosage')} /><input name="code" placeholder={text('code')} /><label className="file-field">{text('image')}<input name="image" type="file" accept=".jpg,.jpeg,.png,.webp" /></label><label className="check-field"><input name="prescription_required" type="checkbox" value="1" /> {text('prescription')}</label><button className="primary-button" type="submit">{text('createMedicine')}</button></form>{message && <div className="form-success">{message}</div>}</section><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">{text('medicineCatalog')}</p><h2>{text('activeMedicines')}</h2></div></div>{loading ? <div className="state">{text('loadingRecords')}</div> : rows.map((row) => <div className="table-row" key={String(row.id)}><strong>{String(row.name_en)}</strong><span>{String(row.name_ar)} · {String(row.manufacturer ?? '')}</span><span className="status-pill">{row.prescription_required ? text('prescription') : text('noPrescription')}</span><button className="reject-button" type="button" onClick={() => void deactivate(Number(row.id))}>{text('deactivate')}</button></div>)}</section></section>
}

function MedicineCategoryAdmin({ locale }: { locale: string }) {
  const [categories, setCategories] = useState<Array<Record<string, unknown>>>([])
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  useEffect(() => { document.title = `MedLine · ${tr('categories', locale)}` }, [locale])
  const load = async () => { try { const response = await api.get('/medicine-categories'); setCategories(response.data.data ?? []) } catch { setCategories([]) } }
  useEffect(() => { void load() }, [])
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api.post('/medicine-categories', { name_en: form.get('name_en'), name_ar: form.get('name_ar'), slug: form.get('slug') }, mutationConfig('medicine-category', uniqueMutationId('medicine-category'), 'create')); setMessage('Category created.'); event.currentTarget.reset(); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to create category.' : 'Unable to create category.') } }
  const update = async (event: FormEvent<HTMLFormElement>, id: number) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api.patch(`/medicine-categories/${id}`, { name_en: form.get('name_en'), name_ar: form.get('name_ar'), slug: form.get('slug') }, mutationConfig('medicine-category', id, 'update')); setMessage('Category updated.'); setEditing(null); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update category.' : 'Unable to update category.') } }
  return <section className="content"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{tr('categoryTaxonomy', locale)}</p><h2>{tr('categories', locale)}</h2></div></div><form className="inline-form" onSubmit={create}><input name="name_en" placeholder={tr('englishName', locale)} required /><input name="name_ar" placeholder={tr('arabicName', locale)} required /><input name="slug" placeholder={tr('slug', locale)} pattern="[A-Za-z0-9_-]+" required /><button className="primary-button" type="submit">{tr('addCategory', locale)}</button></form>{message && <div className="form-success" role="status">{message}</div>}<div className="operations-table">{categories.map((category) => editing === Number(category.id) ? <form className="table-row" key={String(category.id)} onSubmit={(event) => void update(event, Number(category.id))}><input aria-label={tr('englishName', locale)} name="name_en" defaultValue={String(category.name_en ?? '')} required /><input aria-label={tr('arabicName', locale)} name="name_ar" defaultValue={String(category.name_ar ?? '')} required /><input aria-label={tr('slug', locale)} name="slug" defaultValue={String(category.slug ?? '')} pattern="[A-Za-z0-9_-]+" required /><div className="row-actions"><button className="approve-button" type="submit">{tr('save', locale)}</button><button className="ghost-button" type="button" onClick={() => setEditing(null)}>{tr('cancel', locale)}</button></div></form> : <div className="table-row" key={String(category.id)}><strong>{String(category.name_en)}</strong><span>{String(category.name_ar)}</span><span className="status-pill">{String(category.slug)}</span><div className="row-actions"><span>{tr('referencedCategories', locale)}</span><button className="ghost-button" type="button" onClick={() => setEditing(Number(category.id))}>{tr('edit', locale)}</button></div></div>)}</div></section></section>
}

function MedicineEditAdminPage({ locale }: { locale: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [selectedId, setSelectedId] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { document.title = `MedLine · ${tr('editMedicine', locale)}` }, [locale])
  const selected = rows.find((row) => String(row.id) === selectedId)
  useEffect(() => { api.get('/medicines', { params: { per_page: 100 } }).then((response) => setRows(response.data.data ?? [])).catch(() => setRows([])) }, [])
  const update = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedId) return; const form = new FormData(event.currentTarget); try { await api.patch(`/medicines/${selectedId}`, { name_en: form.get('name_en'), name_ar: form.get('name_ar'), manufacturer: form.get('manufacturer'), form: form.get('form'), dosage: form.get('dosage'), code: form.get('code'), prescription_required: form.get('prescription_required') === 'on', is_active: form.get('is_active') === 'on' }, mutationConfig('medicine', selectedId, 'update')); setMessage('Medicine updated.'); const response = await api.get('/medicines', { params: { per_page: 100 } }); setRows(response.data.data ?? []) } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update medicine.' : 'Unable to update medicine.') } }
  return <section className="content"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{tr('catalogRefinement', locale)}</p><h2>{tr('editMedicine', locale)}</h2></div></div><label>{tr('medicine', locale)}<select aria-label={tr('selectMedicine', locale)} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">{tr('selectMedicine', locale)}</option>{rows.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name_en)} · {String(row.code ?? row.id)}</option>)}</select></label>{selected && <form className="inline-form" key={selectedId} onSubmit={update}><input name="name_en" defaultValue={String(selected.name_en ?? '')} placeholder={tr('englishName', locale)} required /><input name="name_ar" defaultValue={String(selected.name_ar ?? '')} placeholder={tr('arabicName', locale)} required /><input name="manufacturer" defaultValue={String(selected.manufacturer ?? '')} placeholder={tr('manufacturer', locale)} /><input name="form" defaultValue={String(selected.form ?? '')} placeholder={tr('form', locale)} /><input name="dosage" defaultValue={String(selected.dosage ?? '')} placeholder={tr('dosage', locale)} /><input name="code" defaultValue={String(selected.code ?? '')} placeholder={tr('code', locale)} /><label className="check-field"><input name="prescription_required" type="checkbox" defaultChecked={Boolean(selected.prescription_required)} /> {tr('prescription', locale)}</label><label className="check-field"><input name="is_active" type="checkbox" defaultChecked={selected.is_active !== false} /> {tr('active', locale)}</label><button className="primary-button" type="submit">{tr('saveMedicine', locale)}</button></form>}{message && <div className="form-success" role="status">{message}</div>}</section></section>
}

function PartnerSubscriptionPage({ locale }: { locale: string }) {
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null)
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null)
  const [amount, setAmount] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKey = useRef<string | null>(null)
  const load = async () => { setLoading(true); try { const response = await api.get('/subscription'); setSubscription(response.data.subscription ?? null); const plans = await api.get('/subscription/plans'); setPlan(plans.data.data?.[0] ?? null) } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? tr('unableToLoadSubscription', locale) : tr('unableToLoadSubscription', locale)) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const submit = async (event: FormEvent) => { event.preventDefault(); if (submitting || !proof || !amount) return; setMessage(''); setSubmitting(true); const key = idempotencyKey.current ?? uniqueMutationId('web-payment-proof'); idempotencyKey.current = key; const form = new FormData(); form.append('amount', amount); if (plan?.code) form.append('plan_code', String(plan.code)); form.append('proof', proof); try { await api.post('/subscription/payment-proof', form, { headers: { 'Idempotency-Key': key } }); setMessage(tr('paymentSubmitted', locale)); setProof(null); idempotencyKey.current = null; await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? tr('uploadFailed', locale) : tr('uploadFailed', locale)) } finally { setSubmitting(false) } }
  const displayPlan = plan ?? {}
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{tr('partnerAccount', locale)}</p><h1>{tr('annualSubscription', locale)}</h1><p className="muted">{tr('activeSubscriptionHint', locale)}</p></div></div><div className="subscription-grid"><section className="panel subscription-status"><p className="eyebrow">{tr('currentStatus', locale)}</p><h2>{loading ? tr('loadingSubscription', locale) : String(subscription?.status ?? tr('notActive', locale))}</h2>{Boolean(subscription?.ends_at) && <p className="muted">{tr('validUntil', locale)} {String(subscription?.ends_at)}</p>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{tr('paymentReview', locale)}</p><h2>{tr('submitPaymentProof', locale)}</h2>{Boolean(displayPlan.code) && <p className="muted">{tr('configuredPlan', locale)}: {String(displayPlan.name ?? displayPlan.code)} · {String(displayPlan.amount ?? tr('contactAdministrator', locale))}</p>}</div></div><form className="subscription-form" onSubmit={submit}><label>{tr('amount', locale)}<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>{tr('receiptFile', locale)}<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setProof(event.target.files?.[0] ?? null)} required /></label><button className="primary-button" type="submit" disabled={!proof || !amount || submitting}>{tr('submitForReview', locale)}</button>{message && <div className="form-message">{message}</div>}</form></section></div></section>
}

function PartnerSubscriptionPageLegacy({ locale }: { locale: string }) {
  void locale
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null)
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null)
  const [amount, setAmount] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKey = useRef<string | null>(null)
  const load = async () => { setLoading(true); try { const response = await api.get('/subscription'); setSubscription(response.data.subscription ?? null); const plans = await api.get('/subscription/plans'); setPlan(plans.data.data?.[0] ?? null) } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to load subscription.' : 'Unable to load subscription.') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const submit = async (event: FormEvent) => { event.preventDefault(); if (submitting || !proof || !amount) return; setMessage(''); setSubmitting(true); const key = idempotencyKey.current ?? (typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : `web-payment-proof-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`); idempotencyKey.current = key; const form = new FormData(); form.append('amount', amount); if (plan?.code) form.append('plan_code', String(plan.code)); form.append('proof', proof); try { await api.post('/subscription/payment-proof', form, { headers: { 'Idempotency-Key': key } }); setMessage('Payment proof submitted for administrator review.'); setProof(null); idempotencyKey.current = null; await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Upload failed.' : 'Upload failed.') } finally { setSubmitting(false) } }
  const displayPlan = plan ?? {}
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">PARTNER ACCOUNT</p><h1>Annual subscription</h1><p className="muted">Keep your partner account active with a verified annual subscription.</p></div></div><div className="subscription-grid"><section className="panel subscription-status"><p className="eyebrow">CURRENT STATUS</p><h2>{loading ? 'Loading...' : String(subscription?.status ?? 'Not active')}</h2>{Boolean(subscription?.ends_at) && <p className="muted">Valid until {String(subscription?.ends_at)}</p>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">PAYMENT REVIEW</p><h2>Submit payment proof</h2>{Boolean(displayPlan.code) && <p className="muted">Configured plan: {String(displayPlan.name ?? displayPlan.code)} · {String(displayPlan.amount ?? 'Contact administrator')}</p>}</div></div><form className="subscription-form" onSubmit={submit}><label>Amount<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>Receipt file<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setProof(event.target.files?.[0] ?? null)} required /></label><button className="primary-button" type="submit" disabled={!proof || !amount}>Submit for review</button>{message && <div className="form-message">{message}</div>}</form></section></div></section>
}

void PartnerSubscriptionPageLegacy

function LegacyOrderDetailPanel({ detail, onClose }: { detail: Record<string, unknown>; onClose: () => void }) {
  const order = (detail.order ?? {}) as Record<string, unknown>
  const invoice = (detail.invoice ?? {}) as Record<string, unknown>
  const timeline = Array.isArray(detail.timeline) ? detail.timeline as Array<Record<string, unknown>> : []
  if (detail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>Back</button><div className="form-error">{String(detail.error)}</div></section>
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">ORDER DETAIL</p><h1>{String(order.public_id ?? order.id ?? 'Order')}</h1><p className="muted">{String(order.status ?? 'unknown').replaceAll('_', ' ')} · {String(order.created_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>Back to queue</button></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">INVOICE</p><h2>Order summary</h2></div></div><p>Subtotal: {String(invoice.subtotal ?? order.subtotal ?? '0.00')}</p><p>Delivery fee: {String(invoice.delivery_fee ?? order.delivery_fee ?? '0.00')}</p><strong>Total: {String(invoice.total ?? order.total ?? '0.00')}</strong><p className="muted">Payment: {String(invoice.payment_method ?? order.payment_method ?? 'cash_on_delivery')}</p></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">TIMELINE</p><h2>Delivery progress</h2></div></div>{timeline.length === 0 ? <div className="state">No delivery events recorded yet.</div> : timeline.map((event, index) => <div className="activity-item" key={`${String(event.id ?? index)}`}><div className="activity-icon blue">{index + 1}</div><div><strong>{String(event.to_status ?? 'Updated').replaceAll('_', ' ')}</strong><span>{String(event.created_at ?? '')}</span></div></div>)}</section></div></section>
}

void LegacyOrderDetailPanel

function OrderDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const order = (detail.order ?? {}) as Record<string, unknown>
  const invoice = (detail.invoice ?? {}) as Record<string, unknown>
  const timeline = Array.isArray(detail.timeline) ? detail.timeline as Array<Record<string, unknown>> : []
  const text = (key: string) => tr(key, locale)
  if (detail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>{text('back')}</button><div className="form-error">{String(detail.error)}</div></section>
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('orderDetail')}</p><h1>{String(order.public_id ?? order.id ?? text('order'))}</h1><p className="muted">{String(order.status ?? 'unknown').replaceAll('_', ' ')} · {String(order.created_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>{text('backToQueue')}</button></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('invoice')}</p><h2>{text('orderSummary')}</h2></div></div><p>{text('subtotal')}: {String(invoice.subtotal ?? order.subtotal ?? '0.00')}</p><p>{text('deliveryFee')}: {String(invoice.delivery_fee ?? order.delivery_fee ?? '0.00')}</p><strong>{text('total')}: {String(invoice.total ?? order.total ?? '0.00')}</strong><p className="muted">{text('payment')}: {String(invoice.payment_method ?? order.payment_method ?? 'cash_on_delivery')}</p></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('timeline')}</p><h2>{text('deliveryProgress')}</h2></div></div>{timeline.length === 0 ? <div className="state">{text('noDeliveryEvents')}</div> : timeline.map((event, index) => <div className="activity-item" key={`${String(event.id ?? index)}`}><div className="activity-icon blue">{index + 1}</div><div><strong>{String(event.to_status ?? 'Updated').replaceAll('_', ' ')}</strong><span>{String(event.created_at ?? '')}</span></div></div>)}</section></div></section>
}

function deliveryMapEmbedUrl(latitudeValue: unknown, longitudeValue: unknown): string | null {
  const latitude = Number(latitudeValue)
  const longitude = Number(longitudeValue)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  const latitudeDelta = 0.01
  const longitudeDelta = 0.015
  const query = new URLSearchParams({
    bbox: `${longitude - longitudeDelta},${latitude - latitudeDelta},${longitude + longitudeDelta},${latitude + latitudeDelta}`,
    layer: 'mapnik',
    marker: `${latitude},${longitude}`,
  })
  return `https://www.openstreetmap.org/export/embed.html?${query.toString()}`
}

function LegacyDeliveryDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const [currentDetail, setCurrentDetail] = useState(detail)
  useEffect(() => {
    setCurrentDetail(detail)
    const initialDelivery = (detail.delivery ?? {}) as Record<string, unknown>
    const deliveryId = Number(initialDelivery.id ?? 0)
    if (!deliveryId) return
    const timer = window.setInterval(() => {
      void api.get(`/deliveries/${deliveryId}`).then((response) => setCurrentDetail(response.data)).catch(() => undefined)
    }, 30000)
    return () => window.clearInterval(timer)
  }, [detail])
  const delivery = (currentDetail.delivery ?? {}) as Record<string, unknown>
  const events = Array.isArray(currentDetail.events) ? currentDetail.events as Array<Record<string, unknown>> : []
  const text = (key: string) => tr(key, locale)
  const mapUrl = deliveryMapEmbedUrl(delivery.last_latitude, delivery.last_longitude)
  if (currentDetail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>{text('backToDeliveries')}</button><div className="form-error">{String(currentDetail.error)}</div></section>
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('deliveryDetail')}</p><h1>{String(delivery.public_id ?? delivery.id ?? 'Delivery')}</h1><p className="muted">{String(delivery.status ?? 'unknown').replaceAll('_', ' ')} · {String(delivery.completed_at ?? delivery.claimed_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>{text('backToDeliveries')}</button></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('assignment')}</p><h2>{String(delivery.order_public_id ?? delivery.procurement_public_id ?? text('operationalDelivery'))}</h2></div></div><p>Address: {String(delivery.delivery_address_snapshot ?? text('privateAddress'))}</p><p>Total: {String(delivery.total ?? '0.00')}</p><p className="muted">Driver assignment: {delivery.driver_id ? text('assigned') : text('awaitingDriver')}</p></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('liveLocation')}</p><h2>{text('driverLocation')}</h2></div></div>{mapUrl && !["delivered","failed","cancelled"].includes(String(delivery.status)) ? <div><p>{text('latestActivePosition')}</p><p className="muted">{text('updated')}: {String(delivery.location_updated_at ?? text('pending'))}</p><iframe className="delivery-map" title={text('driverLocation')} src={mapUrl} loading="lazy" referrerPolicy="no-referrer" allowFullScreen /><a className="ghost-button" href={`https://www.openstreetmap.org/?mlat=${String(delivery.last_latitude)}&mlon=${String(delivery.last_longitude)}&zoom=15`} target="_blank" rel="noreferrer">{text('openMap')}</a></div> : <div className="state">{text('locationActiveOnly')}</div>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('eventTimeline')}</p><h2>{text('deliveryProgress')}</h2></div></div>{events.length === 0 ? <div className="state">{text('noDeliveryEvents')}</div> : events.map((event, index) => <div className="activity-item" key={`${String(event.id ?? index)}`}><div className="activity-icon blue">{index + 1}</div><div><strong>{String(event.to_status ?? 'Updated').replaceAll('_', ' ')}</strong><span>{String(event.created_at ?? '')}</span></div></div>)}</section></div></section>
}

void LegacyDeliveryDetailPanel

function DeliveryDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const [currentDetail, setCurrentDetail] = useState(detail)
  const text = (key: string) => tr(key, locale)
  useEffect(() => {
    setCurrentDetail(detail)
    const initialDelivery = (detail.delivery ?? {}) as Record<string, unknown>
    const deliveryId = Number(initialDelivery.id ?? 0)
    if (!deliveryId) return
    const timer = window.setInterval(() => {
      void api.get(`/deliveries/${deliveryId}`).then((response) => setCurrentDetail(response.data)).catch(() => undefined)
    }, 30000)
    return () => window.clearInterval(timer)
  }, [detail])
  const delivery = (currentDetail.delivery ?? {}) as Record<string, unknown>
  const events = Array.isArray(currentDetail.events) ? currentDetail.events as Array<Record<string, unknown>> : []
  const mapUrl = deliveryMapEmbedUrl(delivery.last_latitude, delivery.last_longitude)
  if (currentDetail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>{text('backToDeliveries')}</button><div className="form-error">{String(currentDetail.error)}</div></section>
  const terminal = ['delivered', 'failed', 'cancelled'].includes(String(delivery.status))
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('deliveryDetail')}</p><h1>{String(delivery.public_id ?? delivery.id ?? 'Delivery')}</h1><p className="muted">{String(delivery.status ?? 'unknown').replaceAll('_', ' ')} · {String(delivery.completed_at ?? delivery.claimed_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>{text('backToDeliveries')}</button></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('assignment')}</p><h2>{String(delivery.order_public_id ?? delivery.procurement_public_id ?? text('operationalDelivery'))}</h2></div></div><p>{text('address')}: {String(delivery.delivery_address_snapshot ?? text('privateAddress'))}</p><p>{text('total')}: {String(delivery.total ?? '0.00')}</p><p className="muted">{text('driverAssignment')}: {delivery.driver_id ? text('assigned') : text('awaitingDriver')}</p></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('liveLocation')}</p><h2>{text('driverLocation')}</h2></div></div>{mapUrl && !terminal ? <div><p>{text('latestActivePosition')}</p><p className="muted">{text('updated')}: {String(delivery.location_updated_at ?? text('pending'))}</p><iframe className="delivery-map" title={text('driverLocation')} src={mapUrl} loading="lazy" referrerPolicy="no-referrer" allowFullScreen /><a className="ghost-button" href={`https://www.openstreetmap.org/?mlat=${String(delivery.last_latitude)}&mlon=${String(delivery.last_longitude)}&zoom=15`} target="_blank" rel="noreferrer">{text('openMap')}</a></div> : <div className="state">{text('locationActiveOnly')}</div>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('eventTimeline')}</p><h2>{text('deliveryProgress')}</h2></div></div>{events.length === 0 ? <div className="state">{text('noDeliveryEvents')}</div> : events.map((event, index) => <div className="activity-item" key={`${String(event.id ?? index)}`}><div className="activity-icon blue">{index + 1}</div><div><strong>{String(event.to_status ?? 'Updated').replaceAll('_', ' ')}</strong><span>{String(event.created_at ?? '')}</span></div></div>)}</section></div></section>
}

function LegacyComplaintDetailPanel({ detail, onClose }: { detail: Record<string, unknown>; onClose: () => void }) {
  const complaint = (detail.complaint ?? {}) as Record<string, unknown>
  const attachments = Array.isArray(detail.attachments) ? detail.attachments as Array<Record<string, unknown>> : []
  const complaintId = Number(complaint.id ?? 0)
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">SUPPORT CASE</p><h1>{String(complaint.subject ?? `Complaint ${complaintId}`)}</h1><p className="muted">{String(complaint.status ?? 'open')} · {String(complaint.priority ?? 'normal')} · {String(complaint.created_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>Back to complaints</button></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">CASE DESCRIPTION</p><h2>{String(complaint.category ?? 'Support')}</h2></div></div><p>{String(complaint.description ?? '')}</p>{Boolean(complaint.resolution) && <><p className="eyebrow">RESOLUTION</p><p>{String(complaint.resolution)}</p></>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">PRIVATE EVIDENCE</p><h2>Attachments</h2></div></div>{attachments.length === 0 ? <div className="state">No evidence attached.</div> : attachments.map((attachment) => <div className="activity-item" key={String(attachment.id)}><div><strong>{String(attachment.original_name ?? 'Evidence file')}</strong><span>{String(attachment.mime_type ?? '')} · {String(attachment.file_size ?? '')} bytes</span></div><button className="ghost-button" onClick={() => void downloadPrivate(`/complaints/${complaintId}/attachments/${Number(attachment.id)}/download`, `medline-complaint-${complaintId}-${String(attachment.original_name ?? 'evidence')}`)}>Download</button></div>)}</section></div></section>
}

void LegacyComplaintDetailPanel

function ComplaintDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const complaint = (detail.complaint ?? {}) as Record<string, unknown>
  const attachments = Array.isArray(detail.attachments) ? detail.attachments as Array<Record<string, unknown>> : []
  const complaintId = Number(complaint.id ?? 0)
  const text = (key: string) => tr(key, locale)
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('supportCase')}</p><h1>{String(complaint.subject ?? `${text('supportCategory')} ${complaintId}`)}</h1><p className="muted">{String(complaint.status ?? 'open')} · {String(complaint.priority ?? 'normal')} · {String(complaint.created_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>{text('backToComplaints')}</button></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('caseDescription')}</p><h2>{String(complaint.category ?? text('supportCategory'))}</h2></div></div><p>{String(complaint.description ?? '')}</p>{Boolean(complaint.resolution) && <><p className="eyebrow">{text('resolution')}</p><p>{String(complaint.resolution)}</p></>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('privateEvidence')}</p><h2>{text('attachments')}</h2></div></div>{attachments.length === 0 ? <div className="state">{text('noEvidence')}</div> : attachments.map((attachment) => <div className="activity-item" key={String(attachment.id)}><div><strong>{String(attachment.original_name ?? text('evidenceFile'))}</strong><span>{String(attachment.mime_type ?? '')} · {String(attachment.file_size ?? '')} {text('bytes')}</span></div><button className="ghost-button" onClick={() => void downloadPrivate(`/complaints/${complaintId}/attachments/${Number(attachment.id)}/download`, `medline-complaint-${complaintId}-${String(attachment.original_name ?? 'evidence')}`)}>{text('download')}</button></div>)}</section></div></section>
}

function LegacyProcurementDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const procurement = (detail.procurement ?? {}) as Record<string, unknown>
  const items = Array.isArray(detail.items) ? detail.items as Array<Record<string, unknown>> : []
  const delivery = (detail.delivery ?? {}) as Record<string, unknown>
  const timeline = Array.isArray(detail.timeline) ? detail.timeline as Array<Record<string, unknown>> : []
  const text = (key: string) => tr(key, locale)
  if (detail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>{text('back')}</button><div className="form-error">{String(detail.error)}</div></section>
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">PROCUREMENT DETAIL</p><h1>{String(procurement.public_id ?? procurement.id ?? 'Procurement')}</h1><p className="muted">{String(procurement.status ?? 'unknown').replaceAll('_', ' ')} · {String(procurement.created_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>Back to procurement</button></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">ITEMS</p><h2>Requested stock</h2></div></div>{items.length === 0 ? <div className="state">No items recorded.</div> : items.map((item) => <div className="activity-item" key={String(item.id)}><div><strong>{String(item.name_en ?? 'Medicine')}</strong><span>{String(item.name_ar ?? '')} · Requested {String(item.quantity ?? 0)} · Accepted {String(item.accepted_quantity ?? 0)}</span></div><strong>{String(item.line_total ?? '')}</strong></div>)}<p className="muted">Delivery address: {String(procurement.delivery_address_snapshot ?? 'Not recorded')}</p><strong>Total: {String(procurement.total ?? '0.00')}</strong></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">DELIVERY</p><h2>{String(delivery.status ?? 'Not created').replaceAll('_', ' ')}</h2></div></div>{timeline.length === 0 ? <div className="state">No delivery events recorded yet.</div> : timeline.map((event, index) => <div className="activity-item" key={`${String(event.id ?? index)}`}><div className="activity-icon blue">{index + 1}</div><div><strong>{String(event.to_status ?? 'Updated').replaceAll('_', ' ')}</strong><span>{String(event.created_at ?? '')}</span></div></div>)}</section></div></section>
}

void LegacyProcurementDetailPanel

function ProcurementDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const procurement = (detail.procurement ?? {}) as Record<string, unknown>
  const items = Array.isArray(detail.items) ? detail.items as Array<Record<string, unknown>> : []
  const delivery = (detail.delivery ?? {}) as Record<string, unknown>
  const timeline = Array.isArray(detail.timeline) ? detail.timeline as Array<Record<string, unknown>> : []
  const text = (key: string) => tr(key, locale)
  if (detail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>{text('back')}</button><div className="form-error">{String(detail.error)}</div></section>
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('procurementDetail')}</p><h1>{String(procurement.public_id ?? procurement.id ?? 'Procurement')}</h1><p className="muted">{String(procurement.status ?? 'unknown').replaceAll('_', ' ')} · {String(procurement.created_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>{text('backToProcurement')}</button></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('items')}</p><h2>{text('requestedStock')}</h2></div></div>{items.length === 0 ? <div className="state">{text('noItems')}</div> : items.map((item) => <div className="activity-item" key={String(item.id)}><div><strong>{String(item.name_en ?? 'Medicine')}</strong><span>{String(item.name_ar ?? '')} · {text('requested')} {String(item.quantity ?? 0)} · {text('accepted')} {String(item.accepted_quantity ?? 0)}</span></div><strong>{String(item.line_total ?? '')}</strong></div>)}<p className="muted">{text('deliveryAddress')}: {String(procurement.delivery_address_snapshot ?? text('notRecorded'))}</p><strong>{text('total')}: {String(procurement.total ?? '0.00')}</strong></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('delivery')}</p><h2>{String(delivery.status ?? text('notCreated')).replaceAll('_', ' ')}</h2></div></div>{timeline.length === 0 ? <div className="state">{text('noDeliveryEvents')}</div> : timeline.map((event, index) => <div className="activity-item" key={`${String(event.id ?? index)}`}><div className="activity-icon blue">{index + 1}</div><div><strong>{String(event.to_status ?? 'Updated').replaceAll('_', ' ')}</strong><span>{String(event.created_at ?? '')}</span></div></div>)}</section></div></section>
}

function operationsEndpoint(section: string, role: string) {
  if (section === 'partners' || section === 'verification') return '/admin/partners'
  if (section === 'documents') return '/admin/verification-documents'
  if (section === 'users') return '/admin/users'
  if (section === 'inventory') return role === 'admin' ? '/medicines' : '/partner/inventory'
  if (section === 'deliveries') return role === 'admin' ? '/admin/deliveries' : role === 'patient' ? '/deliveries/mine' : role === 'driver' ? '/deliveries/available' : '/partner/deliveries'
  if (section === 'subscriptions') return role === 'admin' ? '/admin/subscriptions' : '/subscription'
  if (section === 'complaints') return role === 'admin' ? '/admin/complaints' : '/complaints'
  if (section === 'ratings') return '/admin/ratings'
  if (section === 'audit') return '/admin/audit-logs'
  if (section === 'procurement') return '/procurement'
  return role === 'pharmacy' ? '/partner/orders' : '/orders'
}

function RatingQueue({ locale }: { locale: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const busyRatingKeys = useRef(new Set<string>())
  const text = (key: string) => tr(key, locale)
  const load = async () => { try { const response = await api.get('/admin/ratings', { params: { search, per_page: 50 } }); setRows(response.data.data ?? []) } catch { setRows([]) } }
  useEffect(() => { void load() }, [search])
  const moderate = async (id: number, decision: 'hide' | 'restore') => { const key = `${id}:${decision}`; if (busyRatingKeys.current.has(key)) return; const reason = decision === 'hide' ? window.prompt(text('hideReason'), text('unsafeContent')) : null; if (decision === 'hide' && reason === null) return; busyRatingKeys.current.add(key); try { await api.post(`/admin/ratings/${id}/moderate`, { decision, ...(reason ? { reason } : {}) }, mutationConfig('rating-moderate', id, decision)); setMessage(decision === 'hide' ? text('ratingHidden') : text('ratingRestored')); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to moderate rating.' : 'Unable to moderate rating.') } finally { busyRatingKeys.current.delete(key) } }
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('trustSafety')}</p><h1>{text('ratingsModeration')}</h1><p className="muted">{text('ratingsGuidance')}</p></div></div><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">{text('ratings')}</p><h2>{text('feedbackQueue')}</h2></div><span className="live-status" role="status"><i aria-hidden="true" /> {text('auditedActions')}</span></div><div className="search-box"><Search size={19} aria-hidden="true" /><input aria-label={text('searchFeedback')} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text('searchFeedback')} /></div>{message && <div className="form-success" role="status">{message}</div>}<div className="operations-table"><div className="table-row table-head"><span>{text('order')}</span><span>{text('authorComment')}</span><span>{text('status')}</span><span>{text('action')}</span></div>{rows.length === 0 ? <div className="state" role="status">{text('noRatings')}</div> : rows.map((row) => <div className="table-row" key={String(row.id)}><strong>{String(row.public_id ?? `Rating ${row.id}`)}</strong><span>{String(row.creator_name ?? row.creator_email ?? 'User')} · {String(row.comment ?? 'No comment')} · {String(row.score ?? '?')}/5</span><span className="status-pill">{row.hidden_at ? text('hidden') : text('visible')}</span><div className="row-actions"><button type="button" className={row.hidden_at ? 'approve-button' : 'reject-button'} onClick={() => void moderate(Number(row.id), row.hidden_at ? 'restore' : 'hide')}>{row.hidden_at ? text('restore') : text('hide')}</button></div></div>)}</div></section></section>
}

function OperationsPage({ section, role, locale }: { section: string; role: string; locale: string }) {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [complaintReport, setComplaintReport] = useState<Record<string, unknown> | null>(null)
  const busyMutationKeys = useRef(new Set<string>())
  const endpoint = operationsEndpoint(section, role)
  const runMutation = async (key: string, task: () => Promise<void>) => { if (busyMutationKeys.current.has(key)) return; busyMutationKeys.current.add(key); try { await task() } catch (error) { const message = axios.isAxiosError(error) ? error.response?.data?.message ?? 'The operation could not be completed. You can retry the same action safely.' : 'The operation could not be completed. You can retry the same action safely.'; announceAccessibilityMessage(message); window.alert(message) } finally { busyMutationKeys.current.delete(key) } }
  useEffect(() => { let cancelled = false; setLoading(true); const params = section === 'verification' ? { search, status: 'pending', per_page: 8 } : section === 'documents' ? { status: 'under_review', per_page: 8 } : { search, per_page: 8 }; api.get(endpoint, { params }).then((response) => { if (cancelled) return; const data = response.data.data ?? []; setRows(data.map((item: Record<string, unknown>) => ({ id: Number(item.id ?? 0), primary: String(item.business_name ?? item.name ?? item.name_en ?? item.public_id ?? `Record ${item.id}`), secondary: String(item.email ?? item.document_type ?? item.name_ar ?? item.manufacturer ?? item.delivery_address_snapshot ?? item.status ?? 'Operational record'), status: String(item.status ?? item.approval_status ?? 'Active'), raw: item }))) }).catch(() => { if (!cancelled) setRows([]) }).finally(() => { if (!cancelled) setLoading(false) }); return () => { cancelled = true } }, [endpoint, section, search])
  useEffect(() => { if (section !== 'complaints' || role !== 'admin') { setComplaintReport(null); return } api.get('/admin/reports/complaints').then((response) => setComplaintReport(response.data)).catch(() => setComplaintReport(null)) }, [section, role, rows.length])
  const decidePartner = async (id: number, decision: 'approve' | 'reject') => runMutation(`partner:${id}:${decision}`, async () => { await api.post(`/admin/partners/${id}/decision`, { decision }, mutationConfig('partner-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const decideOrder = async (id: number, decision: 'accept' | 'reject') => runMutation(`order:${id}:${decision}`, async () => { await api.post(`/partner/orders/${id}/decision`, { decision }, mutationConfig('order-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const decideProcurement = async (id: number, decision: 'accept' | 'reject') => runMutation(`procurement:${id}:${decision}`, async () => { await api.post(`/procurement/${id}/decision`, { decision }, mutationConfig('procurement-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const decidePayment = async (id: number, decision: 'approve' | 'reject') => runMutation(`payment:${id}:${decision}`, async () => { await api.post(`/admin/subscriptions/${id}/decision`, { decision }, mutationConfig('subscription-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const updateComplaint = async (id: number, status: 'in_review' | 'resolved') => runMutation(`complaint:${id}:${status}`, async () => { await api.patch(`/complaints/${id}`, { status }, mutationConfig('complaint-status', id, status)); setRows((current) => current.map((row) => row.id === id ? { ...row, status } : row)) })
  const reassignDelivery = async (id: number) => runMutation(`reassign:${id}`, async () => { await api.post(`/admin/deliveries/${id}/reassign`, { reason: 'Administrative reassignment after failed delivery.' }, mutationConfig('delivery-reassign', id, 'failed')); setRows((current) => current.map((row) => row.id === id ? { ...row, status: 'available' } : row)) })
  const updateUserStatus = async (id: number, status: 'active' | 'suspended') => runMutation(`user:${id}:${status}`, async () => { await api.patch(`/admin/users/${id}/status`, { status, reason: 'Administrative account review.' }, mutationConfig('user-status', id, status)); setRows((current) => current.map((row) => row.id === id ? { ...row, status } : row)) })
  const decideDocument = async (id: number, decision: 'approve' | 'reject' | 'correction') => runMutation(`document:${id}:${decision}`, async () => { await api.post(`/admin/verification-documents/${id}/decision`, { decision }, mutationConfig('document-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const updateInventory = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const payload = { medicine_id: Number(form.get('medicine_id')), quantity: Number(form.get('quantity')), unit_price: Number(form.get('unit_price')), low_stock_threshold: Number(form.get('low_stock_threshold') ?? 5) }; const key = `${payload.medicine_id}-${payload.quantity}-${payload.unit_price}-${payload.low_stock_threshold}`; await runMutation(`inventory:${key}`, async () => { await api.put('/partner/inventory', payload, mutationConfig('inventory-upsert', key, 'save')); formElement.reset(); const response = await api.get(endpoint, { params: { search, per_page: 8 } }); setRows((response.data.data ?? []).map((item: Record<string, unknown>) => ({ id: Number(item.id ?? 0), primary: String(item.business_name ?? item.name_en ?? item.public_id ?? `Record ${item.id}`), secondary: String(item.name_ar ?? item.manufacturer ?? item.status ?? 'Operational record'), status: String(item.status ?? item.approval_status ?? 'Active'), raw: item }))) }) }
  const openDetail = async (id: number) => { if (!['orders', 'deliveries', 'complaints', 'procurement'].includes(section)) return; try { const response = await api.get(section === 'complaints' ? `/complaints/${id}` : section === 'procurement' ? `/procurement/${id}` : section === 'deliveries' ? `/deliveries/${id}` : `/orders/${id}`); setDetail(section === 'complaints' ? { ...response.data, _kind: 'complaint' } : section === 'procurement' ? { ...response.data, _kind: 'procurement' } : section === 'deliveries' ? { ...response.data, _kind: 'delivery' } : response.data) } catch { setDetail({ error: section === 'complaints' ? 'Unable to load complaint details.' : section === 'procurement' ? 'Unable to load procurement details.' : section === 'deliveries' ? 'Unable to load delivery details.' : 'Unable to load order details.' }) } }
  const exportAudit = async () => { try { const response = await api.get('/admin/audit-logs/export', { params: { search }, responseType: 'blob' }); const url = window.URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'medline-audit-log.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.URL.revokeObjectURL(url) } catch { setDetail({ error: 'Unable to export audit records.' }) } }
  if (detail) return detail._kind === 'complaint' ? <ComplaintDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} /> : detail._kind === 'procurement' ? <ProcurementDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} /> : detail._kind === 'delivery' ? <DeliveryDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} /> : <OrderDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} />
  if (section === 'ratings' && role === 'admin') return <RatingQueue locale={locale} />
  const action = (row: Row) => section === 'verification' ? <div className="row-actions"><button className="approve-button" onClick={() => decidePartner(row.id, 'approve')}>{tr('approve', locale)}</button><button className="reject-button" onClick={() => decidePartner(row.id, 'reject')}>{tr('reject', locale)}</button></div> : section === 'documents' && role === 'admin' && row.status.includes('review') ? <div className="row-actions"><button className="ghost-button" onClick={() => void downloadPrivate(`/verification-documents/${row.id}/download`, `medline-document-${row.id}`)}>{tr('download', locale)}</button><button className="approve-button" onClick={() => decideDocument(row.id, 'approve')}>{tr('approve', locale)}</button><button className="reject-button" onClick={() => decideDocument(row.id, 'reject')}>{tr('reject', locale)}</button></div> : section === 'users' && role === 'admin' ? <div className="row-actions"><button className={row.status === 'suspended' ? 'approve-button' : 'reject-button'} onClick={() => updateUserStatus(row.id, row.status === 'suspended' ? 'active' : 'suspended')}>{row.status === 'suspended' ? tr('reactivate', locale) : tr('suspend', locale)}</button></div> : section === 'deliveries' && role === 'admin' && row.status === 'failed' ? <div className="row-actions"><button className="approve-button" onClick={() => reassignDelivery(row.id)}>{tr('reassign', locale)}</button></div> : section === 'orders' && role === 'pharmacy' && row.status.includes('pending') ? <div className="row-actions"><button className="approve-button" onClick={() => decideOrder(row.id, 'accept')}>{tr('accept', locale)}</button><button className="reject-button" onClick={() => decideOrder(row.id, 'reject')}>{tr('reject', locale)}</button></div> : section === 'procurement' && role === 'warehouse' && row.status.includes('pending') ? <div className="row-actions"><button className="approve-button" onClick={() => decideProcurement(row.id, 'accept')}>{tr('accept', locale)}</button><button className="reject-button" onClick={() => decideProcurement(row.id, 'reject')}>{tr('reject', locale)}</button></div> : section === 'subscriptions' && row.status.includes('review') ? <div className="row-actions"><button className="ghost-button" onClick={() => void downloadPrivate(`/admin/payment-proofs/${String(row.raw?.payment_proof_id ?? row.id)}/download`, `medline-payment-proof-${row.id}`)}>{tr('receipt', locale)}</button><button className="approve-button" onClick={() => decidePayment(row.id, 'approve')}>{tr('approve', locale)}</button><button className="reject-button" onClick={() => decidePayment(row.id, 'reject')}>{tr('reject', locale)}</button></div> : section === 'complaints' ? <div className="row-actions"><button className="ghost-button" onClick={() => void openDetail(row.id)}>{tr('view', locale)}</button>{(row.status === 'open' || row.status === 'in_review') && <button className="approve-button" onClick={() => updateComplaint(row.id, row.status === 'open' ? 'in_review' : 'resolved')}>{row.status === 'open' ? tr('review', locale) : tr('resolve', locale)}</button>}</div> : section === 'audit' ? <button className="ghost-button" onClick={() => void exportAudit()}>{tr('exportCsv', locale)}</button> : <button className="ghost-button" onClick={() => void openDetail(row.id)}>{tr('view', locale)} <ChevronRight size={15} /></button>
  const reportTotals = (complaintReport?.totals ?? {}) as Record<string, unknown>
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">MEDLINE OPERATIONS</p><h1>{tr(section, locale)}</h1><p className="muted">{tr('workflowGuidance', locale)}</p></div>{section === 'inventory' && role !== 'admin' && <form className="inline-form" onSubmit={updateInventory}><input name="medicine_id" type="number" placeholder={tr('medicineId', locale)} required /><input name="quantity" type="number" placeholder={tr('quantity', locale)} min="0" required /><input name="unit_price" type="number" placeholder={tr('unitPrice', locale)} min="0" step="0.01" /><input name="low_stock_threshold" type="number" placeholder={tr('lowStock', locale)} min="0" defaultValue="5" /><button className="primary-button" type="submit"><Package size={17} /> {tr('saveStock', locale)}</button></form>}</div>{section === 'complaints' && role === 'admin' && complaintReport && <section className="metric-grid"><Metric label="Open complaints" value={String(reportTotals.open ?? 0)} change="Live" icon={<MessageSquare />} tone="orange" /><Metric label="In review" value={String(reportTotals.in_review ?? 0)} change="Live" icon={<History />} tone="violet" /><Metric label="Resolved complaints" value={String(reportTotals.resolved ?? 0)} change="Live" icon={<ShieldCheck />} tone="green" /></section>}<section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">{tr(['orders', 'deliveries', 'verification', 'procurement'].includes(section) ? 'queue' : 'directory', locale)}</p><h2>{tr(section, locale)} {tr('overview', locale)}</h2></div><span className="live-status" role="status"><i aria-hidden="true" /> {tr('liveData', locale)}</span></div><div className="search-box"><Search size={19} aria-hidden="true" /><input aria-label={`${tr('search', locale)} ${tr(section, locale)}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`${tr('search', locale)} ${tr(section, locale)}...`} /></div><div className="operations-table" aria-busy={loading}><div className="table-row table-head"><span>{tr('record', locale)}</span><span>{tr('details', locale)}</span><span>{tr('status', locale)}</span><span>{tr('action', locale)}</span></div>{loading ? <div className="state" role="status" aria-live="polite">{tr('loadingRecords', locale)}</div> : rows.length === 0 ? <div className="state" role="status">{tr('noRecordsYet', locale)}</div> : rows.map((row) => <div className="table-row" key={row.id}><strong>{row.primary}</strong><span>{row.secondary}</span><span className="status-pill">{row.status}</span>{action(row)}</div>)}</div></section></section>
}

function Metric({ label, value, change, icon, tone }: { label: string; value: string; change: string; icon: ReactNode; tone: string }) { const key = label === 'Active orders' || label === 'Total orders' ? 'orders' : label === 'Pending verification' ? 'pending_partners' : label === 'In delivery' || label === 'Active deliveries' ? 'active_deliveries' : label === 'Registered partners' ? 'partners' : ''; const liveValue = key ? String(dashboardMetrics[key] ?? 0) : value; const currentLocale = document.documentElement.lang === 'ar' ? 'ar' : 'en'; const localizedLabel = label === 'Active orders' ? tr('activeOrders', currentLocale) : label === 'Pending verification' ? tr('pendingVerification', currentLocale) : label === 'In delivery' ? tr('inDelivery', currentLocale) : label === 'Registered partners' ? tr('registeredPartners', currentLocale) : label; return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-copy"><span>{localizedLabel}</span><strong>{liveValue}</strong><small className="positive">↗ {change} <em>{change === 'Live' ? 'from API' : 'vs last month'}</em></small></div></div> }
function Activity({ icon, title: itemTitle, detail, tone }: { icon: string; title: string; detail: string; tone: string }) { return <div className="activity-item"><div className={`activity-icon ${tone}`}>{icon}</div><div><strong>{itemTitle}</strong><span>{detail}</span></div><ChevronRight size={16} /></div> }
function Workflow({ label, value, percent, color }: { label: string; value: string; percent: number; color: string }) { return <div className="workflow-item"><div><span>{label}</span><strong>{value}</strong></div><div className="progress"><i className={color} style={{ width: `${percent}%` }} /></div><small>{percent}%</small></div> }

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { failed: boolean }

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState { return { failed: true } }

  componentDidCatch(error: Error): void { captureWebError(error, 'react_error_boundary') }

  render() {
    if (this.state.failed) return <main className="session-loading"><section className="panel"><h1>MedLine needs to reload</h1><p className="muted">An unexpected interface error occurred. Your server-side records remain protected.</p><button className="primary-button" onClick={() => window.location.reload()}>Reload workspace</button></section></main>
    return this.props.children
  }
}

function RootApp() { return <AppErrorBoundary><App /></AppErrorBoundary> }

export default RootApp
