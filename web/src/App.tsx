import { Component, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import axios from 'axios'
import { Bell, ChevronRight, ClipboardList, CreditCard, Eye, FileCheck2, FileX2, History, LayoutDashboard, LogOut, Menu, MessageSquare, Package, Search, Settings, ShieldCheck, Truck, Users } from 'lucide-react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { translate as tr } from './i18n'
import type { DashboardMetrics, Medicine, NotificationRecord } from './api-types'
import { captureWebError } from './telemetry'
import { createMedlineEcho } from './echo'
import './style.css'

type Row = { id: number; primary: string; secondary: string; status: string; raw: Record<string, unknown> }

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api/v1', withCredentials: true })

export function formatMedlineDate(value: unknown, locale = 'en'): string {
  if (!value) return '—'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

export function formatMedlineMoney(value: unknown, currency = 'SYP', locale = 'en'): string {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en-GB', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
}

export function formatDeliveryDuration(events: Array<Record<string, unknown>>, endValue?: unknown): string {
  const timestamps = events.map((event) => new Date(String(event.created_at ?? '')).getTime()).filter(Number.isFinite)
  if (timestamps.length === 0) return '—'
  const endTimestamp = endValue ? new Date(String(endValue)).getTime() : timestamps[timestamps.length - 1]
  if (!Number.isFinite(endTimestamp)) return '—'
  const minutes = Math.max(1, Math.round(Math.max(0, endTimestamp - timestamps[0]) / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}
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
  const [locale, setLocale] = useState(() => localStorage.getItem('medline_locale_explicit') === 'true' ? (localStorage.getItem('medline_locale') ?? 'en') : 'en')
  const [section, setSection] = useState(() => sectionFromPath(window.location.pathname))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const requiresSubscription = role === 'pharmacy' || role === 'warehouse'
  const [subscriptionActive, setSubscriptionActive] = useState(role === 'admin' || !requiresSubscription)
  useEffect(() => {
    const handleUnauthorized = () => { localStorage.removeItem('medline_token'); localStorage.removeItem('medline_refresh_token'); localStorage.removeItem('medline_user'); setAuthenticated(false) }
    window.addEventListener('medline:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('medline:unauthorized', handleUnauthorized)
  }, [])
  useEffect(() => { if (!authenticated) { setSessionReady(true); return } setSessionReady(false); api.get('/auth/me').then((response) => { const user = response.data.user ?? {}; localStorage.setItem('medline_user', JSON.stringify(user)); setRole(user.role ?? 'admin') }).catch(() => { localStorage.removeItem('medline_token'); localStorage.removeItem('medline_user'); setAuthenticated(false) }).finally(() => setSessionReady(true)) }, [authenticated])
  useEffect(() => { document.documentElement.lang = locale; document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'; localStorage.setItem('medline_locale', locale); localStorage.setItem('medline_locale_explicit', 'true') }, [locale])
  useEffect(() => { if (!authenticated || role === 'admin' || !requiresSubscription) { setSubscriptionActive(true); return } setSubscriptionActive(false); api.get('/subscription').then((response) => setSubscriptionActive(['active', 'grace'].includes(String(response.data.subscription?.status ?? '')))).catch(() => setSubscriptionActive(false)) }, [authenticated, role, requiresSubscription])
  useEffect(() => { const handleRoute = () => setSection(sectionFromPath(window.location.pathname)); window.addEventListener('popstate', handleRoute); return () => window.removeEventListener('popstate', handleRoute) }, [])
  useEffect(() => { if (authenticated && role === 'patient' && !['orders', 'deliveries', 'settings', 'notifications'].includes(section)) { window.history.replaceState({}, '', '/orders'); setSection('orders') } }, [authenticated, role, section])
  useEffect(() => { const openMetric = (event: Event) => { const target = event.target as HTMLElement; const card = target.closest('.metric-card'); if (!card) return; const label = card.querySelector('.metric-copy span')?.textContent ?? ''; const destination = label.includes('orders') ? '/orders' : label.includes('verification') ? '/verification' : label.includes('delivery') ? '/deliveries' : label.includes('organization') ? '/pharmacies' : ''; if (destination) { window.history.pushState({}, '', destination); window.dispatchEvent(new Event('popstate')) } }; document.addEventListener('click', openMetric); return () => document.removeEventListener('click', openMetric) }, [])
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
  const operationalAccess = role === 'admin' || !requiresSubscription || subscriptionActive
  useEffect(() => { if (authenticated && requiresSubscription && !operationalAccess && section !== 'subscriptions') { window.history.replaceState({}, '', '/subscriptions'); setSection('subscriptions') } }, [authenticated, requiresSubscription, operationalAccess, section])
  if (!sessionReady) return <div className="session-loading">Restoring your secure MedLine session...</div>
  if (!authenticated) return section === 'register' ? <RegistrationPage onBack={() => { window.history.pushState({}, '', '/'); setSection('dashboard') }} onAuthenticated={(user) => { localStorage.setItem('medline_user', JSON.stringify(user)); setRole(String(user.role ?? 'patient')); setAuthenticated(true) }} /> : <div className="login-composite"><LoginPage locale={locale} onAuthenticated={(user) => { localStorage.setItem('medline_user', JSON.stringify(user)); setRole(user.role ?? 'admin'); setAuthenticated(true) }} /><a className="register-launch" href="/register">Create an account</a></div>
  const logout = async () => { try { await api.post('/auth/logout', {}) } catch { /* Continue local cleanup if the API is unavailable. */ } finally { localStorage.removeItem('medline_token'); localStorage.removeItem('medline_refresh_token'); localStorage.removeItem('medline_user'); setAuthenticated(false) } }
  const nav = (value: string) => { if (requiresSubscription && !operationalAccess && value !== 'subscriptions') value = 'subscriptions'; window.history.pushState({}, '', pathForSection(value)); setSection(value); setSidebarOpen(false) }
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">M</div><div><strong>MedLine</strong><span>Healthcare logistics</span></div></div>
      <nav>
        <p className="nav-label">{tr('workspace', locale)}</p>
        {operationalAccess && <>{role !== 'patient' && <NavItem active={section === 'dashboard'} onClick={() => nav('dashboard')} icon={<LayoutDashboard size={18} />} label={tr('dashboard', locale)} />}
        {role !== 'warehouse' && <NavItem active={section === 'orders'} onClick={() => nav('orders')} icon={<ClipboardList size={18} />} label={tr('orders', locale)} />}
        {(role === 'admin' || role === 'pharmacy' || role === 'warehouse') && <><NavItem active={section === 'inventory'} onClick={() => nav('inventory')} icon={<Package size={18} />} label={tr('inventory', locale)} />
        <NavItem active={section === 'procurement'} onClick={() => nav('procurement')} icon={<Package size={18} />} label={tr('procurement', locale)} /></>}
        {(role === 'admin' || role === 'patient' || role === 'driver' || role === 'pharmacy' || role === 'warehouse') && <NavItem active={section === 'deliveries'} onClick={() => nav('deliveries')} icon={<Truck size={18} />} label={tr('deliveries', locale)} />}</>}
        {requiresSubscription && <NavItem active={section === 'subscriptions'} onClick={() => nav('subscriptions')} icon={<CreditCard size={18} />} label={tr('subscriptions', locale)} />}
        {role === 'admin' && <><NavItem active={section === 'complaints'} onClick={() => nav('complaints')} icon={<MessageSquare size={18} />} label={tr('complaints', locale)} /><NavItem active={section === 'ratings'} onClick={() => nav('ratings')} icon={<History size={18} />} label={tr('ratings', locale)} /><NavItem active={section === 'audit'} onClick={() => nav('audit')} icon={<History size={18} />} label={tr('audit', locale)} /></>}
        {role === 'admin' && <><p className="nav-label">{tr('management', locale)}</p>
        <NavItem active={section === 'pharmacies'} onClick={() => nav('pharmacies')} icon={<Users size={18} />} label="Pharmacies" />
        <NavItem active={section === 'warehouses'} onClick={() => nav('warehouses')} icon={<Package size={18} />} label="Warehouses" />
        <NavItem active={section === 'users'} onClick={() => nav('users')} icon={<Users size={18} />} label={tr('users', locale)} />
        <NavItem active={section === 'documents'} onClick={() => nav('documents')} icon={<ShieldCheck size={18} />} label={tr('documents', locale)} />
        <NavItem active={section === 'verification'} onClick={() => nav('verification')} icon={<ShieldCheck size={18} />} label={tr('verification', locale)} /></>}
        <NavItem active={section === 'settings'} onClick={() => nav('settings')} icon={<Settings size={18} />} label={tr('settings', locale)} />
      </nav>
      <button className="sidebar-footer" onClick={logout}><div className="avatar">{role.slice(0, 2).toUpperCase()}</div><div><strong>MedLine {tr(`role_${role}`, locale)}</strong><span>{tr('signOut', locale)}</span></div><LogOut size={16} /></button>
    </aside>
    {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
    <main className="main-content">
      {(role === 'pharmacy' || role === 'warehouse') && <PartnerAccessGuard role={role} onOpen={() => nav('subscriptions')} />}
      {role === 'pharmacy' && <ProcurementCreatePanel section={section} />}
      <header className="topbar"><button className="icon-button menu-button" aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={22} /></button><div className="breadcrumb"><span>{tr('workspace', locale)}</span><ChevronRight size={15} /><strong>{tr(section, locale) || title(section)}</strong></div><div className="top-actions"><WebNotifications locale={locale} onOpenAll={() => nav('notifications')} /><div className="top-avatar" aria-label="Signed-in user">MA</div></div></header>
      {section === 'dashboard' ? <><LiveDashboard role={role} locale={locale} /><DashboardAlerts role={role} locale={locale} /><NotificationHealthPanel role={role} locale={locale} /></> : section === 'notifications' ? <NotificationsPage locale={locale} /> : section === 'subscriptions' && (role === 'pharmacy' || role === 'warehouse') ? <PartnerSubscriptionPage locale={locale} /> : section === 'settings' ? <>{role === 'admin' ? <><SettingsPage role="patient" locale={locale} onLocaleChange={setLocale} /><AdminTwoFactorPanel locale={locale} /></> : <SettingsPage role={role} locale={locale} onLocaleChange={setLocale} />}<ConsentSettings /></> : section === 'inventory/categories' && role === 'admin' ? <><InventoryBackLink /><MedicineCategoryAdmin locale={locale} /></> : section === 'inventory' && role === 'admin' ? <><InventoryCategoryLink /><MedicineAdminPage locale={locale} /><MedicineEditAdminPage locale={locale} /></> : (section === 'pharmacies' || section === 'warehouses') && role === 'admin' ? <PartnerManagementPanel section={section} /> : section === 'users' && role === 'admin' ? <UserRolePanelWithCompany section={section} /> : <OperationsPage section={section} role={role} locale={locale} />}
    </main>
  </div>
}

function NavItem({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; badge?: string }) { return <button type="button" className={active ? 'active' : ''} onClick={onClick} aria-current={active ? 'page' : undefined}>{icon}<span>{label}</span>{badge && <b>{badge}</b>}</button> }
function title(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }
function pathForSection(section: string): string { return section === 'dashboard' ? '/' : `/${section}` }
function sectionFromPath(pathname: string): string { const path = pathname.replace(/^\/+|\/+$/g, ''); return path || 'dashboard' }

function TablePagination({ page, lastPage, onPageChange }: { page: number; lastPage: number; onPageChange: (page: number) => void }) {
  if (lastPage < 1) return null
  return <nav className="table-pagination" aria-label="Table pagination"><button type="button" className="ghost-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button><span>Page <strong>{page}</strong> of <strong>{lastPage}</strong></span><button type="button" className="ghost-button" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>Next</button></nav>
}
function InventoryCategoryLink() { return <div className="inventory-subview-actions"><button type="button" className="ghost-button" onClick={() => { window.history.pushState({}, '', '/inventory/categories'); window.dispatchEvent(new PopStateEvent('popstate')) }}>Manage categories</button></div> }
function InventoryBackLink() { return <div className="inventory-subview-actions"><button type="button" className="ghost-button" onClick={() => { window.history.pushState({}, '', '/inventory'); window.dispatchEvent(new PopStateEvent('popstate')) }}>Back to inventory</button></div> }

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

function NotificationsPage({ locale }: { locale: string }) {
  const [rows, setRows] = useState<NotificationRecord[]>([])
  const [search, setSearch] = useState('')
  const load = async () => { try { const response = await api.get('/notifications', { params: { per_page: 100 } }); setRows(response.data.data ?? []) } catch { setRows([]) } }
  useEffect(() => { void load() }, [])
  const visible = rows.filter((row) => `${row.type ?? ''} ${notificationText(row)}`.toLowerCase().includes(search.toLowerCase()))
  const markRead = async (id: string) => { await api.post(`/notifications/${id}/read`, {}, mutationConfig('notification-read', id, 'read')); await load() }
  const remove = async (id: string) => { await api.delete(`/notifications/${id}`); await load() }
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">WORKSPACE</p><h1>Notifications</h1><p className="muted">Review, read, and remove your MedLine notification history.</p></div></div><section className="panel table-panel"><div className="panel-heading"><div><h2>Notification queue</h2></div></div><div className="search-box"><Search size={19} aria-hidden="true" /><input aria-label="Search notifications" placeholder="Search notifications..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="operations-table notification-table"><div className="table-row table-head"><span>Notification</span><span>Message</span><span>Created</span><span>Status</span><span>Action</span></div>{visible.length === 0 ? <div className="state">No notifications found.</div> : visible.map((row) => <div className="table-row" key={String(row.id)}><strong>{String(row.type ?? 'MedLine update')}</strong><span>{notificationText(row)}</span><span>{formatMedlineDate(row.created_at)}</span><span className="status-pill">{row.read_at ? 'Read' : 'Unread'}</span><div className="row-actions"><button className="approve-button" type="button" onClick={() => void markRead(String(row.id))} disabled={Boolean(row.read_at)}>—</button><button className="reject-button" type="button" onClick={() => void remove(String(row.id))}>— ??</button></div></div>)}</div></section></section>
}

export function WebNotifications({ locale, onOpenAll }: { locale: string; onOpenAll?: () => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<NotificationRecord[]>([])
  const busyNotificationIds = useRef(new Set<string>())
  const load = async () => { try { const response = await api.get('/notifications', { params: { per_page: 5 } }); setRows(response.data.data ?? []) } catch { setRows([]) } }
  useEffect(() => { void load(); const onNotification = () => { void load() }; window.addEventListener('medline:notification', onNotification); const interval = window.setInterval(() => { void load() }, open ? 30000 : 60000); return () => { window.clearInterval(interval); window.removeEventListener('medline:notification', onNotification) } }, [open])
  const toggle = () => { const next = !open; setOpen(next); if (next) void load() }
  const markRead = async (id: string) => { if (busyNotificationIds.current.has(id)) return; busyNotificationIds.current.add(id); try { await api.post(`/notifications/${id}/read`, {}, mutationConfig('notification-read', id, 'read')); await load() } finally { busyNotificationIds.current.delete(id) } }
  return <div className="notification-wrap"><button className="icon-button" type="button" onClick={toggle} aria-label={tr('notifications', locale)} aria-expanded={open}><Bell size={19} />{rows.some((row) => row.read_at == null) && <i aria-hidden="true" />}</button>{open && <div className="notification-popover" role="region" aria-label={tr('notifications', locale)}><div className="notification-header"><strong>{tr('notifications', locale)}</strong><div><button type="button" onClick={() => void load()}>{tr('notificationsRefresh', locale)}</button>{onOpenAll && <button type="button" onClick={onOpenAll}>View all</button>}</div></div>{rows.length === 0 ? <div className="state" role="status">{tr('noNotifications', locale)}</div> : rows.map((row) => <div className={`notification-row ${row.read_at == null ? 'unread' : ''}`} key={String(row.id)}><div><strong>{String(row.type ?? 'MedLine update')}</strong><span>{notificationText(row)}</span></div>{row.read_at == null && <button type="button" onClick={() => void markRead(String(row.id))}>{tr('read', locale)}</button>}</div>)}</div>}</div>
}

export function notificationText(row: NotificationRecord): string {
  const data = row.data
  if (typeof data === 'string') { try { const parsed = JSON.parse(data) as unknown; if (parsed && typeof parsed === 'object') return notificationText({ ...row, data: parsed }) } catch { /* Keep ordinary text as-is. */ } return data }
  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>
    if (typeof payload.message === 'string') return payload.message
    if (typeof payload.title === 'string') return payload.title
    return Object.entries(payload).filter(([key]) => !['token', 'pin', 'prescription', 'document'].some((blocked) => key.toLowerCase().includes(blocked))).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`).join(' · ')
  }
  return 'MedLine has a new update.'
}

export function ConsentSettings() {
  const [consents, setConsents] = useState<Record<string, boolean>>({ terms_of_service: false, privacy_policy: false, marketing: false })
  const [message, setMessage] = useState('')
  const busyConsentKeys = useRef(new Set<string>())
  useEffect(() => { api.get('/privacy/consents').then((response) => { const next = { ...consents }; for (const item of response.data.data ?? []) next[String(item.consent_type)] = true; setConsents(next) }).catch(() => setMessage('Unable to load consent choices.')) }, [])
  const update = async (type: string, value: boolean) => { if (busyConsentKeys.current.has(type)) return; busyConsentKeys.current.add(type); const previous = consents[type]; setConsents((current) => ({ ...current, [type]: value })); try { const key = mutationConfig('privacy-consent', type, value ? 'grant' : 'revoke'); if (value) await api.post('/privacy/consents', { consent_type: type, policy_version: '2026-08-18', consented: true }, key); else await api.delete(`/privacy/consents/${type}`, key); setMessage('Privacy choices saved.') } catch { setConsents((current) => ({ ...current, [type]: previous })); setMessage('Unable to save this privacy choice.') } finally { busyConsentKeys.current.delete(type) } }
  return <section className="content"><section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">PRIVACY</p><h2>Consent and policy records</h2></div></div>{[['terms_of_service', 'Terms of service', 'Required to use MedLine.'], ['privacy_policy', 'Privacy policy', 'How MedLine handles account and medical data.'], ['marketing', 'Optional product updates', 'Non-essential MedLine communications.']].map(([key, label, description]) => <label className="setting-row" key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={Boolean(consents[key])} onChange={(event) => void update(key, event.target.checked)} /></label>)}{message && <div className="form-success">{message}</div>}</section></section>
}

export function PartnerAccessGuard({ role, onOpen }: { role: string; onOpen: () => void }) {
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => { api.get('/subscription').then((response) => setStatus(String(response.data.subscription?.status ?? 'inactive'))).catch(() => setStatus('unavailable')) }, [])
  if (status === null || status === 'active') return null
  const organization = role === 'warehouse' ? 'Warehouse' : 'Pharmacy'
  return <div className="access-banner"><div><strong>{status === 'unavailable' ? 'Subscription status unavailable' : `${organization} operations require an active subscription`}</strong><span>{status === 'unavailable' ? 'Check your connection or retry before processing operational work.' : 'Submit or review your annual payment proof to continue.'}</span></div><button className="ghost-button" onClick={onOpen}>Open subscription</button></div>
}

function UserApprovalAction({ user, onUpdated }: { user: Record<string, unknown>; onUpdated: () => void }) {
  const status = String(user.status ?? 'active')
  if (status !== 'pending') return <span className="status-pill">{status}</span>
  return <button className="approve-button" onClick={async () => { try { await api.patch(`/admin/users/${String(user.id)}/status`, { status: 'active', reason: 'Administrator approved account.' }, mutationConfig('user-approval', user.id as number, 'approve')); onUpdated() } catch (error) { window.alert(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to approve account.' : 'Unable to approve account.') } }}>Approve account</button>
}
export function UserRolePanel({ section }: { section: string }) {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([])
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const load = async () => { try { const response = await api.get('/admin/users', { params: { per_page: 100 } }); const data = response.data.data ?? []; setUsers(data); setRoles(Object.fromEntries(data.map((user: Record<string, unknown>) => [String(user.id), String(user.role ?? 'patient')]))) } catch { setUsers([]) } }
  useEffect(() => { if (section === 'users') void load() }, [section])
  const update = async (id: number) => { try { await api.patch(`/admin/users/${id}/role`, { role: roles[String(id)], reason: 'Administrative role review.' }, mutationConfig('user-role', id, roles[String(id)])); setMessage('User role updated.'); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update user role.' : 'Unable to update user role.') } }
  if (section !== 'users') return null
  return <section className="content"><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">IDENTITY MANAGEMENT</p><h2>Role assignments</h2><p className="muted">Partner and driver roles require a matching approved profile on the server.</p></div></div>{message && <div className="form-success">{message}</div>}<div className="operations-table"><div className="table-row table-head"><span>User</span><span>Email</span><span>Role</span><span>Approval</span><span>Action</span></div>{users.map((user) => <div className="table-row" key={String(user.id)}><strong>{String(user.name ?? `User ${user.id}`)}</strong><span>{String(user.email ?? '')}</span><select value={roles[String(user.id)] ?? 'patient'} onChange={(event) => setRoles((current) => ({ ...current, [String(user.id)]: event.target.value }))}><option value="patient">Patient</option><option value="pharmacy">Pharmacy</option><option value="warehouse">Warehouse</option><option value="driver">Driver</option><option value="admin">Admin</option></select><UserApprovalAction user={user} onUpdated={() => void load()} /><button className="ghost-button" onClick={() => void update(Number(user.id))}>Save role</button></div>)}</div></section></section>
}

export function UserRolePanelWithCompany({ section }: { section: string }) {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([])
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const load = async () => { try { const response = await api.get('/admin/users', { params: { per_page: 100, search } }); const data = response.data.data ?? []; setUsers(data); setRoles(Object.fromEntries(data.map((user: Record<string, unknown>) => [String(user.id), String(user.role ?? 'patient')]))) } catch { setUsers([]) } }
  useEffect(() => { if (section === 'users') void load() }, [section, search])
  const update = async (id: number) => { try { await api.patch('/admin/users/' + id + '/role', { role: roles[String(id)], reason: 'Administrative role review.' }, mutationConfig('user-role', id, roles[String(id)])); setMessage('User role updated.'); await load() } catch { setMessage('Unable to update user role.') } }
  const companyName = (user: Record<string, unknown>) => String(user.company_name ?? (user.role === 'admin' || user.role === 'support' ? 'MedLine' : user.role === 'driver' ? 'Independent driver' : 'Not assigned'))
  if (section !== 'users') return null
  return <section className="content"><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">IDENTITY MANAGEMENT</p><h2>Role assignments</h2><p className="muted">Partner and driver roles require a matching approved profile on the server.</p></div></div><div className="search-box"><Search size={19} aria-hidden="true" /><input aria-label="Search users" placeholder="Search users, email, company, or role..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>{message && <div className="form-success">{message}</div>}<div className="operations-table"><div className="table-row table-head"><span>User</span><span>Email</span><span>Company / organization</span><span>Role</span><span>Approval</span><span>Action</span></div>{users.map((user) => <div className="table-row" key={String(user.id)}><strong>{String(user.name ?? 'User ' + user.id)}</strong><span>{String(user.email ?? '')}</span><span>{companyName(user)}</span><select value={roles[String(user.id)] ?? 'patient'} onChange={(event) => setRoles((current) => ({ ...current, [String(user.id)]: event.target.value }))}><option value="patient">Patient</option><option value="pharmacy">Pharmacy</option><option value="warehouse">Warehouse</option><option value="driver">Driver</option><option value="admin">Admin</option></select><UserApprovalAction user={user} onUpdated={() => void load()} /><button className="ghost-button" onClick={() => void update(Number(user.id))}>Save role</button></div>)}</div></section></section>
}

function PartnerDetailPanel({ partner, onClose }: { partner: Record<string, unknown>; onClose: () => void }) {
  const mapUrl = deliveryMapEmbedUrl(partner.latitude, partner.longitude)
  const type = String(partner.type ?? 'partner')
  return <section className="content partner-detail-content"><div className="welcome-row"><div><p className="eyebrow">PARTNER PROFILE</p><h1>{String(partner.business_name ?? 'Partner')}</h1><p className="muted">{type} · {String(partner.approval_status ?? 'pending')}</p></div><button className="ghost-button" onClick={onClose}>Back to {type === 'warehouse' ? 'warehouses' : 'pharmacies'}</button></div><div className="partner-detail-grid"><section className="panel partner-info-card"><div className="panel-heading"><div><p className="eyebrow">BUSINESS INFORMATION</p><h2>{String(partner.business_name ?? 'Partner')}</h2></div><span className="status-pill">{String(partner.approval_status ?? 'pending')}</span></div><div className="partner-detail-fields"><p><span>Type</span><strong>{type}</strong></p><p><span>License number</span><strong>{String(partner.license_number ?? 'Not provided')}</strong></p><p><span>Subscription access</span><strong>{String(partner.subscription_status ?? 'Not configured')}</strong></p><p><span>Payment review</span><strong>{String(partner.payment_proof_status ?? 'Not submitted').replaceAll('_', ' ')}</strong></p>{partner.payment_proof_id && <button type="button" className="ghost-button" onClick={() => void downloadPrivate(`/admin/payment-proofs/${String(partner.payment_proof_id)}/download`, `medline-registration-payment-${String(partner.id)}`)}>View payment proof</button>}<p><span>Activation period</span><strong>{partner.subscription_starts_at && partner.subscription_ends_at ? String(partner.subscription_starts_at) + ' — ·? ? ' + String(partner.subscription_ends_at) : 'Not activated'}</strong></p><p><span>Phone</span><strong>{String(partner.phone ?? 'Not provided')}</strong></p><p><span>Contact person</span><strong>{String(partner.contact_name ?? 'Not provided')}</strong></p><p><span>Contact email</span><strong>{String(partner.contact_email ?? 'Not provided')}</strong></p></div></section><section className="panel partner-address-card"><div className="panel-heading"><div><p className="eyebrow">LOCATION</p><h2>Registered location</h2></div></div><p className="partner-address">{String(partner.address ?? 'Address not provided')}</p>{mapUrl ? <><iframe className="partner-map" title={`${String(partner.business_name ?? 'Partner')} location`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer" allowFullScreen /><a className="ghost-button" href={`https://www.openstreetmap.org/?mlat=${String(partner.latitude)}&mlon=${String(partner.longitude)}&zoom=16`} target="_blank" rel="noreferrer">Open in OpenStreetMap — ·? ?</a></> : <div className="state">Map coordinates are not available for this partner.</div>}</section></div></section>
}

export function PartnerManagementPanel({ section }: { section: string }) {
  const [partners, setPartners] = useState<Array<Record<string, unknown>>>([])
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [selectedPartner, setSelectedPartner] = useState<Record<string, unknown> | null>(null)
  const partnerType = section === 'warehouses' ? 'warehouse' : 'pharmacy'
  const title = partnerType === 'warehouse' ? 'Warehouses' : 'Pharmacies'
  const load = async () => { try { const response = await api.get('/admin/partners', { params: { type: partnerType, search, per_page: 100 } }); setPartners(response.data.data ?? []) } catch { setPartners([]) } }
  useEffect(() => { setSelectedPartner(null); setMessage('') }, [section])
  useEffect(() => { if (section === 'pharmacies' || section === 'warehouses') void load() }, [section, search])
  const decide = async (id: number, decision: 'approve' | 'reject' | 'correction') => { const note = decision === 'correction' ? window.prompt('Explain exactly what the pharmacy or warehouse must correct before resubmitting:', 'Please review the submitted details and correct the highlighted information.') : undefined; if (decision === 'correction' && note === null) return; try { await api.post(`/admin/partners/${id}/decision`, { decision, note }, mutationConfig('partner-decision', id, decision)); setMessage(`Partner ${decision === 'correction' ? 'sent for correction' : `${decision}d`}.`); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update partner.' : 'Unable to update partner.') } }
  const viewPartner = async (id: number) => { try { const response = await api.get(`/admin/partners/${id}`); setSelectedPartner(response.data.partner ?? null) } catch { setMessage('Unable to load partner details.') } }
  if (section !== 'pharmacies' && section !== 'warehouses') return null
  if (selectedPartner) return <PartnerDetailPanel partner={selectedPartner} onClose={() => setSelectedPartner(null)} />
  return <section className="content"><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">PARTNER OPERATIONS</p><h2>{title}</h2><p className="muted">Review registered {partnerType === 'warehouse' ? 'warehouse' : 'pharmacy'} partners before operational access.</p></div></div><div className="search-box"><Search size={19} aria-hidden="true" /><input aria-label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()} by name, license, or status...`} value={search} onChange={(event) => setSearch(event.target.value)} /></div>{message && <div className="form-success">{message}</div>}<div className="operations-table"><div className="table-row table-head"><span>{partnerType === 'warehouse' ? 'Warehouse' : 'Pharmacy'}</span><span>Type and license</span><span>Status</span><span>Action</span></div>{partners.length === 0 ? <div className="state">No {title.toLowerCase()} applications available.</div> : partners.map((partner) => <div className="table-row" key={String(partner.id)}><button className="partner-name-button" onClick={() => void viewPartner(Number(partner.id))}>{String(partner.business_name ?? `${partnerType} ${partner.id}`)}</button><span>{String(partner.type ?? '')} · {String(partner.license_number ?? 'License pending')}</span><span className="status-pill">{String(partner.approval_status ?? 'pending')}</span><div className="row-actions"><button className="ghost-button" onClick={() => void viewPartner(Number(partner.id))}>View details</button>{partner.approval_status === 'pending' && <><button className="approve-button" onClick={() => void decide(Number(partner.id), 'approve')}>Approve</button><button className="reject-button" onClick={() => void decide(Number(partner.id), 'reject')}>Reject</button><button className="ghost-button" onClick={() => void decide(Number(partner.id), 'correction')}>Correction</button></>}</div></div>)}</div></section></section>
}

export function ProcurementCreatePanel({ section }: { section: string }) {
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

export function PrescriptionReviewPanel({ section }: { section: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [message, setMessage] = useState('')
  const load = async () => { try { const response = await api.get('/pharmacy/prescriptions', { params: { status: 'pending_review', per_page: 50 } }); setRows(response.data.data ?? []) } catch { setRows([]) } }
  useEffect(() => { if (section === 'orders') void load() }, [section])
  const review = async (id: number, decision: 'approve' | 'reject') => { try { await api.post(`/pharmacy/prescriptions/${id}/review`, { decision }, mutationConfig('prescription-review', id, decision)); setMessage(`Prescription ${decision === 'approve' ? 'approved' : 'rejected'}.`); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to review prescription.' : 'Unable to review prescription.') } }
  if (section !== 'orders') return null
  return <section className="content"><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">PHARMACY SAFETY REVIEW</p><h2>Prescription queue</h2><p className="muted">Review private prescription evidence before accepting the patient order.</p></div><span className="live-status"><i /> Restricted access</span></div>{message && <div className="form-success">{message}</div>}<div className="operations-table"><div className="table-row table-head"><span>Order</span><span>Submitted</span><span>Status</span><span>Action</span></div>{rows.length === 0 ? <div className="state">No prescriptions awaiting review.</div> : rows.map((row) => <div className="table-row" key={String(row.id)}><strong>{String(row.order_public_id ?? `Order ${row.order_id}`)}</strong><span>{String(row.created_at ?? '')}</span><span className="status-pill">{String(row.status)}</span><div className="row-actions"><button className="ghost-button" onClick={() => void downloadPrivate(`/prescriptions/${Number(row.id)}/download`, `medline-prescription-${row.id}`)}>View file</button><button className="approve-button" onClick={() => void review(Number(row.id), 'approve')}>Approve</button><button className="reject-button" onClick={() => void review(Number(row.id), 'reject')}>Reject</button></div></div>)}</div></section></section>
}

export function SettingsPage({ role, locale, onLocaleChange }: { role: string; locale: string; onLocaleChange: (locale: string) => void }) {
  const [preferences, setPreferences] = useState<Record<string, boolean>>({ in_app_enabled: true, push_enabled: true, email_enabled: true, sms_enabled: false })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [twoFactorSecret, setTwoFactorSecret] = useState('')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const busyPreferenceKeys = useRef(new Set<string>())
  useEffect(() => { api.get('/notification-preferences').then((response) => setPreferences((current) => ({ ...current, ...(response.data.preferences ?? {}) }))).catch(() => setMessage('Unable to load notification preferences.')).finally(() => setLoading(false)) }, [])
  const update = async (key: string, value: boolean) => { if (busyPreferenceKeys.current.has(key)) return; busyPreferenceKeys.current.add(key); const previous = preferences[key]; setPreferences((current) => ({ ...current, [key]: value })); setMessage(''); try { await api.patch('/notification-preferences', { [key]: value }, mutationConfig('notification-preference', key, value ? 'on' : 'off')); setMessage('Notification preferences saved.') } catch { setPreferences((current) => ({ ...current, [key]: previous })); setMessage('Unable to save this preference.') } finally { busyPreferenceKeys.current.delete(key) } }
  const setupTwoFactor = async () => undefined
  const confirmTwoFactor = async () => undefined
  const disableTwoFactor = async () => undefined
  const changeLocale = async (next: string) => { onLocaleChange(next); try { await api.patch('/profile', { locale: next }, mutationConfig('profile-locale', 'self', next)) } catch { setMessage(tr('localePending', locale)) } }
  const text = (key: string) => tr(key, locale)
  useEffect(() => { document.querySelectorAll('.settings-panel select option[value="ar"]').forEach((option) => { option.textContent = 'Arabic · RTL' }) }, [locale])
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('account')}</p><h1>{text('settings')}</h1><p className="muted">{text('settingsDescription')}</p></div></div><section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">{text('language')}</p><h2>{text('interfaceDirection')}</h2></div></div><div className="setting-row"><span><strong>{text('language')}</strong><small>{text('languageHint')}</small></span><select aria-label={text('language')} value={locale} onChange={(event) => void changeLocale(event.target.value)}><option value="en">English · LTR</option><option value="ar">Arabic · RTL</option></select></div><div className="panel-heading"><div><p className="eyebrow">{text('notifications')}</p><h2>{text('deliveryPreferences')}</h2></div></div>{loading ? <div className="state">{text('loadingPreferences')}</div> : Object.entries({ in_app_enabled: text('inAppNotifications'), push_enabled: text('pushNotifications'), email_enabled: text('emailNotifications'), sms_enabled: text('smsNotifications') }).map(([key, label]) => <label className="setting-row" key={key}><span><strong>{label}</strong><small>{text('channelHint')}</small></span><input type="checkbox" checked={Boolean(preferences[key])} onChange={(event) => void update(key, event.target.checked)} /></label>)}{role === 'admin' && <div className="two-factor-box"><div className="panel-heading"><div><p className="eyebrow">{text('adminSecurity')}</p><h2>{text('authenticatorProtection')}</h2></div></div><button className="primary-button" onClick={() => void setupTwoFactor()}>{text('generateSetupSecret')}</button>{twoFactorSecret && <><p className="muted">Secret: {twoFactorSecret}</p><input aria-label={text('authenticatorCode')} inputMode="numeric" maxLength={6} value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value)} placeholder={text('authenticatorCode')} /><div className="row-actions"><button className="approve-button" onClick={() => void confirmTwoFactor()}>{text('confirmTwoFactor')}</button><button className="reject-button" onClick={() => void disableTwoFactor()}>{text('disableTwoFactor')}</button></div></>}{message && <div className="form-success">{message}</div>}</div>}</section></section>
}

export function AdminTwoFactorPanel({ locale }: { locale: string }) {
  return null
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
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('account')}</p><h1>{text('settings')}</h1><p className="muted">{text('settingsDescription')}</p></div></div><section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">{text('language')}</p><h2>{text('interfaceDirection')}</h2></div></div><div className="setting-row"><span><strong>{text('language')}</strong><small>{text('languageHint')}</small></span><select aria-label={text('language')} value={locale} onChange={(event) => void onLocaleChange(event.target.value)}><option value="en">English · LTR</option><option value="ar">Arabic · RTL</option></select></div><div className="panel-heading"><div><p className="eyebrow">{text('adminSecurity')}</p><h2>{text('authenticatorProtection')}</h2></div></div>{loading ? <div className="state">{text('loading')}</div> : <><p className="muted">{enabled ? 'Two-factor authentication is enabled.' : 'Two-factor authentication is not enabled.'}</p>{!enabled && <button className="primary-button" type="button" onClick={() => void setup()}>{text('generateSetupSecret')}</button>}{(secret || enabled) && <><p className="muted">{secret ? `Secret: ${secret}` : 'Enter your current authenticator code to disable 2FA.'}</p><input aria-label={text('authenticatorCode')} inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder={text('authenticatorCode')} /><div className="row-actions">{secret && <button className="approve-button" type="button" onClick={() => void confirm()}>{text('confirmTwoFactor')}</button>}{enabled && <button className="reject-button" type="button" onClick={() => void disable()}>{text('disableTwoFactor')}</button>}</div></>}</>}{message && <div className="form-success" role="status">{message}</div>}</section></section>
}

function RegistrationMapPicker({ latitude, longitude, onChange }: { latitude: string; longitude: string; onChange: (latitude: string, longitude: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const initial: [number, number] = [Number(latitude) || 33.5138, Number(longitude) || 36.2765]
    const map = L.map(containerRef.current).setView(initial, latitude && longitude ? 16 : 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
    const place = (lat: number, lng: number) => { markerRef.current?.remove(); markerRef.current = L.circleMarker([lat, lng], { radius: 9, color: '#0d86b5', fillColor: '#1fb0dc', fillOpacity: .9, weight: 3 }).addTo(map); onChange(lat.toFixed(7), lng.toFixed(7)) }
    if (latitude && longitude) place(Number(latitude), Number(longitude))
    map.on('click', (event) => place(event.latlng.lat, event.latlng.lng))
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])
  return <div className="registration-map-wrap"><div ref={containerRef} className="registration-map" /><div className="map-picker-hint"><span>Click the map to pin your registered location</span>{latitude && longitude && <strong>{latitude}, {longitude}</strong>}</div></div>
}

function RegistrationPage({ onBack, onAuthenticated }: { onBack: () => void; onAuthenticated: (user: Record<string, unknown>, token: string) => void }) {
  const [role, setRole] = useState('patient')
  const [form, setForm] = useState<Record<string, string>>({})
  const [paymentProof, setPaymentProof] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const highlightErrors = (errors: Record<string, string[]>) => { const aliases: Record<string, string[]> = { name: ['full name'], email: ['email address'], phone: ['phone number'], password_confirmation: ['confirm password'], password: ['password'], business_name: ['business name'], license_number: ['license number'], address: ['registered address'], latitude: ['latitude'], longitude: ['longitude'], national_id: ['national id'], vehicle_type: ['vehicle type'], vehicle_plate: ['vehicle plate'], payment_amount: ['payment amount'], payment_proof: ['payment proof'] }; document.querySelectorAll('.registration-form label').forEach((label) => { const text = label.textContent?.toLowerCase() ?? ''; const field = Object.keys(aliases).find((key) => aliases[key].some((alias) => text.includes(alias))); const input = label.querySelector('input'); if (input) input.classList.toggle('registration-invalid', Boolean(field && errors[field])) }) }
  const validateBeforeSubmit = () => { const errors: Record<string, string[]> = {}; const required = ['name', 'email', 'password', 'password_confirmation', ...(partner ? ['business_name', 'license_number', 'address', 'latitude', 'longitude', 'payment_amount'] : []), ...(role === 'driver' ? ['national_id', 'vehicle_type', 'vehicle_plate'] : [])]; required.forEach((field) => { if (!String(form[field] ?? '').trim()) errors[field] = ['This field is required.'] }); if (partner && !paymentProof) errors.payment_proof = ['Payment proof is required.']; if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errors.email = ['Enter a valid email address.']; if (form.password && form.password.length < 8) errors.password = ['Use at least 8 characters.']; if (form.password !== form.password_confirmation) errors.password_confirmation = ['Passwords do not match.']; if (partner) { const latitude = Number(form.latitude); const longitude = Number(form.longitude); if (form.latitude && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) errors.latitude = ['Enter a latitude between -90 and 90.']; if (form.longitude && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) errors.longitude = ['Enter a longitude between -180 and 180.']; } return errors }
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); setMessage(''); document.querySelectorAll('.registration-invalid').forEach((input) => input.classList.remove('registration-invalid')); const localErrors = validateBeforeSubmit(); if (Object.keys(localErrors).length) { highlightErrors(localErrors); setError(Object.entries(localErrors).map(([field, messages]) => `${field.replaceAll('_', ' ')}: ${messages.join(' ')}`).join(' · ')); return } setLoading(true); try { const payload = partner ? new FormData() : { ...form, role, transport: 'cookie' }; if (partner) { Object.entries({ ...form, role, transport: 'cookie' }).forEach(([key, value]) => (payload as FormData).append(key, value)); (payload as FormData).append('payment_proof', paymentProof as File) } const response = await api.post('/auth/register', payload, partner ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined); if (!response.data.token) { setMessage(response.data.message ?? 'Registration submitted for administrator approval.'); return } localStorage.setItem('medline_token', response.data.token); localStorage.removeItem('medline_refresh_token'); setMessage(response.data.message ?? 'Registration submitted.'); onAuthenticated(response.data.user ?? {}, response.data.token) } catch (requestError) { if (axios.isAxiosError(requestError)) { const data = requestError.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined; const errors = data?.errors ?? {}; highlightErrors(errors); const details = Object.entries(errors).map(([field, messages]) => `${field.replaceAll('_', ' ')}: ${messages.join(' ')}`).join(' · '); const status = requestError.response?.status; setError(details || data?.message || (status ? `Registration failed (HTTP ${status}). Please review the form and try again.` : 'Cannot reach the MedLine server. Start the Laravel API on http://127.0.0.1:8000 and try again.')) } else setError('Cannot reach the MedLine server. Start the Laravel API on http://127.0.0.1:8000 and try again.') } finally { setLoading(false) } }
  const partner = role === 'pharmacy' || role === 'warehouse'
  return <div className="registration-page"><div className="registration-shell"><div className="registration-intro"><div className="brand login-brand"><div className="brand-mark">M</div><div><strong>MedLine</strong><span>Healthcare logistics</span></div></div><p className="eyebrow">JOIN THE NETWORK</p><h1>Create your MedLine account</h1><p className="muted">Choose your role and provide the details needed to activate your healthcare operations profile.</p><div className="registration-benefits"><div><strong>One secure account</strong><span>Use the same identity across portal and mobile.</span></div><div><strong>Verified operations</strong><span>Pharmacy, warehouse, and driver applications are reviewed before access.</span></div><div><strong>Location-ready delivery</strong><span>Pin approved pharmacy and warehouse locations directly on OpenStreetMap.</span></div></div></div><section className="registration-card"><div className="registration-card-heading"><div><p className="eyebrow">NEW REGISTRATION</p><h2>Tell us about yourself</h2></div><button type="button" className="text-button" onClick={onBack}>Back to sign in</button></div><div className="registration-role-grid">{[['patient', 'Customer', 'Order medicines and track deliveries'], ['pharmacy', 'Pharmacy', 'Fulfil prescriptions and request stock'], ['warehouse', 'Warehouse', 'Supply approved pharmacy partners'], ['driver', 'Driver', 'Deliver orders and update trips']].map(([value, label, hint]) => <button type="button" className={`registration-role ${role === value ? 'selected' : ''}`} key={value} onClick={() => { setRole(value); setForm(value === 'pharmacy' ? { payment_amount: '12000' } : value === 'warehouse' ? { payment_amount: '24000' } : {}); setPaymentProof(null) }}><strong>{label}</strong><span>{hint}</span></button>)}</div><form className="registration-form" onSubmit={submit}><div className="form-section-heading"><span>Account details</span><small>Required for every user</small></div><div className="registration-grid"><label>Full name<input value={form.name ?? ''} onChange={(event) => update('name', event.target.value)} required minLength={2} placeholder="Your full name" /></label><label>Email address<input type="email" value={form.email ?? ''} onChange={(event) => update('email', event.target.value)} required placeholder="you@example.com" /></label><label>Phone number<input value={form.phone ?? ''} onChange={(event) => update('phone', event.target.value)} placeholder="+963..." /></label><label>Password<input type="password" value={form.password ?? ''} onChange={(event) => update('password', event.target.value)} required minLength={8} placeholder="At least 8 characters" /></label><label>Confirm password<input type="password" value={form.password_confirmation ?? ''} onChange={(event) => update('password_confirmation', event.target.value)} required minLength={8} placeholder="Repeat your password" /></label></div>{partner && <><div className="form-section-heading"><span>{role === 'pharmacy' ? 'Pharmacy details' : 'Warehouse details'}</span><small>Used for verification and deliveries</small></div><div className="registration-grid"><label>Business name<input value={form.business_name ?? ''} onChange={(event) => update('business_name', event.target.value)} required placeholder={role === 'pharmacy' ? 'Central Pharmacy' : 'United Medical Warehouse'} /></label><label>License number<input value={form.license_number ?? ''} onChange={(event) => update('license_number', event.target.value)} required placeholder="Official license number" /></label><label className="registration-span-2">Registered address<input value={form.address ?? ''} onChange={(event) => update('address', event.target.value)} required placeholder="Street, district, city" /></label></div><div className="form-section-heading"><span>Registered location</span><small>Click the map to set the exact point</small></div><RegistrationMapPicker latitude={form.latitude ?? ''} longitude={form.longitude ?? ''} onChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))} /><div className="registration-grid coordinates"><label>Latitude<input value={form.latitude ?? ''} onChange={(event) => update('latitude', event.target.value)} required inputMode="decimal" /></label><label>Longitude<input value={form.longitude ?? ''} onChange={(event) => update('longitude', event.target.value)} required inputMode="decimal" /></label></div><div className="form-section-heading"><span>Initial subscription</span><small>Required for pharmacy and warehouse registration · valid for one year after approval</small></div><div className="registration-grid"><label>Payment amount (SYP) (Required)<input type="number" min="0" step="0.01" value={form.payment_amount ?? ''} onChange={(event) => update('payment_amount', event.target.value)} required placeholder="12,000 SYP" /></label><label>Payment proof (Required)<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setPaymentProof(event.target.files?.[0] ?? null)} required /></label></div></>}{role === 'driver' && <><div className="form-section-heading"><span>Driver details</span><small>Required for delivery review</small></div><div className="registration-grid"><label>National ID<input value={form.national_id ?? ''} onChange={(event) => update('national_id', event.target.value)} required placeholder="Government ID" /></label><label>Vehicle type<input value={form.vehicle_type ?? ''} onChange={(event) => update('vehicle_type', event.target.value)} required placeholder="Motorcycle, car, van..." /></label><label>Vehicle plate<input value={form.vehicle_plate ?? ''} onChange={(event) => update('vehicle_plate', event.target.value)} required placeholder="Plate number" /></label></div></>}{message && <div className="form-success">{message}</div>}{error && <div className="form-error">{error}</div>}<div className="registration-submit"><span>By registering, you agree to MedLine verification and privacy procedures.</span><button className="primary-button" disabled={loading}>{loading ? 'Submitting...' : 'Create account'}</button></div></form></section></div></div>
}

export function LoginPage({ locale, onAuthenticated }: { locale: string; onAuthenticated: (user: Record<string, unknown>) => void }) {
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
  const login = async (event: FormEvent) => { event.preventDefault(); setError(''); setLoading(true); try { const response = await api.post('/auth/login', { email, password, transport: 'cookie' }); localStorage.setItem('medline_token', response.data.token); localStorage.removeItem('medline_refresh_token'); onAuthenticated(response.data.user ?? {}) } catch (requestError) { setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to sign in.' : 'Unable to sign in.') } finally { setLoading(false) } }
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

export function LiveDashboard({ role, locale }: { role: string; locale: string }) {
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

export function DashboardAlerts({ role, locale }: { role: string; locale: string }) {
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

export function NotificationHealthPanel({ role, locale }: { role: string; locale: string }) {
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
  const [search, setSearch] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  useEffect(() => { document.title = `MedLine · ${tr('medicineCatalog', locale)}` }, [locale])
  const text = (key: string) => tr(key, locale)
  const load = async () => { setLoading(true); try { const response = await api.get('/medicines', { params: { per_page: 50, search } }); setRows(response.data.data ?? []) } catch { setRows([]) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [search])
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api.post('/medicines', form, { headers: mutationConfig('medicine', uniqueMutationId('medicine'), 'create').headers }); setMessage('Medicine created.'); event.currentTarget.reset(); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to create medicine.' : 'Unable to create medicine.') } }
  const deactivate = async (id: number) => { try { await api.delete(`/medicines/${id}`, mutationConfig('medicine', id, 'deactivate')); setMessage('Medicine deactivated.'); await load() } catch { setMessage('Unable to deactivate medicine.') } }
  const importCatalog = async () => { if (!importFile) return; const form = new FormData(); form.append('file', importFile); try { const response = await api.post('/medicines/import', form, { headers: mutationConfig('medicine-import', 'catalog', 'upload').headers }); setMessage(response.data.message ?? 'Catalog imported.'); setImportFile(null); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to import catalog.' : 'Unable to import catalog.') } }
  const exportCatalog = async () => { try { const response = await api.get('/medicines/export', { params: { include_inactive: false }, responseType: 'blob' }); const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv' }); const url = window.URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'medline-medicine-catalog.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => window.URL.revokeObjectURL(url), 1000); setMessage('Catalog export downloaded.') } catch { setMessage('Unable to export catalog.') } }
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('catalogAdministration')}</p><h1>{text('medicineCatalog')}</h1><p className="muted">{text('bilingualRecords')}</p></div><div className="row-actions"><button className="ghost-button" type="button" onClick={() => void exportCatalog()}>{text('exportCatalog')}</button><label className="file-field">{text('chooseCsv')}<input type="file" accept=".csv,text/csv" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} /></label><button className="primary-button" type="button" disabled={!importFile} onClick={() => void importCatalog()}>{text('importCsv')}</button></div></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('newRecord')}</p><h2>{text('addMedicine')}</h2></div></div><form className="inline-form" onSubmit={create}><input name="name_en" placeholder={text('englishName')} required /><input name="name_ar" placeholder={text('arabicName')} required /><input name="manufacturer" placeholder={text('manufacturer')} /><input name="form" placeholder={text('form')} /><input name="dosage" placeholder={text('dosage')} /><input name="code" placeholder={text('code')} /><label className="file-field">{text('image')}<input name="image" type="file" accept=".jpg,.jpeg,.png,.webp" /></label><label className="check-field"><input name="prescription_required" type="checkbox" value="1" /> {text('prescription')}</label><button className="primary-button" type="submit">{text('createMedicine')}</button></form>{message && <div className="form-success">{message}</div>}</section><section className="panel table-panel rich-operations-panel medicine-catalog-panel"><div className="panel-heading"><div><p className="eyebrow">{text('medicineCatalog')}</p><h2>{text('activeMedicines')}</h2></div></div><div className="search-box"><Search size={19} aria-hidden="true" /><input aria-label="Search medicine catalog" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by medicine, manufacturer, code, or form..." /></div><div className="operations-table"><div className="table-row table-head"><span>Medicine</span><span>Manufacturer / form</span><span>Dosage</span><span>Code</span><span>Prescription</span><span>Action</span></div>{loading ? <div className="state">{text('loadingRecords')}</div> : rows.length === 0 ? <div className="state">No medicines match your search.</div> : rows.map((row) => <div className="table-row" key={String(row.id)}><strong>{String(row.name_en)}<small>{String(row.name_ar ?? '')}</small></strong><span>{String(row.manufacturer ?? '—')} · {String(row.form ?? '—')}</span><span>{String(row.dosage ?? '—')}</span><span>{String(row.code ?? '—')}</span><span className="status-pill">{row.prescription_required ? text('prescription') : text('noPrescription')}</span><button className="reject-button" type="button" onClick={() => void deactivate(Number(row.id))}>{text('deactivate')}</button></div>)}</div></section></section>
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
  const deactivate = async (id: string) => { try { await api.delete(`/medicines/${id}`, mutationConfig('medicine', id, 'deactivate')); setMessage('Medicine deleted.'); setSelectedId(''); const response = await api.get('/medicines', { params: { per_page: 100 } }); setRows(response.data.data ?? []) } catch { setMessage('Unable to delete medicine.') } }
  return <section className="content"><section className="panel medicine-edit-workspace"><div className="panel-heading"><div><p className="eyebrow">{tr('catalogRefinement', locale)}</p><h2>{tr('editMedicine', locale)}</h2></div></div><div className="operations-table medicine-edit-table"><div className="table-row table-head"><span>Medicine</span><span>Manufacturer</span><span>Form / dosage</span><span>Prescription</span><span>Action</span></div>{rows.map((row) => <div className="table-row" key={String(row.id)}><strong>{String(row.name_en)}<small>{String(row.name_ar ?? '')}</small></strong><span>{String(row.manufacturer ?? '—')}</span><span>{String(row.form ?? '—')} · {String(row.dosage ?? '—')}</span><span className="status-pill">{row.prescription_required ? tr('prescription', locale) : tr('noPrescription', locale)}</span><div className="row-actions"><button className="ghost-button" type="button" onClick={() => setSelectedId(String(row.id))}>View</button><button className="approve-button" type="button" onClick={() => setSelectedId(String(row.id))}>Edit</button><button className="reject-button" type="button" onClick={() => void deactivate(String(row.id))}>Delete</button></div></div>)}</div>{selected && <div className="medicine-edit-form"><div className="panel-heading"><div><p className="eyebrow">EDIT FORM</p><h3>{String(selected.name_en)}</h3></div><button className="ghost-button" type="button" onClick={() => setSelectedId('')}>Close</button></div><form className="inline-form" key={selectedId} onSubmit={update}><input name="name_en" defaultValue={String(selected.name_en ?? '')} placeholder={tr('englishName', locale)} required /><input name="name_ar" defaultValue={String(selected.name_ar ?? '')} placeholder={tr('arabicName', locale)} required /><input name="manufacturer" defaultValue={String(selected.manufacturer ?? '')} placeholder={tr('manufacturer', locale)} /><input name="form" defaultValue={String(selected.form ?? '')} placeholder={tr('form', locale)} /><input name="dosage" defaultValue={String(selected.dosage ?? '')} placeholder={tr('dosage', locale)} /><input name="code" defaultValue={String(selected.code ?? '')} placeholder={tr('code', locale)} /><label className="check-field"><input name="prescription_required" type="checkbox" defaultChecked={Boolean(selected.prescription_required)} /> {tr('prescription', locale)}</label><label className="check-field"><input name="is_active" type="checkbox" defaultChecked={selected.is_active !== false} /> {tr('active', locale)}</label><button className="primary-button" type="submit">{tr('saveMedicine', locale)}</button></form></div>}{message && <div className="form-success" role="status">{message}</div>}</section></section>
}

function PartnerSubscriptionPage({ locale }: { locale: string }) {
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null)
  const [partner, setPartner] = useState<Record<string, unknown> | null>(null)
  const [correctionForm, setCorrectionForm] = useState<Record<string, string>>({})
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null)
  const [amount, setAmount] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKey = useRef<string | null>(null)
  const load = async () => { setLoading(true); try { const response = await api.get('/subscription'); const loadedPartner = response.data.partner ?? null; setPartner(loadedPartner); setCorrectionForm({ business_name: String(loadedPartner?.business_name ?? ''), license_number: String(loadedPartner?.license_number ?? ''), address: String(loadedPartner?.address ?? ''), latitude: String(loadedPartner?.latitude ?? ''), longitude: String(loadedPartner?.longitude ?? '') }); setSubscription(response.data.subscription ?? null); const plans = await api.get('/subscription/plans'); setPlan(plans.data.data?.[0] ?? null) } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? tr('unableToLoadSubscription', locale) : tr('unableToLoadSubscription', locale)) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const submit = async (event: FormEvent) => { event.preventDefault(); if (submitting || !proof || !amount) return; setMessage(''); setSubmitting(true); const key = idempotencyKey.current ?? uniqueMutationId('web-payment-proof'); idempotencyKey.current = key; const form = new FormData(); form.append('amount', amount); if (plan?.code) form.append('plan_code', String(plan.code)); form.append('proof', proof); try { await api.post('/subscription/payment-proof', form, { headers: { 'Idempotency-Key': key } }); setMessage(tr('paymentSubmitted', locale)); setProof(null); idempotencyKey.current = null; await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? tr('uploadFailed', locale) : tr('uploadFailed', locale)) } finally { setSubmitting(false) } }
  const displayPlan = plan ?? {}
  const planLabel = String(displayPlan.name ?? displayPlan.code ?? '').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{tr('partnerAccount', locale)}</p><h1>{tr('annualSubscription', locale)}</h1><p className="muted">{tr('activeSubscriptionHint', locale)}</p></div></div>{partner?.approval_status === 'correction_required' && <section className="panel correction-panel"><div className="panel-heading"><div><p className="eyebrow">APPLICATION CORRECTION REQUIRED</p><h2>Update your application</h2><p className="muted">Administrator note: {String(partner.review_note ?? 'Please review your application details and resubmit.')}</p></div><span className="status-pill correction-status">Correction required</span></div><form className="registration-form correction-form" onSubmit={async (event) => { event.preventDefault(); setMessage(''); try { await api.patch('/subscription/profile', correctionForm, mutationConfig('partner-profile', 'self', 'resubmit')); setMessage('Corrected application resubmitted for review.'); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to resubmit application.' : 'Unable to resubmit application.') }}}><div className="form-section-heading"><span>Business details</span><small>Update the information identified by the administrator</small></div><div className="registration-grid"><label>Business name<input name="business_name" value={correctionForm.business_name ?? ''} onChange={(event) => setCorrectionForm((current) => ({ ...current, business_name: event.target.value }))} required /></label><label>License number<input name="license_number" value={correctionForm.license_number ?? ''} onChange={(event) => setCorrectionForm((current) => ({ ...current, license_number: event.target.value }))} required /></label><label className="registration-span-2">Registered address<input name="address" value={correctionForm.address ?? ''} onChange={(event) => setCorrectionForm((current) => ({ ...current, address: event.target.value }))} required /></label></div><div className="form-section-heading"><span>Registered location</span><small>Click the map to set the exact point</small></div><RegistrationMapPicker latitude={correctionForm.latitude ?? ''} longitude={correctionForm.longitude ?? ''} onChange={(latitude, longitude) => setCorrectionForm((current) => ({ ...current, latitude, longitude }))} /><div className="registration-grid coordinates"><label>Latitude<input name="latitude" value={correctionForm.latitude ?? ''} onChange={(event) => setCorrectionForm((current) => ({ ...current, latitude: event.target.value }))} required inputMode="decimal" /></label><label>Longitude<input name="longitude" value={correctionForm.longitude ?? ''} onChange={(event) => setCorrectionForm((current) => ({ ...current, longitude: event.target.value }))} required inputMode="decimal" /></label></div><button className="primary-button" type="submit">Resubmit application</button></form></section>}<div className="subscription-grid"><section className="panel subscription-status"><p className="eyebrow">{tr('currentStatus', locale)}</p><h2>{loading ? tr('loadingSubscription', locale) : String(subscription?.status ?? tr('notActive', locale))}</h2>{Boolean(subscription?.ends_at) && <p className="muted">{tr('validUntil', locale)} {String(subscription?.ends_at)}</p>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{tr('paymentReview', locale)}</p><h2>{tr('submitPaymentProof', locale)}</h2>{Boolean(displayPlan.code) && <p className="muted">{tr('configuredPlan', locale)}: {planLabel} · {String(displayPlan.amount ?? tr('contactAdministrator', locale))}</p>}</div></div><form className="subscription-form" onSubmit={submit}><label>{tr('amount', locale)}<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>{tr('receiptFile', locale)}<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setProof(event.target.files?.[0] ?? null)} required /></label><button className="primary-button" type="submit" disabled={!proof || !amount || submitting}>{tr('submitForReview', locale)}</button>{message && <div className="form-message">{message}</div>}</form></section></div></section>
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

function OrderDetailPanelRaw({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
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
void OrderDetailPanelRaw

function RouteMap({ route }: { route: Record<string, unknown> }) {
  const pickup = (route.pickup ?? {}) as Record<string, unknown>
  const dropoff = (route.dropoff ?? {}) as Record<string, unknown>
  const coordinate = (place: Record<string, unknown>) => {
    const latitude = Number(place.latitude)
    const longitude = Number(place.longitude)
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
  }
  const pickupPoint = coordinate(pickup)
  const dropoffPoint = coordinate(dropoff)
  if (!pickupPoint || !dropoffPoint) return <section className="panel route-card"><div className="panel-heading"><div><p className="eyebrow">ROUTE MAP</p><h2>Pickup and drop-off</h2></div></div><div className="state">Route coordinates are not available for this order yet.</div></section>
  const routeUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${pickupPoint.latitude},${pickupPoint.longitude};${dropoffPoint.latitude},${dropoffPoint.longitude}`
  const mapDocument = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0}#map{font-family:Arial,sans-serif}.leaflet-control-attribution{font-size:10px}.leaflet-popup-content{font-size:12px;font-weight:600}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script><script>const pickup=[${pickupPoint.latitude},${pickupPoint.longitude}],dropoff=[${dropoffPoint.latitude},${dropoffPoint.longitude}];const map=L.map('map').fitBounds([pickup,dropoff],{padding:[80,80],maxZoom:14});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'· OpenStreetMap contributors'}).addTo(map);L.marker(pickup).addTo(map).bindPopup('<b>Pickup</b><br>${String(pickup.label ?? 'Pharmacy').replaceAll("'", '')}').openPopup();L.marker(dropoff).addTo(map).bindPopup('<b>Drop-off</b><br>${String(dropoff.label ?? 'Patient address').replaceAll("'", '')}');const fallback=L.polyline([pickup,dropoff],{color:'#1596c3',weight:5,dashArray:'10 8'}).addTo(map);fetch('https://router.project-osrm.org/route/v1/driving/'+pickup[1]+','+pickup[0]+';'+dropoff[1]+','+dropoff[0]+'?overview=full&geometries=geojson').then(r=>r.json()).then(data=>{if(data.routes&&data.routes[0]){map.removeLayer(fallback);const routeLayer=L.geoJSON(data.routes[0].geometry,{style:{color:'#1596c3',weight:6}}).addTo(map);map.fitBounds(routeLayer.getBounds(),{padding:[80,80],maxZoom:14})}}).catch(()=>{});<\/script></body></html>`
  return <section className="panel route-card"><div className="panel-heading"><div><p className="eyebrow">ROUTE MAP · OPENSTREETMAP</p><h2>Pickup and drop-off</h2><p className="muted">Real map tiles with the planned driving route.</p></div><a className="ghost-button" href={routeUrl} target="_blank" rel="noreferrer">Open directions — ·? ?</a></div><div className="route-map route-map-real"><iframe title={`OpenStreetMap route from ${String(pickup.label ?? 'pickup')} to ${String(dropoff.label ?? 'drop-off')}`} srcDoc={mapDocument} loading="lazy" referrerPolicy="no-referrer" /></div><div className="route-legend"><span><i className="legend-dot pickup-dot" /> Pickup: {String(pickup.label ?? 'Pharmacy')}</span><span><i className="legend-dot dropoff-dot" /> Drop-off: {String(dropoff.label ?? 'Patient address')}</span><span><i className="legend-line" /> Road route</span></div></section>
}

function DriverProfilePanel({ driverId, onClose, onOpenOrder }: { driverId: number; onClose: () => void; onOpenOrder?: (orderId: number) => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  useEffect(() => { void api.get(`/admin/drivers/${driverId}`).then((response) => setData(response.data)).catch(() => setData({ error: 'Unable to load driver details.' })) }, [driverId])
  if (!data) return <section className="content"><div className="state">Loading driver profile...</div></section>
  if (data.error) return <section className="content"><button className="ghost-button" onClick={onClose}>Back</button><div className="form-error">{String(data.error)}</div></section>
  const driver = (data.driver ?? {}) as Record<string, unknown>
  const summary = (data.summary ?? {}) as Record<string, unknown>
  const trips = Array.isArray(data.trips) ? data.trips as Array<Record<string, unknown>> : []
  const label = (value: unknown) => String(value ?? 'unknown').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  const statusClass = (value: unknown) => String(value ?? 'unknown').replaceAll('_', '-')
  return <section className="content driver-profile-content"><div className="welcome-row"><div><p className="eyebrow">DRIVER PROFILE</p><h1>{String(driver.name ?? 'Driver')}</h1><p className="muted">{String(driver.email ?? '')} · {String(driver.vehicle_type ?? 'Delivery vehicle')} · {String(driver.vehicle_plate ?? 'Plate not provided')}</p></div><button className="ghost-button" onClick={onClose}>Back to delivery</button></div><section className="panel driver-profile-card"><div className="driver-profile-identity"><span className="driver-avatar">{String(driver.name ?? 'D').slice(0, 1).toUpperCase()}</span><div><p className="eyebrow">DRIVER DETAILS</p><h2>{String(driver.name ?? 'Driver')}</h2><span className="driver-status"><i /> {driver.is_available ? 'Available for delivery' : 'Currently assigned'}</span></div></div><div className="driver-details driver-profile-details"><p><span>Vehicle</span><strong>{String(driver.vehicle_type ?? 'Not provided')}</strong></p><p><span>Plate</span><strong>{String(driver.vehicle_plate ?? 'Not provided')}</strong></p><p><span>Contact</span><strong>{String(driver.email ?? 'Not provided')}</strong></p><p><span>Approval</span><strong>{label(driver.approval_status)}</strong></p></div></section><section className="driver-trip-metrics"><div className="metric-card"><div className="metric-copy"><span>Total trips</span><strong>{String(summary.total ?? 0)}</strong></div></div><div className="metric-card"><div className="metric-copy"><span>Accepted</span><strong>{String(summary.accepted ?? 0)}</strong></div></div><div className="metric-card"><div className="metric-copy"><span>In progress</span><strong>{String(summary.in_progress ?? 0)}</strong></div></div><div className="metric-card"><div className="metric-copy"><span>Completed</span><strong>{String(summary.completed ?? 0)}</strong></div></div><div className="metric-card"><div className="metric-copy"><span>Cancelled / failed</span><strong>{Number(summary.cancelled ?? 0) + Number(summary.failed ?? 0)}</strong></div></div></section><section className="panel driver-trips-card"><div className="panel-heading"><div><p className="eyebrow">TRIP HISTORY</p><h2>All delivery trips</h2><p className="muted">Timing, estimate, and current outcome for every assigned trip.</p></div></div><div className="driver-trips-table"><div className="driver-trip-row driver-trip-head"><span>Trip</span><span>Status</span><span>Started</span><span>Duration</span><span>Estimate</span><span>Action</span></div>{trips.length === 0 ? <div className="state">No trips recorded for this driver.</div> : trips.map((trip) => <div className="driver-trip-row driver-trip-clickable" key={String(trip.id)} onClick={() => { if (trip.order_id && onOpenOrder) onOpenOrder(Number(trip.order_id)) }}><strong>{String(trip.order_public_id ?? trip.public_id ?? `Trip ${trip.id}`)}</strong><span><em className={`trip-status status-${statusClass(trip.status)}`}>{label(trip.status)}</em></span><span>{formatMedlineDate(trip.claimed_at ?? trip.created_at)}</span><span>{trip.duration_minutes ? `${String(trip.duration_minutes)}m` : '—'}</span><span>~{String(trip.estimated_minutes ?? 45)}m</span><button type="button" className="ghost-button" onClick={(event) => { event.stopPropagation(); if (trip.order_id && onOpenOrder) onOpenOrder(Number(trip.order_id)) }}>View order</button></div>)}</div></section></section>
}

export function OrderDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null)
  const [tripOrder, setTripOrder] = useState<Record<string, unknown> | null>(null)
  const order = (detail.order ?? {}) as Record<string, unknown>
  const delivery = (detail.delivery ?? {}) as Record<string, unknown>
  const driver = (delivery.driver ?? {}) as Record<string, unknown>
  const route = (detail.route ?? {}) as Record<string, unknown>
  const invoice = (detail.invoice ?? {}) as Record<string, unknown>
  const timeline = Array.isArray(detail.timeline) ? detail.timeline as Array<Record<string, unknown>> : []
  const amount = (key: string) => formatMedlineMoney(invoice[key] ?? order[key] ?? 0, 'SYP', locale)
  const currentStatus = String(delivery.status ?? order.status ?? 'pending')
  const statusLabel = (value: string) => value.replaceAll('_', ' ')
  const readableStatus = statusLabel(currentStatus).replace(/\b\w/g, (letter) => letter.toUpperCase())
  const paymentMethod = String(invoice.payment_method ?? order.payment_method ?? 'cash_on_delivery').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  const deliveryDuration = formatDeliveryDuration(timeline, delivery.completed_at ?? delivery.location_updated_at)
  if (tripOrder) return <OrderDetailPanel detail={tripOrder} onClose={() => setTripOrder(null)} locale={locale} />
  if (selectedDriverId) return <DriverProfilePanel driverId={selectedDriverId} onClose={() => setSelectedDriverId(null)} onOpenOrder={(orderId) => { void api.get(`/orders/${orderId}`).then((response) => setTripOrder(response.data)).catch(() => setTripOrder({ error: 'Unable to load order details.' })) }} />
  if (detail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>Back to queue</button><div className="form-error">{String(detail.error)}</div></section>
  return <section className="content order-detail-content">
    <div className="welcome-row"><div><p className="eyebrow">{locale === 'ar' ? '— · · · · ·? · — · · · · —' : 'ORDER DETAIL'}</p><h1>{String(order.public_id ?? order.id ?? 'Order')}</h1><div className="order-meta"><span className={`order-status status-${currentStatus.replaceAll('_', '-')}`}><i />{readableStatus}</span><span className="muted">{formatMedlineDate(order.created_at, locale)}</span></div></div><button className="ghost-button" onClick={onClose}>{locale === 'ar' ? '— · · · ·? — · · · · · · · · · · · —' : 'Back to queue'}</button></div>
    <div className="order-detail-grid">
      <section className="panel invoice-card"><div className="panel-heading"><div><p className="eyebrow">{locale === 'ar' ? '— · · · · · ·? — · —' : 'INVOICE'}</p><h2>{locale === 'ar' ? '— · · · · · · · · —' : 'Order summary'}</h2></div><span className="detail-total">{amount('total')}</span></div><div className="invoice-lines"><p><span>Subtotal</span><strong>{amount('subtotal')}</strong></p><p><span>Delivery fee</span><strong>{amount('delivery_fee')}</strong></p><p className="invoice-grand-total"><span>Total</span><strong>{amount('total')}</strong></p></div><div className="payment-line"><span>Payment method</span><strong className="payment-pill"><CreditCard size={14} />{paymentMethod}</strong></div></section>
      <section className="panel driver-card driver-card-clickable" role="button" tabIndex={0} onClick={() => Number(driver.driver_id ?? delivery.driver_id) > 0 && setSelectedDriverId(Number(driver.driver_id ?? delivery.driver_id))} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); Number(driver.driver_id ?? delivery.driver_id) > 0 && setSelectedDriverId(Number(driver.driver_id ?? delivery.driver_id)) } }}><div className="panel-heading"><div><p className="eyebrow">DRIVER</p><h2>{driver.name ? String(driver.name) : 'Awaiting driver assignment'}</h2></div><span className="driver-avatar">{driver.name ? String(driver.name).slice(0, 1).toUpperCase() : '?'}</span></div>{driver.name ? <><div className="driver-status"><i /> {driver.is_available ? 'Available for delivery' : 'Assigned to delivery'}</div><div className="driver-details"><p><span>Vehicle</span><strong>{String(driver.vehicle_type ?? 'Delivery vehicle')}</strong></p><p><span>Plate</span><strong>{String(driver.vehicle_plate ?? 'Not provided')}</strong></p><p><span>Contact</span><strong>{String(driver.email ?? 'Not provided')}</strong></p></div><span className="driver-view-hint">View driver profile and trip history — ·? ?</span></> : <p className="muted">The driver details will appear here after a driver claims this delivery.</p>}</section>
      <RouteMap route={route} />
      <section className="panel timeline-card"><div className="panel-heading"><div><p className="eyebrow">DELIVERY TIMELINE</p><h2>Delivery progress</h2></div><div className="timeline-heading-right"><span className={`order-status status-${currentStatus.replaceAll('_', '-')}`}><i />{statusLabel(currentStatus).replace(/\b\w/g, (letter) => letter.toUpperCase())}</span><div className="timeline-summary"><span>Total delivery time</span><strong>{deliveryDuration}</strong></div></div></div>{timeline.length === 0 ? <div className="state">No delivery events recorded yet.</div> : <div className="step-timeline">{timeline.map((event, index) => <div className={`timeline-step ${index === timeline.length - 1 ? 'current' : 'complete'}`} key={String(event.id ?? index)}><div className="step-marker">{index + 1}</div><div className="step-content"><strong>{statusLabel(String(event.to_status ?? 'Updated'))}</strong><span>{formatMedlineDate(event.created_at, locale)}</span>{Boolean(event.note) && <small>{String(event.note)}</small>}</div></div>)}</div>}</section>
    </div>
  </section>
}

function DeliveryDetailPresentation({ delivery, driver, events, route, mapUrl, terminal, onClose, onDriverClick, text }: { delivery: Record<string, unknown>; driver: Record<string, unknown>; events: Array<Record<string, unknown>>; route: Record<string, unknown>; mapUrl: string | null; terminal: boolean; onClose: () => void; onDriverClick: () => void; text: (key: string) => string }) {
  const statusLabel = (value: string) => value.replaceAll('_', ' ')
  const currentStatus = statusLabel(String(delivery.status ?? 'unknown'))
  const deliveryDuration = formatDeliveryDuration(events, delivery.completed_at)
  return <section className="content order-detail-content"><div className="welcome-row"><div><p className="eyebrow">{text('deliveryDetail')}</p><h1>{String(delivery.public_id ?? delivery.id ?? 'Delivery')}</h1><p className="muted">{currentStatus} · {String(delivery.completed_at ?? delivery.claimed_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>{text('backToDeliveries')}</button></div><div className="order-detail-grid"><section className="panel invoice-card"><div className="panel-heading"><div><p className="eyebrow">ASSIGNMENT</p><h2>{String(delivery.order_public_id ?? delivery.procurement_public_id ?? text('operationalDelivery'))}</h2></div><span className="detail-total">SYP {Number(delivery.total ?? 0).toLocaleString()}</span></div><div className="invoice-lines"><p><span>Address</span><strong>{String(delivery.delivery_address_snapshot ?? text('privateAddress'))}</strong></p><p className="invoice-grand-total"><span>Total</span><strong>SYP {Number(delivery.total ?? 0).toLocaleString()}</strong></p></div><p className="muted payment-line">Driver assignment: {delivery.driver_id ? text('assigned') : text('awaitingDriver')}</p></section><section className="panel driver-card driver-card-clickable" role="button" tabIndex={0} onClick={onDriverClick} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onDriverClick() } }}><div className="panel-heading"><div><p className="eyebrow">DRIVER</p><h2>{driver.name ? String(driver.name) : 'Awaiting driver assignment'}</h2></div><span className="driver-avatar">{driver.name ? String(driver.name).slice(0, 1).toUpperCase() : '?'}</span></div>{driver.name ? <><div className="driver-status"><i /> {driver.is_available ? 'Available for delivery' : 'Assigned to delivery'}</div><div className="driver-details"><p><span>Vehicle</span><strong>{String(driver.vehicle_type ?? 'Delivery vehicle')}</strong></p><p><span>Plate</span><strong>{String(driver.vehicle_plate ?? 'Not provided')}</strong></p><p><span>Contact</span><strong>{String(driver.email ?? 'Not provided')}</strong></p></div><span className="driver-view-hint">View driver profile and trip history — ·? ?</span></> : <p className="muted">The driver details will appear here after assignment.</p>}</section><RouteMap route={route} /><section className="panel live-location-card"><div className="panel-heading"><div><p className="eyebrow">{text('liveLocation')}</p><h2>{text('driverLocation')}</h2></div></div>{mapUrl && !terminal ? <div><p>{text('latestActivePosition')}</p><p className="muted">{text('updated')}: {String(delivery.location_updated_at ?? text('pending'))}</p><iframe className="delivery-map" title={text('driverLocation')} src={mapUrl} loading="lazy" referrerPolicy="no-referrer" allowFullScreen /></div> : <div className="state">{text('locationActiveOnly')}</div>}</section><section className="panel timeline-card"><div className="panel-heading"><div><p className="eyebrow">{text('eventTimeline')}</p><h2>{text('deliveryProgress')}</h2></div><div className="timeline-heading-right"><span className={`order-status status-${currentStatus.replaceAll('_', '-')}`}><i />{statusLabel(currentStatus).replace(/\b\w/g, (letter) => letter.toUpperCase())}</span><div className="timeline-summary"><span>Total delivery time</span><strong>{deliveryDuration}</strong></div></div></div>{events.length === 0 ? <div className="state">{text('noDeliveryEvents')}</div> : <div className="step-timeline">{events.map((event, index) => <div className={`timeline-step ${index === events.length - 1 ? 'current' : 'complete'}`} key={String(event.id ?? index)}><div className="step-marker">{index + 1}</div><div className="step-content"><strong>{statusLabel(String(event.to_status ?? 'Updated'))}</strong><span>{formatMedlineDate(event.created_at, 'en')}</span>{Boolean(event.note) && <small>{String(event.note)}</small>}</div></div>)}</div>}</section></div></section>
}

export function DeliveryDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const [currentDetail, setCurrentDetail] = useState(detail)
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null)
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
  const route = (currentDetail.route ?? {}) as Record<string, unknown>
  const driver = (delivery.driver ?? {}) as Record<string, unknown>
  if (currentDetail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>{text('backToDeliveries')}</button><div className="form-error">{String(currentDetail.error)}</div></section>
  const terminal = ['delivered', 'failed', 'cancelled'].includes(String(delivery.status))
  if (selectedDriverId) return <DriverProfilePanel driverId={selectedDriverId} onClose={() => setSelectedDriverId(null)} />
  return <DeliveryDetailPresentation delivery={delivery} driver={driver} events={events} route={route} mapUrl={mapUrl} terminal={terminal} onClose={onClose} onDriverClick={() => Number(driver.driver_id ?? delivery.driver_id) > 0 && setSelectedDriverId(Number(driver.driver_id ?? delivery.driver_id))} text={text} />
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('deliveryDetail')}</p><h1>{String(delivery.public_id ?? delivery.id ?? 'Delivery')}</h1><p className="muted">{String(delivery.status ?? 'unknown').replaceAll('_', ' ')} · {String(delivery.completed_at ?? delivery.claimed_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>{text('backToDeliveries')}</button></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('assignment')}</p><h2>{String(delivery.order_public_id ?? delivery.procurement_public_id ?? text('operationalDelivery'))}</h2></div></div><p>{text('address')}: {String(delivery.delivery_address_snapshot ?? text('privateAddress'))}</p><p>{text('total')}: {String(delivery.total ?? '0.00')}</p><p className="muted">{text('driverAssignment')}: {delivery.driver_id ? text('assigned') : text('awaitingDriver')}</p></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('liveLocation')}</p><h2>{text('driverLocation')}</h2></div></div>{mapUrl && !terminal ? <div><p>{text('latestActivePosition')}</p><p className="muted">{text('updated')}: {String(delivery.location_updated_at ?? text('pending'))}</p><iframe className="delivery-map" title={text('driverLocation')} src={mapUrl} loading="lazy" referrerPolicy="no-referrer" allowFullScreen /><a className="ghost-button" href={`https://www.openstreetmap.org/?mlat=${String(delivery.last_latitude)}&mlon=${String(delivery.last_longitude)}&zoom=15`} target="_blank" rel="noreferrer">{text('openMap')}</a></div> : <div className="state">{text('locationActiveOnly')}</div>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('eventTimeline')}</p><h2>{text('deliveryProgress')}</h2></div></div>{events.length === 0 ? <div className="state">{text('noDeliveryEvents')}</div> : events.map((event, index) => <div className="activity-item" key={`${String(event.id ?? index)}`}><div className="activity-icon blue">{index + 1}</div><div><strong>{String(event.to_status ?? 'Updated').replaceAll('_', ' ')}</strong><span>{String(event.created_at ?? '')}</span></div></div>)}</section></div></section>
}

function LegacyComplaintDetailPanel({ detail, onClose }: { detail: Record<string, unknown>; onClose: () => void }) {
  const complaint = (detail.complaint ?? {}) as Record<string, unknown>
  const attachments = Array.isArray(detail.attachments) ? detail.attachments as Array<Record<string, unknown>> : []
  const complaintId = Number(complaint.id ?? 0)
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">SUPPORT CASE</p><h1>{String(complaint.subject ?? `Complaint ${complaintId}`)}</h1><p className="muted">{String(complaint.status ?? 'open')} · {String(complaint.priority ?? 'normal')} · {String(complaint.created_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>Back to complaints</button></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">CASE DESCRIPTION</p><h2>{String(complaint.category ?? 'Support')}</h2></div></div><p>{String(complaint.description ?? '')}</p>{Boolean(complaint.resolution) && <><p className="eyebrow">RESOLUTION</p><p>{String(complaint.resolution)}</p></>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">PRIVATE EVIDENCE</p><h2>Attachments</h2></div></div>{attachments.length === 0 ? <div className="state">No evidence attached.</div> : attachments.map((attachment) => <div className="activity-item" key={String(attachment.id)}><div><strong>{String(attachment.original_name ?? 'Evidence file')}</strong><span>{String(attachment.mime_type ?? '')} · {String(attachment.file_size ?? '')} bytes</span></div><button className="ghost-button" onClick={() => void downloadPrivate(`/complaints/${complaintId}/attachments/${Number(attachment.id)}/download`, `medline-complaint-${complaintId}-${String(attachment.original_name ?? 'evidence')}`)}>Download</button></div>)}</section></div></section>
}

void LegacyComplaintDetailPanel

export function ComplaintDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
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

export function ProcurementDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const procurement = (detail.procurement ?? {}) as Record<string, unknown>
  const items = Array.isArray(detail.items) ? detail.items as Array<Record<string, unknown>> : []
  const delivery = (detail.delivery ?? {}) as Record<string, unknown>
  const timeline = Array.isArray(detail.timeline) ? detail.timeline as Array<Record<string, unknown>> : []
  const text = (key: string) => tr(key, locale)
  if (detail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>{text('back')}</button><div className="form-error">{String(detail.error)}</div></section>
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('procurementDetail')}</p><h1>{String(procurement.public_id ?? procurement.id ?? 'Procurement')}</h1><p className="muted">{String(procurement.status ?? 'unknown').replaceAll('_', ' ')} · {formatMedlineDate(procurement.created_at)}</p></div><button className="ghost-button" onClick={onClose}>{text('backToProcurement')}</button></div><div className="detail-stat-grid"><div><small>PHARMACY</small><strong>{String(procurement.pharmacy_name ?? text('notRecorded'))}</strong></div><div><small>WAREHOUSE</small><strong>{String(procurement.warehouse_name ?? text('notRecorded'))}</strong></div><div><small>DELIVERY ADDRESS</small><strong>{String(procurement.delivery_address_snapshot ?? text('notRecorded'))}</strong></div><div><small>TOTAL</small><strong className="money-cell">SYP {Number(procurement.total ?? 0).toLocaleString()}</strong></div></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('items')}</p><h2>{text('requestedStock')}</h2></div></div><div className="detail-items-table"><div className="detail-item-head"><span>Medicine</span><span>Requested</span><span>Accepted</span><span>Line total</span></div>{items.length === 0 ? <div className="state">{text('noItems')}</div> : items.map((item) => <div className="detail-item-row" key={String(item.id)}><strong>{String(item.name_en ?? 'Medicine')}<small>{String(item.name_ar ?? '')}</small></strong><span>{String(item.quantity ?? 0)}</span><span>{String(item.accepted_quantity ?? 0)}</span><span className="money-cell">SYP {Number(item.line_total ?? 0).toLocaleString()}</span></div>)}</div></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('delivery')}</p><h2>{String(delivery.status ?? text('notCreated')).replaceAll('_', ' ')}</h2></div></div>{timeline.length === 0 ? <div className="state">{text('noDeliveryEvents')}</div> : timeline.map((event, index) => <div className="activity-item" key={`${String(event.id ?? index)}`}><div className="activity-icon blue">{index + 1}</div><div><strong>{String(event.to_status ?? 'Updated').replaceAll('_', ' ')}</strong><span>{formatMedlineDate(event.created_at)}</span></div></div>)}</section></div></section>
}

function operationsEndpoint(section: string, role: string) {
  if (section === 'partners' || section === 'verification') return '/admin/partners'
  if (section === 'documents') return '/admin/verification-documents'
  if (section === 'users') return '/admin/users'
  if (section === 'inventory') return role === 'admin' ? '/admin/inventory' : '/partner/inventory'
  if (section === 'deliveries') return role === 'admin' ? '/admin/deliveries' : role === 'patient' ? '/deliveries/mine' : role === 'driver' ? '/deliveries/available' : '/partner/deliveries'
  if (section === 'subscriptions') return role === 'admin' ? '/admin/subscriptions' : '/subscription'
  if (section === 'complaints') return role === 'admin' ? '/admin/complaints' : '/complaints'
  if (section === 'ratings') return '/admin/ratings'
  if (section === 'audit') return '/admin/audit-logs'
  if (section === 'procurement') return role === 'admin' ? '/admin/procurements' : '/procurement'
  return role === 'pharmacy' ? '/partner/orders' : '/orders'
}

export function RatingQueue({ locale }: { locale: string }) {
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

function CustomerOrderMap({ pharmacies, selectedPharmacy, deliveryPoint, onPharmacySelect, onDeliverySelect }: { pharmacies: Array<Record<string, unknown>>; selectedPharmacy: Record<string, unknown> | null; deliveryPoint: { latitude: number; longitude: number } | null; onPharmacySelect: (pharmacy: Record<string, unknown>) => void; onDeliverySelect: (latitude: number, longitude: number) => void }) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const deliveryMarkerRef = useRef<L.Marker | null>(null)
  const center: L.LatLngExpression = [33.5138, 36.2765]
  useEffect(() => {
    if (!mapElement.current || mapRef.current) return
    const map = L.map(mapElement.current, { zoomControl: true }).setView(center, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
    map.on('click', (event) => onDeliverySelect(event.latlng.lat, event.latlng.lng))
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current?.clearLayers()
    const markers = L.layerGroup().addTo(map)
    markersRef.current = markers
    const validPoints = pharmacies.map((pharmacy) => ({ pharmacy, latitude: Number(pharmacy.latitude), longitude: Number(pharmacy.longitude) })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    validPoints.forEach(({ pharmacy, latitude, longitude }) => {
      const marker = L.marker([latitude, longitude]).addTo(markers)
      marker.bindPopup(`<strong>${String(pharmacy.business_name ?? 'Pharmacy')}</strong><br>${String(pharmacy.address ?? 'Approved pharmacy')}`)
      marker.on('click', () => onPharmacySelect(pharmacy))
    })
    if (validPoints.length > 0) map.fitBounds(L.latLngBounds(validPoints.map((point) => [point.latitude, point.longitude] as [number, number])), { padding: [30, 30], maxZoom: 14 })
  }, [pharmacies])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !deliveryPoint) return
    deliveryMarkerRef.current?.remove()
    deliveryMarkerRef.current = L.marker([deliveryPoint.latitude, deliveryPoint.longitude], { title: 'Delivery address' }).addTo(map).bindPopup('<strong>Delivery address</strong>').openPopup()
  }, [deliveryPoint])
  return <div className="customer-order-map-wrap"><div ref={mapElement} className="customer-order-map" /><div className="map-instruction"><span>1</span> Select a pharmacy marker, then click anywhere on the map to pin your delivery address.</div>{selectedPharmacy && <div className="map-selection-card"><strong>{String(selectedPharmacy.business_name)}</strong><span>{String(selectedPharmacy.address ?? 'Approved pharmacy')}</span></div>}</div>
}

function PatientOrderCreatePanel({ locale: _locale }: { locale: string }) {
  const [pharmacies, setPharmacies] = useState<Array<Record<string, unknown>>>([])
  const [medicines, setMedicines] = useState<Array<Record<string, unknown>>>([])
  const [selectedPharmacy, setSelectedPharmacy] = useState<Record<string, unknown> | null>(null)
  const [deliveryPoint, setDeliveryPoint] = useState<{ latitude: number; longitude: number } | null>(null)
  const [medicineSearch, setMedicineSearch] = useState('')
  const [medicineId, setMedicineId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => { api.get('/partners', { params: { type: 'pharmacy', per_page: 100 } }).then((response) => setPharmacies(response.data.data ?? [])).catch(() => setMessage('Unable to load approved pharmacies.')) }, [])
  const selectPharmacy = (pharmacy: Record<string, unknown>) => { setSelectedPharmacy(pharmacy); setMedicineId(''); setPrescriptionFile(null); setMedicines([]); api.get('/medicines', { params: { available_only: true, partner_id: Number(pharmacy.id), per_page: 100 } }).then((response) => setMedicines(response.data.data ?? [])).catch(() => setMessage('Unable to load medicines for this pharmacy.')) }
  const filteredMedicines = medicines.filter((medicine) => [String(medicine.name_en ?? ''), String(medicine.manufacturer ?? '')].join(' ').toLowerCase().includes(medicineSearch.toLowerCase()))
  const selectedMedicine = medicines.find((medicine) => String(medicine.id) === medicineId) ?? null
  const prescriptionRequired = Boolean(selectedMedicine?.prescription_required)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedPharmacy || !medicineId || !deliveryPoint) { setMessage('Select a pharmacy, medicine, and delivery point on the map first.'); return }
    if (prescriptionRequired && !prescriptionFile) { setMessage('Upload a prescription image or PDF for this medicine before submitting the order.'); return }
    try {
      const response = await api.post('/orders', { pharmacy_id: Number(selectedPharmacy.id), delivery_address_snapshot: 'Pinned map location (' + deliveryPoint.latitude.toFixed(6) + ', ' + deliveryPoint.longitude.toFixed(6) + ')', items: [{ medicine_id: Number(medicineId), quantity: Number(quantity) }] }, mutationConfig('patient-order', uniqueMutationId('patient-order'), 'create'))
      const order = response.data.order ?? response.data
      const orderId = Number(order.id ?? 0)
      if (prescriptionRequired && prescriptionFile && orderId) {
        const form = new FormData()
        form.append('prescription', prescriptionFile)
        await api.post('/orders/' + orderId + '/prescription', form, { headers: mutationConfig('patient-prescription', orderId, 'upload').headers })
      }
      setMessage(prescriptionRequired ? 'Order submitted with prescription for pharmacy review.' : 'Order submitted to the selected pharmacy for review.')
      setMedicineId('')
      setPrescriptionFile(null)
      setQuantity('1')
      event.currentTarget.reset()
    } catch (error) {
      setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to create order.' : 'Unable to create order.')
    }
  }

  return <section className="panel patient-order-create"><div className="panel-heading"><div><p className="eyebrow">NEW ORDER · MAP PICKER</p><h2>Choose a pharmacy and delivery location</h2><p className="muted">Click a pharmacy marker to view its available medicines. Then click the map to set where you want your order delivered.</p></div></div><CustomerOrderMap pharmacies={pharmacies} selectedPharmacy={selectedPharmacy} deliveryPoint={deliveryPoint} onPharmacySelect={selectPharmacy} onDeliverySelect={(latitude, longitude) => setDeliveryPoint({ latitude, longitude })} /><form className="customer-order-form" onSubmit={submit}><div className="order-step-card"><span className="order-step-number">2</span><div><strong>{selectedPharmacy ? String(selectedPharmacy.business_name) : 'Select a pharmacy on the map'}</strong><small>{selectedPharmacy ? 'Pharmacy selected · medicines are ready to choose' : 'Click a marker to continue'}</small></div></div><div className="customer-order-fields">{selectedPharmacy && <label>Search medicines<input value={medicineSearch} onChange={(event) => setMedicineSearch(event.target.value)} placeholder="Search by medicine name..." /></label>}<label>Medicine<select value={medicineId} onChange={(event) => { setMedicineId(event.target.value); setPrescriptionFile(null) }} required disabled={!selectedPharmacy}><option value="">{selectedPharmacy ? (filteredMedicines.length ? 'Choose available medicine' : 'No medicines match') : 'Select a pharmacy first'}</option>{filteredMedicines.map((medicine) => <option key={String(medicine.id)} value={String(medicine.id)}>{String(medicine.name_en)}{medicine.manufacturer ? ' · ' + String(medicine.manufacturer) : ''}</option>)}</select></label><label>Quantity<input type="number" min="1" max="100" value={quantity} onChange={(event) => setQuantity(event.target.value)} required disabled={!selectedPharmacy} /></label></div>{prescriptionRequired && <label className="prescription-upload-field"><span>Prescription image or PDF <em>(Required)</em></span><small>This medicine requires prescription evidence before the pharmacy can review your order.</small><input type="file" accept=".jpg,.jpeg,.png,.pdf" required onChange={(event) => setPrescriptionFile(event.target.files?.[0] ?? null)} /></label>}<div className={'delivery-point-summary ' + (deliveryPoint ? 'selected' : '')}><span className="order-step-number">3</span><div><strong>{deliveryPoint ? 'Delivery location selected' : 'Pin your delivery location'}</strong><small>{deliveryPoint ? deliveryPoint.latitude.toFixed(6) + ', ' + deliveryPoint.longitude.toFixed(6) : 'Click the map where you want the driver to deliver'}</small></div></div><button className="primary-button" type="submit" disabled={!selectedPharmacy || !medicineId || !deliveryPoint || (prescriptionRequired && !prescriptionFile)}>Create order</button>{message && <div className="form-message">{message}</div>}</form></section>
}
export function OperationsPage({ section, role, locale }: { section: string; role: string; locale: string }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [complaintReport, setComplaintReport] = useState<Record<string, unknown> | null>(null)
  const busyMutationKeys = useRef(new Set<string>())
  const endpoint = operationsEndpoint(section, role)
  const runMutation = async (key: string, task: () => Promise<void>) => { if (busyMutationKeys.current.has(key)) return; busyMutationKeys.current.add(key); try { await task() } catch (error) { const message = axios.isAxiosError(error) ? error.response?.data?.message ?? 'The operation could not be completed. You can retry the same action safely.' : 'The operation could not be completed. You can retry the same action safely.'; announceAccessibilityMessage(message); window.alert(message) } finally { busyMutationKeys.current.delete(key) } }
  useEffect(() => { setPage(1); setStatusFilter(''); setSortBy('created_at'); setSortDirection('desc') }, [section, endpoint, search])
  useEffect(() => { let cancelled = false; setLoading(true); const params = section === 'verification' ? { search, status: 'pending', per_page: 8, page } : section === 'documents' ? { status: 'under_review', per_page: 8, page } : { search, ...(section === 'orders' && statusFilter ? { status: statusFilter } : {}), ...(section === 'orders' ? { sort_by: sortBy, sort_direction: sortDirection } : {}), per_page: 8, page }; api.get(endpoint, { params }).then((response) => { if (cancelled) return; const data = response.data.data ?? []; setLastPage(Number(response.data.meta?.last_page ?? 1)); setRows(data.map((item: Record<string, unknown>) => ({ id: Number(item.id ?? 0), primary: String(item.business_name ?? item.name ?? item.name_en ?? item.public_id ?? `Record ${item.id}`), secondary: String(item.email ?? item.document_type ?? item.name_ar ?? item.manufacturer ?? item.delivery_address_snapshot ?? item.status ?? 'Operational record'), status: String(item.status ?? item.approval_status ?? 'Active'), raw: item }))) }).catch(() => { if (!cancelled) { setRows([]); setLastPage(1) } }).finally(() => { if (!cancelled) setLoading(false) }); return () => { cancelled = true } }, [endpoint, section, search, page, statusFilter, sortBy, sortDirection])
  useEffect(() => { if (section !== 'complaints' || role !== 'admin') { setComplaintReport(null); return } api.get('/admin/reports/complaints').then((response) => setComplaintReport(response.data)).catch(() => setComplaintReport(null)) }, [section, role, rows.length])
  const decidePartner = async (id: number, decision: 'approve' | 'reject') => runMutation(`partner:${id}:${decision}`, async () => { await api.post(`/admin/partners/${id}/decision`, { decision }, mutationConfig('partner-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const decideOrder = async (id: number, decision: 'accept' | 'reject') => runMutation(`order:${id}:${decision}`, async () => { await api.post(`/partner/orders/${id}/decision`, { decision }, mutationConfig('order-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const decidePrescription = async (id: number, decision: 'approve' | 'reject') => runMutation(`prescription:${id}:${decision}`, async () => { await api.post(`/pharmacy/prescriptions/${id}/review`, { decision }, mutationConfig('prescription-review', id, decision)); setRows((current) => current.map((row) => row.id === id ? { ...row, status: decision === 'approve' ? 'pending_pharmacy_review' : 'cancelled' } : row)) })
  const decideProcurement = async (id: number, decision: 'accept' | 'reject') => runMutation(`procurement:${id}:${decision}`, async () => { await api.post(`/procurement/${id}/decision`, { decision }, mutationConfig('procurement-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const decidePayment = async (id: number, decision: 'approve' | 'reject') => runMutation(`payment:${id}:${decision}`, async () => { await api.post(`/admin/subscriptions/${id}/decision`, { decision }, mutationConfig('subscription-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const updateComplaint = async (id: number, status: 'in_review' | 'resolved') => runMutation(`complaint:${id}:${status}`, async () => { await api.patch(`/complaints/${id}`, { status }, mutationConfig('complaint-status', id, status)); setRows((current) => current.map((row) => row.id === id ? { ...row, status } : row)) })
  const reassignDelivery = async (id: number) => runMutation(`reassign:${id}`, async () => { await api.post(`/admin/deliveries/${id}/reassign`, { reason: 'Administrative reassignment after failed delivery.' }, mutationConfig('delivery-reassign', id, 'failed')); setRows((current) => current.map((row) => row.id === id ? { ...row, status: 'available' } : row)) })
  const updateUserStatus = async (id: number, status: 'active' | 'suspended') => runMutation(`user:${id}:${status}`, async () => { await api.patch(`/admin/users/${id}/status`, { status, reason: 'Administrative account review.' }, mutationConfig('user-status', id, status)); setRows((current) => current.map((row) => row.id === id ? { ...row, status } : row)) })
  const decideDocument = async (id: number, decision: 'approve' | 'reject' | 'correction') => runMutation(`document:${id}:${decision}`, async () => { await api.post(`/admin/verification-documents/${id}/decision`, { decision }, mutationConfig('document-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const updateInventory = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const payload = { medicine_id: Number(form.get('medicine_id')), quantity: Number(form.get('quantity')), unit_price: Number(form.get('unit_price')), low_stock_threshold: Number(form.get('low_stock_threshold') ?? 5) }; const key = `${payload.medicine_id}-${payload.quantity}-${payload.unit_price}-${payload.low_stock_threshold}`; await runMutation(`inventory:${key}`, async () => { await api.put('/partner/inventory', payload, mutationConfig('inventory-upsert', key, 'save')); formElement.reset(); const response = await api.get(endpoint, { params: { search, per_page: 8 } }); setRows((response.data.data ?? []).map((item: Record<string, unknown>) => ({ id: Number(item.id ?? 0), primary: String(item.business_name ?? item.name_en ?? item.public_id ?? `Record ${item.id}`), secondary: String(item.name_ar ?? item.manufacturer ?? item.status ?? 'Operational record'), status: String(item.status ?? item.approval_status ?? 'Active'), raw: item }))) }) }
  const openDetail = async (id: number) => { if (!['orders', 'deliveries', 'complaints', 'procurement'].includes(section)) return; try { const response = await api.get(section === 'complaints' ? `/complaints/${id}` : section === 'procurement' ? `/procurement/${id}` : section === 'deliveries' ? `/deliveries/${id}` : `/orders/${id}`); setDetail(section === 'complaints' ? { ...response.data, _kind: 'complaint' } : section === 'procurement' ? { ...response.data, _kind: 'procurement' } : section === 'deliveries' ? { ...response.data, _kind: 'delivery' } : response.data) } catch { setDetail({ error: section === 'complaints' ? 'Unable to load complaint details.' : section === 'procurement' ? 'Unable to load procurement details.' : section === 'deliveries' ? 'Unable to load delivery details.' : 'Unable to load order details.' }) } }
  const exportAudit = async () => { try { const response = await api.get('/admin/audit-logs/export', { params: { search }, responseType: 'blob' }); const url = window.URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'medline-audit-log.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.URL.revokeObjectURL(url) } catch { setDetail({ error: 'Unable to export audit records.' }) } }
  const toggleSort = (key: string) => { if (section !== 'orders') return; if (sortBy === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(key); setSortDirection('asc') }; setPage(1) }
  if (detail) return detail._kind === 'complaint' ? <ComplaintDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} /> : detail._kind === 'procurement' ? <ProcurementDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} /> : detail._kind === 'delivery' ? <DeliveryDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} /> : <OrderDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} />
  if (section === 'ratings' && role === 'admin') return <RatingQueue locale={locale} />
  const action = (row: Row) => section === 'verification' ? <div className="row-actions"><button className="approve-button" aria-label={tr('approve', locale)} title={tr('approve', locale)} onClick={() => decidePartner(row.id, 'approve')}><FileCheck2 size={22} strokeWidth={2.5} /></button><button className="reject-button" aria-label={tr('reject', locale)} title={tr('reject', locale)} onClick={() => decidePartner(row.id, 'reject')}><FileX2 size={22} strokeWidth={2.5} /></button></div> : section === 'documents' && role === 'admin' && row.status.includes('review') ? <div className="row-actions"><button className="ghost-button" aria-label={tr('download', locale)} title={tr('download', locale)} onClick={() => void downloadPrivate(`/verification-documents/${row.id}/download`, `medline-document-${row.id}`)}><Eye size={22} strokeWidth={2.5} /></button><button className="approve-button" aria-label={tr('approve', locale)} title={tr('approve', locale)} onClick={() => decideDocument(row.id, 'approve')}><FileCheck2 size={22} strokeWidth={2.5} /></button><button className="reject-button" aria-label={tr('reject', locale)} title={tr('reject', locale)} onClick={() => decideDocument(row.id, 'reject')}><FileX2 size={22} strokeWidth={2.5} /></button></div> : section === 'users' && role === 'admin' ? <div className="row-actions"><button className={row.status === 'suspended' ? 'approve-button' : 'reject-button'} aria-label={row.status === 'suspended' ? tr('reactivate', locale) : tr('suspend', locale)} title={row.status === 'suspended' ? tr('reactivate', locale) : tr('suspend', locale)} onClick={() => updateUserStatus(row.id, row.status === 'suspended' ? 'active' : 'suspended')}>{row.status === 'suspended' ? <FileCheck2 size={22} strokeWidth={2.5} /> : <FileX2 size={22} strokeWidth={2.5} />}</button></div> : section === 'deliveries' && role === 'admin' && row.status === 'failed' ? <div className="row-actions"><button className="approve-button" aria-label={tr('reassign', locale)} title={tr('reassign', locale)} onClick={() => reassignDelivery(row.id)}><FileCheck2 size={22} strokeWidth={2.5} /></button></div> : section === 'orders' && role === 'pharmacy' && row.status.includes('pending') ? <div className="row-actions"><button className="approve-button" aria-label={tr('accept', locale)} title={tr('accept', locale)} onClick={() => decideOrder(row.id, 'accept')}><FileCheck2 size={22} strokeWidth={2.5} /></button><button className="reject-button" aria-label={tr('reject', locale)} title={tr('reject', locale)} onClick={() => decideOrder(row.id, 'reject')}><FileX2 size={22} strokeWidth={2.5} /></button></div> : section === 'procurement' && role === 'warehouse' && row.status.includes('pending') ? <div className="row-actions"><button className="approve-button" aria-label={tr('accept', locale)} title={tr('accept', locale)} onClick={() => decideProcurement(row.id, 'accept')}><FileCheck2 size={22} strokeWidth={2.5} /></button><button className="reject-button" aria-label={tr('reject', locale)} title={tr('reject', locale)} onClick={() => decideProcurement(row.id, 'reject')}><FileX2 size={22} strokeWidth={2.5} /></button></div> : section === 'subscriptions' && row.status.includes('review') ? <div className="row-actions"><button className="ghost-button" aria-label={tr('receipt', locale)} title={tr('receipt', locale)} onClick={() => void downloadPrivate(`/admin/payment-proofs/${String(row.raw?.payment_proof_id ?? row.id)}/download`, `medline-payment-proof-${row.id}`)}><Eye size={22} strokeWidth={2.5} /></button><button className="approve-button" aria-label={tr('approve', locale)} title={tr('approve', locale)} onClick={() => decidePayment(row.id, 'approve')}><FileCheck2 size={22} strokeWidth={2.5} /></button><button className="reject-button" aria-label={tr('reject', locale)} title={tr('reject', locale)} onClick={() => decidePayment(row.id, 'reject')}><FileX2 size={22} strokeWidth={2.5} /></button></div> : section === 'complaints' ? <div className="row-actions"><button className="ghost-button" aria-label={tr('view', locale)} title={tr('view', locale)} onClick={() => void openDetail(row.id)}><Eye size={22} strokeWidth={2.5} /></button>{(row.status === 'open' || row.status === 'in_review') && <button className="approve-button" aria-label={row.status === 'open' ? tr('review', locale) : tr('resolve', locale)} title={row.status === 'open' ? tr('review', locale) : tr('resolve', locale)} onClick={() => updateComplaint(row.id, row.status === 'open' ? 'in_review' : 'resolved')}><FileCheck2 size={22} strokeWidth={2.5} /></button>}</div> : section === 'audit' ? <button className="ghost-button" aria-label={tr('exportCsv', locale)} title={tr('exportCsv', locale)} onClick={() => void exportAudit()}><Eye size={22} strokeWidth={2.5} /></button> : <button className="ghost-button" aria-label={tr('view', locale)} title={tr('view', locale)} onClick={() => void openDetail(row.id)}><Eye size={22} strokeWidth={2.5} /></button>
  const richTable = section === 'procurement' || section === 'inventory' || section === 'orders'
  const richHeaders = section === 'procurement' ? ['Procurement', 'Pharmacy', 'Warehouse', 'Value', 'Status', 'Created', 'Action'] : section === 'inventory' ? ['Medicine', 'Owner', 'Available', 'Reserved', 'Unit price', 'Stock health', 'Action'] : ['Order', 'Customer', 'Pharmacy', 'Driver', 'Medicines', 'Destination', 'Total', 'Status', 'Created', 'Action']
  const orderHeaders = [['Order', 'public_id'], ['Customer', 'customer_name'], ['Pharmacy', 'pharmacy_name'], ['Driver', 'driver_name'], ['Medicines', 'medicine_names'], ['Destination', 'delivery_address_snapshot'], ['Total', 'total'], ['Status', 'status'], ['Created', 'created_at'], ['Action', '']] as const
  const displayedRows = section === 'orders' ? [...rows].sort((left, right) => { if (!sortBy || sortBy === 'created_at' || sortBy === 'public_id' || sortBy === 'status' || sortBy === 'total' || sortBy === 'delivery_address_snapshot') return 0; const comparison = String(left.raw?.[sortBy] ?? '').localeCompare(String(right.raw?.[sortBy] ?? ''), undefined, { numeric: true, sensitivity: 'base' }); return sortDirection === 'asc' ? comparison : -comparison }) : rows
  const richCells = (row: Row) => section === 'procurement' ? <><strong>{row.primary}</strong><span>{String(row.raw?.pharmacy_name ?? 'Pharmacy not recorded')}</span><span>{String(row.raw?.warehouse_name ?? 'Warehouse not recorded')}</span><span className="money-cell">SYP {Number(row.raw?.total ?? 0).toLocaleString()}</span><span className="status-pill">{row.status}</span><span>{formatMedlineDate(row.raw?.created_at)}</span>{action(row)}</> : section === 'inventory' ? <><strong>{row.primary}</strong><span>{String(row.raw?.owner_name ?? row.raw?.owner_type ?? 'Owner not recorded')}</span><span>{String(Number(row.raw?.quantity ?? 0) - Number(row.raw?.reserved_quantity ?? 0))}</span><span>{String(row.raw?.reserved_quantity ?? 0)}</span><span className="money-cell">SYP {Number(row.raw?.unit_price ?? 0).toLocaleString()}</span><span className={`stock-health ${Number(row.raw?.quantity ?? 0) - Number(row.raw?.reserved_quantity ?? 0) <= Number(row.raw?.low_stock_threshold ?? 0) ? 'low' : 'healthy'}`}>{Number(row.raw?.quantity ?? 0) - Number(row.raw?.reserved_quantity ?? 0) <= Number(row.raw?.low_stock_threshold ?? 0) ? 'Low stock' : 'Healthy'}</span>{action(row)}</> : <><strong>{row.primary}</strong><span>{String(row.raw?.customer_name ?? 'Customer not recorded')}</span><span>{String(row.raw?.pharmacy_name ?? 'Pharmacy not recorded')}</span><span>{String(row.raw?.driver_name ?? 'Unassigned')}</span><span>{String(row.raw?.medicine_names ?? 'No medicines listed')}</span><span>{String(row.raw?.delivery_address_snapshot ?? 'Destination not recorded')}</span><span className="money-cell">SYP {Number(row.raw?.total ?? 0).toLocaleString()}</span><span className={`order-status status-${row.status.replaceAll('_', '-')}`}><i />{row.status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}</span><span>{formatMedlineDate(row.raw?.created_at)}</span>{action(row)}</>
  const reportTotals = (complaintReport?.totals ?? {}) as Record<string, unknown>
  const canOpenDetail = ['orders', 'deliveries', 'complaints', 'procurement'].includes(section)
  return <section className="content">{section === 'orders' && role === 'patient' && <PatientOrderCreatePanel locale={locale} />}<div className="welcome-row"><div><p className="eyebrow">MEDLINE OPERATIONS</p><h1>{tr(section, locale)}</h1><p className="muted">{tr('workflowGuidance', locale)}</p></div>{section === 'inventory' && role !== 'admin' && <form className="inline-form" onSubmit={updateInventory}><input name="medicine_id" type="number" placeholder={tr('medicineId', locale)} required /><input name="quantity" type="number" placeholder={tr('quantity', locale)} min="0" required /><input name="unit_price" type="number" placeholder={tr('unitPrice', locale)} min="0" step="0.01" /><input name="low_stock_threshold" type="number" placeholder={tr('lowStock', locale)} min="0" defaultValue="5" /><button className="primary-button" type="submit"><Package size={17} /> {tr('saveStock', locale)}</button></form>}</div>{section === 'complaints' && role === 'admin' && complaintReport && <section className="metric-grid"><Metric label="Open complaints" value={String(reportTotals.open ?? 0)} change="Live" icon={<MessageSquare />} tone="orange" /><Metric label="In review" value={String(reportTotals.in_review ?? 0)} change="Live" icon={<History />} tone="violet" /><Metric label="Resolved complaints" value={String(reportTotals.resolved ?? 0)} change="Live" icon={<ShieldCheck />} tone="green" /></section>}<section className={`panel table-panel ${richTable ? 'rich-operations-panel' : ''}`}><div className="panel-heading"><div><p className="eyebrow">{tr(['orders', 'deliveries', 'verification', 'procurement'].includes(section) ? 'queue' : 'directory', locale)}</p><h2>{tr(section, locale)} {tr('overview', locale)}</h2></div><span className="live-status" role="status"><i aria-hidden="true" /> {tr('liveData', locale)}</span></div><div className="table-controls"><div className="search-box"><Search size={19} aria-hidden="true" /><input aria-label={tr('search', locale) + ' ' + tr(section, locale)} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('search', locale) + ' ' + tr(section, locale) + '...'} /></div>{section === 'orders' && <label className="status-filter-label"><span>Filter status</span><select aria-label="Filter orders by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="pending_pharmacy_review">Pending pharmacy review</option><option value="prescription_review">Prescription review</option><option value="accepted">Accepted</option><option value="in_transit">In transit</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>}</div><div className="operations-table" aria-busy={loading}><div className="table-row table-head">{richTable ? section === 'orders' ? orderHeaders.map(([header, key]) => key ? <button type="button" className={`sortable-header ${sortBy === key ? 'active' : ''}`} onClick={() => toggleSort(key)} key={header} title={`Sort by ${header}`}>{header}{sortBy === key ? <span aria-hidden="true">{sortDirection === 'asc' ? ' ?' : ' ?'}</span> : null}</button> : <span key={header}>{header}</span>) : richHeaders.map((header) => <span key={header}>{header}</span>) : <><span>{tr('record', locale)}</span><span>{tr('details', locale)}</span><span>{tr('status', locale)}</span><span>{tr('action', locale)}</span></>}</div>{loading ? <div className="state" role="status" aria-live="polite">{tr('loadingRecords', locale)}</div> : rows.length === 0 ? <div className="state" role="status">{tr('noRecordsYet', locale)}</div> : displayedRows.map((row) => <div className={`table-row ${richTable ? 'rich-table-row' : ''} ${canOpenDetail ? 'clickable-table-row' : ''}`} key={row.id} onClick={() => { if (canOpenDetail) void openDetail(row.id) }} onKeyDown={(event) => { if (canOpenDetail && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); void openDetail(row.id) } }} tabIndex={canOpenDetail ? 0 : undefined}>{richTable ? richCells(row) : <><strong>{row.primary}</strong><span>{row.secondary}</span><span className="status-pill">{row.status}</span>{action(row)}</>}</div>)}</div><TablePagination page={page} lastPage={lastPage} onPageChange={setPage} /></section></section>
}

function Metric({ label, value, change, icon, tone }: { label: string; value: string; change: string; icon: ReactNode; tone: string }) { const key = label === 'Active orders' || label === 'Total orders' ? 'orders' : label === 'Pending verification' ? 'pending_partners' : label === 'In delivery' || label === 'Active deliveries' ? 'active_deliveries' : label === 'Registered partners' ? 'partners' : ''; const liveValue = key ? String(dashboardMetrics[key] ?? 0) : value; const currentLocale = document.documentElement.lang === 'ar' ? 'ar' : 'en'; const localizedLabel = label === 'Active orders' ? tr('activeOrders', currentLocale) : label === 'Pending verification' ? tr('pendingVerification', currentLocale) : label === 'In delivery' ? tr('inDelivery', currentLocale) : label === 'Registered partners' ? tr('registeredPartners', currentLocale) : label; return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-copy"><span>{localizedLabel}</span><strong>{liveValue}</strong><small className="positive"><span aria-hidden="true">•</span> {change} <em>{change === 'Live' ? 'from API' : 'vs last month'}</em></small></div></div> }
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
