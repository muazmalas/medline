import { Component, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import axios from 'axios'
import { ArrowDown, ArrowUp, ArrowUpDown, Bell, ChevronDown, ChevronRight, ClipboardList, Clock3, CreditCard, Download, Eye, FileCheck2, FileX2, History, Languages, LayoutDashboard, LockKeyhole, LogOut, Mail, MapPin, Menu, MessageSquare, Navigation, Package, Pencil, Phone, Plus, Power, Search, Settings, ShieldCheck, ShoppingCart, Trash2, Truck, Upload, UserRound, Users, X } from 'lucide-react'
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

export const DELIVERY_FEE_PER_KM_SYP = 100
export const DELIVERY_VEHICLE_TYPES = ['bicycle', 'motorcycle', 'car', 'van'] as const
type DeliveryVehicleType = typeof DELIVERY_VEHICLE_TYPES[number]
type RoadDeliveryEstimate = { distance_km: number; rate_per_km: number; fee: number; route_geometry: unknown; route_duration_seconds: number; route_provider: string }
const deliveryVehicleLabel = (value: unknown) => String(value ?? 'motorcycle').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

function roadRoutePoints(geometryValue: unknown): Array<[number, number]> {
  let geometry = geometryValue
  if (typeof geometry === 'string') {
    try { geometry = JSON.parse(geometry) } catch { return [] }
  }
  const coordinates = geometry && typeof geometry === 'object' && 'coordinates' in geometry ? (geometry as { coordinates?: unknown }).coordinates : null
  if (!Array.isArray(coordinates)) return []
  return coordinates.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null
    const longitude = Number(coordinate[0]); const latitude = Number(coordinate[1])
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] as [number, number] : null
  }).filter((coordinate): coordinate is [number, number] => coordinate !== null)
}

function useRoadDeliveryEstimate(fromLatitude: unknown, fromLongitude: unknown, toLatitude: unknown, toLongitude: unknown, vehicleType: DeliveryVehicleType) {
  const [estimate, setEstimate] = useState<RoadDeliveryEstimate | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const rawCoordinates = [fromLatitude, fromLongitude, toLatitude, toLongitude]
    if (rawCoordinates.some((coordinate) => coordinate === null || coordinate === undefined || coordinate === '')) { setEstimate(null); setLoading(false); setError(''); return }
    const coordinates = rawCoordinates.map(Number)
    if (!coordinates.every(Number.isFinite)) { setEstimate(null); setLoading(false); setError(''); return }
    const controller = new AbortController()
    setEstimate(null); setLoading(true); setError('')
    api.get('/delivery-pricing/estimate', { params: { from_latitude: coordinates[0], from_longitude: coordinates[1], to_latitude: coordinates[2], to_longitude: coordinates[3], vehicle_type: vehicleType }, signal: controller.signal })
      .then((response) => setEstimate(response.data as RoadDeliveryEstimate))
      .catch((requestError) => { if (!axios.isCancel(requestError)) setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to calculate the road route.' : 'Unable to calculate the road route.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [fromLatitude, fromLongitude, toLatitude, toLongitude, vehicleType])
  return { estimate, loading, error }
}

type DeliveryPreference = 'asap' | 'scheduled'

function minimumDeliveryDateTime(): string {
  const value = new Date(Date.now() + 30 * 60 * 1000)
  value.setMinutes(Math.ceil(value.getMinutes() / 15) * 15, 0, 0)
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function scheduledDeliveryPayload(preference: DeliveryPreference, localDateTime: string): string | null {
  if (preference !== 'scheduled' || !localDateTime) return null
  const value = new Date(localDateTime)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

function DeliverySchedulePicker({ idPrefix, preference, scheduledAt, onPreferenceChange, onScheduledAtChange }: { idPrefix: string; preference: DeliveryPreference; scheduledAt: string; onPreferenceChange: (value: DeliveryPreference) => void; onScheduledAtChange: (value: string) => void }) {
  return <fieldset className="delivery-schedule-picker"><legend>When should this be delivered?</legend><p>Choose the timing that works for this delivery.</p><div className="delivery-schedule-options"><label className={preference === 'asap' ? 'selected' : ''}><input type="radio" name={`${idPrefix}-delivery-preference`} value="asap" checked={preference === 'asap'} onChange={() => onPreferenceChange('asap')} /><span className="delivery-schedule-option-icon"><Truck size={19} aria-hidden="true" /></span><span><strong>As soon as possible</strong><small>Make the delivery available to drivers after approval.</small></span></label><label className={preference === 'scheduled' ? 'selected' : ''}><input type="radio" name={`${idPrefix}-delivery-preference`} value="scheduled" checked={preference === 'scheduled'} onChange={() => onPreferenceChange('scheduled')} /><span className="delivery-schedule-option-icon"><Clock3 size={19} aria-hidden="true" /></span><span><strong>Schedule date &amp; time</strong><small>Deliver at a specific future date and time.</small></span></label></div>{preference === 'scheduled' && <label className="delivery-schedule-datetime" htmlFor={`${idPrefix}-scheduled-at`}><span>Delivery date and time</span><input id={`${idPrefix}-scheduled-at`} type="datetime-local" min={minimumDeliveryDateTime()} value={scheduledAt} onChange={(event) => onScheduledAtChange(event.target.value)} required /><small>Shown in your current local time.</small></label>}</fieldset>
}

function DeliveryVehiclePicker({ idPrefix, value, rates, onChange }: { idPrefix: string; value: DeliveryVehicleType; rates: Record<string, number>; onChange: (value: DeliveryVehicleType) => void }) {
  return <fieldset className="delivery-vehicle-picker"><legend>Delivery vehicle</legend><p>Select the vehicle class for this order. Its current rate is locked when you submit.</p><div className="delivery-vehicle-options">{DELIVERY_VEHICLE_TYPES.map((type) => <label className={value === type ? 'selected' : ''} key={type}><input type="radio" name={`${idPrefix}-delivery-vehicle`} value={type} checked={value === type} onChange={() => onChange(type)} /><Truck size={18} aria-hidden="true" /><span><strong>{deliveryVehicleLabel(type)}</strong><small>SYP {Number(rates[type] ?? 0).toLocaleString()} / km</small></span></label>)}</div></fieldset>
}

export function calculateDeliveryEstimate(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number, ratePerKm = DELIVERY_FEE_PER_KM_SYP, roadDistanceKm?: number): { distanceKm: number; feeSyp: number } | null {
  const coordinates = [fromLatitude, fromLongitude, toLatitude, toLongitude]
  if (coordinates.some((coordinate) => !Number.isFinite(coordinate)) || Math.abs(fromLatitude) > 90 || Math.abs(toLatitude) > 90 || Math.abs(fromLongitude) > 180 || Math.abs(toLongitude) > 180 || !Number.isFinite(ratePerKm) || ratePerKm < 0 || roadDistanceKm === undefined || !Number.isFinite(roadDistanceKm) || roadDistanceKm < 0) return null
  const distanceKm = Math.round(roadDistanceKm * 100) / 100
  return { distanceKm, feeSyp: Math.round(distanceKm * ratePerKm) }
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
  const [currentUser, setCurrentUser] = useState<Record<string, unknown>>(() => { try { return JSON.parse(localStorage.getItem('medline_user') ?? '{}') } catch { return {} } })
  const [role, setRole] = useState(() => String(currentUser.role ?? 'admin'))
  const [sessionReady, setSessionReady] = useState(!localStorage.getItem('medline_token'))
  const [locale, setLocale] = useState(() => localStorage.getItem('medline_locale_explicit') === 'true' ? (localStorage.getItem('medline_locale') ?? 'en') : 'en')
  const [section, setSection] = useState(() => sectionFromPath(window.location.pathname))
  const [navigationRevision, setNavigationRevision] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const requiresSubscription = role === 'pharmacy' || role === 'warehouse'
  const [subscriptionActive, setSubscriptionActive] = useState<boolean | null>(role === 'admin' || !requiresSubscription ? true : null)
  useEffect(() => {
    const handleUnauthorized = () => { localStorage.removeItem('medline_token'); localStorage.removeItem('medline_refresh_token'); localStorage.removeItem('medline_user'); setAuthenticated(false) }
    window.addEventListener('medline:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('medline:unauthorized', handleUnauthorized)
  }, [])
  useEffect(() => { if (!authenticated) { setSessionReady(true); return } setSessionReady(false); api.get('/auth/me').then((response) => { const user = response.data.user ?? {}; localStorage.setItem('medline_user', JSON.stringify(user)); setCurrentUser(user); setRole(user.role ?? 'admin') }).catch(() => { localStorage.removeItem('medline_token'); localStorage.removeItem('medline_user'); setAuthenticated(false) }).finally(() => setSessionReady(true)) }, [authenticated])
  useEffect(() => { document.documentElement.lang = locale; document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'; localStorage.setItem('medline_locale', locale); localStorage.setItem('medline_locale_explicit', 'true') }, [locale])
  useEffect(() => { if (!authenticated || role === 'admin' || !requiresSubscription) { setSubscriptionActive(true); return } if (!sessionReady) return; let cancelled = false; setSubscriptionActive(null); api.get('/subscription').then((response) => { if (!cancelled) setSubscriptionActive(Boolean(response.data.access_active ?? ['active', 'expiring_soon', 'grace'].includes(String(response.data.active_subscription?.status ?? response.data.subscription?.status ?? '')))) }).catch(() => { if (!cancelled) setSubscriptionActive(false) }); return () => { cancelled = true } }, [authenticated, role, requiresSubscription, sessionReady])
  useEffect(() => { const handleRoute = () => { setSection(sectionFromPath(window.location.pathname)); setNavigationRevision((current) => current + 1) }; window.addEventListener('popstate', handleRoute); return () => window.removeEventListener('popstate', handleRoute) }, [])
  const sectionAllowed = roleCanAccessSection(role, section)
  useEffect(() => {
    if (!authenticated || !sessionReady || sectionAllowed) return
    const fallback = defaultSectionForRole(role)
    window.history.replaceState({}, '', pathForSection(fallback))
    setSection(fallback)
    setNavigationRevision((current) => current + 1)
  }, [authenticated, role, section, sectionAllowed, sessionReady])
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
  const operationalAccess = role === 'admin' || !requiresSubscription || subscriptionActive === true
  const authActionRequested = new URLSearchParams(window.location.search).get('recovery') === 'password'
  useEffect(() => { if (authenticated && requiresSubscription && subscriptionActive === false && section !== 'subscriptions') { window.history.replaceState({}, '', '/subscriptions'); setSection('subscriptions') } }, [authenticated, requiresSubscription, subscriptionActive, section])
  if (!sessionReady) return <div className="session-loading">Restoring your secure MedLine session...</div>
  if ((authenticated && requiresSubscription && subscriptionActive === null) || (authenticated && !sectionAllowed)) return <div className="session-loading">Opening your authorized MedLine workspace...</div>
  if (!authenticated || authActionRequested) return section === 'register' && !authActionRequested ? <RegistrationPage onBack={() => { window.history.pushState({}, '', '/'); setSection('dashboard') }} onAuthenticated={(user) => { localStorage.setItem('medline_user', JSON.stringify(user)); setCurrentUser(user); setRole(String(user.role ?? 'patient')); setAuthenticated(true) }} /> : <LoginPage locale={locale} onLocaleChange={setLocale} onAuthenticated={(user) => { localStorage.setItem('medline_user', JSON.stringify(user)); setCurrentUser(user); setRole(String(user.role ?? 'admin')); setAuthenticated(true) }} />
  const logout = async () => { try { await api.post('/auth/logout', {}) } catch { /* Continue local cleanup if the API is unavailable. */ } finally { localStorage.removeItem('medline_token'); localStorage.removeItem('medline_refresh_token'); localStorage.removeItem('medline_user'); setCurrentUser({}); setAuthenticated(false) } }
  const nav = (requestedDestination: string) => {
    const [requestedSection, requestedQuery = ''] = requestedDestination.split('?', 2)
    let value = requestedSection
    if (!roleCanAccessSection(role, value)) value = defaultSectionForRole(role)
    if (requiresSubscription && subscriptionActive === false && value !== 'subscriptions') value = 'subscriptions'
    const query = value === requestedSection && requestedQuery ? `?${requestedQuery}` : ''
    window.history.pushState({}, '', `${pathForSection(value)}${query}`)
    setSection(value)
    setNavigationRevision((current) => current + 1)
    setSidebarOpen(false)
  }
  const finishOrderCreation = (order: Record<string, unknown>) => {
    const publicId = String(order.public_id ?? `Order ${String(order.id ?? '')}`).trim()
    sessionStorage.setItem('medline_order_created', JSON.stringify({ id: Number(order.id ?? 0), publicId }))
    window.history.replaceState({}, '', pathForSection('orders'))
    setSection('orders')
    setNavigationRevision((current) => current + 1)
    setSidebarOpen(false)
  }
  const finishProcurementCreation = (procurement: Record<string, unknown>) => {
    const publicId = String(procurement.public_id ?? `Procurement ${String(procurement.id ?? '')}`).trim()
    sessionStorage.setItem('medline_procurement_created', JSON.stringify({ id: Number(procurement.id ?? 0), publicId }))
    window.history.replaceState({}, '', pathForSection('procurement'))
    setSection('procurement')
    setNavigationRevision((current) => current + 1)
    setSidebarOpen(false)
  }
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">M</div><div><strong>MedLine</strong><span>{tr('healthcareLogistics', locale)}</span></div></div>
      <nav>
        <p className="nav-label">{tr('workspace', locale)}</p>
        {operationalAccess && <><NavItem active={section === 'dashboard'} onClick={() => nav('dashboard')} icon={<LayoutDashboard size={18} />} label={tr('dashboard', locale)} />
        {['admin', 'patient', 'pharmacy'].includes(role) && <NavItem active={section === 'orders' || section === 'new-order'} onClick={() => nav('orders')} icon={<ClipboardList size={18} />} label={tr('orders', locale)} />}
        {(role === 'admin' || role === 'pharmacy' || role === 'warehouse') && <><NavItem active={section === 'inventory' || section === 'medicine-create' || section === 'inventory/categories'} onClick={() => nav('inventory')} icon={<Package size={18} />} label={tr('inventory', locale)} />
        <NavItem active={section === 'procurement'} onClick={() => nav('procurement')} icon={<Package size={18} />} label={tr('procurement', locale)} /></>}
        {(role === 'admin' || role === 'patient' || role === 'driver' || role === 'pharmacy' || role === 'warehouse') && <NavItem active={section === 'deliveries'} onClick={() => nav('deliveries')} icon={<Truck size={18} />} label={tr('deliveries', locale)} />}</>}
        {(requiresSubscription || role === 'admin') && <NavItem active={section === 'subscriptions'} onClick={() => nav('subscriptions')} icon={<CreditCard size={18} />} label={role === 'admin' ? tr('subscriptionReviews', locale) : tr('subscriptions', locale)} />}
        {role === 'admin' && <><NavItem active={section === 'complaints'} onClick={() => nav('complaints')} icon={<MessageSquare size={18} />} label={tr('complaints', locale)} /><NavItem active={section === 'ratings'} onClick={() => nav('ratings')} icon={<History size={18} />} label={tr('ratings', locale)} /><NavItem active={section === 'audit'} onClick={() => nav('audit')} icon={<History size={18} />} label={tr('audit', locale)} /></>}
        {role === 'admin' && <><p className="nav-label">{tr('management', locale)}</p>
        <NavItem active={section === 'pharmacies'} onClick={() => nav('pharmacies')} icon={<Users size={18} />} label={tr('pharmacies', locale)} />
        <NavItem active={section === 'warehouses'} onClick={() => nav('warehouses')} icon={<Package size={18} />} label={tr('warehouses', locale)} />
        <NavItem active={section === 'users'} onClick={() => nav('users')} icon={<Users size={18} />} label={tr('users', locale)} />
        </>}
        <NavItem active={section === 'settings'} onClick={() => nav('settings')} icon={<Settings size={18} />} label={tr('settings', locale)} />
      </nav>
      <button className="sidebar-footer" onClick={logout}><div className="avatar">{role.slice(0, 2).toUpperCase()}</div><div><strong>MedLine {tr(`role_${role}`, locale)}</strong><span>{tr('signOut', locale)}</span></div><LogOut size={16} /></button>
    </aside>
    {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
    <main className="main-content">
      {(role === 'pharmacy' || role === 'warehouse') && <PartnerAccessGuard role={role} onOpen={() => nav('subscriptions')} />}
      <header className="topbar"><button className="icon-button menu-button" aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={22} /></button><div className="breadcrumb"><span>{tr('workspace', locale)}</span><ChevronRight size={15} /><strong>{section === 'medicine-detail' ? 'Medicine details' : section === 'medicine-create' ? 'Add medicine' : section === 'new-order' ? 'Create order' : section === 'new-procurement' ? 'Replenish inventory' : tr(section, locale) || title(section)}</strong></div><div className="top-actions"><WebNotifications locale={locale} onOpenAll={() => nav('notifications')} /><AccountMenu user={currentUser} locale={locale} onProfile={() => nav('profile')} onLogout={() => void logout()} /></div></header>
      {section === 'new-order' && role === 'patient' ? <NewOrderPage locale={locale} onBack={() => nav('orders')} onCreated={finishOrderCreation} /> : section === 'new-procurement' && role === 'pharmacy' ? <ProcurementCreatePanel section={section} onBack={() => nav('procurement')} onCreated={finishProcurementCreation} /> : section === 'medicine-create' && role === 'admin' ? <MedicineCreateAdminPage locale={locale} onBack={() => nav('inventory')} /> : section === 'medicine-detail' ? <MedicineDetailPage medicineId={Number(window.location.pathname.split('/').pop())} onBack={() => { window.history.back(); window.setTimeout(() => { if (sectionFromPath(window.location.pathname) === 'medicine-detail') nav('dashboard') }, 50) }} locale={locale} /> : section === 'profile' ? <ProfilePage user={currentUser} locale={locale} onUpdated={(user) => { setCurrentUser(user); localStorage.setItem('medline_user', JSON.stringify(user)) }} /> : section === 'dashboard' ? <><RoleAwareDashboard role={role} locale={locale} onNavigate={nav} /><DashboardAlerts role={role} locale={locale} /><NotificationHealthPanel role={role} locale={locale} /></> : section === 'notifications' ? <NotificationsPage locale={locale} /> : section === 'subscriptions' && (role === 'pharmacy' || role === 'warehouse') ? <PartnerSubscriptionPage locale={locale} /> : section === 'subscriptions' && role === 'admin' ? <AdminReviewHub locale={locale} /> : section === 'settings' ? <>{role === 'admin' ? <><SettingsPage role="patient" locale={locale} onLocaleChange={setLocale} /><AdminDeliveryPricingPanel locale={locale} /><AdminTwoFactorPanel locale={locale} /></> : <SettingsPage role={role} locale={locale} onLocaleChange={setLocale} />}{role === 'pharmacy' && <PharmacyWorkingHoursPanel />}<ConsentSettings /></> : section === 'inventory/categories' && role === 'admin' ? <><InventoryBackLink /><MedicineCategoryAdmin locale={locale} /></> : section === 'inventory' && role === 'admin' ? <><InventoryCategoryLink /><MedicineAdminPage locale={locale} onCreate={() => nav('medicine-create')} /></> : (section === 'pharmacies' || section === 'warehouses') && role === 'admin' ? <PartnerManagementPanel section={section} /> : section === 'users' && role === 'admin' ? <UserRolePanelWithCompany section={section} /> : <OperationsPage key={`${section}-${navigationRevision}`} section={section} role={role} locale={locale} />}
    </main>
  </div>
}

function NavItem({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; badge?: string }) { return <button type="button" className={active ? 'active' : ''} onClick={onClick} aria-current={active ? 'page' : undefined}>{icon}<span>{label}</span>{badge && <b>{badge}</b>}</button> }
function title(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }
function pathForSection(section: string): string { return section === 'dashboard' ? '/' : section === 'new-order' ? '/orders/new' : section === 'new-procurement' ? '/procurement/new' : section === 'medicine-create' ? '/inventory/medicines/new' : `/${section}` }
const roleSections: Record<string, ReadonlySet<string>> = {
  admin: new Set(['dashboard', 'orders', 'inventory', 'inventory/categories', 'medicine-create', 'medicine-detail', 'procurement', 'deliveries', 'subscriptions', 'complaints', 'ratings', 'audit', 'pharmacies', 'warehouses', 'users', 'settings', 'notifications', 'profile']),
  patient: new Set(['dashboard', 'orders', 'new-order', 'medicine-detail', 'deliveries', 'settings', 'notifications', 'profile']),
  pharmacy: new Set(['dashboard', 'orders', 'inventory', 'medicine-detail', 'procurement', 'new-procurement', 'deliveries', 'subscriptions', 'settings', 'notifications', 'profile']),
  warehouse: new Set(['dashboard', 'inventory', 'medicine-detail', 'procurement', 'deliveries', 'subscriptions', 'settings', 'notifications', 'profile']),
  driver: new Set(['dashboard', 'medicine-detail', 'deliveries', 'settings', 'notifications', 'profile']),
  support: new Set(['dashboard', 'complaints', 'settings', 'notifications', 'profile']),
}
export function roleCanAccessSection(role: string, section: string): boolean { return Boolean(roleSections[role]?.has(section)) }
function defaultSectionForRole(_role: string): string { return 'dashboard' }
function sectionFromPath(pathname: string): string { const path = pathname.replace(/^\/+|\/+$/g, ''); if (path === 'orders/new') return 'new-order'; if (path === 'procurement/new') return 'new-procurement'; if (path === 'inventory/medicines/new') return 'medicine-create'; if (path === 'verification') return 'subscriptions'; if (/^medicines\/\d+$/.test(path)) return 'medicine-detail'; return path || 'dashboard' }
export function openMedicineDetail(id: number) {
  if (!Number.isFinite(id) || id <= 0) return
  const medicineWindow = window.open(`/medicines/${id}`, '_blank', 'noopener,noreferrer')
  if (medicineWindow) medicineWindow.opener = null
}

export function AccountMenu({ user, onProfile, onLogout, locale = 'en' }: { user: Record<string, unknown>; onProfile: () => void; onLogout: () => void; locale?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const firstItem = useRef<HTMLButtonElement>(null)
  const name = String(user.name ?? 'MedLine user')
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'MU'
  useEffect(() => {
    const closeOutside = (event: globalThis.MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const handleMenuKeys = (event: KeyboardEvent) => {
      const menu = root.current?.querySelector<HTMLElement>('[role="menu"]')
      if (!menu) return
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); root.current?.querySelector<HTMLButtonElement>('.account-menu-trigger')?.focus(); return }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : (current <= 0 ? items.length : current) - 1
      items[next]?.focus()
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', handleMenuKeys)
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', handleMenuKeys) }
  }, [])
  useEffect(() => { if (open) firstItem.current?.focus() }, [open])
  return <div className="account-menu" ref={root}><button type="button" className="account-menu-trigger" aria-label={tr('openUserMenu', locale)} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span className="top-avatar">{initials}</span><ChevronDown size={15} aria-hidden="true" /></button>{open && <div className="account-menu-popover" role="menu"><div className="account-menu-identity"><span className="top-avatar">{initials}</span><div><strong>{name}</strong><small dir="ltr">{String(user.email ?? '')}</small></div></div><button ref={firstItem} type="button" role="menuitem" onClick={() => { setOpen(false); onProfile() }}><UserRound size={17} aria-hidden="true" /> {tr('profile', locale)}</button><button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout() }}><LogOut size={17} aria-hidden="true" /> {tr('signOut', locale)}</button></div>}</div>
}

export function ProfilePage({ user, onUpdated, locale = 'en' }: { user: Record<string, unknown>; onUpdated: (user: Record<string, unknown>) => void; locale?: string }) {
  const [profile, setProfile] = useState({ name: String(user.name ?? ''), phone: String(user.phone ?? '') })
  const [password, setPassword] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [profileMessage, setProfileMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const text = (key: string) => tr(key, locale)
  useEffect(() => setProfile({ name: String(user.name ?? ''), phone: String(user.phone ?? '') }), [user.name, user.phone])
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setProfileMessage('')
    try {
      const response = await api.patch('/profile', profile, mutationConfig('profile', 'self', 'update'))
      onUpdated(response.data.user ?? { ...user, ...profile })
      setProfileMessage(text('profileUpdated'))
    } catch {
      setProfileMessage(text('profileUpdateFailed'))
    } finally { setSaving(false) }
  }
  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setPasswordMessage('')
    try {
      await api.post('/profile/password', password, mutationConfig('profile-password', 'self', uniqueMutationId('change')))
      setPasswordMessage(text('passwordChanged'))
      setPassword({ current_password: '', password: '', password_confirmation: '' })
    } catch {
      setPasswordMessage(text('passwordChangeFailed'))
    } finally { setSaving(false) }
  }
  return <section className="content profile-page" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <div className="welcome-row"><div><p className="eyebrow">{text('account')}</p><h1>{text('yourProfile')}</h1><p className="muted">{text('profileDescription')}</p></div></div>
    <div className="profile-grid">
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">{text('personalDetails')}</p><h2>{text('profileInformation')}</h2></div><UserRound size={22} aria-hidden="true" /></div>
        <form className="profile-form" onSubmit={saveProfile}>
          <div className="profile-field"><label htmlFor="profile-name">{text('fullName')}</label><input id="profile-name" dir="auto" autoComplete="name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} required minLength={2} /></div>
          <div className="profile-field"><label htmlFor="profile-email">{text('emailAddress')}</label><input id="profile-email" dir="ltr" type="email" autoComplete="email" value={String(user.email ?? '')} readOnly aria-readonly="true" /></div>
          <div className="profile-field"><label htmlFor="profile-phone">{text('phoneNumber')}</label><input id="profile-phone" dir="ltr" type="tel" autoComplete="tel" value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} placeholder="+963..." /></div>
          <button className="primary-button" disabled={saving}>{saving ? text('savingProfile') : text('saveProfile')}</button>
          {profileMessage && <div className="form-message" role="status">{profileMessage}</div>}
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">{text('security')}</p><h2>{text('changePassword')}</h2></div><LockKeyhole size={22} aria-hidden="true" /></div>
        <form className="profile-form" onSubmit={changePassword}>
          <div className="profile-field"><label htmlFor="current-password">{text('currentPassword')}</label><input id="current-password" type="password" autoComplete="current-password" value={password.current_password} onChange={(event) => setPassword((current) => ({ ...current, current_password: event.target.value }))} required /></div>
          <div className="profile-field"><label htmlFor="new-password">{text('newPassword')}</label><input id="new-password" type="password" autoComplete="new-password" value={password.password} onChange={(event) => setPassword((current) => ({ ...current, password: event.target.value }))} required minLength={8} /><small>{text('passwordHint')}</small></div>
          <div className="profile-field"><label htmlFor="confirm-new-password">{text('confirmNewPassword')}</label><input id="confirm-new-password" type="password" autoComplete="new-password" value={password.password_confirmation} onChange={(event) => setPassword((current) => ({ ...current, password_confirmation: event.target.value }))} required minLength={8} /></div>
          <button className="primary-button" disabled={saving || password.password !== password.password_confirmation}>{saving ? text('changingPassword') : text('changePassword')}</button>
          {passwordMessage && <div className="form-message" role="status">{passwordMessage}</div>}
        </form>
      </section>
    </div>
  </section>
}

function TablePagination({ page, lastPage, onPageChange }: { page: number; lastPage: number; onPageChange: (page: number) => void }) {
  if (lastPage < 1) return null
  return <nav className="table-pagination" aria-label="Table pagination"><button type="button" className="ghost-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button><span>Page <strong>{page}</strong> of <strong>{lastPage}</strong></span><button type="button" className="ghost-button" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>Next</button></nav>
}

type TableSortDirection = 'asc' | 'desc'

function SortableTableHeader({ label, column, sortBy, sortDirection, onSort, className }: { label: string; column?: string; sortBy: string; sortDirection: TableSortDirection; onSort: (column: string) => void; className?: string }) {
  const active = Boolean(column) && sortBy === column
  return <th className={className} scope="col" aria-sort={column ? (active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}>{column ? <button type="button" className={`orders-sort-button ${active ? 'active' : ''}`} onClick={() => onSort(column)} title={`Sort by ${label}`}><span>{label}</span>{active ? (sortDirection === 'asc' ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />) : <ArrowUpDown aria-hidden="true" />}</button> : label}</th>
}

function ManagementStatus({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll('_', '-')
  const label = status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  return <span className={`order-status status-${normalized}`}><i aria-hidden="true" />{label}</span>
}

function ManagementTableFooter({ label, page, lastPage, perPage, onPageChange, onPerPageChange }: { label: string; page: number; lastPage: number; perPage: number; onPageChange: (page: number) => void; onPerPageChange: (size: number) => void }) {
  return <div className="orders-table-footer"><label className="orders-page-size"><span>Rows per page</span><select aria-label={`Rows per page for ${label}`} value={perPage} onChange={(event) => onPerPageChange(Number(event.target.value))}>{[5, 10, 25, 50].map((size) => <option value={size} key={size}>{size}</option>)}</select></label><TablePagination page={page} lastPage={lastPage} onPageChange={onPageChange} /></div>
}
function InventoryCategoryLink() { return null }
function InventoryBackLink() { return <div className="inventory-subview-actions"><button type="button" className="ghost-button" onClick={() => { window.history.pushState({}, '', '/inventory'); window.dispatchEvent(new PopStateEvent('popstate')) }}>Back to inventory</button></div> }

export function humanizeNotificationType(value: unknown): string {
  return String(value ?? 'MedLine update').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

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

function NotificationsPageLegacy({ locale }: { locale: string }) {
  void locale
  const [rows, setRows] = useState<NotificationRecord[]>([])
  const [search, setSearch] = useState('')
  const load = async () => { try { const response = await api.get('/notifications', { params: { per_page: 100 } }); setRows((response.data.data ?? []).map((row: NotificationRecord) => ({ ...row, type: humanizeNotificationType(row.type) }))) } catch { setRows([]) } }
  useEffect(() => { void load() }, [])
  const visible = rows.filter((row) => `${row.type ?? ''} ${notificationText(row)}`.toLowerCase().includes(search.toLowerCase()))
  const markRead = async (id: string) => { await api.post(`/notifications/${id}/read`, {}, mutationConfig('notification-read', id, 'read')); await load() }
  const remove = async (id: string) => { await api.delete(`/notifications/${id}`); await load() }
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">WORKSPACE</p><h1>Notifications</h1><p className="muted">Review, read, and remove your MedLine notification history.</p></div></div><section className="panel table-panel"><div className="panel-heading"><div><h2>Notification queue</h2></div></div><div className="search-box"><Search size={19} aria-hidden="true" /><input aria-label="Search notifications" placeholder="Search notifications..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="operations-table notification-table"><div className="table-row table-head"><span>Notification</span><span>Message</span><span>Created</span><span>Status</span><span>Action</span></div>{visible.length === 0 ? <div className="state">No notifications found.</div> : visible.map((row) => <div className="table-row" key={String(row.id)}><strong>{String(row.type ?? 'MedLine update')}</strong><span>{notificationText(row)}</span><span>{formatMedlineDate(row.created_at)}</span><span className="status-pill">{row.read_at ? 'Read' : 'Unread'}</span><div className="row-actions"><button className="approve-button" type="button" onClick={() => void markRead(String(row.id))} disabled={Boolean(row.read_at)}>—</button><button className="reject-button" type="button" onClick={() => void remove(String(row.id))}>— ??</button></div></div>)}</div></section></section>
}

export function NotificationsPage({ locale }: { locale: string }) {
  const [rows, setRows] = useState<NotificationRecord[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('desc')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<NotificationRecord | null>(null)
  const load = async () => {
    setLoading(true)
    try {
      const response = await api.get('/notifications', { params: { search, status, page, per_page: perPage, sort_by: sortBy, sort_direction: sortDirection } })
      const data = (response.data.data ?? []).map((row: NotificationRecord) => ({ ...row, type: humanizeNotificationType(row.type) }))
      setRows(data); setLastPage(Number(response.data.last_page ?? 1)); setTotal(Number(response.data.total ?? data.length))
    } catch { setRows([]); setLastPage(1); setTotal(0); setMessage('Unable to load notifications.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [search, status, page, perPage, sortBy, sortDirection])
  const toggleSort = (column: string) => { if (sortBy === column) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(column); setSortDirection('asc') }; setPage(1) }
  const markRead = async (row: NotificationRecord) => { if (row.read_at) return; try { await api.post(`/notifications/${String(row.id)}/read`, {}, mutationConfig('notification-read', String(row.id), 'read')); setSelected((current) => current?.id === row.id ? { ...current, read_at: new Date().toISOString() } : current); await load() } catch { setMessage('Unable to mark this notification as read.') } }
  const open = (row: NotificationRecord) => { setSelected(row); void markRead(row) }
  const remove = async (row: NotificationRecord) => { if (!window.confirm(`Delete “${String(row.type ?? 'this notification')}”?`)) return; try { await api.delete(`/notifications/${String(row.id)}`); setSelected(null); setMessage('Notification deleted.'); await load() } catch { setMessage('Unable to delete this notification.') } }
  if (selected) return <section className="content notification-detail-page"><button type="button" className="back-link" onClick={() => setSelected(null)}>Back to notifications</button><section className="panel notification-detail-card"><div className="panel-heading"><div><p className="eyebrow">NOTIFICATION</p><h1>{String(selected.type ?? 'MedLine update')}</h1><p className="muted">{formatMedlineDate(selected.created_at, locale)}</p></div><ManagementStatus status={selected.read_at ? 'read' : 'unread'} /></div><div className="notification-detail-message">{notificationText(selected)}</div><div className="row-actions"><button type="button" className="reject-button" onClick={() => void remove(selected)}><Trash2 size={18} /> Delete notification</button></div></section></section>
  return <section className="content orders-content operations-list-content management-list-content"><section className="panel table-panel orders-table-panel operations-table-panel"><div className="panel-heading orders-panel-heading"><div><div className="orders-heading-row"><h1>Notifications</h1><span className="orders-result-count" aria-live="polite">{loading ? 'Updating' : `${total} ${total === 1 ? 'notification' : 'notifications'}`}</span></div><p className="muted">Search, filter, sort, read, and remove your notification history.</p></div></div>{message && <div className="form-message" role="status">{message}</div>}<div className="table-controls orders-toolbar management-toolbar" role="search" aria-label="Notification filters"><label className="orders-search-control"><span>Search notifications</span><span className="search-box"><Search size={19} aria-hidden="true" /><input aria-label="Search notifications" placeholder="Title or message" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></span></label><label className="orders-status-filter"><span>Status</span><select aria-label="Filter notifications by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option><option value="unread">Unread</option><option value="read">Read</option></select></label></div><div className="orders-table-region operations-table-region" role="region" aria-label="Scrollable notifications table" aria-busy={loading} tabIndex={0}><table className="orders-data-table operations-data-table admin-management-table notifications-management-table"><caption className="sr-only">Notifications</caption><thead><tr><SortableTableHeader label="Notification" column="type" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Message" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Created" column="created_at" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Status" column="read_at" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Action" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /></tr></thead><tbody>{loading ? <tr className="orders-state-row"><td colSpan={5}><span className="state" role="status">Loading notifications...</span></td></tr> : rows.length === 0 ? <tr className="orders-state-row"><td colSpan={5}><span className="state" role="status">No notifications match the current filters.</span></td></tr> : rows.map((row) => <tr className={`orders-data-row ${row.read_at ? '' : 'notification-unread-row'}`} key={String(row.id)} tabIndex={0} aria-label={`Open ${String(row.type ?? 'notification')}`} onClick={(event) => { if ((event.target as HTMLElement).closest('button, a')) return; open(row) }} onKeyDown={(event) => { if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); open(row) }}><th scope="row"><button type="button" className="order-id-button" onClick={() => open(row)}>{String(row.type ?? 'MedLine update')}</button></th><td>{notificationText(row)}</td><td><time dateTime={String(row.created_at ?? '')}>{formatMedlineDate(row.created_at, locale)}</time></td><td><ManagementStatus status={row.read_at ? 'read' : 'unread'} /></td><td><div className="orders-action-cell"><div className="row-actions">{!row.read_at && <button type="button" className="approve-button" aria-label={`Mark ${String(row.type ?? 'notification')} as read`} title="Mark as read" onClick={() => void markRead(row)}><FileCheck2 size={19} aria-hidden="true" /></button>}<button type="button" className="reject-button" aria-label={`Delete ${String(row.type ?? 'notification')}`} title="Delete notification" onClick={() => void remove(row)}><Trash2 size={19} aria-hidden="true" /></button></div></div></td></tr>)}</tbody></table></div><ManagementTableFooter label="notifications" page={page} lastPage={lastPage} perPage={perPage} onPageChange={setPage} onPerPageChange={(size) => { setPerPage(size); setPage(1) }} /></section></section>
}

export function WebNotifications({ locale, onOpenAll }: { locale: string; onOpenAll?: () => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<NotificationRecord[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const notificationRoot = useRef<HTMLDivElement>(null)
  const busyNotificationIds = useRef(new Set<string>())
  const load = async () => { try { const response = await api.get('/notifications', { params: { per_page: 5 } }); const nextRows = (response.data.data ?? []).map((row: NotificationRecord) => ({ ...row, type: humanizeNotificationType(row.type) })); setRows(nextRows); setUnreadCount(Number(response.data.unread_count ?? nextRows.filter((row: NotificationRecord) => row.read_at == null).length)) } catch { setRows([]); setUnreadCount(0) } }
  useEffect(() => { void load(); const onNotification = () => { void load() }; window.addEventListener('medline:notification', onNotification); const interval = window.setInterval(() => { void load() }, open ? 30000 : 60000); return () => { window.clearInterval(interval); window.removeEventListener('medline:notification', onNotification) } }, [open])
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => { if (!notificationRoot.current?.contains(event.target as Node)) setOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [open])
  const toggle = () => { const next = !open; setOpen(next); if (next) void load() }
  const markRead = async (id: string) => { if (busyNotificationIds.current.has(id)) return; busyNotificationIds.current.add(id); try { await api.post(`/notifications/${id}/read`, {}, mutationConfig('notification-read', id, 'read')); await load() } finally { busyNotificationIds.current.delete(id) } }
  return <div className="notification-wrap" ref={notificationRoot}><button className={`icon-button notification-bell ${unreadCount > 0 ? 'has-unread' : ''}`} type="button" onClick={toggle} aria-label={tr('notifications', locale)} aria-expanded={open}><Bell size={20} aria-hidden="true" />{unreadCount > 0 && <span className="notification-unread-count" role="status" aria-live="polite" aria-atomic="true"><span className="sr-only">{`${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}`}</span><span aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</span></span>}</button>{open && <div className="notification-popover" role="region" aria-label={tr('notifications', locale)}><div className="notification-header"><strong>{tr('notifications', locale)}</strong><div><button type="button" onClick={() => void load()}>{tr('notificationsRefresh', locale)}</button>{onOpenAll && <button type="button" onClick={() => { setOpen(false); onOpenAll() }}>View all</button>}</div></div>{rows.length === 0 ? <div className="state" role="status">{tr('noNotifications', locale)}</div> : rows.map((row) => <div className={`notification-row ${row.read_at == null ? 'unread' : ''}`} key={String(row.id)}><div><strong>{String(row.type ?? 'MedLine update')}</strong><span>{notificationText(row)}</span></div>{row.read_at == null && <button type="button" onClick={() => void markRead(String(row.id))}>{tr('read', locale)}</button>}</div>)}</div>}</div>
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

export function PartnerAccessGuard({ role = 'pharmacy', onOpen }: { role?: string; onOpen: () => void }) {
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => { api.get('/subscription').then((response) => setStatus(response.data.access_active ? 'active' : String(response.data.review_subscription?.status ?? response.data.subscription?.status ?? 'inactive'))).catch(() => setStatus('unavailable')) }, [])
  if (status === null || ['active', 'expiring_soon', 'grace'].includes(status)) return null
  const organization = role === 'warehouse' ? 'Warehouse' : 'Pharmacy'
  return <div className="access-banner"><div><strong>{status === 'unavailable' ? 'Subscription status unavailable' : `${organization} operations require an active subscription`}</strong><span>{status === 'unavailable' ? 'Check your connection or retry before processing operational work.' : 'Submit or review your annual payment proof to continue.'}</span></div><button className="ghost-button" onClick={onOpen}>Open subscription</button></div>
}

function UserApprovalAction({ user, onUpdated }: { user: Record<string, unknown>; onUpdated: () => void }) {
  const status = String(user.status ?? 'active')
  if (status !== 'pending') return <span className="status-pill">{status}</span>
  return <button className="approve-button" aria-label="Approve account" title="Approve account" onClick={async () => { try { await api.patch(`/admin/users/${String(user.id)}/status`, { status: 'active', reason: 'Administrator approved account.' }, mutationConfig('user-approval', user.id as number, 'approve')); onUpdated() } catch (error) { window.alert(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to approve account.' : 'Unable to approve account.') } }}><FileCheck2 size={18} aria-hidden="true" /><span>Approve account</span></button>
}
export function UserRolePanel({ section }: { section: string }) {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([])
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const load = async () => { try { const response = await api.get('/admin/users', { params: { per_page: 100 } }); const data = response.data.data ?? []; setUsers(data); setRoles(Object.fromEntries(data.map((user: Record<string, unknown>) => [String(user.id), String(user.role ?? 'patient')]))) } catch { setUsers([]) } }
  useEffect(() => { if (section === 'users') void load() }, [section])
  const update = async (id: number) => { try { await api.patch(`/admin/users/${id}/role`, { role: roles[String(id)], reason: 'Administrative role review.' }, mutationConfig('user-role', id, roles[String(id)])); setMessage('User role updated.'); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update user role.' : 'Unable to update user role.') } }
  if (section !== 'users') return null
  return <section className="content"><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">IDENTITY MANAGEMENT</p><h2>Role assignments</h2><p className="muted">Pharmacy, warehouse, and driver roles require a matching approved profile on the server.</p></div></div>{message && <div className="form-success">{message}</div>}<div className="operations-table"><div className="table-row table-head"><span>User</span><span>Email</span><span>Role</span><span>Approval</span><span>Action</span></div>{users.map((user) => <div className="table-row" key={String(user.id)}><strong>{String(user.name ?? `User ${user.id}`)}</strong><span>{String(user.email ?? '')}</span><select value={roles[String(user.id)] ?? 'patient'} onChange={(event) => setRoles((current) => ({ ...current, [String(user.id)]: event.target.value }))}><option value="patient">Patient</option><option value="pharmacy">Pharmacy</option><option value="warehouse">Warehouse</option><option value="driver">Driver</option><option value="admin">Admin</option></select><UserApprovalAction user={user} onUpdated={() => void load()} /><button className="ghost-button" onClick={() => void update(Number(user.id))}>Save role</button></div>)}</div></section></section>
}

export function UserRolePanelWithCompany({ section }: { section: string }) {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([])
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('desc')
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<Record<string, unknown> | null>(null)
  const load = async () => { setLoading(true); try { const response = await api.get('/admin/users', { params: { per_page: perPage, page, search, role: roleFilter, status: statusFilter, sort_by: sortBy, sort_direction: sortDirection } }); const data = response.data.data ?? []; setUsers(data); setLastPage(Number(response.data.last_page ?? response.data.meta?.last_page ?? 1)); setTotal(Number(response.data.total ?? response.data.meta?.total ?? data.length)); setRoles((current) => ({ ...current, ...Object.fromEntries(data.map((user: Record<string, unknown>) => [String(user.id), String(user.role ?? 'patient')])) })) } catch { setUsers([]); setLastPage(1); setTotal(0) } finally { setLoading(false) } }
  useEffect(() => { if (section === 'users') void load() }, [section, search, roleFilter, statusFilter, page, perPage, sortBy, sortDirection])
  const update = async (id: number) => { try { await api.patch('/admin/users/' + id + '/role', { role: roles[String(id)], reason: 'Administrative role review.' }, mutationConfig('user-role', id, roles[String(id)])); setMessage('User role updated.'); setSelectedUser(null); await load() } catch { setMessage('Unable to update user role.') } }
  const updateStatus = async (user: Record<string, unknown>) => {
    const current = String(user.status ?? 'active')
    const next = current === 'suspended' ? 'active' : 'suspended'
    if (next === 'suspended' && !window.confirm(`Deactivate ${String(user.name ?? 'this user')}? Their active sessions will be signed out immediately.`)) return
    try {
      await api.patch(`/admin/users/${String(user.id)}/status`, { status: next, reason: next === 'suspended' ? 'Administrator deactivated account access.' : 'Administrator restored account access.' }, mutationConfig('user-status', Number(user.id), next))
      setMessage(next === 'suspended' ? 'User access deactivated.' : 'User access restored.')
      setSelectedUser(null)
      await load()
    } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update account access.' : 'Unable to update account access.') }
  }
  const toggleSort = (column: string) => { if (sortBy === column) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(column); setSortDirection('asc') }; setPage(1) }
  const companyName = (user: Record<string, unknown>) => String(user.company_name ?? (user.role === 'admin' || user.role === 'support' ? 'MedLine' : user.role === 'driver' ? 'Independent driver' : 'Not assigned'))
  if (section !== 'users') return null
  if (selectedUser) return <section className="content partner-detail-content"><div className="welcome-row"><div><p className="eyebrow">USER PROFILE</p><h1>{String(selectedUser.name ?? `User ${selectedUser.id}`)}</h1><p className="muted">Review account identity, organization, access status, and assigned role.</p></div><button className="ghost-button" onClick={() => setSelectedUser(null)}>Back to users</button></div><section className="panel user-detail-panel"><div className="detail-stat-grid"><div><small>EMAIL</small><strong>{String(selectedUser.email ?? 'Not recorded')}</strong></div><div><small>ORGANIZATION</small><strong>{companyName(selectedUser)}</strong></div><div><small>STATUS</small><ManagementStatus status={String(selectedUser.status ?? 'active')} /></div><div><small>CREATED</small><strong>{formatMedlineDate(selectedUser.created_at)}</strong></div></div><div className="user-detail-role"><label>Assigned role<select value={roles[String(selectedUser.id)] ?? 'patient'} onChange={(event) => setRoles((current) => ({ ...current, [String(selectedUser.id)]: event.target.value }))}><option value="patient">Patient</option><option value="pharmacy">Pharmacy</option><option value="warehouse">Warehouse</option><option value="driver">Driver</option><option value="admin">Admin</option></select></label><button className="primary-button" onClick={() => void update(Number(selectedUser.id))}><FileCheck2 size={18} aria-hidden="true" /> Save role</button>{String(selectedUser.status ?? 'active') === 'pending' ? <UserApprovalAction user={selectedUser} onUpdated={() => { setSelectedUser(null); void load() }} /> : <button className={String(selectedUser.status) === 'suspended' ? 'approve-button' : 'reject-button'} onClick={() => void updateStatus(selectedUser)}><Power size={18} aria-hidden="true" /> {String(selectedUser.status) === 'suspended' ? 'Restore access' : 'Deactivate user'}</button>}</div></section></section>
  return <section className="content orders-content operations-list-content management-list-content"><section className="panel table-panel orders-table-panel operations-table-panel"><div className="panel-heading orders-panel-heading"><div><div className="orders-heading-row"><h1>Role assignments</h1><span className="orders-result-count" aria-live="polite">{loading ? 'Updating' : `${total} ${total === 1 ? 'user' : 'users'}`}</span></div><p className="muted">Search, filter, sort, review, and update every account from one workspace.</p></div></div>{message && <div className="form-success" role="status">{message}</div>}<div className="table-controls orders-toolbar management-toolbar management-toolbar-three" role="search" aria-label="User filters"><label className="orders-search-control"><span>Search users</span><span className="search-box"><Search size={19} aria-hidden="true" /><input aria-label="Search users" placeholder="Name, email, company, or role" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></span></label><label className="orders-status-filter"><span>Role</span><select aria-label="Filter users by role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1) }}><option value="">All roles</option><option value="patient">Patient</option><option value="pharmacy">Pharmacy</option><option value="warehouse">Warehouse</option><option value="driver">Driver</option><option value="admin">Admin</option></select></label><label className="orders-status-filter"><span>Status</span><select aria-label="Filter users by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></select></label></div><div className="orders-table-region operations-table-region" role="region" aria-label="Scrollable users table" aria-busy={loading} tabIndex={0}><table className="orders-data-table operations-data-table admin-management-table users-management-table"><caption className="sr-only">Role assignments</caption><thead><tr><SortableTableHeader label="User" column="name" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Email" column="email" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Company / organization" column="company" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Role" column="role" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Status" column="status" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Created" column="created_at" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Action" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /></tr></thead><tbody>{loading ? <tr className="orders-state-row"><td colSpan={7}><span className="state" role="status">Loading users...</span></td></tr> : users.length === 0 ? <tr className="orders-state-row"><td colSpan={7}><span className="state" role="status">No users match the current filters.</span></td></tr> : users.map((user) => <tr className="orders-data-row" key={String(user.id)} tabIndex={0} aria-label={`Open user ${String(user.name ?? user.id)}`} onClick={(event) => { if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return; setSelectedUser(user) }} onKeyDown={(event) => { if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); setSelectedUser(user) }}><th scope="row"><button type="button" className="order-id-button" onClick={() => setSelectedUser(user)}>{String(user.name ?? `User ${user.id}`)}</button></th><td>{String(user.email ?? 'Not recorded')}</td><td>{companyName(user)}</td><td><select aria-label={`Role for ${String(user.name ?? user.id)}`} value={roles[String(user.id)] ?? 'patient'} onChange={(event) => setRoles((current) => ({ ...current, [String(user.id)]: event.target.value }))}><option value="patient">Patient</option><option value="pharmacy">Pharmacy</option><option value="warehouse">Warehouse</option><option value="driver">Driver</option><option value="admin">Admin</option></select></td><td><ManagementStatus status={String(user.status ?? 'active')} /></td><td><time dateTime={String(user.created_at ?? '')}>{formatMedlineDate(user.created_at)}</time></td><td><div className="orders-action-cell"><div className="row-actions"><button type="button" className="ghost-button" aria-label={`View ${String(user.name ?? 'user')}`} title="View user" onClick={() => setSelectedUser(user)}><Eye size={19} aria-hidden="true" /></button>{String(user.status ?? 'active') === 'pending' ? <UserApprovalAction user={user} onUpdated={() => void load()} /> : <button type="button" className={String(user.status) === 'suspended' ? 'approve-button' : 'reject-button'} aria-label={`${String(user.status) === 'suspended' ? 'Restore access for' : 'Deactivate'} ${String(user.name ?? 'user')}`} title={String(user.status) === 'suspended' ? 'Restore access' : 'Deactivate user'} onClick={() => void updateStatus(user)}><Power size={19} aria-hidden="true" /></button>}<button type="button" className="approve-button" aria-label={`Save role for ${String(user.name ?? 'user')}`} title="Save role" onClick={() => void update(Number(user.id))}><FileCheck2 size={19} aria-hidden="true" /><span>Save role</span></button></div></div></td></tr>)}</tbody></table></div><ManagementTableFooter label="users" page={page} lastPage={lastPage} perPage={perPage} onPageChange={setPage} onPerPageChange={(size) => { setPerPage(size); setPage(1) }} /></section></section>
}

const partnerWeekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function PartnerWorkingHoursSummary({ value }: { value: unknown }) {
  const shifts = Array.isArray(value) ? value as Array<Record<string, unknown>> : []
  return <section className="panel partner-hours-card">
    <div className="panel-heading"><div><p className="eyebrow">AVAILABILITY</p><h2>Working hours</h2><p className="muted">Registered weekly opening periods, including split shifts.</p></div><Clock3 size={22} aria-hidden="true" /></div>
    <dl className="partner-working-hours">
      {partnerWeekdays.map((day, dayIndex) => {
        const dayShifts = shifts.filter((shift) => Number(shift.day_of_week) === dayIndex)
        return <div className="partner-working-day" key={day}>
          <dt>{day}</dt>
          <dd>{dayShifts.length === 0 ? <span className="partner-closed-label">Closed</span> : dayShifts.map((shift, index) => <span key={`${day}-${index}`}>{String(shift.opens_at ?? '').slice(0, 5)}–{String(shift.closes_at ?? '').slice(0, 5)}</span>)}</dd>
        </div>
      })}
    </dl>
  </section>
}

function PartnerDetailPanel({ partner, onClose, accessAction }: { partner: Record<string, unknown>; onClose: () => void; accessAction?: ReactNode }) {
  const mapUrl = deliveryMapEmbedUrl(partner.latitude, partner.longitude)
  const type = String(partner.type) === 'warehouse' ? 'warehouse' : 'pharmacy'
  const typeLabel = type === 'warehouse' ? 'Warehouse' : 'Pharmacy'
  return <section className="content partner-detail-content">
    <div className="welcome-row"><div><p className="eyebrow">{typeLabel.toUpperCase()} PROFILE</p><h1>{String(partner.business_name ?? typeLabel)}</h1><p className="muted">{typeLabel} · {String(partner.approval_status ?? 'pending')}</p></div><div className="partner-detail-heading-actions">{accessAction}<button className="ghost-button" onClick={onClose}>Back to {type === 'warehouse' ? 'warehouses' : 'pharmacies'}</button></div></div>
    <div className="partner-detail-grid">
      <section className="panel partner-info-card"><div className="panel-heading"><div><p className="eyebrow">BUSINESS INFORMATION</p><h2>{String(partner.business_name ?? typeLabel)}</h2></div><span className="status-pill">{String(partner.approval_status ?? 'pending')}</span></div><div className="partner-detail-fields"><p><span>Organization type</span><strong>{typeLabel}</strong></p><p><span>License number</span><strong>{String(partner.license_number ?? 'Not provided')}</strong></p><p><span>Subscription access</span><strong>{String(partner.subscription_status ?? 'Not configured')}</strong></p><p><span>Payment review</span><strong>{String(partner.payment_proof_status ?? 'Not submitted').replaceAll('_', ' ')}</strong></p>{Boolean(partner.payment_proof_id) && <button type="button" className="ghost-button" onClick={() => void downloadPrivate(`/admin/payment-proofs/${String(partner.payment_proof_id)}/download`, `medline-registration-payment-${String(partner.id)}`)}>View payment proof</button>}<p><span>Activation period</span><strong>{partner.subscription_starts_at && partner.subscription_ends_at ? String(partner.subscription_starts_at) + ' → ' + String(partner.subscription_ends_at) : 'Not activated'}</strong></p><p><span>Phone</span><strong>{String(partner.phone ?? 'Not provided')}</strong></p><p><span>Contact person</span><strong>{String(partner.contact_name ?? 'Not provided')}</strong></p><p><span>Contact email</span><strong>{String(partner.contact_email ?? 'Not provided')}</strong></p></div></section>
      <section className="panel partner-address-card"><div className="panel-heading"><div><p className="eyebrow">LOCATION</p><h2>Registered location</h2></div></div><p className="partner-address">{String(partner.address ?? 'Address not provided')}</p>{mapUrl ? <><iframe className="partner-map" title={`${String(partner.business_name ?? typeLabel)} location`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer" allowFullScreen /><a className="ghost-button" href={`https://www.openstreetmap.org/?mlat=${String(partner.latitude)}&mlon=${String(partner.longitude)}&zoom=16`} target="_blank" rel="noreferrer">Open in OpenStreetMap ↗</a></> : <div className="state">Map coordinates are not available for this {type}.</div>}</section>
      <PartnerWorkingHoursSummary value={partner.working_hours} />
    </div>
  </section>
}

export function PartnerManagementPanel({ section }: { section: string }) {
  const [partners, setPartners] = useState<Array<Record<string, unknown>>>([])
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('desc')
  const [loading, setLoading] = useState(false)
  const [selectedPartner, setSelectedPartner] = useState<Record<string, unknown> | null>(null)
  const partnerType = section === 'warehouses' ? 'warehouse' : 'pharmacy'
  const title = partnerType === 'warehouse' ? 'Warehouses' : 'Pharmacies'
  const load = async () => { setLoading(true); try { const response = await api.get('/admin/partners', { params: { type: partnerType, search, status: statusFilter, per_page: perPage, page, sort_by: sortBy, sort_direction: sortDirection } }); const data = response.data.data ?? []; setPartners(data); setLastPage(Number(response.data.last_page ?? response.data.meta?.last_page ?? 1)); setTotal(Number(response.data.total ?? response.data.meta?.total ?? data.length)) } catch { setPartners([]); setLastPage(1); setTotal(0) } finally { setLoading(false) } }
  useEffect(() => { setSelectedPartner(null); setMessage('') }, [section])
  useEffect(() => { if (section === 'pharmacies' || section === 'warehouses') void load() }, [section, search, statusFilter, page, perPage, sortBy, sortDirection])
  const decide = async (id: number, decision: 'approve' | 'reject' | 'correction') => { const note = decision === 'correction' ? window.prompt('Explain exactly what the pharmacy or warehouse must correct before resubmitting:', 'Please review the submitted details and correct the highlighted information.') : undefined; if (decision === 'correction' && note === null) return; try { await api.post(`/admin/partners/${id}/decision`, { decision, note }, mutationConfig('organization-decision', id, decision)); setMessage(`${partnerType === 'warehouse' ? 'Warehouse' : 'Pharmacy'} ${decision === 'correction' ? 'sent for correction' : `${decision}d`}.`); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? `Unable to update ${partnerType}.` : `Unable to update ${partnerType}.`) } }
  const updateAccess = async (partner: Record<string, unknown>) => {
    const suspended = String(partner.approval_status) === 'suspended'
    const next = suspended ? 'active' : 'suspended'
    if (!suspended && !window.confirm(`Deactivate ${String(partner.business_name ?? `this ${partnerType}`)}? The linked user will be signed out and the ${partnerType} will disappear from new operational selections.`)) return
    try {
      await api.patch(`/admin/users/${String(partner.user_id)}/status`, { status: next, reason: suspended ? `Administrator restored ${partnerType} access.` : `Administrator deactivated ${partnerType} access.` }, mutationConfig('partner-access', Number(partner.id), next))
      setMessage(suspended ? `${title.slice(0, -1)} access restored.` : `${title.slice(0, -1)} access deactivated.`)
      setSelectedPartner(null)
      await load()
    } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? `Unable to update ${partnerType} access.` : `Unable to update ${partnerType} access.`) }
  }
  const viewPartner = async (id: number) => { try { const response = await api.get(`/admin/partners/${id}`); setSelectedPartner(response.data.partner ?? null) } catch { setMessage(`Unable to load ${partnerType} details.`) } }
  const toggleSort = (column: string) => { if (sortBy === column) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(column); setSortDirection('asc') }; setPage(1) }
  if (section !== 'pharmacies' && section !== 'warehouses') return null
  if (selectedPartner) return <PartnerDetailPanel partner={selectedPartner} onClose={() => setSelectedPartner(null)} accessAction={['approved', 'suspended'].includes(String(selectedPartner.approval_status)) ? <button type="button" className={String(selectedPartner.approval_status) === 'suspended' ? 'approve-button' : 'reject-button'} onClick={() => void updateAccess(selectedPartner)}><Power size={18} aria-hidden="true" /> {String(selectedPartner.approval_status) === 'suspended' ? `Restore ${partnerType} access` : `Deactivate ${partnerType}`}</button> : undefined} />
  return <section className="content orders-content operations-list-content management-list-content">
    <section className="panel table-panel orders-table-panel operations-table-panel">
      <div className="panel-heading orders-panel-heading"><div><div className="orders-heading-row"><h1>{title}</h1><span className="orders-result-count" aria-live="polite">{loading ? 'Updating' : `${total} ${total === 1 ? partnerType : `${partnerType}s`}`}</span></div><p className="muted">Search, filter, sort, and review registered {partnerType} accounts before operational access.</p></div></div>
      {message && <div className="form-success" role="status">{message}</div>}
      <div className="table-controls orders-toolbar management-toolbar" role="search" aria-label={`${title} filters`}><label className="orders-search-control"><span>Search {title.toLowerCase()}</span><span className="search-box"><Search size={19} aria-hidden="true" /><input aria-label={`Search ${title.toLowerCase()}`} placeholder="Name, license, address, or status" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></span></label><label className="orders-status-filter"><span>Status</span><select aria-label={`Filter ${title.toLowerCase()} by status`} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="correction_required">Correction required</option><option value="rejected">Rejected</option></select></label></div>
      <div className="orders-table-region operations-table-region" role="region" aria-label={`Scrollable ${title.toLowerCase()} table`} aria-busy={loading} tabIndex={0}>
        <table className="orders-data-table operations-data-table admin-management-table partners-management-table">
          <caption className="sr-only">{title} overview</caption>
          <thead><tr><SortableTableHeader label={partnerType === 'warehouse' ? 'Warehouse' : 'Pharmacy'} column="business_name" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="License" column="license_number" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Location" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Subscription" column="subscription_status" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Status" column="approval_status" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Created" column="created_at" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Action" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /></tr></thead>
          <tbody>{loading ? <tr className="orders-state-row"><td colSpan={7}><span className="state" role="status">Loading {title.toLowerCase()}...</span></td></tr> : partners.length === 0 ? <tr className="orders-state-row"><td colSpan={7}><span className="state" role="status">No {title.toLowerCase()} match the current filters.</span></td></tr> : partners.map((partner) => <tr className="orders-data-row" key={String(partner.id)} tabIndex={0} aria-label={`Open ${partnerType} ${String(partner.business_name ?? partner.id)}`} onClick={(event) => { if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return; void viewPartner(Number(partner.id)) }} onKeyDown={(event) => { if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); void viewPartner(Number(partner.id)) }}><th scope="row"><button type="button" className="order-id-button" onClick={() => void viewPartner(Number(partner.id))}>{String(partner.business_name ?? `${partnerType} ${partner.id}`)}</button></th><td><span className="orders-cell-primary">{String(partner.license_number ?? 'License pending')}</span></td><td>{String(partner.address ?? 'Location not recorded')}</td><td><ManagementStatus status={String(partner.subscription_status ?? 'inactive')} /></td><td><ManagementStatus status={String(partner.approval_status ?? 'pending')} /></td><td><time dateTime={String(partner.created_at ?? '')}>{formatMedlineDate(partner.created_at)}</time></td><td><div className="orders-action-cell"><div className="row-actions"><button className="ghost-button" aria-label={`View ${String(partner.business_name ?? partnerType)}`} title="View details" onClick={() => void viewPartner(Number(partner.id))}><Eye size={19} aria-hidden="true" /></button>{partner.approval_status === 'pending' && <><button className="approve-button" aria-label="Approve" title="Approve" onClick={() => void decide(Number(partner.id), 'approve')}><FileCheck2 size={19} aria-hidden="true" /></button><button className="reject-button" aria-label="Reject" title="Reject" onClick={() => void decide(Number(partner.id), 'reject')}><FileX2 size={19} aria-hidden="true" /></button><button className="ghost-button" aria-label="Correction" title="Request correction" onClick={() => void decide(Number(partner.id), 'correction')}><MessageSquare size={19} aria-hidden="true" /></button></>}{['approved', 'suspended'].includes(String(partner.approval_status)) && <button className={partner.approval_status === 'suspended' ? 'approve-button' : 'reject-button'} aria-label={partner.approval_status === 'suspended' ? `Restore ${partnerType} access` : `Deactivate ${partnerType}`} title={partner.approval_status === 'suspended' ? 'Restore access' : 'Deactivate access'} onClick={() => void updateAccess(partner)}><Power size={19} aria-hidden="true" /></button>}</div></div></td></tr>)}</tbody>
        </table>
      </div>
      <ManagementTableFooter label={title.toLowerCase()} page={page} lastPage={lastPage} perPage={perPage} onPageChange={setPage} onPerPageChange={(size) => { setPerPage(size); setPage(1) }} />
    </section>
  </section>
}

type ProcurementDraftItem = { id: number; name: string; manufacturer: string; quantity: number; unitPrice: number; available: number }

export function ProcurementCreatePanel({ section, onBack, onCreated }: { section: string; onBack?: () => void; onCreated?: (procurement: Record<string, unknown>) => void }) {
  const [pharmacy, setPharmacy] = useState<Record<string, unknown> | null>(null)
  const [warehouses, setWarehouses] = useState<Array<Record<string, unknown>>>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<Record<string, unknown> | null>(null)
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [medicines, setMedicines] = useState<Array<Record<string, unknown>>>([])
  const [medicineSearch, setMedicineSearch] = useState('')
  const [selectedMedicine, setSelectedMedicine] = useState<Record<string, unknown> | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [items, setItems] = useState<ProcurementDraftItem[]>([])
  const [activeStep, setActiveStep] = useState(1)
  const [ratePerKm, setRatePerKm] = useState(DELIVERY_FEE_PER_KM_SYP)
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({ motorcycle: DELIVERY_FEE_PER_KM_SYP })
  const [deliveryVehicleType, setDeliveryVehicleType] = useState<DeliveryVehicleType>('motorcycle')
  const [deliveryPreference, setDeliveryPreference] = useState<DeliveryPreference>('asap')
  const [scheduledDeliveryAt, setScheduledDeliveryAt] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKey = useRef<string | null>(null)
  const visible = section === 'new-procurement' || section === 'procurement'

  useEffect(() => {
    if (!visible) return
    setLoading(true)
    Promise.all([
      api.get('/auth/me'),
      api.get('/partners', { params: { type: 'warehouse', per_page: 100 } }),
      api.get('/delivery-pricing/current'),
    ]).then(([meResponse, warehouseResponse, pricingResponse]) => {
      setPharmacy(meResponse.data.partner ?? null)
      setWarehouses(warehouseResponse.data.data ?? [])
      const nextRates = Object.fromEntries((pricingResponse.data.rates ?? []).map((rate: Record<string, unknown>) => [String(rate.vehicle_type), Number(rate.rate_per_km)]))
      setDeliveryRates(nextRates)
      setRatePerKm(Number(nextRates[deliveryVehicleType] ?? pricingResponse.data.rate_per_km ?? DELIVERY_FEE_PER_KM_SYP))
    }).catch(() => setMessage('Unable to load the pharmacy replenishment workspace.')).finally(() => setLoading(false))
  }, [visible])

  useEffect(() => { setRatePerKm(Number(deliveryRates[deliveryVehicleType] ?? DELIVERY_FEE_PER_KM_SYP)) }, [deliveryRates, deliveryVehicleType])

  const roadEstimate = useRoadDeliveryEstimate(selectedWarehouse?.latitude, selectedWarehouse?.longitude, pharmacy?.latitude, pharmacy?.longitude, deliveryVehicleType)

  useEffect(() => {
    if (!selectedWarehouse) { setMedicines([]); return }
    api.get('/medicines', { params: { partner_id: Number(selectedWarehouse.id), inventory_type: 'warehouse', available_only: true, per_page: 100 } })
      .then((response) => setMedicines(response.data.data ?? []))
      .catch(() => { setMedicines([]); setMessage('Unable to load medicines from this warehouse.') })
  }, [selectedWarehouse])

  if (!visible) return null
  const filteredWarehouses = warehouses.filter((warehouse) => `${String(warehouse.business_name ?? '')} ${String(warehouse.address ?? '')}`.toLowerCase().includes(warehouseSearch.trim().toLowerCase()))
  const filteredMedicines = medicines.filter((medicine) => !items.some((item) => item.id === Number(medicine.id)) && `${String(medicine.name_en ?? '')} ${String(medicine.name_ar ?? '')} ${String(medicine.manufacturer ?? '')}`.toLowerCase().includes(medicineSearch.trim().toLowerCase()))
  const deliveryEstimate = roadEstimate.estimate
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const deliveryFee = deliveryEstimate?.fee ?? 0
  const total = subtotal + deliveryFee
  const selectWarehouse = (warehouse: Record<string, unknown>) => {
    setSelectedWarehouse(warehouse)
    setWarehouseSearch(String(warehouse.business_name ?? 'Warehouse'))
    setItems([])
    setSelectedMedicine(null)
    setMedicineSearch('')
    setMessage('')
  }
  const addMedicine = () => {
    if (!selectedMedicine) return
    const available = Number(selectedMedicine.available_quantity ?? 0)
    const safeQuantity = Math.max(1, Math.min(available || 1, Math.trunc(quantity)))
    setItems((current) => [...current, { id: Number(selectedMedicine.id), name: String(selectedMedicine.name_en ?? `Medicine ${selectedMedicine.id}`), manufacturer: String(selectedMedicine.manufacturer ?? ''), quantity: safeQuantity, unitPrice: Number(selectedMedicine.unit_price ?? 0), available }])
    setSelectedMedicine(null)
    setMedicineSearch('')
    setQuantity(1)
  }
  const updateQuantity = (id: number, next: number) => setItems((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(1, Math.min(item.available || 1, Number.isFinite(next) ? Math.trunc(next) : 1)) } : item))
  const submit = async () => {
    if (!selectedWarehouse || !pharmacy || items.length === 0 || submitting) return
    if (!deliveryEstimate) { setMessage(roadEstimate.error || 'Wait for the road route and route-based fee before submitting.'); return }
    const scheduledAt = scheduledDeliveryPayload(deliveryPreference, scheduledDeliveryAt)
    if (deliveryPreference === 'scheduled' && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) { setMessage('Choose a future delivery date and time before submitting.'); return }
    const key = idempotencyKey.current ?? (typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : `web-procurement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
    idempotencyKey.current = key
    setSubmitting(true)
    setMessage('')
    try {
      const response = await api.post('/procurement', {
        warehouse_id: Number(selectedWarehouse.id),
        delivery_address_snapshot: String(pharmacy.address ?? 'Pharmacy address not recorded'),
        delivery_preference: deliveryPreference,
        delivery_vehicle_type: deliveryVehicleType,
        scheduled_delivery_at: scheduledAt,
        items: items.map((item) => ({ medicine_id: item.id, quantity: item.quantity })),
      }, { headers: { 'Idempotency-Key': key } })
      idempotencyKey.current = null
      setItems([])
      setSelectedWarehouse(null)
      setWarehouseSearch('')
      setDeliveryPreference('asap')
      setDeliveryVehicleType('motorcycle')
      setScheduledDeliveryAt('')
      setActiveStep(1)
      if (onCreated) onCreated(response.data.procurement ?? {})
      else setMessage(response.data.message ?? 'Replenishment order submitted.')
    } catch (error) {
      setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to create the replenishment order.' : 'Unable to create the replenishment order.')
    } finally { setSubmitting(false) }
  }
  const steps = [
    { number: 1, label: 'Select warehouse', complete: Boolean(selectedWarehouse) },
    { number: 2, label: 'Select medicines', complete: items.length > 0 },
    { number: 3, label: 'Review delivery & cost', complete: false },
  ]

  return <section className="content replenishment-page"><section className="panel replenishment-shell">
    <div className="panel-heading replenishment-heading"><div><p className="eyebrow">PHARMACY INVENTORY</p><h1>Replenish inventory</h1><p className="muted">Choose a warehouse, add the medicines you need, then review delivery details and the complete cost.</p></div>{onBack && <button type="button" className="ghost-button" onClick={onBack}>Back to procurement</button>}</div>
    <ol className="replenishment-progress" aria-label="Replenishment steps">{steps.map((step) => <li className={`${activeStep === step.number ? 'current' : ''} ${step.complete ? 'complete' : ''}`} key={step.number}><button type="button" disabled={(step.number === 2 && !selectedWarehouse) || (step.number === 3 && items.length === 0)} aria-current={activeStep === step.number ? 'step' : undefined} onClick={() => setActiveStep(step.number)}><span>{step.complete ? <FileCheck2 size={16} aria-hidden="true" /> : step.number}</span><strong>{step.label}</strong></button></li>)}</ol>
    {loading ? <div className="state" role="status">Loading replenishment options...</div> : <>
      <section className={`replenishment-step ${activeStep === 1 ? 'expanded' : ''}`}><button type="button" className="replenishment-step-heading" onClick={() => setActiveStep(1)} aria-expanded={activeStep === 1}><span>1</span><div><strong>{selectedWarehouse ? String(selectedWarehouse.business_name) : 'Select warehouse'}</strong><small>{selectedWarehouse ? String(selectedWarehouse.address ?? 'Warehouse location selected') : 'Search approved warehouses that have active subscriptions.'}</small></div>{selectedWarehouse && <em>Selected</em>}<ChevronDown size={18} aria-hidden="true" /></button>{activeStep === 1 && <div className="replenishment-step-body"><label className="replenishment-search"><span>Search warehouses</span><span className="search-box"><Search size={18} aria-hidden="true" /><input role="combobox" aria-label="Search warehouses" aria-controls="warehouse-suggestions" aria-expanded={filteredWarehouses.length > 0} value={warehouseSearch} onChange={(event) => { setWarehouseSearch(event.target.value); if (selectedWarehouse && event.target.value !== selectedWarehouse.business_name) setSelectedWarehouse(null) }} placeholder="Warehouse name or location" /></span></label><div id="warehouse-suggestions" className="replenishment-suggestions" role="listbox" aria-label="Warehouse suggestions">{filteredWarehouses.length === 0 ? <span className="state">No warehouses match this search.</span> : filteredWarehouses.map((warehouse) => <button type="button" role="option" aria-selected={Number(selectedWarehouse?.id) === Number(warehouse.id)} key={String(warehouse.id)} onClick={() => selectWarehouse(warehouse)}><Package size={20} aria-hidden="true" /><span><strong>{String(warehouse.business_name ?? `Warehouse ${warehouse.id}`)}</strong><small>{String(warehouse.address ?? 'Address not recorded')}</small></span></button>)}</div>{selectedWarehouse && <div className="replenishment-next"><button type="button" className="primary-button" onClick={() => setActiveStep(2)}>Next: Select medicines <ChevronRight size={17} aria-hidden="true" /></button></div>}</div>}</section>
      <section className={`replenishment-step ${activeStep === 2 ? 'expanded' : ''}`}><button type="button" className="replenishment-step-heading" disabled={!selectedWarehouse} onClick={() => setActiveStep(2)} aria-expanded={activeStep === 2}><span>2</span><div><strong>Select medicines</strong><small>{items.length > 0 ? `${items.length} ${items.length === 1 ? 'medicine' : 'medicines'} added` : 'Add all required stock from the selected warehouse.'}</small></div>{items.length > 0 && <em>{items.length} added</em>}<ChevronDown size={18} aria-hidden="true" /></button>{activeStep === 2 && <div className="replenishment-step-body"><div className="replenishment-medicine-picker"><label className="replenishment-search"><span>Medicine</span><span className="search-box"><Search size={18} aria-hidden="true" /><input role="combobox" aria-label="Search warehouse medicines" aria-controls="warehouse-medicine-suggestions" aria-expanded={filteredMedicines.length > 0} value={medicineSearch} onChange={(event) => { setMedicineSearch(event.target.value); setSelectedMedicine(null) }} placeholder="Name, Arabic name, or manufacturer" /></span></label><label><span>Quantity</span><input aria-label="Replenishment quantity" type="number" min="1" max={Number(selectedMedicine?.available_quantity ?? 10000)} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} /></label><button type="button" className="add-medicine-button" disabled={!selectedMedicine} onClick={addMedicine}><Plus size={17} aria-hidden="true" /> Add medicine</button><div id="warehouse-medicine-suggestions" className="replenishment-suggestions medicine-results" role="listbox" aria-label="Warehouse medicine suggestions">{medicineSearch && filteredMedicines.map((medicine) => <button type="button" role="option" aria-selected={Number(selectedMedicine?.id) === Number(medicine.id)} key={String(medicine.id)} onClick={() => { setSelectedMedicine(medicine); setMedicineSearch(String(medicine.name_en ?? 'Medicine')); setQuantity(1) }}><Package size={18} aria-hidden="true" /><span><strong>{String(medicine.name_en ?? `Medicine ${medicine.id}`)}</strong><small>{String(medicine.manufacturer ?? '')} · {Number(medicine.available_quantity ?? 0)} available · {formatMedlineMoney(medicine.unit_price, 'SYP')}</small></span></button>)}</div></div><div className="replenishment-items">{items.length === 0 ? <div className="state">No medicines added yet.</div> : items.map((item, index) => <article key={item.id}><span className="replenishment-item-number">{index + 1}</span><div><strong>{item.name}</strong><small>{item.manufacturer || 'Manufacturer not recorded'} · {item.available} available</small></div><label><span>Quantity</span><input aria-label={`Quantity for ${item.name}`} type="number" min="1" max={item.available} value={item.quantity} onChange={(event) => updateQuantity(item.id, Number(event.target.value))} /></label><strong className="money-cell">{formatMedlineMoney(item.unitPrice * item.quantity, 'SYP')}</strong><button type="button" className="reject-button" aria-label={`Remove ${item.name}`} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 size={17} aria-hidden="true" /></button></article>)}</div>{items.length > 0 && <div className="replenishment-next"><button type="button" className="primary-button" onClick={() => setActiveStep(3)}>Next: Review delivery &amp; cost <ChevronRight size={17} aria-hidden="true" /></button></div>}</div>}</section>
      <section className={`replenishment-step ${activeStep === 3 ? 'expanded' : ''}`}><button type="button" className="replenishment-step-heading" disabled={items.length === 0} onClick={() => setActiveStep(3)} aria-expanded={activeStep === 3}><span>3</span><div><strong>Review delivery &amp; cost</strong><small>Delivery goes to your pharmacy’s registered location.</small></div><ChevronRight size={18} aria-hidden="true" /></button>{activeStep === 3 && <div className="replenishment-step-body"><div className="replenishment-route"><div><small>FROM WAREHOUSE</small><strong>{String(selectedWarehouse?.business_name ?? 'Warehouse')}</strong><span>{String(selectedWarehouse?.address ?? 'Address not recorded')}</span></div><ChevronRight size={20} aria-hidden="true" /><div><small>TO YOUR PHARMACY</small><strong>{String(pharmacy?.business_name ?? 'Your pharmacy')}</strong><span>{String(pharmacy?.address ?? 'Pharmacy address not recorded')}</span></div></div><DeliverySchedulePicker idPrefix="procurement" preference={deliveryPreference} scheduledAt={scheduledDeliveryAt} onPreferenceChange={(value) => { setDeliveryPreference(value); if (value === 'asap') setScheduledDeliveryAt('') }} onScheduledAtChange={setScheduledDeliveryAt} />{roadEstimate.error && <div className="form-error" role="alert">{roadEstimate.error}</div>}<div className="replenishment-delivery-metrics"><div><small>Road distance</small><strong>{roadEstimate.loading ? 'Calculating route…' : deliveryEstimate ? `${deliveryEstimate.distance_km.toFixed(2)} km` : 'Route unavailable'}</strong></div><div><small>Rate at submission</small><strong>{formatMedlineMoney(deliveryEstimate?.rate_per_km ?? ratePerKm, 'SYP')} / km</strong></div><div><small>Route-based fee</small><strong>{roadEstimate.loading ? '—' : formatMedlineMoney(deliveryFee, 'SYP')}</strong></div></div><div className="replenishment-cost-summary"><div><span>Medicines subtotal</span><strong>{formatMedlineMoney(subtotal, 'SYP')}</strong></div><div><span>Road-route delivery fee</span><strong>{formatMedlineMoney(deliveryFee, 'SYP')}</strong></div><div className="grand-total"><span>Total procurement cost</span><strong>{formatMedlineMoney(total, 'SYP')}</strong></div></div><div className="replenishment-submit"><span><strong>{items.length} {items.length === 1 ? 'medicine' : 'medicines'}</strong><small>{deliveryPreference === 'scheduled' && scheduledDeliveryAt ? `Requested for ${formatMedlineDate(new Date(scheduledDeliveryAt), 'en')}.` : 'The warehouse will review availability before delivery is created.'}</small></span><button type="button" className="primary-button" disabled={submitting || roadEstimate.loading || !deliveryEstimate || (deliveryPreference === 'scheduled' && !scheduledDeliveryAt)} onClick={() => void submit()}>{submitting ? 'Submitting...' : 'Create replenishment order'}</button></div></div>}</section>
    </>}
    {message && <div className="form-message" role="status">{message}</div>}
  </section></section>
}

function ProcurementCreatePanelLegacy({ section }: { section: string }) {
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

void ProcurementCreatePanelLegacy

export function PrescriptionReviewPanel({ section }: { section: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const load = async () => { try { const response = await api.get('/pharmacy/prescriptions', { params: { status: 'pending_review', per_page: 50 } }); setRows(response.data.data ?? []) } catch { setRows([]) } }
  useEffect(() => { if (section === 'orders') void load() }, [section])
  const review = async (row: Record<string, unknown>, decision: 'approve' | 'reject') => { const id = String(row.id); const note = String(notes[id] ?? '').trim(); if (decision === 'reject' && !note) { setMessage('Add a rejection reason for this medicine so the patient knows what to correct.'); return } setBusy(`${id}:${decision}`); setMessage(''); try { await api.post(`/pharmacy/prescriptions/${id}/review`, { decision, ...(note ? { note } : {}) }, mutationConfig('prescription-review', id, decision)); setMessage(`Prescription for ${String(row.name_en ?? 'medicine')} ${decision === 'approve' ? 'approved' : 'rejected'}.`); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to review prescription.' : 'Unable to review prescription.') } finally { setBusy(null) } }
  if (section !== 'orders') return null
  return <section className="content prescription-review-section"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">PHARMACY SAFETY REVIEW</p><h2>Item-specific prescriptions</h2><p className="muted">Each prescription is tied to one medicine and must be reviewed separately.</p></div><span className="live-status"><i /> Restricted access</span></div>{message && <div className="form-message" role="status">{message}</div>}<div className="prescription-review-list">{rows.length === 0 ? <div className="state">No prescriptions are waiting for review.</div> : rows.map((row) => { const id = String(row.id); return <article className="prescription-review-item" key={id}><div className="prescription-medicine"><button type="button" onClick={() => row.medicine_id && openMedicineDetail(Number(row.medicine_id))}>{String(row.name_en ?? 'Prescription medicine')}</button><span>{String(row.dosage ?? row.form ?? '')} · Quantity {String(row.quantity ?? '—')}</span><small>Order {String(row.order_public_id ?? row.order_id)}</small></div><span className="status-pill">{String(row.status).replaceAll('_', ' ')}</span><button type="button" className="ghost-button" onClick={() => void downloadPrivate(`/prescriptions/${id}/download`, `prescription-${String(row.order_public_id ?? row.order_id)}-${String(row.name_en ?? id)}`)}><Eye size={17} /> View prescription</button><label>Pharmacist note<textarea value={notes[id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [id]: event.target.value }))} placeholder="Required when rejecting" maxLength={1000} /></label><div className="row-actions"><button className="approve-button" disabled={busy !== null} onClick={() => void review(row, 'approve')}><FileCheck2 size={17} /> Approve</button><button className="reject-button" disabled={busy !== null} onClick={() => void review(row, 'reject')}><FileX2 size={17} /> Reject</button></div></article> })}</div></section></section>
}

void PrescriptionReviewPanelLegacy
function PrescriptionReviewPanelLegacy({ section }: { section: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [message, setMessage] = useState('')
  const load = async () => { try { const response = await api.get('/pharmacy/prescriptions', { params: { status: 'pending_review', per_page: 50 } }); setRows(response.data.data ?? []) } catch { setRows([]) } }
  useEffect(() => { if (section === 'orders') void load() }, [section])
  const review = async (id: number, decision: 'approve' | 'reject') => { try { await api.post(`/pharmacy/prescriptions/${id}/review`, { decision }, mutationConfig('prescription-review', id, decision)); setMessage(`Prescription ${decision === 'approve' ? 'approved' : 'rejected'}.`); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to review prescription.' : 'Unable to review prescription.') } }
  if (section !== 'orders') return null
  return <section className="content"><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">PHARMACY SAFETY REVIEW</p><h2>Prescription queue</h2><p className="muted">Review private prescription evidence before accepting the patient order.</p></div><span className="live-status"><i /> Restricted access</span></div>{message && <div className="form-success">{message}</div>}<div className="operations-table"><div className="table-row table-head"><span>Order</span><span>Submitted</span><span>Status</span><span>Action</span></div>{rows.length === 0 ? <div className="state">No prescriptions awaiting review.</div> : rows.map((row) => <div className="table-row" key={String(row.id)}><strong>{String(row.order_public_id ?? `Order ${row.order_id}`)}</strong><span>{String(row.created_at ?? '')}</span><span className="status-pill">{String(row.status)}</span><div className="row-actions"><button className="ghost-button" onClick={() => void downloadPrivate(`/prescriptions/${Number(row.id)}/download`, `medline-prescription-${row.id}`)}>View file</button><button className="approve-button" onClick={() => void review(Number(row.id), 'approve')}>Approve</button><button className="reject-button" onClick={() => void review(Number(row.id), 'reject')}>Reject</button></div></div>)}</div></section></section>
}

type WorkingShift = { day_of_week: number; opens_at: string; closes_at: string }

export function PharmacyWorkingHoursPanel() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const [shifts, setShifts] = useState<WorkingShift[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { api.get('/partner/working-hours').then((response) => setShifts((response.data.data ?? []).map((shift: Record<string, unknown>) => ({ day_of_week: Number(shift.day_of_week), opens_at: String(shift.opens_at ?? '').slice(0, 5), closes_at: String(shift.closes_at ?? '').slice(0, 5) })))).catch(() => setMessage('Unable to load pharmacy working hours.')).finally(() => setLoading(false)) }, [])
  const addShift = (day: number) => setShifts((current) => [...current, { day_of_week: day, opens_at: '09:00', closes_at: '17:00' }].sort((left, right) => left.day_of_week - right.day_of_week || left.opens_at.localeCompare(right.opens_at)))
  const updateShift = (day: number, index: number, field: 'opens_at' | 'closes_at', value: string) => setShifts((current) => { let dayIndex = -1; return current.map((shift) => { if (shift.day_of_week !== day) return shift; dayIndex += 1; return dayIndex === index ? { ...shift, [field]: value } : shift }) })
  const removeShift = (day: number, index: number) => setShifts((current) => { let dayIndex = -1; return current.filter((shift) => { if (shift.day_of_week !== day) return true; dayIndex += 1; return dayIndex !== index }) })
  const save = async () => { setSaving(true); setMessage(''); try { const response = await api.put('/partner/working-hours', { shifts }, mutationConfig('working-hours', 'pharmacy', uniqueMutationId('save'))); setMessage(response.data.message ?? 'Working hours updated.') } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Check that shifts do not overlap and each closing time is later than its opening time.' : 'Unable to update working hours.') } finally { setSaving(false) } }
  return <section className="content pharmacy-hours-section"><section className="panel pharmacy-hours-panel"><div className="panel-heading"><div><p className="eyebrow">PHARMACY AVAILABILITY</p><h2>Working hours</h2><p className="muted">Add multiple opening periods on the same day for split pharmacist shifts.</p></div><Clock3 size={23} aria-hidden="true" /></div>{loading ? <div className="state">Loading working hours...</div> : <div className="working-hours-list">{days.map((day, dayIndex) => { const dayShifts = shifts.filter((shift) => shift.day_of_week === dayIndex); return <section className="working-day" key={day}><div className="working-day-heading"><div><strong>{day}</strong><small>{dayShifts.length === 0 ? 'Closed' : `${dayShifts.length} ${dayShifts.length === 1 ? 'shift' : 'shifts'}`}</small></div><button type="button" className="ghost-button" onClick={() => addShift(dayIndex)}><Plus size={17} /> Add shift</button></div><div className="working-day-shifts">{dayShifts.length === 0 ? <span className="working-day-closed">No working hours</span> : dayShifts.map((shift, shiftIndex) => <div className="working-shift" key={`${day}-${shiftIndex}`}><label><span>Opens</span><input type="time" aria-label={`${day} shift ${shiftIndex + 1} opens`} value={shift.opens_at} onChange={(event) => updateShift(dayIndex, shiftIndex, 'opens_at', event.target.value)} /></label><span aria-hidden="true">to</span><label><span>Closes</span><input type="time" aria-label={`${day} shift ${shiftIndex + 1} closes`} value={shift.closes_at} onChange={(event) => updateShift(dayIndex, shiftIndex, 'closes_at', event.target.value)} /></label><button type="button" className="remove-shift-button" aria-label={`Remove ${day} shift ${shiftIndex + 1}`} title="Remove shift" onClick={() => removeShift(dayIndex, shiftIndex)}><Trash2 size={17} /></button></div>)}</div></section> })}</div>}<div className="pharmacy-hours-footer"><div>{message && <div className="form-message" role="status">{message}</div>}</div><button type="button" className="primary-button" disabled={saving || loading} onClick={() => void save()}>{saving ? 'Saving hours…' : 'Save working hours'}</button></div></section></section>
}

export function SettingsPage({ role, locale, onLocaleChange }: { role: string; locale: string; onLocaleChange: (locale: string) => void }) {
  const [preferences, setPreferences] = useState<Record<string, boolean>>({ in_app_enabled: true, push_enabled: true, email_enabled: true, sms_enabled: false })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [twoFactorSecret, setTwoFactorSecret] = useState('')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const busyPreferenceKeys = useRef(new Set<string>())
  void setTwoFactorSecret
  void twoFactorEnabled
  void setTwoFactorEnabled
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

export function AdminDeliveryPricingPanel({ locale }: { locale: string }) {
  const [rates, setRates] = useState<Array<Record<string, unknown>>>([])
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([])
  const [vehicleType, setVehicleType] = useState<DeliveryVehicleType>('motorcycle')
  const [newRate, setNewRate] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const applyPricingResponse = (data: Record<string, any>) => { setRates(Array.isArray(data.rates) ? data.rates : data.current ? [data.current] : []); setHistory(Array.isArray(data.all_history) ? data.all_history : Array.isArray(data.history) ? data.history : []) }
  const load = async () => { setLoading(true); setError(''); try { const response = await api.get('/admin/delivery-pricing'); applyPricingResponse(response.data) } catch (requestError) { setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to load delivery pricing.' : 'Unable to load delivery pricing.') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    setSaving(true); setMessage(''); setError('')
    try {
      const response = await api.post('/admin/delivery-pricing', { vehicle_type: vehicleType, rate_per_km: Number(newRate), reason: reason.trim() }, mutationConfig('delivery-pricing', vehicleType, uniqueMutationId('rate-change')))
      applyPricingResponse(response.data)
      setNewRate(''); setReason('')
      setMessage('Delivery rate updated. New orders will use the new rate; existing orders remain unchanged.')
    } catch (requestError) { setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to update the delivery rate.' : 'Unable to update the delivery rate.') }
    finally { setSaving(false) }
  }
  const displayedRate = Number(rates.find((rate) => String(rate.vehicle_type) === vehicleType)?.rate_per_km ?? DELIVERY_FEE_PER_KM_SYP)
  return <section className="content admin-delivery-pricing"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">DELIVERY PRICING</p><h2>Rates by vehicle type</h2><p className="muted">Each vehicle class has its own versioned rate. Existing orders retain the vehicle, rate, distance, and fee captured at creation.</p></div><span className="pricing-current-badge"><Truck size={18} aria-hidden="true" /><span>{deliveryVehicleLabel(vehicleType)} rate</span><strong>SYP {displayedRate.toLocaleString()} / km</strong></span></div>{loading ? <div className="state" role="status">Loading delivery pricing...</div> : <><div className="pricing-vehicle-grid" aria-label="Current rates">{DELIVERY_VEHICLE_TYPES.map((type) => <button type="button" className={vehicleType === type ? 'selected' : ''} key={type} onClick={() => { setVehicleType(type); setNewRate(''); setMessage(''); setError('') }}><Truck size={18} aria-hidden="true" /><span><small>{deliveryVehicleLabel(type)}</small><strong>SYP {Number(rates.find((rate) => rate.vehicle_type === type)?.rate_per_km ?? 0).toLocaleString()} / km</strong></span></button>)}</div><form className="delivery-pricing-form" onSubmit={submit}><label htmlFor="delivery-rate-vehicle">Vehicle type<select id="delivery-rate-vehicle" value={vehicleType} onChange={(event) => { setVehicleType(event.target.value as DeliveryVehicleType); setNewRate('') }}>{DELIVERY_VEHICLE_TYPES.map((type) => <option value={type} key={type}>{deliveryVehicleLabel(type)}</option>)}</select></label><label htmlFor="delivery-rate-per-km">New rate per kilometre (SYP)<input id="delivery-rate-per-km" type="number" min="0.01" max="1000000" step="0.01" inputMode="decimal" value={newRate} onChange={(event) => setNewRate(event.target.value)} placeholder={displayedRate.toString()} required /></label><label htmlFor="delivery-rate-reason">Reason for change<textarea id="delivery-rate-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={1000} placeholder={`Explain why the ${deliveryVehicleLabel(vehicleType).toLowerCase()} rate is changing`} required /></label><button className="primary-button" disabled={saving || !newRate || reason.trim().length < 5 || Math.abs(Number(newRate) - displayedRate) < .005}>{saving ? 'Saving rate...' : `Update ${deliveryVehicleLabel(vehicleType)} rate`}</button></form>{message && <div className="form-success" role="status">{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}<div className="pricing-history-heading"><div><p className="eyebrow">CHANGE HISTORY</p><h3>Delivery-rate audit trail</h3></div><span>{history.length} {history.length === 1 ? 'version' : 'versions'}</span></div><div className="pricing-history-table" role="table" aria-label="Delivery pricing change history"><div className="pricing-history-row pricing-history-head" role="row"><span role="columnheader">Vehicle / rate</span><span role="columnheader">Changed by</span><span role="columnheader">Reason</span><span role="columnheader">Effective from</span></div>{history.map((entry) => <div className="pricing-history-row" role="row" key={String(entry.id)}><strong role="cell"><span>{deliveryVehicleLabel(entry.vehicle_type)}</span>SYP {Number(entry.rate_per_km ?? 0).toLocaleString()} / km{rates.some((rate) => Number(rate.id) === Number(entry.id)) && <small>Current</small>}</strong><span role="cell">{String(entry.changed_by_name ?? 'System')}<small>{String(entry.changed_by_email ?? 'Initial configuration')}</small></span><span role="cell">{String(entry.reason ?? 'No reason recorded')}</span><time role="cell" dateTime={String(entry.effective_at ?? '')}>{formatMedlineDate(entry.effective_at, locale)}</time></div>)}</div></>}</section></section>
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
  const [proof, setProof] = useState<File | null>(null)
  const [plans, setPlans] = useState<Array<Record<string, unknown>>>([])
  const [planError, setPlanError] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const partner = role === 'pharmacy' || role === 'warehouse'
  const plan = plans.find((item) => item.partner_type === role)
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    api.get('/subscription-plans')
      .then((response) => { setPlans(response.data.data ?? []); setPlanError('') })
      .catch(() => setPlanError('Subscription pricing is temporarily unavailable. Please retry before registering a pharmacy or warehouse.'))
  }, [])
  useEffect(() => {
    if (partner && plan?.amount !== null && plan?.amount !== undefined) update('payment_amount', String(plan.amount))
  }, [partner, plan?.amount])

  const chooseRole = (value: string) => {
    setRole(value)
    setProof(null)
    setError('')
    setMessage('')
    setForm((current) => ({
      name: current.name ?? '', email: current.email ?? '', phone: current.phone ?? '',
      password: current.password ?? '', password_confirmation: current.password_confirmation ?? '',
    }))
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (partner && (!plan || !proof)) { setError(!plan ? 'The subscription plan could not be loaded.' : 'Upload your payment receipt.'); return }
    setLoading(true)
    try {
      const values = { ...form, role, transport: 'cookie' }
      const payload: FormData | Record<string, string> = partner ? new FormData() : values
      if (payload instanceof FormData) {
        Object.entries(values).forEach(([key, value]) => payload.append(key, value))
        payload.append('payment_proof', proof as File)
      }
      const response = await api.post('/auth/register', payload)
      setMessage(response.data.message ?? 'Registration submitted.')
      if (response.data.token) {
        localStorage.setItem('medline_token', response.data.token)
        localStorage.removeItem('medline_refresh_token')
        onAuthenticated(response.data.user ?? {}, response.data.token)
      }
    } catch (requestError) {
      const data = axios.isAxiosError(requestError) ? requestError.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined : undefined
      const details = Object.entries(data?.errors ?? {}).map(([field, entries]) => `${field.replaceAll('_', ' ')}: ${entries.join(' ')}`).join(' · ')
      setError(details || data?.message || 'Unable to submit registration. Please try again.')
    } finally { setLoading(false) }
  }

  return <div className="registration-page"><div className="registration-shell">
    <aside className="registration-intro"><div className="brand login-brand"><div className="brand-mark">M</div><div><strong>MedLine</strong><span>Healthcare logistics</span></div></div><p className="eyebrow">JOIN THE NETWORK</p><h1>Create your MedLine account</h1><p className="muted">Select your role to see exactly what is required.</p><div className="registration-benefits"><div><strong>No subscription for patients or drivers</strong><span>Create the relevant profile without any subscription payment.</span></div><div><strong>Verified subscriptions</strong><span>Pharmacies and warehouses upload a receipt for administrator review.</span></div><div><strong>Clear correction workflow</strong><span>If a receipt needs correction, the administrator provides a comment before resubmission.</span></div></div></aside>
    <section className="registration-card"><div className="registration-card-heading"><div><p className="eyebrow">NEW REGISTRATION</p><h2>Tell us about yourself</h2></div><button type="button" className="text-button" onClick={onBack}>Back to sign in</button></div>
      <div className="registration-role-grid">{[['patient', 'Patient', 'No subscription'], ['pharmacy', 'Pharmacy', 'Subscription required'], ['warehouse', 'Warehouse', 'Subscription required'], ['driver', 'Driver', 'No subscription']].map(([value, label, hint]) => <button type="button" className={`registration-role ${role === value ? 'selected' : ''}`} key={value} onClick={() => chooseRole(value)}><strong>{label}</strong><span>{hint}</span></button>)}</div>
      <form className="registration-form" onSubmit={submit}>
        <div className="form-section-heading"><span>Account details</span><small>Required for every user</small></div>
        <div className="registration-grid"><label>Full name<input value={form.name ?? ''} onChange={(event) => update('name', event.target.value)} required minLength={2} /></label><label>Email address<input type="email" value={form.email ?? ''} onChange={(event) => update('email', event.target.value)} required /></label><label>Phone number<input value={form.phone ?? ''} onChange={(event) => update('phone', event.target.value)} /></label><label>Password<input type="password" value={form.password ?? ''} onChange={(event) => update('password', event.target.value)} required minLength={8} /></label><label>Confirm password<input type="password" value={form.password_confirmation ?? ''} onChange={(event) => update('password_confirmation', event.target.value)} required minLength={8} /></label></div>
        {partner && <><div className="form-section-heading"><span>{role === 'pharmacy' ? 'Pharmacy' : 'Warehouse'} details</span><small>Used for verification and deliveries</small></div><div className="registration-grid"><label>Business name<input value={form.business_name ?? ''} onChange={(event) => update('business_name', event.target.value)} required /></label><label>License number<input value={form.license_number ?? ''} onChange={(event) => update('license_number', event.target.value)} required /></label><label className="registration-span-2">Registered address<input value={form.address ?? ''} onChange={(event) => update('address', event.target.value)} required /></label></div><div className="form-section-heading"><span>Registered location</span><small>Click the map to set the exact point</small></div><RegistrationMapPicker latitude={form.latitude ?? ''} longitude={form.longitude ?? ''} onChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))} /><div className="registration-grid coordinates"><label>Latitude<input value={form.latitude ?? ''} onChange={(event) => update('latitude', event.target.value)} required inputMode="decimal" /></label><label>Longitude<input value={form.longitude ?? ''} onChange={(event) => update('longitude', event.target.value)} required inputMode="decimal" /></label></div><div className="form-section-heading"><span>Initial subscription payment</span><small>{plan ? `${String(plan.duration_months)} months · administrator approval required` : 'Loading plan...'}</small></div>{planError && <div className="form-error">{planError}</div>}<div className="registration-grid"><label>Exact amount (SYP)<input value={form.payment_amount ?? ''} readOnly aria-readonly="true" required /><small className="field-help">This configured amount cannot be changed.</small></label><label>Payment receipt<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setProof(event.target.files?.[0] ?? null)} required /><small className="field-help">JPG, PNG, or PDF showing the exact amount paid.</small></label></div></>}
        {role === 'driver' && <><div className="form-section-heading"><span>Driver details</span><small>No subscription payment is required</small></div><div className="registration-grid"><label>National ID<input value={form.national_id ?? ''} onChange={(event) => update('national_id', event.target.value)} required /></label><label>Vehicle type<input value={form.vehicle_type ?? ''} onChange={(event) => update('vehicle_type', event.target.value)} required /></label><label>Vehicle plate<input value={form.vehicle_plate ?? ''} onChange={(event) => update('vehicle_plate', event.target.value)} required /></label></div></>}
        {message && <div className="form-success" role="status">{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}<div className="registration-submit"><span>{partner ? 'Your access starts only after administrator approval.' : 'This role does not require a subscription.'}</span><button className="primary-button" disabled={loading || (partner && !plan)}>{loading ? 'Submitting...' : partner ? 'Submit registration and payment' : 'Create account'}</button></div>
      </form>
    </section>
  </div></div>
}

function RegistrationPageLegacy({ onBack, onAuthenticated }: { onBack: () => void; onAuthenticated: (user: Record<string, unknown>, token: string) => void }) {
  const [role, setRole] = useState('patient')
  const [form, setForm] = useState<Record<string, string>>({})
  const [paymentProof, setPaymentProof] = useState<File | null>(null)
  const [plans, setPlans] = useState<Array<Record<string, unknown>>>([])
  const [planError, setPlanError] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const partner = role === 'pharmacy' || role === 'warehouse'
  const selectedPlan = plans.find((plan) => plan.partner_type === role)
  useEffect(() => { api.get('/subscription-plans').then((response) => { setPlans(response.data.data ?? []); setPlanError('') }).catch(() => setPlanError('Subscription pricing is temporarily unavailable. Please try again before registering a pharmacy or warehouse.')) }, [])
  useEffect(() => { if (partner && selectedPlan?.amount !== null && selectedPlan?.amount !== undefined) setForm((current) => ({ ...current, payment_amount: String(selectedPlan.amount) })) }, [partner, selectedPlan?.amount])
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const chooseRole = (value: string) => { setRole(value); setPaymentProof(null); setError(''); setMessage(''); setForm((current) => ({ name: current.name ?? '', email: current.email ?? '', phone: current.phone ?? '', password: current.password ?? '', password_confirmation: current.password_confirmation ?? '' })) }
  void planError
  void chooseRole
  const highlightErrors = (errors: Record<string, string[]>) => { const aliases: Record<string, string[]> = { name: ['full name'], email: ['email address'], phone: ['phone number'], password_confirmation: ['confirm password'], password: ['password'], business_name: ['business name'], license_number: ['license number'], address: ['registered address'], latitude: ['latitude'], longitude: ['longitude'], national_id: ['national id'], vehicle_type: ['vehicle type'], vehicle_plate: ['vehicle plate'], payment_amount: ['payment amount'], payment_proof: ['payment proof'] }; document.querySelectorAll('.registration-form label').forEach((label) => { const text = label.textContent?.toLowerCase() ?? ''; const field = Object.keys(aliases).find((key) => aliases[key].some((alias) => text.includes(alias))); const input = label.querySelector('input'); if (input) input.classList.toggle('registration-invalid', Boolean(field && errors[field])) }) }
  const validateBeforeSubmit = () => { const errors: Record<string, string[]> = {}; const required = ['name', 'email', 'password', 'password_confirmation', ...(partner ? ['business_name', 'license_number', 'address', 'latitude', 'longitude', 'payment_amount'] : []), ...(role === 'driver' ? ['national_id', 'vehicle_type', 'vehicle_plate'] : [])]; required.forEach((field) => { if (!String(form[field] ?? '').trim()) errors[field] = ['This field is required.'] }); if (partner && !paymentProof) errors.payment_proof = ['Payment proof is required.']; if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errors.email = ['Enter a valid email address.']; if (form.password && form.password.length < 8) errors.password = ['Use at least 8 characters.']; if (form.password !== form.password_confirmation) errors.password_confirmation = ['Passwords do not match.']; if (partner) { const latitude = Number(form.latitude); const longitude = Number(form.longitude); if (form.latitude && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) errors.latitude = ['Enter a latitude between -90 and 90.']; if (form.longitude && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) errors.longitude = ['Enter a longitude between -180 and 180.']; } return errors }
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); setMessage(''); document.querySelectorAll('.registration-invalid').forEach((input) => input.classList.remove('registration-invalid')); const localErrors = validateBeforeSubmit(); if (Object.keys(localErrors).length) { highlightErrors(localErrors); setError(Object.entries(localErrors).map(([field, messages]) => `${field.replaceAll('_', ' ')}: ${messages.join(' ')}`).join(' · ')); return } setLoading(true); try { const payload = partner ? new FormData() : { ...form, role, transport: 'cookie' }; if (partner) { Object.entries({ ...form, role, transport: 'cookie' }).forEach(([key, value]) => (payload as FormData).append(key, value)); (payload as FormData).append('payment_proof', paymentProof as File) } const response = await api.post('/auth/register', payload, partner ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined); if (!response.data.token) { setMessage(response.data.message ?? 'Registration submitted for administrator approval.'); return } localStorage.setItem('medline_token', response.data.token); localStorage.removeItem('medline_refresh_token'); setMessage(response.data.message ?? 'Registration submitted.'); onAuthenticated(response.data.user ?? {}, response.data.token) } catch (requestError) { if (axios.isAxiosError(requestError)) { const data = requestError.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined; const errors = data?.errors ?? {}; highlightErrors(errors); const details = Object.entries(errors).map(([field, messages]) => `${field.replaceAll('_', ' ')}: ${messages.join(' ')}`).join(' · '); const status = requestError.response?.status; setError(details || data?.message || (status ? `Registration failed (HTTP ${status}). Please review the form and try again.` : 'Cannot reach the MedLine server. Start the Laravel API on http://127.0.0.1:8000 and try again.')) } else setError('Cannot reach the MedLine server. Start the Laravel API on http://127.0.0.1:8000 and try again.') } finally { setLoading(false) } }
  return <div className="registration-page"><div className="registration-shell"><div className="registration-intro"><div className="brand login-brand"><div className="brand-mark">M</div><div><strong>MedLine</strong><span>Healthcare logistics</span></div></div><p className="eyebrow">JOIN THE NETWORK</p><h1>Create your MedLine account</h1><p className="muted">Choose your role and provide the details needed to activate your healthcare operations profile.</p><div className="registration-benefits"><div><strong>One secure account</strong><span>Use the same identity across portal and mobile.</span></div><div><strong>Verified operations</strong><span>Pharmacy, warehouse, and driver applications are reviewed before access.</span></div><div><strong>Location-ready delivery</strong><span>Pin approved pharmacy and warehouse locations directly on OpenStreetMap.</span></div></div></div><section className="registration-card"><div className="registration-card-heading"><div><p className="eyebrow">NEW REGISTRATION</p><h2>Tell us about yourself</h2></div><button type="button" className="text-button" onClick={onBack}>Back to sign in</button></div><div className="registration-role-grid">{[['patient', 'Customer', 'Order medicines and track deliveries'], ['pharmacy', 'Pharmacy', 'Fulfil prescriptions and request stock'], ['warehouse', 'Warehouse', 'Supply approved pharmacy partners'], ['driver', 'Driver', 'Deliver orders and update trips']].map(([value, label, hint]) => <button type="button" className={`registration-role ${role === value ? 'selected' : ''}`} key={value} onClick={() => { setRole(value); setForm(value === 'pharmacy' ? { payment_amount: '12000' } : value === 'warehouse' ? { payment_amount: '24000' } : {}); setPaymentProof(null) }}><strong>{label}</strong><span>{hint}</span></button>)}</div><form className="registration-form" onSubmit={submit}><div className="form-section-heading"><span>Account details</span><small>Required for every user</small></div><div className="registration-grid"><label>Full name<input value={form.name ?? ''} onChange={(event) => update('name', event.target.value)} required minLength={2} placeholder="Your full name" /></label><label>Email address<input type="email" value={form.email ?? ''} onChange={(event) => update('email', event.target.value)} required placeholder="you@example.com" /></label><label>Phone number<input value={form.phone ?? ''} onChange={(event) => update('phone', event.target.value)} placeholder="+963..." /></label><label>Password<input type="password" value={form.password ?? ''} onChange={(event) => update('password', event.target.value)} required minLength={8} placeholder="At least 8 characters" /></label><label>Confirm password<input type="password" value={form.password_confirmation ?? ''} onChange={(event) => update('password_confirmation', event.target.value)} required minLength={8} placeholder="Repeat your password" /></label></div>{partner && <><div className="form-section-heading"><span>{role === 'pharmacy' ? 'Pharmacy details' : 'Warehouse details'}</span><small>Used for verification and deliveries</small></div><div className="registration-grid"><label>Business name<input value={form.business_name ?? ''} onChange={(event) => update('business_name', event.target.value)} required placeholder={role === 'pharmacy' ? 'Central Pharmacy' : 'United Medical Warehouse'} /></label><label>License number<input value={form.license_number ?? ''} onChange={(event) => update('license_number', event.target.value)} required placeholder="Official license number" /></label><label className="registration-span-2">Registered address<input value={form.address ?? ''} onChange={(event) => update('address', event.target.value)} required placeholder="Street, district, city" /></label></div><div className="form-section-heading"><span>Registered location</span><small>Click the map to set the exact point</small></div><RegistrationMapPicker latitude={form.latitude ?? ''} longitude={form.longitude ?? ''} onChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))} /><div className="registration-grid coordinates"><label>Latitude<input value={form.latitude ?? ''} onChange={(event) => update('latitude', event.target.value)} required inputMode="decimal" /></label><label>Longitude<input value={form.longitude ?? ''} onChange={(event) => update('longitude', event.target.value)} required inputMode="decimal" /></label></div><div className="form-section-heading"><span>Initial subscription</span><small>Required for pharmacy and warehouse registration · valid for one year after approval</small></div><div className="registration-grid"><label>Payment amount (SYP) (Required)<input type="number" min="0" step="0.01" value={form.payment_amount ?? ''} onChange={(event) => update('payment_amount', event.target.value)} required placeholder="12,000 SYP" /></label><label>Payment proof (Required)<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setPaymentProof(event.target.files?.[0] ?? null)} required /></label></div></>}{role === 'driver' && <><div className="form-section-heading"><span>Driver details</span><small>Required for delivery review</small></div><div className="registration-grid"><label>National ID<input value={form.national_id ?? ''} onChange={(event) => update('national_id', event.target.value)} required placeholder="Government ID" /></label><label>Vehicle type<input value={form.vehicle_type ?? ''} onChange={(event) => update('vehicle_type', event.target.value)} required placeholder="Motorcycle, car, van..." /></label><label>Vehicle plate<input value={form.vehicle_plate ?? ''} onChange={(event) => update('vehicle_plate', event.target.value)} required placeholder="Plate number" /></label></div></>}{message && <div className="form-success">{message}</div>}{error && <div className="form-error">{error}</div>}<div className="registration-submit"><span>By registering, you agree to MedLine verification and privacy procedures.</span><button className="primary-button" disabled={loading}>{loading ? 'Submitting...' : 'Create account'}</button></div></form></section></div></div>
}

void RegistrationPageLegacy

export function LoginPage({ locale, onAuthenticated, onLocaleChange }: { locale: string; onAuthenticated: (user: Record<string, unknown>) => void; onLocaleChange: (locale: 'en' | 'ar') => void }) {
  const authLink = useRef(new URLSearchParams(window.location.search)).current
  const linkedResetToken = authLink.get('recovery') === 'password' ? authLink.get('token') ?? '' : ''
  const [email, setEmail] = useState(authLink.get('recovery') === 'password' ? authLink.get('email') ?? '' : '')
  const [password, setPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(authLink.get('recovery') === 'password')
  const [resetRequested, setResetRequested] = useState(linkedResetToken.length === 64)
  const [resetToken, setResetToken] = useState(linkedResetToken)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirmation, setResetConfirmation] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const text = (key: string) => tr(key, locale)
  const switchLocale = () => {
    const nextLocale = locale === 'ar' ? 'en' : 'ar'
    localStorage.setItem('medline_locale', nextLocale)
    localStorage.setItem('medline_locale_explicit', 'true')
    document.documentElement.lang = nextLocale
    document.documentElement.dir = nextLocale === 'ar' ? 'rtl' : 'ltr'
    onLocaleChange(nextLocale)
  }
  const login = async (event: FormEvent) => { event.preventDefault(); setError(''); setLoading(true); try { const response = await api.post('/auth/login', { email, password, transport: 'cookie' }); localStorage.setItem('medline_token', response.data.token); localStorage.removeItem('medline_refresh_token'); onAuthenticated(response.data.user ?? {}) } catch (requestError) { setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to sign in.' : 'Unable to sign in.') } finally { setLoading(false) } }
  const requestReset = async (event: FormEvent) => { event.preventDefault(); setError(''); setLoading(true); try { const response = await api.post('/auth/forgot-password', { email }); setRecoveryMessage(response.data.message ?? 'Recovery instructions have been sent if the account exists.'); setResetRequested(true) } catch (requestError) { setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to request password recovery.' : 'Unable to request password recovery.') } finally { setLoading(false) } }
  const clearAuthLink = () => { window.history.replaceState({}, '', window.location.pathname); window.dispatchEvent(new PopStateEvent('popstate')) }
  const completeReset = async (event: FormEvent) => { event.preventDefault(); setError(''); setLoading(true); try { const response = await api.post('/auth/reset-password', { email, token: resetToken, password: resetPassword, password_confirmation: resetConfirmation }); setRecoveryMessage(response.data.message ?? 'Password reset successfully.'); setRecoveryMode(false); setResetToken(''); setResetPassword(''); setResetConfirmation(''); clearAuthLink() } catch (requestError) { setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to reset password.' : 'Unable to reset password.') } finally { setLoading(false) } }
  return <div className="login-page"><div className="login-card"><div className="login-language-row"><button type="button" className="login-language-toggle" onClick={switchLocale} aria-label={text('switchLanguage')}><Languages size={17} aria-hidden="true" /><span>{locale === 'ar' ? 'English' : 'العربية'}</span></button></div><div className="brand login-brand"><div className="brand-mark">M</div><div><strong>MedLine</strong><span>{text('healthcareLogistics')}</span></div></div><p className="eyebrow">{text('secureOperations')}</p><h1>{recoveryMode ? (resetRequested ? text('resetYourPassword') : text('recoverPassword')) : text('welcomeBack')}</h1><p className="muted">{recoveryMode ? (resetRequested ? text('resetHint') : text('recoveryHint')) : text('signInWorkspace')}</p>{recoveryMode ? (resetRequested ? <form onSubmit={completeReset}><label>{text('emailAddress')}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>{text('resetToken')}<input value={resetToken} onChange={(event) => setResetToken(event.target.value)} minLength={64} required /></label><label>{text('newPassword')}<input type="password" autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={8} required /></label><label>{text('confirmPassword')}<input type="password" autoComplete="new-password" value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} minLength={8} required /></label>{recoveryMessage && <div className="form-success">{recoveryMessage}</div>}{error && <div className="form-error">{error}</div>}<button className="primary-button login-button" disabled={loading}>{loading ? text('resetting') : text('resetPassword')}</button><button type="button" className="text-button" onClick={() => { setRecoveryMode(false); setResetRequested(false); setError(''); setRecoveryMessage(''); clearAuthLink() }}>{text('backToSignIn')}</button></form> : <form onSubmit={requestReset}><label>{text('emailAddress')}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{recoveryMessage && <div className="form-success">{recoveryMessage}</div>}{error && <div className="form-error">{error}</div>}<button className="primary-button login-button" disabled={loading}>{loading ? text('sending') : text('sendRecovery')}</button><button type="button" className="text-button" onClick={() => { setRecoveryMode(false); setError(''); setRecoveryMessage(''); clearAuthLink() }}>{text('backToSignIn')}</button></form>) : <form onSubmit={login}><label>{text('emailAddress')}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@medline.local" required /></label><label>{text('password')}<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={text('passwordPlaceholder')} required /></label><label>{text('authCodeLabel')}<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value)} placeholder={text('optionalCode')} /></label>{recoveryMessage && <div className="form-success">{recoveryMessage}</div>}{error && <div className="form-error">{error}</div>}<button className="primary-button login-button" disabled={loading}>{loading ? text('signingIn') : text('signIn')}</button><div className="login-form-actions"><a className="login-secondary-action" href="/register">{text('createAccount')}</a><button type="button" className="text-button login-secondary-action" onClick={() => { setRecoveryMode(true); setResetRequested(false); setError(''); setRecoveryMessage('') }}>{text('forgotPassword')}</button></div></form>}</div></div>
}

export function MedicineDetailPage({ medicineId, onBack, locale }: { medicineId: number; onBack: () => void; locale: string }) {
  const [medicine, setMedicine] = useState<Record<string, any> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { setMedicine(null); setError(''); api.get(`/medicines/${medicineId}`).then((response) => setMedicine(response.data.medicine ?? response.data)).catch((loadError) => setError(axios.isAxiosError(loadError) ? loadError.response?.data?.message ?? 'Unable to load medicine details.' : 'Unable to load medicine details.')) }, [medicineId])
  if (error) return <section className="content medicine-detail-page"><button className="ghost-button" onClick={onBack}>Back</button><div className="form-error">{error}</div></section>
  if (!medicine) return <section className="content medicine-detail-page"><div className="state">Loading medicine information...</div></section>
  const category = (medicine.category ?? {}) as Record<string, unknown>
  const pharmacies = Array.isArray(medicine.available_at) ? medicine.available_at as Array<Record<string, unknown>> : []
  const detailSections = [
    ['Description', medicine.description, 'General product information has not been provided yet.'],
    ['Uses and indications', medicine.indications, 'Indications have not been provided.'],
    ['Directions', medicine.directions, 'Follow the prescriber or pharmacist instructions.'],
    ['Possible side effects', medicine.side_effects, 'Side-effect information has not been provided.'],
    ['Warnings and precautions', medicine.warnings, 'Consult a healthcare professional before use.'],
    ['Contraindications', medicine.contraindications, 'Contraindication information has not been provided.'],
    ['Drug interactions', medicine.drug_interactions, 'Tell your pharmacist about all medicines and supplements you use.'],
    ['Storage', medicine.storage_instructions, 'Store according to the package instructions and keep out of reach of children.'],
  ]
  return <section className="content medicine-detail-page"><button className="medicine-back-button" type="button" onClick={onBack}>← Back to catalog</button><div className="medicine-detail-hero"><div className="medicine-image-frame">{medicine.image_url ? <img src={String(medicine.image_url)} alt={`Package of ${String(medicine.name_en)}`} /> : <div className="medicine-image-placeholder" aria-label="Medicine image unavailable"><span>Rx</span><small>Image unavailable</small></div>}</div><div className="medicine-hero-copy"><p className="eyebrow">{String(category.name_en ?? 'MEDICINE')}</p><h1>{String(medicine.name_en)}</h1><p className="medicine-arabic-name" lang="ar" dir="rtl">{String(medicine.name_ar ?? '')}</p><p className="medicine-description-lead">{String(medicine.description ?? 'Detailed medicine information and pharmacy availability.')}</p><div className="medicine-fact-pills"><span><strong>Active ingredient</strong>{String(medicine.active_ingredient ?? 'Not specified')}</span><span><strong>Strength</strong>{String(medicine.dosage ?? 'Not specified')}</span><span><strong>Form</strong>{String(medicine.form ?? 'Not specified')}</span><span><strong>Route</strong>{String(medicine.administration_route ?? 'Not specified')}</span><span><strong>Pack size</strong>{String(medicine.pack_size ?? 'Not specified')}</span><span><strong>Manufacturer</strong>{String(medicine.manufacturer ?? 'Not specified')}</span></div><div className={`medicine-prescription-callout ${medicine.prescription_required ? 'required' : 'not-required'}`}><ShieldCheck size={20} aria-hidden="true" /><div><strong>{medicine.prescription_required ? 'Prescription required' : 'No prescription required'}</strong><span>{medicine.prescription_required ? 'A separate prescription must be uploaded for this medicine when ordering.' : 'A pharmacy may still provide usage guidance before fulfilment.'}</span></div></div></div></div><div className="medicine-detail-layout"><div className="medicine-information-stack">{detailSections.map(([heading, value, fallback]) => <section className="panel medicine-information-card" key={String(heading)}><h2>{String(heading)}</h2><p className={value ? '' : 'muted'}>{String(value ?? fallback)}</p></section>)}<div className="medicine-safety-note"><ShieldCheck size={20} aria-hidden="true" /><p><strong>Safety note</strong>This catalog supports informed ordering but does not replace advice from a doctor or pharmacist. Seek urgent medical help for severe or unexpected reactions.</p></div></div><aside className="panel medicine-availability-card"><p className="eyebrow">AVAILABILITY</p><h2>Available pharmacies</h2><p className="muted">Prices and quantities reflect current available inventory.</p>{pharmacies.length === 0 ? <div className="state">No approved pharmacy currently lists this medicine.</div> : <div className="medicine-pharmacy-list">{pharmacies.map((pharmacy) => <div key={String(pharmacy.id)}><strong>{String(pharmacy.business_name)}</strong><span>{String(pharmacy.address ?? 'Address not provided')}</span><small>{String(pharmacy.available_quantity)} available · {formatMedlineMoney(pharmacy.unit_price, 'SYP', locale)}</small></div>)}</div>}<a className="primary-button" href="/orders"><ShoppingCart size={17} /> Start an order</a><dl className="medicine-reference"><div><dt>Product code</dt><dd>{String(medicine.code ?? 'Not provided')}</dd></div><div><dt>Catalog status</dt><dd>{medicine.is_active ? 'Active' : 'Inactive'}</dd></div></dl></aside></div></section>
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
  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.search-panel .medicine-card'))
    const cleanups = cards.map((card, index) => {
      const medicine = medicines[index]
      if (!medicine) return () => undefined
      card.setAttribute('role', 'button')
      card.setAttribute('tabindex', '0')
      card.setAttribute('aria-label', `View details for ${medicine.name_en}`)
      const open = () => openMedicineDetail(medicine.id)
      const keyboard = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open() } }
      card.addEventListener('click', open)
      card.addEventListener('keydown', keyboard)
      return () => { card.removeEventListener('click', open); card.removeEventListener('keydown', keyboard) }
    })
    return () => cleanups.forEach((cleanup) => cleanup())
  }, [medicines])
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">MEDLINE OPERATIONS</p><h1>{roleTitle}</h1><p className="muted">{tr('guidance', locale)}</p></div></div><div className="metric-grid"><Metric label="Active orders" value="0" change="Live" icon={<ClipboardList />} tone="blue" /><Metric label="Pending verification" value="0" change="Live" icon={<ShieldCheck />} tone="violet" /><Metric label="In delivery" value="0" change="Live" icon={<Truck />} tone="orange" /><Metric label="Registered partners" value="0" change="Live" icon={<Users />} tone="green" /></div><div className="dashboard-grid"><section className="panel search-panel"><div className="panel-heading"><div><p className="eyebrow">{tr('catalog', locale)}</p><h2>{tr('medicineSearch', locale)}</h2></div></div><div className="search-box"><Search size={19} aria-hidden="true" /><input aria-label={tr('medicineSearch', locale)} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('searchPlaceholder', locale)} /></div>{suggestions.length > 0 && <div className="suggestion-list" aria-label={tr('medicineSearch', locale)}>{suggestions.slice(0, 5).map((suggestion) => <button type="button" className="suggestion-chip" key={String(suggestion.id)} onClick={() => selectSuggestion(String(suggestion.name_en ?? ''))}>{String(suggestion.name_en ?? suggestion.name_ar ?? tr('medicineSearch', locale))}<small>{String(suggestion.match_score ?? '')}</small></button>)}</div>}<div className="medicine-list" aria-busy={loading}>{loading ? <div className="state" role="status">{tr('searching', locale)}</div> : medicines.length === 0 ? <div className="state" role="status">{tr('noMedicines', locale)}</div> : medicines.map((medicine) => <div className="medicine-card" key={medicine.id}><div className="medicine-icon" aria-hidden="true">Rx</div><div className="medicine-info"><strong>{medicine.name_en}</strong><span>{medicine.name_ar} · {medicine.manufacturer ?? tr('manufacturerPending', locale)}</span></div><div className="medicine-tag">{medicine.prescription_required ? tr('prescription', locale) : tr('noPrescription', locale)}</div><ChevronRight size={17} aria-hidden="true" className="chevron" /></div>)}</div>{medicines.length === 0 && emptySuggestions.length > 0 && <div className="empty-suggestions"><span>{tr('tryInstead', locale)}</span>{emptySuggestions.map((suggestion) => <button type="button" className="text-button" key={suggestion} onClick={() => selectSuggestion(suggestion)}>{suggestion}</button>)}</div>}</section><section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">{tr('operations', locale)}</p><h2>{tr('roleMetrics', locale)}</h2></div><span className="live-status" role="status"><i aria-hidden="true" /> {tr('liveData', locale)}</span></div><Activity icon="OK" title={`${String(metrics.orders ?? 0)} ${tr('ordersInScope', locale)}`} detail={`${String(metrics.active_deliveries ?? 0)} ${tr('activeDeliveries', locale)}`} tone="green" /><Activity icon="!" title={`${String(metrics.pending_orders ?? metrics.pending_procurement ?? 0)} ${tr('itemsPending', locale)}`} detail={`${String(metrics.low_stock_items ?? 0)} ${tr('lowStockItems', locale)}`} tone="orange" /></section></div></section>
}

type DashboardMapFilter = 'all' | 'open' | 'closed'
type DeliveryScheduleFilter = 'all' | 'asap' | 'scheduled'
const DRIVER_ACTIVE_DELIVERY_STATUSES = new Set(['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'])
const deliveryStatusForDisplay = (status: string) => status === 'picked_up' ? 'in_transit' : status

function DashboardMetricCard({ label, value, hint, icon, tone }: { label: string; value: number; hint: string; icon: ReactNode; tone: string }) {
  return <article className="metric-card dashboard-role-metric"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-copy"><span>{label}</span><strong>{value.toLocaleString()}</strong><small><span aria-hidden="true">•</span> {hint}</small></div></article>
}

function dashboardMetricCards(role: string, metrics: Record<string, number>, locale: string) {
  const value = (key: string) => Number(metrics[key] ?? 0)
  const live = tr('liveData', locale)
  if (role === 'admin') return [
    { label: tr('totalOrders', locale), value: value('orders'), hint: live, icon: <ClipboardList />, tone: 'blue' },
    { label: tr('pendingVerification', locale), value: value('pending_partners'), hint: live, icon: <ShieldCheck />, tone: 'violet' },
    { label: tr('activeDeliveries', locale), value: value('active_deliveries'), hint: live, icon: <Truck />, tone: 'orange' },
    { label: tr('registeredPartners', locale), value: value('partners'), hint: live, icon: <Users />, tone: 'green' },
  ]
  if (role === 'pharmacy') return [
    { label: tr('totalOrders', locale), value: value('orders'), hint: live, icon: <ClipboardList />, tone: 'blue' },
    { label: tr('awaitingReview', locale), value: value('pending_orders'), hint: live, icon: <Clock3 />, tone: 'violet' },
    { label: tr('activeDeliveries', locale), value: value('active_deliveries'), hint: live, icon: <Truck />, tone: 'orange' },
    { label: tr('lowStock', locale), value: value('low_stock_items'), hint: live, icon: <Package />, tone: 'green' },
  ]
  if (role === 'warehouse') return [
    { label: tr('inventoryItems', locale), value: value('inventory_items'), hint: live, icon: <Package />, tone: 'blue' },
    { label: tr('awaitingReview', locale), value: value('pending_procurement'), hint: live, icon: <Clock3 />, tone: 'violet' },
    { label: tr('fulfilledRequests', locale), value: value('completed_orders'), hint: live, icon: <ShieldCheck />, tone: 'green' },
    { label: tr('lowStock', locale), value: value('low_stock_items'), hint: live, icon: <Package />, tone: 'orange' },
  ]
  if (role === 'driver') return [
    { label: tr('availableJobs', locale), value: value('available_deliveries'), hint: live, icon: <MapPin />, tone: 'blue' },
    { label: tr('activeDeliveries', locale), value: value('active_deliveries'), hint: live, icon: <Truck />, tone: 'orange' },
    { label: tr('completed', locale), value: value('completed_orders'), hint: live, icon: <ShieldCheck />, tone: 'green' },
  ]
  return [
    { label: tr('totalOrders', locale), value: value('orders'), hint: live, icon: <ClipboardList />, tone: 'blue' },
    { label: tr('awaitingReview', locale), value: value('pending_orders'), hint: live, icon: <Clock3 />, tone: 'violet' },
    { label: tr('activeDeliveries', locale), value: value('active_deliveries'), hint: live, icon: <Truck />, tone: 'orange' },
    { label: tr('completed', locale), value: value('completed_orders'), hint: live, icon: <ShieldCheck />, tone: 'green' },
  ]
}

function dashboardRoleDefinition(role: string, locale: string) {
  const definitions: Record<string, { guidance: string; action: string; destination: string }> = {
    admin: { guidance: tr('adminDashboardGuidance', locale), action: tr('reviewOperations', locale), destination: 'orders' },
    pharmacy: { guidance: tr('pharmacyDashboardGuidance', locale), action: tr('reviewOrders', locale), destination: 'orders' },
    warehouse: { guidance: tr('warehouseDashboardGuidance', locale), action: tr('reviewProcurement', locale), destination: 'procurement' },
    driver: { guidance: tr('driverDashboardGuidance', locale), action: tr('findDelivery', locale), destination: 'deliveries' },
    patient: { guidance: tr('patientDashboardGuidance', locale), action: tr('createMedicineOrder', locale), destination: 'new-order' },
    support: { guidance: tr('supportDashboardGuidance', locale), action: tr('reviewComplaints', locale), destination: 'complaints' },
  }
  return definitions[role] ?? definitions.patient
}

function DashboardCatalogPanel({ locale }: { locale: string }) {
  const [query, setQuery] = useState('')
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try { const response = await api.get('/medicines', { params: { search: query, per_page: 5 } }); if (active) setMedicines(response.data.data ?? []) }
      catch { if (active) setMedicines([]) }
      finally { if (active) setLoading(false) }
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query])
  return <section className="panel search-panel dashboard-catalog-panel"><div className="panel-heading"><div><p className="eyebrow">{tr('catalog', locale)}</p><h2>{tr('medicineSearch', locale)}</h2></div></div><label className="search-box dashboard-search-box"><Search size={19} aria-hidden="true" /><span className="sr-only">{tr('medicineSearch', locale)}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('searchPlaceholder', locale)} /></label><div className="medicine-list" aria-busy={loading}>{loading ? <div className="state" role="status">{tr('searching', locale)}</div> : medicines.length === 0 ? <div className="state" role="status">{tr('noMedicines', locale)}</div> : medicines.map((medicine) => <button type="button" className="medicine-card dashboard-medicine-button" key={medicine.id} onClick={() => openMedicineDetail(medicine.id)}><span className="medicine-icon" aria-hidden="true">Rx</span><span className="medicine-info"><strong>{medicine.name_en}</strong><span>{medicine.name_ar} · {medicine.manufacturer ?? tr('manufacturerPending', locale)}</span></span><span className="medicine-tag">{medicine.prescription_required ? tr('prescription', locale) : tr('noPrescription', locale)}</span><ChevronRight size={17} aria-hidden="true" className="chevron" /></button>)}</div></section>
}

function DashboardRolePriorities({ role, metrics, locale, onNavigate }: { role: string; metrics: Record<string, number>; locale: string; onNavigate: (section: string) => void }) {
  const value = (key: string) => Number(metrics[key] ?? 0)
  type PriorityRow = { label: string; count: number; destination: string; hint?: string }
  const rows = role === 'admin'
    ? [{ label: tr('pendingVerification', locale), count: value('pending_partners'), destination: 'subscriptions' }, { label: tr('activeDeliveries', locale), count: value('active_deliveries'), destination: 'deliveries' }, { label: tr('registeredPartners', locale), count: value('partners'), destination: 'pharmacies' }] as PriorityRow[]
    : role === 'pharmacy'
      ? [{ label: tr('awaitingReview', locale), count: value('pending_orders'), destination: 'orders' }, { label: tr('claimedByDriver', locale), count: value('claimed_by_driver'), destination: 'deliveries?status=claimed&pickup_only=1', hint: tr('sendPickupPinHint', locale) }, { label: tr('readyForPickup', locale), count: value('ready_for_pickup'), destination: 'deliveries?status=pickup_started&pickup_only=1', hint: tr('pickupPinSentHint', locale) }, { label: tr('procurementInProgress', locale), count: value('pending_procurement'), destination: 'procurement' }, { label: tr('lowStock', locale), count: value('low_stock_items'), destination: 'inventory' }] as PriorityRow[]
      : role === 'warehouse'
        ? [{ label: tr('awaitingReview', locale), count: value('pending_procurement'), destination: 'procurement' }, { label: tr('claimedByDriver', locale), count: value('claimed_by_driver'), destination: 'deliveries?status=claimed&pickup_only=1', hint: tr('sendPickupPinHint', locale) }, { label: tr('readyForPickup', locale), count: value('ready_for_pickup'), destination: 'deliveries?status=pickup_started&pickup_only=1', hint: tr('pickupPinSentHint', locale) }, { label: tr('fulfilledRequests', locale), count: value('completed_orders'), destination: 'procurement' }, { label: tr('lowStock', locale), count: value('low_stock_items'), destination: 'inventory' }] as PriorityRow[]
        : [{ label: tr('awaitingReview', locale), count: value('pending_orders'), destination: 'orders' }, { label: tr('activeDeliveries', locale), count: value('active_deliveries'), destination: 'deliveries' }, { label: tr('completed', locale), count: value('completed_orders'), destination: 'orders' }] as PriorityRow[]
  return <section className="panel dashboard-priority-panel"><div className="panel-heading"><div><p className="eyebrow">{tr('operations', locale)}</p><h2>{tr('rolePriorities', locale)}</h2></div><span className="live-status"><i aria-hidden="true" /> {tr('liveData', locale)}</span></div><div className="dashboard-priority-list">{rows.map((row) => <button type="button" key={row.label} onClick={() => onNavigate(row.destination)}><span><strong>{row.label}</strong><small>{row.hint ?? tr('liveData', locale)}</small></span><b>{row.count.toLocaleString()}</b><ChevronRight size={18} aria-hidden="true" /></button>)}</div></section>
}

function formatDashboardHours(pharmacy: Record<string, unknown>, locale: string) {
  const hours = Array.isArray(pharmacy.today_hours) ? pharmacy.today_hours as Array<Record<string, unknown>> : []
  if (hours.length === 0) return tr('hoursNotRecorded', locale)
  return hours.map((shift) => `${String(shift.opens_at ?? '').slice(0, 5)}–${String(shift.closes_at ?? '').slice(0, 5)}`).join(', ')
}

function DashboardPharmacyMap({ locale }: { locale: string }) {
  const [pharmacies, setPharmacies] = useState<Array<Record<string, unknown>>>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<DashboardMapFilter>('open')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  useEffect(() => {
    let active = true
    const load = async () => {
      try { const response = await api.get('/partners', { params: { type: 'pharmacy', per_page: 50 } }); if (active) setPharmacies(response.data.data ?? []) }
      catch { if (active) setPharmacies([]) }
      finally { if (active) setLoading(false) }
    }
    void load()
    const timer = window.setInterval(() => void load(), 60000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filtered = pharmacies.filter((pharmacy) => {
    const matchesSearch = !normalizedSearch || `${String(pharmacy.business_name ?? '')} ${String(pharmacy.address ?? '')}`.toLocaleLowerCase().includes(normalizedSearch)
    const matchesStatus = filter === 'all' || (filter === 'open' ? Boolean(pharmacy.is_open) : !pharmacy.is_open)
    return matchesSearch && matchesStatus && Number.isFinite(Number(pharmacy.latitude)) && Number.isFinite(Number(pharmacy.longitude))
  })
  const selected = filtered.find((pharmacy) => Number(pharmacy.id) === selectedId) ?? null
  useEffect(() => {
    if (!mapElement.current || mapRef.current) return
    const map = L.map(mapElement.current, { zoomControl: true }).setView([33.5138, 36.2765], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layerRef.current?.remove()
    const layer = L.layerGroup().addTo(map)
    layerRef.current = layer
    const points: Array<[number, number]> = []
    filtered.forEach((pharmacy) => {
      const latitude = Number(pharmacy.latitude)
      const longitude = Number(pharmacy.longitude)
      points.push([latitude, longitude])
      const isOpen = Boolean(pharmacy.is_open)
      const icon = L.divIcon({ className: `dashboard-pharmacy-marker ${isOpen ? 'is-open' : 'is-closed'} ${Number(pharmacy.id) === selectedId ? 'selected' : ''}`, html: '<span></span>', iconSize: [30, 36], iconAnchor: [15, 34] })
      const marker = L.marker([latitude, longitude], { icon, title: String(pharmacy.business_name ?? 'Pharmacy'), keyboard: true }).addTo(layer)
      marker.on('click', () => setSelectedId(Number(pharmacy.id)))
    })
    if (selected) map.fitBounds(L.latLngBounds([[Number(selected.latitude), Number(selected.longitude)]]), { padding: [70, 70], maxZoom: 15 })
    else if (points.length > 0) map.fitBounds(L.latLngBounds(points), { padding: [34, 34], maxZoom: 14 })
  }, [filtered, selectedId, selected])
  return <section className="panel dashboard-map-panel"><div className="panel-heading"><div><p className="eyebrow">{tr('openNow', locale)}</p><h2>{tr('sharedPharmacyMap', locale)}</h2><p className="muted">{tr('sharedPharmacyMapHint', locale)}</p></div><span className="record-count-badge" aria-live="polite">{filtered.length}</span></div><div className="dashboard-map-toolbar"><label className="search-box"><Search size={18} aria-hidden="true" /><span className="sr-only">{tr('searchPharmacies', locale)}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('searchPharmacies', locale)} /></label><div className="dashboard-filter-buttons" role="group" aria-label={tr('sharedPharmacyMap', locale)}>{(['all', 'open', 'closed'] as DashboardMapFilter[]).map((value) => <button type="button" key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? tr('allPharmacies', locale) : value === 'open' ? tr('openNow', locale) : tr('closedNow', locale)}</button>)}</div></div><div className="dashboard-map-layout"><div ref={mapElement} className="dashboard-leaflet-map" aria-label={tr('sharedPharmacyMap', locale)} /><aside className="dashboard-map-results" aria-busy={loading}>{loading ? <div className="state" role="status">{tr('loadingRecords', locale)}</div> : filtered.length === 0 ? <div className="state" role="status">{tr('noMappedPharmacies', locale)}</div> : filtered.map((pharmacy) => <button type="button" className={Number(pharmacy.id) === selectedId ? 'selected' : ''} key={String(pharmacy.id)} onClick={() => setSelectedId(Number(pharmacy.id))}><span className={`pharmacy-open-dot ${pharmacy.is_open ? 'open' : 'closed'}`} aria-hidden="true" /><span><strong>{String(pharmacy.business_name ?? 'Pharmacy')}</strong><small>{String(pharmacy.address ?? '')}</small><em>{pharmacy.is_open ? `${tr('openNow', locale)}${pharmacy.open_until ? ` · ${tr('openUntil', locale)} ${String(pharmacy.open_until).slice(0, 5)}` : ''}` : tr('closedNow', locale)} · {formatDashboardHours(pharmacy, locale)}</em></span><ChevronRight size={17} aria-hidden="true" /></button>)}</aside></div>{selected && <div className="dashboard-map-selection" role="status"><div><span className={`pharmacy-open-dot ${selected.is_open ? 'open' : 'closed'}`} aria-hidden="true" /><span><strong>{String(selected.business_name)}</strong><small>{String(selected.address ?? '')}</small></span></div><span>{tr('todayHours', locale)}: <strong>{formatDashboardHours(selected, locale)}</strong></span><a className="ghost-button" href={`https://www.openstreetmap.org/?mlat=${String(selected.latitude)}&mlon=${String(selected.longitude)}&zoom=16`} target="_blank" rel="noreferrer"><MapPin size={17} aria-hidden="true" /> {tr('openInMap', locale)}</a></div>}</section>
}

function DriverAvailableDeliveryMap({ locale, refreshRevision, onOpenDetail }: { locale: string; refreshRevision: number; onOpenDetail: (detail: Record<string, unknown>) => void }) {
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [schedule, setSchedule] = useState<DeliveryScheduleFilter>('all')
  const [availability, setAvailability] = useState<boolean | null>(null)
  const [approvalStatus, setApprovalStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [updatingAvailability, setUpdatingAvailability] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [message, setMessage] = useState('')
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true); setMessage('')
      try {
        const availabilityResponse = await api.get('/driver/availability')
        if (!active) return
        const isAvailable = Boolean(availabilityResponse.data.is_available)
        setAvailability(isAvailable)
        setApprovalStatus(String(availabilityResponse.data.approval_status ?? 'pending'))
        if (!isAvailable) { setJobs([]); return }
        const response = await api.get('/deliveries/available', { params: { per_page: 100, sort_direction: 'asc' } })
        if (!active) return
        const data = response.data.data ?? []
        setJobs(data)
        setSelectedId((current) => data.some((job: Record<string, unknown>) => Number(job.id) === current) ? current : Number(data[0]?.id ?? 0) || null)
      } catch (error) {
        if (!active) return
        setJobs([])
        setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to load available deliveries.' : 'Unable to load available deliveries.')
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [refreshRevision])
  const toggleAvailability = async () => {
    if (updatingAvailability || approvalStatus !== 'approved') return
    setUpdatingAvailability(true); setMessage('')
    try {
      const next = !availability
      await api.patch('/driver/availability', { is_available: next })
      setAvailability(next)
      if (!next) { setJobs([]); setSelectedId(null) }
      else {
        const response = await api.get('/deliveries/available', { params: { per_page: 100, sort_direction: 'asc' } })
        const data = response.data.data ?? []
        setJobs(data); setSelectedId(Number(data[0]?.id ?? 0) || null)
      }
    } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update availability.' : 'Unable to update availability.') }
    finally { setUpdatingAvailability(false) }
  }
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filtered = jobs.filter((job) => {
    const matchesSearch = !normalizedSearch || `${String(job.public_id ?? '')} ${String(job.order_public_id ?? '')} ${String(job.pickup_label ?? '')} ${String(job.delivery_address_snapshot ?? '')}`.toLocaleLowerCase().includes(normalizedSearch)
    const isScheduled = Boolean(job.scheduled_for)
    return matchesSearch && (schedule === 'all' || (schedule === 'scheduled' ? isScheduled : !isScheduled))
  })
  const effectiveSelectedId = filtered.some((job) => Number(job.id) === selectedId) ? selectedId : Number(filtered[0]?.id ?? 0) || null
  const selected = filtered.find((job) => Number(job.id) === effectiveSelectedId) ?? null
  useEffect(() => {
    if (!mapElement.current || mapRef.current) return
    const map = L.map(mapElement.current, { zoomControl: true }).setView([33.5138, 36.2765], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    routeLayerRef.current?.remove()
    const layer = L.layerGroup().addTo(map)
    routeLayerRef.current = layer
    const allPoints: Array<[number, number]> = []
    filtered.forEach((job) => {
      const pickup: [number, number] = [Number(job.pickup_latitude), Number(job.pickup_longitude)]
      const dropoff: [number, number] = [Number(job.dropoff_latitude), Number(job.dropoff_longitude)]
      if (![...pickup, ...dropoff].every(Number.isFinite)) return
      const routePoints = roadRoutePoints(job.route_geometry)
      allPoints.push(...(routePoints.length >= 2 ? routePoints : [pickup, dropoff]))
      const isSelected = Number(job.id) === effectiveSelectedId
      const pickupIcon = L.divIcon({ className: `driver-route-marker pickup ${isSelected ? 'selected' : ''}`, html: '<span>P</span>', iconSize: [30, 30], iconAnchor: [15, 15] })
      const dropoffIcon = L.divIcon({ className: `driver-route-marker dropoff ${isSelected ? 'selected' : ''}`, html: '<span>D</span>', iconSize: [30, 30], iconAnchor: [15, 15] })
      const selectJob = () => setSelectedId(Number(job.id))
      L.marker(pickup, { icon: pickupIcon, title: `${tr('pickup', locale)} · ${String(job.public_id)}`, keyboard: true }).on('click', selectJob).addTo(layer)
      L.marker(dropoff, { icon: dropoffIcon, title: `${tr('dropoff', locale)} · ${String(job.public_id)}`, keyboard: true }).on('click', selectJob).addTo(layer)
      if (routePoints.length >= 2) L.polyline(routePoints, { color: isSelected ? '#d25b4f' : '#2b91b8', weight: isSelected ? 5 : 3, opacity: isSelected ? .95 : .52, lineCap: 'round', lineJoin: 'round', className: 'dashboard-driver-route' }).on('click', selectJob).addTo(layer)
    })
    if (selected) {
      const storedRoute = roadRoutePoints(selected.route_geometry)
      const points: Array<[number, number]> = storedRoute.length >= 2 ? storedRoute : [[Number(selected.pickup_latitude), Number(selected.pickup_longitude)], [Number(selected.dropoff_latitude), Number(selected.dropoff_longitude)]]
      if (points.flat().every(Number.isFinite)) map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 15 })
    } else if (allPoints.length > 0) map.fitBounds(L.latLngBounds(allPoints), { padding: [36, 36], maxZoom: 14 })
  }, [filtered, effectiveSelectedId, selected, locale])
  const openDetails = async (job: Record<string, unknown>) => {
    if (detailLoading) return
    setDetailLoading(true); setMessage('')
    try { const response = await api.get(`/deliveries/${String(job.id)}`); onOpenDetail(response.data) }
    catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to open this delivery.' : 'Unable to open this delivery.') }
    finally { setDetailLoading(false) }
  }
  return <section id="available-deliveries" className="panel driver-dashboard-map-panel"><div className="panel-heading"><div><p className="eyebrow">{tr('availableJobs', locale)}</p><h2>{tr('availableDeliveryMap', locale)}</h2><p className="muted">{tr('availableDeliveryMapHint', locale)}</p></div><button type="button" className={`driver-availability-toggle ${availability ? 'active' : ''}`} aria-pressed={Boolean(availability)} disabled={updatingAvailability || approvalStatus !== 'approved'} onClick={() => void toggleAvailability()}><span aria-hidden="true" /><span><strong>{updatingAvailability ? tr('updatingAvailability', locale) : availability ? tr('availableForJobs', locale) : tr('unavailableForJobs', locale)}</strong><small>{approvalStatus === 'approved' ? tr('availabilityHint', locale) : approvalStatus}</small></span></button></div>{message && <div className="form-error" role="alert">{message}</div>}<div className="dashboard-map-toolbar"><label className="search-box"><Search size={18} aria-hidden="true" /><span className="sr-only">{tr('searchDeliveryJobs', locale)}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('searchDeliveryJobs', locale)} /></label><label className="dashboard-schedule-filter"><span>{tr('allSchedules', locale)}</span><select value={schedule} onChange={(event) => setSchedule(event.target.value as DeliveryScheduleFilter)} aria-label={tr('allSchedules', locale)}><option value="all">{tr('allSchedules', locale)}</option><option value="asap">{tr('asapOnly', locale)}</option><option value="scheduled">{tr('scheduledOnly', locale)}</option></select></label></div><div className="driver-dashboard-map-layout"><div ref={mapElement} className="dashboard-leaflet-map driver-jobs-map" aria-label={tr('availableDeliveryMap', locale)} /><aside className="driver-job-results" aria-busy={loading}>{!availability ? <div className="state">{tr('availabilityHint', locale)}</div> : loading ? <div className="state" role="status">{tr('loadingRecords', locale)}</div> : filtered.length === 0 ? <div className="state" role="status">{tr('noAvailableJobs', locale)}</div> : filtered.map((job) => <article className={Number(job.id) === effectiveSelectedId ? 'selected' : ''} key={String(job.id)}><button type="button" className="driver-job-select" onClick={() => setSelectedId(Number(job.id))}><span><strong>{String(job.order_public_id ?? job.public_id ?? `Order ${String(job.id)}`)}</strong><small>{String(job.pickup_label ?? tr('pickup', locale))} → {String(job.delivery_address_snapshot ?? tr('dropoff', locale))}</small></span><ChevronRight size={17} aria-hidden="true" /></button><dl><div><dt>{tr('routePreview', locale)}</dt><dd>{job.delivery_distance_km ? `${Number(job.delivery_distance_km).toFixed(2)} km` : '—'}</dd></div><div><dt>{tr('deliveryFee', locale)}</dt><dd>{formatMedlineMoney(job.job_price, 'SYP', locale)}</dd></div></dl><button type="button" className="ghost-button driver-job-detail-button" disabled={detailLoading} onClick={() => void openDetails(job)}><Eye size={17} aria-hidden="true" /> {tr('viewDeliveryDetails', locale)}</button></article>)}</aside></div>{selected && <div className="driver-route-selection"><div><span className="route-point pickup"><MapPin size={16} aria-hidden="true" /></span><span><small>{tr('pickup', locale)}</small><strong>{String(selected.pickup_label ?? selected.pickup_address ?? 'Pickup')}</strong></span></div><Navigation size={20} aria-hidden="true" /><div><span className="route-point dropoff"><MapPin size={16} aria-hidden="true" /></span><span><small>{tr('dropoff', locale)}</small><strong>{String(selected.delivery_address_snapshot ?? 'Drop-off')}</strong></span></div><button type="button" className="primary-button" disabled={detailLoading} onClick={() => void openDetails(selected)}><Eye size={17} aria-hidden="true" /> {tr('viewDeliveryDetails', locale)}</button></div>}</section>
}

function DriverActiveDeliveriesList({ locale, refreshRevision, onOpenDetail }: { locale: string; refreshRevision: number; onOpenDetail: (detail: Record<string, unknown>) => void }) {
  const [deliveries, setDeliveries] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    let inFlight = false
    const load = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const response = await api.get('/deliveries/mine', { params: { active_only: true, per_page: 100, sort_direction: 'desc' } })
        if (active) { setDeliveries((response.data.data ?? []).filter((delivery: Record<string, unknown>) => DRIVER_ACTIVE_DELIVERY_STATUSES.has(String(delivery.status)))); setMessage('') }
      } catch { if (active) { setDeliveries([]); setMessage('Unable to load your active deliveries.') } }
      finally { if (active) setLoading(false); inFlight = false }
    }
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [refreshRevision])
  const openDetails = async (delivery: Record<string, unknown>) => {
    const id = Number(delivery.id)
    if (!id || detailLoadingId !== null) return
    setDetailLoadingId(id); setMessage('')
    try { const response = await api.get(`/deliveries/${id}`); onOpenDetail(response.data) }
    catch { setMessage('Unable to open this delivery. Please try again.') }
    finally { setDetailLoadingId(null) }
  }
  return <section className="panel driver-active-deliveries-panel"><div className="panel-heading"><div><p className="eyebrow">{tr('assignedDeliveries', locale)}</p><h2>{tr('myActiveDeliveries', locale)}</h2><p className="muted">{tr('activeDeliveryListHint', locale)}</p></div><span className="record-count-badge" aria-live="polite">{deliveries.length}</span></div>{message && <div className="form-error" role="alert">{message}</div>}<div className="driver-active-delivery-list" aria-busy={loading}>{loading ? <div className="state" role="status">{tr('loadingRecords', locale)}</div> : deliveries.length === 0 ? <div className="state driver-active-empty" role="status"><span>{tr('noActiveDeliveries', locale)}</span><button type="button" className="ghost-button" onClick={() => document.getElementById('available-deliveries')?.scrollIntoView({ block: 'start' })}><MapPin size={17} aria-hidden="true" />{tr('findDelivery', locale)}</button></div> : deliveries.map((delivery) => { const status = deliveryStatusForDisplay(String(delivery.status ?? 'claimed')); const reference = String(delivery.order_public_id ?? delivery.procurement_public_id ?? delivery.public_id ?? `Delivery ${String(delivery.id)}`); return <article key={String(delivery.id)}><div className="active-delivery-icon" aria-hidden="true"><Truck size={20} /></div><div className="active-delivery-copy"><span className={`order-status status-${status.replaceAll('_', '-')}`}><i aria-hidden="true" />{status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}</span><strong>{reference}</strong><small>{String(delivery.delivery_address_snapshot ?? tr('dropoff', locale))}</small></div><dl><div><dt>{tr('deliveryTime', locale)}</dt><dd>{delivery.scheduled_for ? formatMedlineDate(delivery.scheduled_for, locale) : 'ASAP'}</dd></div><div><dt>{tr('deliveryFee', locale)}</dt><dd>{formatMedlineMoney(delivery.job_price, 'SYP', locale)}</dd></div></dl><button type="button" className="primary-button active-delivery-open" disabled={detailLoadingId !== null} onClick={() => void openDetails(delivery)}><Eye size={17} aria-hidden="true" />{detailLoadingId === Number(delivery.id) ? tr('loading', locale) : tr('viewDeliveryDetails', locale)}</button></article> })}</div></section>
}

export function RoleAwareDashboard({ role, locale, onNavigate = () => undefined }: { role: string; locale: string; onNavigate?: (section: string) => void }) {
  const [metrics, setMetrics] = useState<Record<string, number>>({})
  const [deliveryDetail, setDeliveryDetail] = useState<Record<string, unknown> | null>(null)
  const [driverRefreshRevision, setDriverRefreshRevision] = useState(0)
  const definition = dashboardRoleDefinition(role, locale)
  const roleTitle = `${tr(`role_${role}`, locale)} ${tr('workspace', locale)}`
  useEffect(() => {
    document.title = `MedLine · ${roleTitle}`
    let active = true
    let inFlight = false
    const load = async () => {
      if (inFlight) return
      inFlight = true
      try { const response = await api.get(role === 'admin' ? '/admin/dashboard' : '/dashboard'); if (active) setMetrics(response.data.metrics ?? {}) }
      catch { if (active) setMetrics({}) }
      finally { inFlight = false }
    }
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [role, roleTitle, driverRefreshRevision])
  if (deliveryDetail) return <DeliveryDetailPanel detail={deliveryDetail} onClose={() => { setDeliveryDetail(null); setDriverRefreshRevision((current) => current + 1) }} locale={locale} role="driver" onAccepted={() => setDriverRefreshRevision((current) => current + 1)} />
  const cards = dashboardMetricCards(role, metrics, locale)
  const runPrimaryAction = () => { if (role === 'driver') document.getElementById('available-deliveries')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); else onNavigate(definition.destination) }
  return <section className="content role-aware-dashboard"><div className="welcome-row role-dashboard-welcome"><div><p className="eyebrow">MEDLINE OPERATIONS</p><h1>{roleTitle}</h1><p className="muted">{definition.guidance}</p></div><button type="button" className="primary-button" onClick={runPrimaryAction}>{role === 'driver' ? <MapPin size={17} aria-hidden="true" /> : role === 'patient' ? <ShoppingCart size={17} aria-hidden="true" /> : <ClipboardList size={17} aria-hidden="true" />}{definition.action}</button></div><div className={`metric-grid role-metric-grid role-${role}`}>{cards.map((card) => <DashboardMetricCard key={card.label} {...card} />)}</div>{role === 'driver' ? <><DriverActiveDeliveriesList locale={locale} refreshRevision={driverRefreshRevision} onOpenDetail={setDeliveryDetail} /><DriverAvailableDeliveryMap locale={locale} refreshRevision={driverRefreshRevision} onOpenDetail={setDeliveryDetail} /></> : <div className="dashboard-grid role-dashboard-grid"><DashboardCatalogPanel locale={locale} /><DashboardRolePriorities role={role} metrics={metrics} locale={locale} onNavigate={onNavigate} /></div>}<DashboardPharmacyMap locale={locale} /></section>
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
      try { const response = await api.get('/admin/notification-delivery-health'); if (active) setHealth({ ...response.data, recent_failures: (response.data.recent_failures ?? []).map((failure: Record<string, unknown>) => ({ ...failure, notification_type: humanizeNotificationType(failure.notification_type) })) }) }
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

function MedicineAdminPageLegacy({ locale }: { locale: string }) {
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
  const deactivate = async (id: number) => { try { await api.patch(`/medicines/${id}/status`, { is_active: false }, mutationConfig('medicine-status', id, 'deactivate')); setMessage('Medicine deactivated.'); await load() } catch { setMessage('Unable to deactivate medicine.') } }
  const importCatalog = async () => { if (!importFile) return; const form = new FormData(); form.append('file', importFile); try { const response = await api.post('/medicines/import', form, { headers: mutationConfig('medicine-import', 'catalog', 'upload').headers }); setMessage(response.data.message ?? 'Catalog imported.'); setImportFile(null); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to import catalog.' : 'Unable to import catalog.') } }
  const exportCatalog = async () => { try { const response = await api.get('/medicines/export', { params: { include_inactive: false }, responseType: 'blob' }); const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv' }); const url = window.URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'medline-medicine-catalog.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => window.URL.revokeObjectURL(url), 1000); setMessage('Catalog export downloaded.') } catch { setMessage('Unable to export catalog.') } }
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('catalogAdministration')}</p><h1>{text('medicineCatalog')}</h1><p className="muted">{text('bilingualRecords')}</p></div><div className="row-actions"><button className="ghost-button" type="button" onClick={() => void exportCatalog()}>{text('exportCatalog')}</button><label className="file-field">{text('chooseCsv')}<input type="file" accept=".csv,text/csv" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} /></label><button className="primary-button" type="button" disabled={!importFile} onClick={() => void importCatalog()}>{text('importCsv')}</button></div></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('newRecord')}</p><h2>{text('addMedicine')}</h2></div></div><form className="inline-form" onSubmit={create}><input name="name_en" placeholder={text('englishName')} required /><input name="name_ar" placeholder={text('arabicName')} required /><input name="manufacturer" placeholder={text('manufacturer')} /><input name="form" placeholder={text('form')} /><input name="dosage" placeholder={text('dosage')} /><input name="code" placeholder={text('code')} /><label className="file-field">{text('image')}<input name="image" type="file" accept=".jpg,.jpeg,.png,.webp" /></label><label className="check-field"><input name="prescription_required" type="checkbox" value="1" /> {text('prescription')}</label><button className="primary-button" type="submit">{text('createMedicine')}</button></form>{message && <div className="form-success">{message}</div>}</section><section className="panel table-panel rich-operations-panel medicine-catalog-panel"><div className="panel-heading"><div><p className="eyebrow">{text('medicineCatalog')}</p><h2>{text('activeMedicines')}</h2></div></div><div className="search-box"><Search size={19} aria-hidden="true" /><input aria-label="Search medicine catalog" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by medicine, manufacturer, code, or form..." /></div><div className="operations-table"><div className="table-row table-head"><span>Medicine</span><span>Manufacturer / form</span><span>Dosage</span><span>Code</span><span>Prescription</span><span>Action</span></div>{loading ? <div className="state">{text('loadingRecords')}</div> : rows.length === 0 ? <div className="state">No medicines match your search.</div> : rows.map((row) => <div className="table-row" key={String(row.id)}><strong>{String(row.name_en)}<small>{String(row.name_ar ?? '')}</small></strong><span>{String(row.manufacturer ?? '—')} · {String(row.form ?? '—')}</span><span>{String(row.dosage ?? '—')}</span><span>{String(row.code ?? '—')}</span><span className="status-pill">{row.prescription_required ? text('prescription') : text('noPrescription')}</span><button className="reject-button" type="button" onClick={() => void deactivate(Number(row.id))}>{text('deactivate')}</button></div>)}</div></section></section>
}

const medicineDetailFields = ['name_en', 'name_ar', 'manufacturer', 'active_ingredient', 'form', 'dosage', 'pack_size', 'administration_route', 'code', 'description', 'indications', 'directions', 'side_effects', 'warnings', 'contraindications', 'drug_interactions', 'storage_instructions']

export function MedicineCreateAdminPage({ locale, onBack }: { locale: string; onBack: () => void }) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [categories, setCategories] = useState<Array<Record<string, unknown>>>([])
  const [image, setImage] = useState<File | null>(null)
  const [spreadsheet, setSpreadsheet] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { document.title = `MedLine · Add medicine`; api.get('/medicine-categories').then((response) => setCategories(response.data.data ?? [])).catch(() => setCategories([])) }, [locale])
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setMessage('')
    const form = new FormData(event.currentTarget)
    form.set('prescription_required', form.get('prescription_required') ? '1' : '0')
    form.set('is_active', '1')
    if (image) form.set('image', image)
    try { const response = await api.post('/medicines', form, { headers: mutationConfig('medicine', uniqueMutationId('medicine'), 'create').headers }); setMessage(response.data.message ?? 'Medicine created.'); event.currentTarget.reset(); setImage(null) }
    catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to create medicine.' : 'Unable to create medicine.') }
    finally { setSaving(false) }
  }
  const importCatalog = async () => {
    if (!spreadsheet) return
    setSaving(true); setMessage('')
    const form = new FormData(); form.append('file', spreadsheet)
    try { const response = await api.post('/medicines/import', form, { headers: mutationConfig('medicine-import', uniqueMutationId('catalog'), 'upload').headers }); setMessage(response.data.message ?? 'Catalog imported.'); setSpreadsheet(null) }
    catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to import this spreadsheet.' : 'Unable to import this spreadsheet.') }
    finally { setSaving(false) }
  }
  const downloadTemplate = async () => { try { const response = await api.get('/medicines/import-template', { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = 'medline-medicine-import-template.csv'; link.click(); URL.revokeObjectURL(url) } catch { setMessage('Unable to download the import template.') } }
  return <section className="content medicine-create-page"><button type="button" className="back-link" onClick={onBack}>Back to medicine catalog</button><section className="panel medicine-create-shell"><div className="panel-heading medicine-create-heading"><div><p className="eyebrow">MEDICINE CATALOG</p><h1>Add medicine</h1><p className="muted">Create one complete medicine record or import many records from Excel or CSV.</p></div></div><div className="medicine-create-tabs" role="tablist" aria-label="Medicine creation method"><button type="button" role="tab" aria-selected={mode === 'single'} className={mode === 'single' ? 'active' : ''} onClick={() => { setMode('single'); setMessage('') }}><Plus size={18} /> Single medicine</button><button type="button" role="tab" aria-selected={mode === 'bulk'} className={mode === 'bulk' ? 'active' : ''} onClick={() => { setMode('bulk'); setMessage('') }}><Upload size={18} /> Bulk spreadsheet</button></div>{message && <div className="form-message" role="status">{message}</div>}{mode === 'single' ? <form className="medicine-record-form" onSubmit={create}><fieldset><legend>Identity and classification</legend><div className="medicine-form-grid"><label>English name <span aria-hidden="true">*</span><input name="name_en" required maxLength={180} /></label><label>Arabic name <span aria-hidden="true">*</span><input name="name_ar" required maxLength={180} dir="rtl" /></label><label>Category<select name="category_id" defaultValue=""><option value="">No category</option>{categories.map((category) => <option key={String(category.id)} value={String(category.id)}>{String(category.name_en)}</option>)}</select></label><label>Code<input name="code" maxLength={100} /></label><label>Manufacturer<input name="manufacturer" maxLength={180} /></label><label>Active ingredient<input name="active_ingredient" maxLength={255} /></label></div></fieldset><fieldset><legend>Presentation</legend><div className="medicine-form-grid"><label>Form<input name="form" placeholder="Tablet, syrup, capsule…" maxLength={80} /></label><label>Dosage<input name="dosage" placeholder="500mg" maxLength={80} /></label><label>Pack size<input name="pack_size" placeholder="20 tablets" maxLength={100} /></label><label>Administration route<input name="administration_route" placeholder="Oral" maxLength={80} /></label></div><label className="medicine-prescription-toggle"><input name="prescription_required" type="checkbox" /> Prescription required</label></fieldset><fieldset><legend>Clinical and safety information</legend><div className="medicine-form-textareas"><label>Description<textarea name="description" maxLength={5000} /></label><label>Indications<textarea name="indications" maxLength={5000} /></label><label>Directions<textarea name="directions" maxLength={5000} /></label><label>Side effects<textarea name="side_effects" maxLength={5000} /></label><label>Warnings<textarea name="warnings" maxLength={5000} /></label><label>Contraindications<textarea name="contraindications" maxLength={5000} /></label><label>Drug interactions<textarea name="drug_interactions" maxLength={5000} /></label><label>Storage instructions<textarea name="storage_instructions" maxLength={2000} /></label></div></fieldset><fieldset><legend>Medicine image</legend><label className="custom-file-upload"><input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /><span><Upload size={19} /> Choose image</span><small>{image?.name ?? 'JPG, PNG, or WebP up to 5 MB'}</small></label></fieldset><div className="medicine-form-actions"><button type="button" className="ghost-button" onClick={onBack}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Creating medicine…' : 'Create medicine'}</button></div></form> : <section className="medicine-import-panel" role="tabpanel"><div className="medicine-import-copy"><div className="medicine-import-icon"><Upload aria-hidden="true" /></div><div><h2>Import medicines from a spreadsheet</h2><p>Use one row per medicine. English and Arabic names are required; code is used to update a matching medicine when supplied.</p></div></div><div className="medicine-import-actions"><button type="button" className="ghost-button" onClick={() => void downloadTemplate()}><Download size={18} /> Download template</button><label className="custom-file-upload spreadsheet-upload"><input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => setSpreadsheet(event.target.files?.[0] ?? null)} /><span><Upload size={19} /> Choose Excel or CSV file</span><small>{spreadsheet?.name ?? 'XLSX or CSV, up to 5 MB'}</small></label><button type="button" className="primary-button" disabled={!spreadsheet || saving} onClick={() => void importCatalog()}>{saving ? 'Importing…' : 'Import medicines'}</button></div><div className="medicine-import-guidance"><strong>Supported columns</strong><span>code, name_en, name_ar, manufacturer, active_ingredient, form, dosage, pack_size, administration_route, category_id, prescription_required, is_active</span></div></section>}</section></section>
}

function MedicineEditPanel({ medicine, onClose, onSaved }: { medicine: Record<string, unknown>; onClose: () => void; onSaved: () => void }) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setMessage(''); const form = new FormData(event.currentTarget); const payload = Object.fromEntries(medicineDetailFields.map((field) => [field, form.get(field)])); try { await api.patch(`/medicines/${String(medicine.id)}`, { ...payload, prescription_required: form.get('prescription_required') === 'on', is_active: Boolean(medicine.is_active) }, mutationConfig('medicine', String(medicine.id), 'update')); setMessage('Medicine updated.'); onSaved() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update medicine.' : 'Unable to update medicine.') } finally { setSaving(false) } }
  return <section className="panel medicine-edit-panel"><div className="panel-heading"><div><p className="eyebrow">EDIT MEDICINE</p><h2>{String(medicine.name_en)}</h2><p className="muted">Update catalog and clinical information. Status is controlled from the table.</p></div><button type="button" className="ghost-button" onClick={onClose}>Close editor</button></div><form className="medicine-record-form compact" onSubmit={save}><div className="medicine-form-grid">{[['name_en', 'English name'], ['name_ar', 'Arabic name'], ['manufacturer', 'Manufacturer'], ['active_ingredient', 'Active ingredient'], ['form', 'Form'], ['dosage', 'Dosage'], ['pack_size', 'Pack size'], ['administration_route', 'Administration route'], ['code', 'Code']].map(([name, label]) => <label key={name}>{label}<input name={name} defaultValue={String(medicine[name] ?? '')} required={name === 'name_en' || name === 'name_ar'} /></label>)}</div><div className="medicine-form-textareas">{[['description', 'Description'], ['indications', 'Indications'], ['directions', 'Directions'], ['side_effects', 'Side effects'], ['warnings', 'Warnings'], ['contraindications', 'Contraindications'], ['drug_interactions', 'Drug interactions'], ['storage_instructions', 'Storage instructions']].map(([name, label]) => <label key={name}>{label}<textarea name={name} defaultValue={String(medicine[name] ?? '')} /></label>)}</div><label className="medicine-prescription-toggle"><input name="prescription_required" type="checkbox" defaultChecked={Boolean(medicine.prescription_required)} /> Prescription required</label><div className="medicine-form-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save medicine'}</button></div>{message && <div className="form-message" role="status">{message}</div>}</form></section>
}

export function MedicineAdminPage({ locale, onCreate }: { locale: string; onCreate: () => void }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [prescription, setPrescription] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('name_en')
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('asc')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const load = async () => { setLoading(true); try { const response = await api.get('/medicines', { params: { include_inactive: true, search, status, ...(prescription === '' ? {} : { prescription_required: prescription === 'required' }), page, per_page: perPage, sort_by: sortBy, sort_direction: sortDirection } }); const data = response.data.data ?? []; setRows(data); setLastPage(Number(response.data.last_page ?? 1)); setTotal(Number(response.data.total ?? data.length)) } catch { setRows([]); setLastPage(1); setTotal(0); setMessage('Unable to load the medicine catalog.') } finally { setLoading(false) } }
  useEffect(() => { document.title = `MedLine · ${tr('medicineCatalog', locale)}` }, [locale])
  useEffect(() => { void load() }, [search, status, prescription, page, perPage, sortBy, sortDirection])
  const toggleSort = (column: string) => { if (sortBy === column) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(column); setSortDirection('asc') }; setPage(1) }
  const setActive = async (row: Record<string, unknown>, active: boolean) => { try { const response = await api.patch(`/medicines/${String(row.id)}/status`, { is_active: active }, mutationConfig('medicine-status', String(row.id), active ? 'activate' : 'deactivate')); setMessage(response.data.message ?? 'Medicine status updated.'); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to change medicine status.' : 'Unable to change medicine status.') } }

  const exportCatalog = async () => { try { const response = await api.get('/medicines/export', { params: { include_inactive: true }, responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = 'medline-medicine-catalog.csv'; link.click(); URL.revokeObjectURL(url); setMessage('Catalog export downloaded.') } catch { setMessage('Unable to export catalog.') } }
  return <section className="content orders-content operations-list-content management-list-content medicine-management-page">{editing && <MedicineEditPanel medicine={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}<section className="panel table-panel orders-table-panel operations-table-panel"><div className="panel-heading orders-panel-heading"><div><div className="orders-heading-row"><h1>Medicine catalog</h1><span className="orders-result-count" aria-live="polite">{loading ? 'Updating' : `${total} ${total === 1 ? 'medicine' : 'medicines'}`}</span></div><p className="muted">Search, filter, sort, and manage every medicine record.</p></div><div className="row-actions"><button type="button" className="ghost-button" onClick={() => void exportCatalog()}><Download size={18} /> Export CSV</button><button type="button" className="ghost-button" onClick={() => { window.history.pushState({}, '', '/inventory/categories'); window.dispatchEvent(new PopStateEvent('popstate')) }}><Package size={18} /> Manage categories</button><button type="button" className="primary-button" onClick={onCreate}><Plus size={18} /> Add medicine</button></div></div>{message && <div className="form-message" role="status">{message}</div>}<div className="table-controls orders-toolbar management-toolbar management-toolbar-three" role="search" aria-label="Medicine filters"><label className="orders-search-control"><span>Search medicines</span><span className="search-box"><Search size={19} aria-hidden="true" /><input aria-label="Search medicines" placeholder="Name, manufacturer, code, or form" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></span></label><label className="orders-status-filter"><span>Status</span><select aria-label="Filter medicines by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="orders-status-filter"><span>Prescription</span><select aria-label="Filter medicines by prescription requirement" value={prescription} onChange={(event) => { setPrescription(event.target.value); setPage(1) }}><option value="">All medicines</option><option value="required">Prescription required</option><option value="not_required">No prescription</option></select></label></div><div className="orders-table-region operations-table-region" role="region" aria-label="Scrollable medicine catalog table" aria-busy={loading} tabIndex={0}><table className="orders-data-table operations-data-table admin-management-table medicines-management-table"><caption className="sr-only">Medicine catalog</caption><thead><tr><SortableTableHeader label="Medicine" column="name_en" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Manufacturer / form" column="manufacturer" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Dosage" column="dosage" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Code" column="code" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Prescription" column="prescription_required" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Status" column="is_active" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Created" column="created_at" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Action" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /></tr></thead><tbody>{loading ? <tr className="orders-state-row"><td colSpan={8}><span className="state">Loading medicines...</span></td></tr> : rows.length === 0 ? <tr className="orders-state-row"><td colSpan={8}><span className="state">No medicines match the current filters.</span></td></tr> : rows.map((row) => { const active = row.is_active === true || Number(row.is_active) === 1; return <tr className="orders-data-row" key={String(row.id)} tabIndex={0} aria-label={`Open ${String(row.name_en)}`} onClick={(event) => { if ((event.target as HTMLElement).closest('button, a')) return; openMedicineDetail(Number(row.id)) }} onKeyDown={(event) => { if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); openMedicineDetail(Number(row.id)) }}><th scope="row"><button type="button" className="order-id-button" onClick={() => openMedicineDetail(Number(row.id))}>{String(row.name_en)}<small>{String(row.name_ar ?? '')}</small></button></th><td>{[row.manufacturer, row.form].filter(Boolean).map(String).join(' · ') || 'Not recorded'}</td><td>{String(row.dosage ?? 'Not recorded')}</td><td>{String(row.code ?? 'Not assigned')}</td><td><ManagementStatus status={row.prescription_required ? 'required' : 'not_required'} /></td><td><ManagementStatus status={active ? 'active' : 'inactive'} /></td><td><time dateTime={String(row.created_at ?? '')}>{formatMedlineDate(row.created_at, locale)}</time></td><td><div className="orders-action-cell"><div className="row-actions"><button type="button" className="ghost-button" aria-label={`View ${String(row.name_en)}`} title="View medicine" onClick={() => openMedicineDetail(Number(row.id))}><Eye size={19} /></button><button type="button" className="ghost-button" aria-label={`Edit ${String(row.name_en)}`} title="Edit medicine" onClick={() => setEditing(row)}><Pencil size={19} /></button><button type="button" className={active ? 'reject-button' : 'approve-button'} aria-label={`${active ? 'Deactivate' : 'Activate'} ${String(row.name_en)}`} title={active ? 'Deactivate medicine' : 'Activate medicine'} onClick={() => void setActive(row, !active)}><Power size={19} /></button></div></div></td></tr> })}</tbody></table></div><ManagementTableFooter label="medicines" page={page} lastPage={lastPage} perPage={perPage} onPageChange={setPage} onPerPageChange={(size) => { setPerPage(size); setPage(1) }} /></section></section>
}

function MedicineCategoryAdmin({ locale }: { locale: string }) {
  const [categories, setCategories] = useState<Array<Record<string, unknown>>>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('name_en')
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('asc')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  useEffect(() => { document.title = `MedLine · ${tr('categories', locale)}` }, [locale])
  const load = async () => {
    setLoading(true)
    try {
      const response = await api.get('/medicine-categories', { params: { search, page, per_page: perPage, sort_by: sortBy, sort_direction: sortDirection } })
      const data = response.data.data ?? []
      setCategories(data)
      setLastPage(Number(response.data.last_page ?? 1))
      setTotal(Number(response.data.total ?? data.length))
    } catch {
      setCategories([]); setLastPage(1); setTotal(0); setMessage('Unable to load medicine categories.')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [search, page, perPage, sortBy, sortDirection])
  const toggleSort = (column: string) => { if (sortBy === column) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(column); setSortDirection('asc') }; setPage(1) }
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      await api.post('/medicine-categories', { name_en: form.get('name_en'), name_ar: form.get('name_ar'), slug: form.get('slug') }, mutationConfig('medicine-category', uniqueMutationId('medicine-category'), 'create'))
      setMessage('Category created.'); event.currentTarget.reset(); setPage(1); await load()
    } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to create category.' : 'Unable to create category.') }
    finally { setSaving(false) }
  }
  const update = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editing) return; setSaving(true); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      await api.patch(`/medicine-categories/${String(editing.id)}`, { name_en: form.get('name_en'), name_ar: form.get('name_ar'), slug: form.get('slug') }, mutationConfig('medicine-category', Number(editing.id), 'update'))
      setMessage('Category updated.'); setEditing(null); await load()
    } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update category.' : 'Unable to update category.') }
    finally { setSaving(false) }
  }
  return <section className="content orders-content operations-list-content management-list-content category-management-page">
    <section className="panel table-panel orders-table-panel operations-table-panel">
      <div className="panel-heading orders-panel-heading"><div><div className="orders-heading-row"><h1>Medicine categories</h1><span className="orders-result-count" aria-live="polite">{loading ? 'Updating' : `${total} ${total === 1 ? 'category' : 'categories'}`}</span></div><p className="muted">Search, sort, and maintain the taxonomy used throughout the medicine catalog.</p></div></div>
      <form className="category-create-form" onSubmit={create}>
        <label><span>English name</span><input name="name_en" required maxLength={120} /></label>
        <label><span>Arabic name</span><input name="name_ar" required maxLength={120} dir="rtl" /></label>
        <label><span>Slug</span><input name="slug" required maxLength={140} pattern="[A-Za-z0-9_-]+" /></label>
        <button className="primary-button" type="submit" disabled={saving}><Plus size={18} aria-hidden="true" /> {saving ? 'Saving…' : 'Add category'}</button>
      </form>
      {message && <div className="form-message" role="status">{message}</div>}
      {editing && <form className="category-edit-form" onSubmit={update}><div><strong>Edit category</strong><span>Changes appear anywhere this category is referenced.</span></div><label><span>English name</span><input name="name_en" defaultValue={String(editing.name_en ?? '')} required maxLength={120} /></label><label><span>Arabic name</span><input name="name_ar" defaultValue={String(editing.name_ar ?? '')} required maxLength={120} dir="rtl" /></label><label><span>Slug</span><input name="slug" defaultValue={String(editing.slug ?? '')} required maxLength={140} pattern="[A-Za-z0-9_-]+" /></label><div className="row-actions"><button className="ghost-button" type="button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>Save changes</button></div></form>}
      <div className="table-controls orders-toolbar management-toolbar" role="search" aria-label="Category filters"><label className="orders-search-control"><span>Search categories</span><span className="search-box"><Search size={19} aria-hidden="true" /><input aria-label="Search medicine categories" placeholder="English name, Arabic name, or slug" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></span></label></div>
      <div className="orders-table-region operations-table-region" role="region" aria-label="Scrollable medicine categories table" aria-busy={loading} tabIndex={0}>
        <table className="orders-data-table operations-data-table admin-management-table categories-management-table">
          <caption className="sr-only">Medicine categories</caption>
          <thead><tr><SortableTableHeader label="English name" column="name_en" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Arabic name" column="name_ar" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Slug" column="slug" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Medicines" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Created" column="created_at" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Action" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /></tr></thead>
          <tbody>{loading ? <tr className="orders-state-row"><td colSpan={6}><span className="state" role="status">Loading categories…</span></td></tr> : categories.length === 0 ? <tr className="orders-state-row"><td colSpan={6}><span className="state" role="status">No categories match the current search.</span></td></tr> : categories.map((category) => <tr className="orders-data-row" key={String(category.id)} tabIndex={0} aria-label={`Edit category ${String(category.name_en)}`} onClick={(event) => { if ((event.target as HTMLElement).closest('button, a, input')) return; setEditing(category) }} onKeyDown={(event) => { if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); setEditing(category) }}><th scope="row"><button type="button" className="order-id-button" onClick={() => setEditing(category)}>{String(category.name_en)}</button></th><td dir="rtl">{String(category.name_ar)}</td><td><span className="status-pill">{String(category.slug)}</span></td><td>{Number(category.medicines_count ?? 0).toLocaleString()}</td><td><time dateTime={String(category.created_at ?? '')}>{formatMedlineDate(category.created_at, locale)}</time></td><td><div className="orders-action-cell"><button type="button" className="ghost-button" aria-label={`Edit ${String(category.name_en)}`} title="Edit category" onClick={() => setEditing(category)}><Pencil size={19} aria-hidden="true" /></button></div></td></tr>)}</tbody>
        </table>
      </div>
      <ManagementTableFooter label="categories" page={page} lastPage={lastPage} perPage={perPage} onPageChange={setPage} onPerPageChange={(size) => { setPerPage(size); setPage(1) }} />
    </section>
  </section>
}

function MedicineCategoryAdminLegacy({ locale }: { locale: string }) {
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

void MedicineCategoryAdminLegacy

function MedicineEditAdminPage({ locale }: { locale: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [selectedId, setSelectedId] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { document.title = `MedLine · ${tr('editMedicine', locale)}` }, [locale])
  const selected = rows.find((row) => String(row.id) === selectedId)
  useEffect(() => { api.get('/medicines', { params: { per_page: 100 } }).then((response) => setRows(response.data.data ?? [])).catch(() => setRows([])) }, [])
  const update = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedId) return; const form = new FormData(event.currentTarget); const detailFields = ['name_en', 'name_ar', 'manufacturer', 'active_ingredient', 'form', 'dosage', 'pack_size', 'administration_route', 'code', 'description', 'indications', 'directions', 'side_effects', 'warnings', 'contraindications', 'drug_interactions', 'storage_instructions']; const payload = Object.fromEntries(detailFields.map((field) => [field, form.get(field)])); try { await api.patch(`/medicines/${selectedId}`, { ...payload, prescription_required: form.get('prescription_required') === 'on', is_active: form.get('is_active') === 'on' }, mutationConfig('medicine', selectedId, 'update')); setMessage('Medicine updated.'); const response = await api.get('/medicines', { params: { per_page: 100 } }); setRows(response.data.data ?? []) } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to update medicine.' : 'Unable to update medicine.') } }
  const deactivate = async (id: string) => { try { await api.patch(`/medicines/${id}/status`, { is_active: false }, mutationConfig('medicine-status', id, 'deactivate')); setMessage('Medicine deactivated.'); const response = await api.get('/medicines', { params: { per_page: 100, include_inactive: true } }); setRows(response.data.data ?? []) } catch { setMessage('Unable to deactivate medicine.') } }
  return <section className="content"><section className="panel medicine-edit-workspace"><div className="panel-heading"><div><p className="eyebrow">{tr('catalogRefinement', locale)}</p><h2>{tr('editMedicine', locale)}</h2></div></div><div className="operations-table medicine-edit-table"><div className="table-row table-head"><span>Medicine</span><span>Manufacturer</span><span>Form / dosage</span><span>Prescription</span><span>Action</span></div>{rows.map((row) => <div className="table-row" key={String(row.id)}><strong>{String(row.name_en)}<small>{String(row.name_ar ?? '')}</small></strong><span>{String(row.manufacturer ?? '—')}</span><span>{String(row.form ?? '—')} · {String(row.dosage ?? '—')}</span><span className="status-pill">{row.prescription_required ? tr('prescription', locale) : tr('noPrescription', locale)}</span><div className="row-actions"><button className="ghost-button" type="button" onClick={() => setSelectedId(String(row.id))}>View</button><button className="approve-button" type="button" onClick={() => setSelectedId(String(row.id))}>Edit</button><button className="reject-button" type="button" onClick={() => void deactivate(String(row.id))}>Delete</button></div></div>)}</div>{selected && <div className="medicine-edit-form"><div className="panel-heading"><div><p className="eyebrow">EDIT FORM</p><h3>{String(selected.name_en)}</h3></div><button className="ghost-button" type="button" onClick={() => setSelectedId('')}>Close</button></div><form className="inline-form" key={selectedId} onSubmit={update}><input name="name_en" defaultValue={String(selected.name_en ?? '')} placeholder={tr('englishName', locale)} required /><input name="name_ar" defaultValue={String(selected.name_ar ?? '')} placeholder={tr('arabicName', locale)} required /><input name="manufacturer" defaultValue={String(selected.manufacturer ?? '')} placeholder={tr('manufacturer', locale)} /><input name="form" defaultValue={String(selected.form ?? '')} placeholder={tr('form', locale)} /><input name="dosage" defaultValue={String(selected.dosage ?? '')} placeholder={tr('dosage', locale)} /><input name="code" defaultValue={String(selected.code ?? '')} placeholder={tr('code', locale)} /><label className="check-field"><input name="prescription_required" type="checkbox" defaultChecked={Boolean(selected.prescription_required)} /> {tr('prescription', locale)}</label><label className="check-field"><input name="is_active" type="checkbox" defaultChecked={selected.is_active !== false} /> {tr('active', locale)}</label><button className="primary-button" type="submit">{tr('saveMedicine', locale)}</button></form></div>}{message && <div className="form-success" role="status">{message}</div>}</section></section>
}

export function AdminReviewHub({ locale }: { locale: string }) {
  const [tab, setTab] = useState<'payments' | 'applications'>('payments')
  return <section className="content admin-review-hub"><div className="welcome-row"><div><p className="eyebrow">SUBSCRIPTION ACCESS</p><h1>Subscription reviews</h1><p className="muted">Review pharmacy and warehouse registration and subscription payment evidence from one place.</p></div></div><div className="review-hub-tabs" role="tablist" aria-label="Subscription review type"><button type="button" role="tab" aria-selected={tab === 'payments'} className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}><CreditCard size={18} /> Subscription payments</button><button type="button" role="tab" aria-selected={tab === 'applications'} className={tab === 'applications' ? 'active' : ''} onClick={() => setTab('applications')}><ShieldCheck size={18} /> Pharmacy &amp; warehouse verification</button></div><div className="review-hub-content">{tab === 'payments' ? <AdminSubscriptionReviewPage locale={locale} /> : <OperationsPage section="verification" role="admin" locale={locale} />}</div></section>
}

export function AdminSubscriptionReviewPage({ locale }: { locale: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('payment_under_review')
  const [origin, setOrigin] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const load = async () => {
    setLoading(true)
    try {
      const response = await api.get('/admin/subscriptions', { params: { search, status, origin, page, per_page: 20 } })
      setRows(response.data.data ?? [])
      setLastPage(Number(response.data.last_page ?? 1))
    } catch (loadError) { setMessage(axios.isAxiosError(loadError) ? loadError.response?.data?.message ?? 'Unable to load subscription reviews.' : 'Unable to load subscription reviews.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [search, status, origin, page])
  const decide = async (row: Record<string, unknown>, decision: 'approve' | 'correction' | 'reject') => {
    const id = String(row.id)
    const note = String(notes[id] ?? '').trim()
    if (decision === 'correction' && !note) { setMessage('Add a clear correction comment before requesting changes.'); return }
    if (decision === 'reject' && !window.confirm(`Reject the ${String(row.origin ?? '')} payment from ${String(row.business_name ?? 'this pharmacy or warehouse')}?`)) return
    setBusy(`${id}:${decision}`)
    setMessage('')
    try {
      const response = await api.post(`/admin/subscriptions/${id}/decision`, { decision, ...(note ? { note } : {}) }, mutationConfig('subscription-decision', id, decision))
      setMessage(response.data.message ?? 'Payment review saved.')
      setNotes((current) => ({ ...current, [id]: '' }))
      await load()
    } catch (decisionError) { setMessage(axios.isAxiosError(decisionError) ? decisionError.response?.data?.message ?? 'Unable to save this payment review.' : 'Unable to save this payment review.') }
    finally { setBusy(null) }
  }
  const textStatus = (value: unknown) => String(value ?? '').replaceAll('_', ' ')

  return <section className="content subscription-review-page"><div className="welcome-row"><div><p className="eyebrow">FINANCE & ACCESS</p><h1>Subscription reviews</h1><p className="muted">Review registration and renewal receipts, then approve, request a correction, or reject.</p></div><span className="live-status"><i /> Audited decisions</span></div>
    <section className="panel subscription-review-panel"><div className="subscription-review-filters"><label>Search<input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value) }} placeholder="Business, contact, email, or plan" /></label><label>Review status<select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value) }}><option value="payment_under_review">Needs review</option><option value="correction_required">Correction requested</option><option value="active">Approved</option><option value="rejected">Rejected</option><option value="">All statuses</option></select></label><label>Payment type<select value={origin} onChange={(event) => { setPage(1); setOrigin(event.target.value) }}><option value="">Registration and renewal</option><option value="registration">Registration</option><option value="renewal">Renewal</option></select></label></div>
      {message && <div className="form-message" role="status">{message}</div>}
      <div className="subscription-review-list">{loading ? <div className="state">Loading payment reviews...</div> : rows.length === 0 ? <div className="state">No subscription payments match these filters.</div> : rows.map((row) => { const id = String(row.id); const pending = row.status === 'payment_under_review'; const organizationType = String(row.type) === 'warehouse' ? 'Warehouse' : 'Pharmacy'; return <article className="subscription-review-item" key={id}><div className="subscription-review-main"><div className="subscription-review-title"><div><span className="review-origin">{textStatus(row.origin)} · {organizationType}</span><h2>{String(row.business_name ?? organizationType)}</h2><p>{String(row.contact_name ?? 'Contact')} · {String(row.contact_email ?? '')}</p></div><span className={`status-pill review-status-${String(row.status)}`}>{textStatus(row.status)}</span></div><dl className="subscription-review-facts"><div><dt>Organization type</dt><dd>{organizationType}</dd></div><div><dt>Exact amount submitted</dt><dd>{formatMedlineMoney(row.amount, 'SYP', locale)}</dd></div><div><dt>Plan</dt><dd>{textStatus(row.plan_code)} · {String(row.duration_months ?? 12)} months</dd></div><div><dt>Submitted</dt><dd>{formatMedlineDate(row.created_at, locale)}</dd></div><div><dt>Activation dates</dt><dd>{row.starts_at ? `${String(row.starts_at)} – ${String(row.ends_at ?? 'Open')}` : 'Assigned after approval'}</dd></div></dl>{Boolean(row.review_note) && <div className="admin-review-note"><strong>Previous administrator comment</strong><span>{String(row.review_note)}</span></div>}</div><aside className="subscription-review-actions">{Boolean(row.payment_proof_id) && <button type="button" className="ghost-button receipt-button" onClick={() => void downloadPrivate(`/admin/payment-proofs/${String(row.payment_proof_id)}/download`, `medline-payment-${id}`)}><Eye size={18} /> View receipt</button>}{pending ? <><label>Review comment<textarea value={notes[id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [id]: event.target.value }))} placeholder="Required when requesting a correction" maxLength={1000} /></label><div className="review-decision-buttons"><button type="button" className="approve-button" disabled={busy !== null} onClick={() => void decide(row, 'approve')}><FileCheck2 size={18} /> Approve</button><button type="button" className="correction-button" disabled={busy !== null} onClick={() => void decide(row, 'correction')}>Request correction</button><button type="button" className="reject-button" disabled={busy !== null} onClick={() => void decide(row, 'reject')}><FileX2 size={18} /> Reject</button></div></> : <p className="muted">{row.status === 'correction_required' ? `Waiting for the ${organizationType.toLowerCase()} to upload a corrected receipt.` : `Reviewed ${row.reviewed_at ? formatMedlineDate(row.reviewed_at, locale) : ''}`}</p>}</aside></article> })}</div><TablePagination page={page} lastPage={lastPage} onPageChange={setPage} />
    </section>
  </section>
}

function PartnerSubscriptionPage({ locale }: { locale: string }) {
  const [record, setRecord] = useState<Record<string, any>>({})
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null)
  const [profile, setProfile] = useState<Record<string, string>>({})
  const [proof, setProof] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKey = useRef<string | null>(null)
  const active = record.active_subscription as Record<string, unknown> | null
  const review = record.review_subscription as Record<string, unknown> | null
  const scheduled = record.scheduled_subscription as Record<string, unknown> | null
  const payment = record.payment_proof as Record<string, unknown> | null
  const partner = record.partner as Record<string, unknown> | null
  const accessActive = Boolean(record.access_active)
  const reviewStatus = String(review?.status ?? '')
  const mayUpload = !review || reviewStatus === 'correction_required'

  const load = async () => {
    setLoading(true)
    try {
      const [currentResponse, plansResponse] = await Promise.all([api.get('/subscription'), api.get('/subscription/plans')])
      const current = currentResponse.data ?? {}
      const loadedPartner = current.partner ?? {}
      setRecord(current)
      setPlan(plansResponse.data.data?.[0] ?? null)
      setProfile({ business_name: String(loadedPartner.business_name ?? ''), license_number: String(loadedPartner.license_number ?? ''), address: String(loadedPartner.address ?? ''), latitude: String(loadedPartner.latitude ?? ''), longitude: String(loadedPartner.longitude ?? '') })
    } catch (loadError) { setMessage(axios.isAxiosError(loadError) ? loadError.response?.data?.message ?? tr('unableToLoadSubscription', locale) : tr('unableToLoadSubscription', locale)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const submitProof = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!proof || !plan?.amount || submitting) return
    setSubmitting(true)
    setMessage('')
    const key = idempotencyKey.current ?? uniqueMutationId('web-payment-proof')
    idempotencyKey.current = key
    const data = new FormData()
    data.append('amount', String(plan.amount))
    data.append('plan_code', String(plan.code ?? ''))
    data.append('proof', proof)
    try {
      const response = await api.post('/subscription/payment-proof', data, { headers: { 'Idempotency-Key': key } })
      setMessage(response.data.message ?? 'Payment proof submitted for administrator review.')
      setProof(null)
      idempotencyKey.current = null
      await load()
    } catch (submitError) { setMessage(axios.isAxiosError(submitError) ? submitError.response?.data?.message ?? tr('uploadFailed', locale) : tr('uploadFailed', locale)) }
    finally { setSubmitting(false) }
  }
  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    try { await api.patch('/subscription/profile', profile, mutationConfig('partner-profile', 'self', 'resubmit')); setMessage('Corrected organization details resubmitted for review.'); await load() }
    catch (submitError) { setMessage(axios.isAxiosError(submitError) ? submitError.response?.data?.message ?? 'Unable to resubmit organization details.' : 'Unable to resubmit organization details.') }
  }
  const dateOnly = (value: unknown) => value ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(String(value))) : 'Not active yet'
  const titleStatus = (value: unknown) => String(value ?? 'not active').replaceAll('_', ' ')

  return <section className="content subscription-workspace"><div className="welcome-row"><div><p className="eyebrow">{String(partner?.type) === 'warehouse' ? 'WAREHOUSE ACCOUNT' : 'PHARMACY ACCOUNT'}</p><h1>Subscription</h1><p className="muted">Review your access dates, payment review, and any administrator feedback.</p></div><span className={`subscription-access-badge ${accessActive ? 'is-active' : 'is-inactive'}`}>{accessActive ? 'Operational access active' : 'Operational access inactive'}</span></div>
    <div className="subscription-summary-grid"><section className="panel subscription-status-card"><p className="eyebrow">CURRENT ACCESS</p><h2>{loading ? 'Loading...' : accessActive ? 'Active' : titleStatus(review?.status ?? partner?.approval_status)}</h2><div className="subscription-dates"><div><span>Start date</span><strong>{dateOnly(active?.starts_at)}</strong></div><div><span>End date</span><strong>{dateOnly(active?.ends_at)}</strong></div></div>{scheduled && <p className="subscription-note">Next period: {dateOnly(scheduled.starts_at)} – {dateOnly(scheduled.ends_at)}</p>}</section>
      <section className="panel subscription-plan-card"><p className="eyebrow">ANNUAL PLAN</p><h2>{String(plan?.duration_months ?? 12)} months</h2><strong className="subscription-price">{formatMedlineMoney(plan?.amount, 'SYP', locale)}</strong><p className="muted">The exact configured amount must appear on the uploaded receipt.</p></section>
      <section className="panel subscription-review-card"><p className="eyebrow">PAYMENT REVIEW</p><h2>{review ? titleStatus(review.status) : active ? 'No payment awaiting review' : 'Payment required'}</h2>{Boolean(payment?.review_note) && <div className="admin-review-note"><strong>Administrator comment</strong><span>{String(payment?.review_note)}</span></div>}<p className="muted">{reviewStatus === 'payment_under_review' ? 'Your receipt is with the administrator. No action is needed until the review is completed.' : reviewStatus === 'correction_required' ? 'Upload a corrected receipt below. The previous file will be replaced.' : active ? 'You may submit the next annual payment when ready.' : 'Submit a receipt to begin review.'}</p></section></div>
    {partner?.approval_status === 'correction_required' && <section className="panel correction-panel"><div className="panel-heading"><div><p className="eyebrow">ORGANIZATION CORRECTION REQUIRED</p><h2>Update registration details</h2><p className="muted">Administrator comment: {String(partner.review_note ?? 'Please review and correct your organization details.')}</p></div></div><form className="registration-form correction-form" onSubmit={submitProfile}><div className="registration-grid"><label>Business name<input value={profile.business_name ?? ''} onChange={(event) => setProfile((current) => ({ ...current, business_name: event.target.value }))} required /></label><label>License number<input value={profile.license_number ?? ''} onChange={(event) => setProfile((current) => ({ ...current, license_number: event.target.value }))} required /></label><label className="registration-span-2">Registered address<input value={profile.address ?? ''} onChange={(event) => setProfile((current) => ({ ...current, address: event.target.value }))} required /></label></div><RegistrationMapPicker latitude={profile.latitude ?? ''} longitude={profile.longitude ?? ''} onChange={(latitude, longitude) => setProfile((current) => ({ ...current, latitude, longitude }))} /><button className="primary-button" type="submit">Resubmit organization details</button></form></section>}
    {mayUpload && <section className={`panel payment-upload-panel ${reviewStatus === 'correction_required' ? 'needs-correction' : ''}`}><div className="panel-heading"><div><p className="eyebrow">{reviewStatus === 'correction_required' ? 'CORRECTED RECEIPT' : active ? 'RENEWAL PAYMENT' : 'PAYMENT RECEIPT'}</p><h2>{reviewStatus === 'correction_required' ? 'Replace the payment proof' : 'Submit payment for review'}</h2></div></div><form className="subscription-form" onSubmit={submitProof}><label>Exact amount (SYP)<input value={String(plan?.amount ?? '')} readOnly aria-readonly="true" /></label><label>Receipt file<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setProof(event.target.files?.[0] ?? null)} required /><small className="field-help">JPG, PNG, or PDF, up to 10 MB.</small></label><button className="primary-button" type="submit" disabled={!proof || !plan?.amount || submitting}>{submitting ? 'Submitting...' : reviewStatus === 'correction_required' ? 'Resubmit corrected receipt' : 'Submit for administrator review'}</button></form></section>}
    {message && <div className="form-message" role="status">{message}</div>}
  </section>
}

void PartnerSubscriptionPageOld
function PartnerSubscriptionPageOld({ locale }: { locale: string }) {
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
  const storedRoute = roadRoutePoints(route.geometry)
  const routeUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${pickupPoint.latitude},${pickupPoint.longitude};${dropoffPoint.latitude},${dropoffPoint.longitude}`
  const pickupLabel = JSON.stringify(String(pickup.label ?? 'Pharmacy')).replaceAll('<', '\\u003c')
  const dropoffLabel = JSON.stringify(String(dropoff.label ?? 'Patient address')).replaceAll('<', '\\u003c')
  const mapDocument = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0}#map{font-family:Arial,sans-serif}.leaflet-control-attribution{font-size:10px}.leaflet-popup-content{font-size:12px;font-weight:600}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script><script>const pickup=[${pickupPoint.latitude},${pickupPoint.longitude}],dropoff=[${dropoffPoint.latitude},${dropoffPoint.longitude}],path=${JSON.stringify(storedRoute)};const map=L.map('map').fitBounds(path.length>1?path:[pickup,dropoff],{padding:[80,80],maxZoom:14});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'· OpenStreetMap contributors'}).addTo(map);L.marker(pickup).addTo(map).bindPopup('<b>Pickup</b><br>'+${pickupLabel}).openPopup();L.marker(dropoff).addTo(map).bindPopup('<b>Drop-off</b><br>'+${dropoffLabel});if(path.length>1){L.polyline(path,{color:'#1596c3',weight:6,opacity:.95,lineCap:'round',lineJoin:'round'}).addTo(map)}<\/script></body></html>`
  const durationMinutes = Number(route.duration_seconds) > 0 ? Math.max(1, Math.round(Number(route.duration_seconds) / 60)) : null
  const storedDistance = Number(route.distance_km)
  return <section className="panel route-card"><div className="panel-heading"><div><p className="eyebrow">ROAD ROUTE · OPENSTREETMAP</p><h2>Pickup and drop-off</h2><p className="muted">The stored road route used to calculate this order’s distance and driver fee.</p></div><a className="ghost-button" href={routeUrl} target="_blank" rel="noreferrer">Open directions ↗</a></div><div className="route-map route-map-real"><iframe title={`OpenStreetMap road route from ${String(pickup.label ?? 'pickup')} to ${String(dropoff.label ?? 'drop-off')}`} srcDoc={mapDocument} loading="lazy" referrerPolicy="no-referrer" /></div><div className="route-legend"><span><i className="legend-dot pickup-dot" /> Pickup: {String(pickup.label ?? 'Pharmacy')}</span><span><i className="legend-dot dropoff-dot" /> Drop-off: {String(dropoff.label ?? 'Patient address')}</span>{storedRoute.length >= 2 && Number.isFinite(storedDistance) ? <span><i className="legend-line" /> {storedDistance.toFixed(2)} km road route{durationMinutes ? ` · about ${durationMinutes} min` : ''}</span> : <span>Road route snapshot unavailable</span>}</div></section>
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

function OrderItemsDecisionPanel({ order, items, onUpdated, locale }: { order: Record<string, any>; items: Array<Record<string, any>>; onUpdated: () => Promise<void>; locale: string }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const [note, setNote] = useState('')
  const [prescriptionNotes, setPrescriptionNotes] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [prescriptionBusy, setPrescriptionBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ url: string; medicine: string } | null>(null)
  const previewCloseButton = useRef<HTMLButtonElement>(null)
  const previewTrigger = useRef<HTMLButtonElement | null>(null)
  const role = (() => { try { return String(JSON.parse(localStorage.getItem('medline_user') ?? '{}').role ?? '') } catch { return '' } })()
  const status = String(order.status ?? '')
  const pharmacyCanDecide = role === 'pharmacy' && ['pending_pharmacy_review', 'prescription_review'].includes(status)
  const decisionRecorded = ['partial_approval_required', 'partially_accepted', 'accepted', 'partial_offer_rejected'].includes(status)

  useEffect(() => {
    setQuantities(Object.fromEntries(items.map((item) => {
      const required = Boolean(item.prescription_required_snapshot ?? item.prescription_required)
      const prescription = item.prescription as Record<string, unknown> | null
      const eligible = !required || prescription?.status === 'approved'
      return [String(item.id), eligible ? Number(item.quantity ?? 0) : 0]
    })))
  }, [order.id, status, items])
  useEffect(() => {
    if (!preview) return
    previewCloseButton.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null) }
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('keydown', closeOnEscape); URL.revokeObjectURL(preview.url); previewTrigger.current?.focus() }
  }, [preview])

  const quantityToFulfil = (item: Record<string, any>) => {
    const requested = Math.max(0, Number(item.quantity ?? 0))
    const entered = Number(quantities[String(item.id)] ?? 0)
    return Math.max(0, Math.min(requested, Number.isFinite(entered) ? Math.trunc(entered) : 0))
  }
  const selectedUnits = items.reduce((sum, item) => sum + quantityToFulfil(item), 0)
  const requestedUnits = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity ?? 0)), 0)
  const quantitiesChanged = items.some((item) => quantityToFulfil(item) < Math.max(0, Number(item.quantity ?? 0)))
  const partialSelectionValid = quantitiesChanged && selectedUnits > 0 && selectedUnits < requestedUnits
  const decisionNoteValid = note.trim().length >= 5
  const partialDecisionHint = !quantitiesChanged
    ? 'Reduce at least one quantity below the amount requested to enable partial approval.'
    : selectedUnits === 0
      ? 'At least one unit must remain selected. Use Reject order if nothing can be fulfilled.'
      : !decisionNoteValid
        ? 'Add a note of at least 5 characters explaining the reduced or excluded quantities.'
        : 'Ready to send. The patient must approve this partial offer before delivery can begin.'

  const decide = async (decision: 'accept' | 'partial' | 'reject') => {
    const cleanedNote = note.trim()
    if (decision === 'partial' && !partialSelectionValid) { setMessage(partialDecisionHint); return }
    if ((decision === 'partial' || decision === 'reject') && !decisionNoteValid) { setMessage('Add a note of at least 5 characters for the patient before continuing.'); return }
    setBusy(true)
    setMessage('')
    try {
      const payload = { decision, ...((decision === 'partial' || decision === 'reject') ? { note: cleanedNote } : {}), ...(decision === 'partial' ? { items: items.map((item) => ({ id: Number(item.id), accepted_quantity: quantityToFulfil(item) })) } : {}) }
      await api.post(`/partner/orders/${String(order.id)}/decision`, payload, mutationConfig('order-decision', String(order.id), decision))
      setMessage(decision === 'partial' ? 'The partial approval was sent to the patient. Delivery will wait for their confirmation.' : `Order ${decision === 'accept' ? 'approved' : 'rejected'}.`)
      await onUpdated()
    } catch (error) {
      setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to save the order decision.' : 'Unable to save the order decision.')
    } finally { setBusy(false) }
  }
  const decidePartialOffer = async (decision: 'approve' | 'reject') => {
    setBusy(true)
    setMessage('')
    try {
      const response = await api.post(`/orders/${String(order.id)}/partial-offer/decision`, { decision, ...(note ? { note } : {}) }, mutationConfig('partial-offer', String(order.id), decision))
      setMessage(response.data.message ?? 'Decision saved.')
      await onUpdated()
    } catch (error) {
      setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to save your partial-offer decision.' : 'Unable to save your partial-offer decision.')
    } finally { setBusy(false) }
  }
  const uploadPrescription = async (item: Record<string, any>) => {
    const file = files[String(item.id)]
    if (!file) return
    setBusy(true)
    setMessage('')
    const form = new FormData()
    form.append('prescription', file)
    try {
      await api.post(`/orders/${String(order.id)}/items/${String(item.id)}/prescription`, form, { headers: mutationConfig('item-prescription', String(item.id), uniqueMutationId('resubmit')).headers })
      setMessage(`Prescription for ${String(item.name_en)} submitted.`)
      setFiles((current) => ({ ...current, [String(item.id)]: null }))
      await onUpdated()
    } catch (error) {
      setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to upload the prescription.' : 'Unable to upload the prescription.')
    } finally { setBusy(false) }
  }
  const openPrescription = async (item: Record<string, any>, prescription: Record<string, unknown>, trigger: HTMLButtonElement) => {
    const prescriptionId = String(prescription.id ?? '')
    if (!prescriptionId) return
    setPrescriptionBusy(`preview:${prescriptionId}`)
    previewTrigger.current = trigger
    setMessage('')
    try {
      const ticket = await api.get(`/prescriptions/${prescriptionId}/download-url`)
      const response = await api.get(String(ticket.data.url), { responseType: 'blob' })
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data])
      setPreview({ url: URL.createObjectURL(blob), medicine: String(item.name_en ?? 'Prescription medicine') })
    } catch (error) {
      setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to open this prescription.' : 'Unable to open this prescription.')
    } finally { setPrescriptionBusy(null) }
  }
  const reviewPrescription = async (item: Record<string, any>, prescription: Record<string, unknown>, decision: 'approve' | 'reject') => {
    const prescriptionId = String(prescription.id ?? '')
    const reviewNote = String(prescriptionNotes[prescriptionId] ?? '').trim()
    if (decision === 'reject' && !reviewNote) { setMessage(`Add a rejection reason for ${String(item.name_en ?? 'this medicine')}.`); return }
    setPrescriptionBusy(`review:${prescriptionId}`)
    setMessage('')
    try {
      await api.post(`/pharmacy/prescriptions/${prescriptionId}/review`, { decision, ...(reviewNote ? { note: reviewNote } : {}) }, mutationConfig('prescription-review', prescriptionId, decision))
      setMessage(`Prescription for ${String(item.name_en ?? 'medicine')} ${decision === 'approve' ? 'approved' : 'rejected'}.`)
      await onUpdated()
    } catch (error) {
      setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to review this prescription.' : 'Unable to review this prescription.')
    } finally { setPrescriptionBusy(null) }
  }

  return <section className="panel order-items-decision-card">
    <div className="panel-heading"><div><p className="eyebrow">MEDICINES &amp; PRESCRIPTIONS</p><h2>Review this order medicine by medicine</h2><p className="muted">Open each prescription document separately, record its decision, then approve all or part of the order.</p></div><span className="order-item-count">{items.length} {items.length === 1 ? 'medicine' : 'medicines'}</span></div>
    {order.partial_offer_note && <div className="partial-offer-note"><strong>Pharmacy note</strong><span>{String(order.partial_offer_note)}</span></div>}
    <div className="order-detail-items">
      <div className="order-detail-item order-detail-item-head"><span>Medicine</span><span>Requested</span><span>Quantity to fulfil</span><span>Prescription document</span><span>Outcome</span></div>
      {items.map((item) => {
        const prescription = item.prescription as Record<string, unknown> | null
        const required = Boolean(item.prescription_required_snapshot ?? item.prescription_required)
        const accepted = Number(item.accepted_quantity ?? 0)
        const requested = Number(item.quantity ?? 0)
        const selected = Number(quantities[String(item.id)] ?? 0)
        const prescriptionStatus = String(prescription?.status ?? 'missing')
        const eligible = !required || prescriptionStatus === 'approved'
        const outcome = decisionRecorded ? (accepted === 0 ? 'Not included' : accepted < requested ? 'Partially accepted' : 'Accepted') : pharmacyCanDecide ? (selected === 0 ? 'Not selected' : selected < requested ? 'Partial selection' : 'Selected') : 'Awaiting pharmacy'
        const prescriptionId = String(prescription?.id ?? '')
        return <div className={`order-detail-item ${decisionRecorded && accepted === 0 ? 'ignored' : ''}`} key={String(item.id)}>
          <button type="button" className="order-item-medicine" onClick={() => openMedicineDetail(Number(item.medicine_id))}><strong>{String(item.name_en ?? `Medicine ${item.medicine_id}`)}</strong><small>{String(item.dosage ?? item.form ?? item.manufacturer ?? '')}</small></button>
          <span>{requested}</span>
          <span>{pharmacyCanDecide ? <span className="fulfil-quantity"><input aria-label={`Quantity to fulfil for ${String(item.name_en)}`} type="number" min="0" max={requested} step="1" inputMode="numeric" value={selected} disabled={!eligible || busy || prescriptionBusy !== null} onChange={(event) => { const entered = Number(event.target.value); const nextQuantity = Number.isFinite(entered) ? Math.trunc(entered) : 0; setQuantities((current) => ({ ...current, [String(item.id)]: Math.max(0, Math.min(requested, nextQuantity)) })) }} />{!eligible && <small>Approve the prescription first</small>}</span> : decisionRecorded ? accepted : '—'}</span>
          <div className="order-prescription-review">
            {required ? <em className={`item-prescription-status status-${prescriptionStatus}`}>{prescriptionStatus.replaceAll('_', ' ')}</em> : <em className="item-prescription-status status-not-required">Not required</em>}
            {required && prescription && <button type="button" className="prescription-view-button" disabled={prescriptionBusy !== null} onClick={(event) => void openPrescription(item, prescription, event.currentTarget)}><Eye size={16} aria-hidden="true" />{prescriptionBusy === `preview:${prescriptionId}` ? 'Opening…' : 'View document'}</button>}
            {required && !prescription && <small className="prescription-awaiting-copy">Waiting for the patient to upload this document.</small>}
            {required && Boolean(prescription?.review_note) && <small className="prescription-review-note">Review note: {String(prescription?.review_note)}</small>}
            {role === 'pharmacy' && prescriptionStatus === 'pending_review' && prescription && <div className="prescription-inline-decision">
              <label><span>Pharmacist note <small>Required to reject</small></span><textarea aria-label={`Pharmacist note for ${String(item.name_en)}`} value={prescriptionNotes[prescriptionId] ?? ''} onChange={(event) => setPrescriptionNotes((current) => ({ ...current, [prescriptionId]: event.target.value }))} maxLength={1000} /></label>
              <div className="row-actions"><button type="button" className="approve-button" disabled={prescriptionBusy !== null || busy} onClick={() => void reviewPrescription(item, prescription, 'approve')}><FileCheck2 size={15} aria-hidden="true" /> Approve</button><button type="button" className="reject-button" disabled={prescriptionBusy !== null || busy} onClick={() => void reviewPrescription(item, prescription, 'reject')}><FileX2 size={15} aria-hidden="true" /> Reject</button></div>
            </div>}
            {role === 'patient' && required && ['prescription_required', 'prescription_review'].includes(status) && (!prescription || prescription.status === 'rejected') && <span className="order-item-prescription-upload"><input aria-label={`Prescription for ${String(item.name_en)}`} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setFiles((current) => ({ ...current, [String(item.id)]: event.target.files?.[0] ?? null }))} /><button type="button" className="ghost-button" disabled={!files[String(item.id)] || busy} onClick={() => void uploadPrescription(item)}>Upload</button></span>}
          </div>
          <span className={`item-outcome ${outcome === 'Not included' || outcome === 'Not selected' ? 'not-included' : ''}`}>{outcome}</span>
        </div>
      })}
    </div>
    {pharmacyCanDecide && <div className="partial-decision-controls"><div className="order-decision-heading"><strong>Order decision</strong><span>Set each quantity from zero up to the amount requested. Reduce at least one quantity to create a partial offer.</span></div><label className="decision-note-field"><span>Note to patient <small>Required for partial approval or rejection</small></span><textarea aria-describedby="decision-note-help" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain reduced quantities, unavailable medicines, or the reason for rejection" maxLength={1000} /><small id="decision-note-help">Enter at least 5 characters so the patient understands what changed.</small></label><div className="row-actions">{status === 'pending_pharmacy_review' && <button type="button" className="approve-button" disabled={busy || prescriptionBusy !== null} onClick={() => void decide('accept')}>Approve all</button>}<button type="button" className="correction-button" aria-describedby="partial-decision-hint" disabled={busy || prescriptionBusy !== null || !partialSelectionValid || !decisionNoteValid} onClick={() => void decide('partial')}>Approve partially</button><button type="button" className="reject-button" aria-describedby="decision-note-help" disabled={busy || prescriptionBusy !== null || !decisionNoteValid} onClick={() => void decide('reject')}>Reject order</button></div><small id="partial-decision-hint" className={partialSelectionValid && decisionNoteValid ? 'decision-hint ready' : 'decision-hint'} aria-live="polite">{partialDecisionHint}</small></div>}
    {role === 'patient' && status === 'partial_approval_required' && <div className="patient-partial-decision"><div><strong>The pharmacy offered part of your order.</strong><span>Review every accepted and excluded quantity above. Delivery starts only if you approve.</span></div><label>Optional note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} /></label><div className="row-actions"><button type="button" className="approve-button" disabled={busy} onClick={() => void decidePartialOffer('approve')}>Approve partial order</button><button type="button" className="reject-button" disabled={busy} onClick={() => void decidePartialOffer('reject')}>Decline offer</button></div></div>}
    {message && <div className="form-message" role="status">{message}</div>}
    <div className="order-item-totals"><span>Originally requested <strong>{formatMedlineMoney(items.reduce((sum, item) => sum + Number(item.requested_line_total ?? item.line_total ?? 0), 0), 'SYP', locale)}</strong></span>{decisionRecorded && <span>Accepted medicines <strong>{formatMedlineMoney(items.reduce((sum, item) => sum + Number(item.accepted_line_total ?? 0), 0), 'SYP', locale)}</strong></span>}</div>
    {preview && <div className="prescription-viewer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null) }}><section className="prescription-viewer" role="dialog" aria-modal="true" aria-labelledby="prescription-viewer-title"><header><div><p className="eyebrow">PRIVATE PRESCRIPTION</p><h2 id="prescription-viewer-title">{preview.medicine}</h2></div><button ref={previewCloseButton} type="button" aria-label="Close prescription viewer" onClick={() => setPreview(null)}><X size={20} aria-hidden="true" /></button></header><iframe title={`Prescription for ${preview.medicine}`} src={preview.url} /><p>Only authorized pharmacy staff, the patient, and administrators can access this document.</p></section></div>}
  </section>
}

function OrderItemsDecisionPanelLegacy2({ order, items, onUpdated, locale }: { order: Record<string, any>; items: Array<Record<string, any>>; onUpdated: () => Promise<void>; locale: string }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const role = (() => { try { return String(JSON.parse(localStorage.getItem('medline_user') ?? '{}').role ?? '') } catch { return '' } })()
  const status = String(order.status ?? '')
  useEffect(() => setQuantities(Object.fromEntries(items.map((item) => [String(item.id), Number(item.quantity ?? 0)]))), [order.id, items.length])
  const decide = async (decision: 'accept' | 'partial' | 'reject') => { setBusy(true); setMessage(''); try { const payload = { decision, note: note || undefined, ...(decision === 'partial' ? { items: items.map((item) => ({ id: Number(item.id), accepted_quantity: Math.max(0, Math.min(Number(item.quantity), Number(quantities[String(item.id)] ?? 0))) })) } : {}) }; await api.post(`/partner/orders/${String(order.id)}/decision`, payload, mutationConfig('order-decision', String(order.id), decision)); setMessage(decision === 'partial' ? 'Partial offer sent to the patient for approval. Delivery has not started.' : `Order ${decision === 'accept' ? 'accepted' : 'rejected'}.`); await onUpdated() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to save the order decision.' : 'Unable to save the order decision.') } finally { setBusy(false) } }
  const decidePartialOffer = async (decision: 'approve' | 'reject') => { setBusy(true); setMessage(''); try { const response = await api.post(`/orders/${String(order.id)}/partial-offer/decision`, { decision, ...(note ? { note } : {}) }, mutationConfig('partial-offer', String(order.id), decision)); setMessage(response.data.message ?? 'Decision saved.'); await onUpdated() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to save your partial-offer decision.' : 'Unable to save your partial-offer decision.') } finally { setBusy(false) } }
  const uploadPrescription = async (item: Record<string, any>) => { const file = files[String(item.id)]; if (!file) return; setBusy(true); setMessage(''); const form = new FormData(); form.append('prescription', file); try { await api.post(`/orders/${String(order.id)}/items/${String(item.id)}/prescription`, form, { headers: mutationConfig('item-prescription', String(item.id), uniqueMutationId('resubmit')).headers }); setMessage(`Prescription for ${String(item.name_en)} submitted.`); setFiles((current) => ({ ...current, [String(item.id)]: null })); await onUpdated() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to upload the prescription.' : 'Unable to upload the prescription.') } finally { setBusy(false) } }
  const decisionRecorded = ['partial_approval_required', 'partially_accepted', 'accepted', 'partial_offer_rejected'].includes(status)
  // @ts-expect-error The guarded optional review note is stringified before rendering; the dynamic API record prevents JSX from narrowing it.
  return <section className="panel order-items-decision-card"><div className="panel-heading"><div><p className="eyebrow">MEDICINES</p><h2>Requested and accepted items</h2><p className="muted">Every requested item remains visible, including quantities that the pharmacy could not fulfil.</p></div><span className="order-item-count">{items.length} {items.length === 1 ? 'medicine' : 'medicines'}</span></div>{order.partial_offer_note && <div className="partial-offer-note"><strong>Pharmacy note</strong><span>{String(order.partial_offer_note)}</span></div>}<div className="order-detail-items"><div className="order-detail-item order-detail-item-head"><span>Medicine</span><span>Requested</span><span>Offered / accepted</span><span>Prescription</span><span>Outcome</span></div>{items.map((item) => { const prescription = item.prescription as Record<string, unknown> | null; const required = Boolean(item.prescription_required_snapshot ?? item.prescription_required); const accepted = Number(item.accepted_quantity ?? 0); const requested = Number(item.quantity ?? 0); const outcome = !decisionRecorded ? 'Awaiting pharmacy' : accepted === 0 ? 'Not included' : accepted < requested ? 'Partially accepted' : 'Accepted'; return <div className={`order-detail-item ${decisionRecorded && accepted === 0 ? 'ignored' : ''}`} key={String(item.id)}><button type="button" className="order-item-medicine" onClick={() => openMedicineDetail(Number(item.medicine_id))}><strong>{String(item.name_en ?? `Medicine ${item.medicine_id}`)}</strong><small>{String(item.dosage ?? item.form ?? item.manufacturer ?? '')}</small></button><span>{requested}</span><span>{role === 'pharmacy' && status === 'pending_pharmacy_review' ? <input aria-label={`Accepted quantity for ${String(item.name_en)}`} type="number" min="0" max={requested} value={quantities[String(item.id)] ?? requested} onChange={(event) => setQuantities((current) => ({ ...current, [String(item.id)]: Number(event.target.value) }))} /> : decisionRecorded ? accepted : '—'}</span><span>{required ? <em className={`item-prescription-status status-${String(prescription?.status ?? 'missing')}`}>{String(prescription?.status ?? 'Missing').replaceAll('_', ' ')}</em> : <em className="item-prescription-status status-not-required">Not required</em>}{required && prescription?.review_note && <small className="prescription-review-note">{String(prescription.review_note)}</small>}{role === 'patient' && required && ['prescription_required', 'prescription_review'].includes(status) && (!prescription || prescription.status === 'rejected') && <span className="order-item-prescription-upload"><input aria-label={`Prescription for ${String(item.name_en)}`} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setFiles((current) => ({ ...current, [String(item.id)]: event.target.files?.[0] ?? null }))} /><button type="button" className="ghost-button" disabled={!files[String(item.id)] || busy} onClick={() => void uploadPrescription(item)}>Upload</button></span>}</span><span className={`item-outcome ${outcome === 'Not included' ? 'not-included' : ''}`}>{outcome}</span></div> })}</div>{role === 'pharmacy' && status === 'pending_pharmacy_review' && <div className="partial-decision-controls"><label>Note to patient<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain unavailable quantities or substitutions" maxLength={1000} /></label><div className="row-actions"><button type="button" className="approve-button" disabled={busy} onClick={() => void decide('accept')}>Accept all</button><button type="button" className="correction-button" disabled={busy} onClick={() => void decide('partial')}>Send partial offer</button><button type="button" className="reject-button" disabled={busy} onClick={() => void decide('reject')}>Reject order</button></div><small>Partial offers require patient approval before any delivery is created.</small></div>}{role === 'patient' && status === 'partial_approval_required' && <div className="patient-partial-decision"><div><strong>The pharmacy offered part of your order.</strong><span>Review every accepted and excluded quantity above. Delivery starts only if you approve.</span></div><label>Optional note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} /></label><div className="row-actions"><button type="button" className="approve-button" disabled={busy} onClick={() => void decidePartialOffer('approve')}>Approve partial order</button><button type="button" className="reject-button" disabled={busy} onClick={() => void decidePartialOffer('reject')}>Decline offer</button></div></div>}{message && <div className="form-message" role="status">{message}</div>}<div className="order-item-totals"><span>Originally requested <strong>{formatMedlineMoney(items.reduce((sum, item) => sum + Number(item.requested_line_total ?? item.line_total ?? 0), 0), 'SYP', locale)}</strong></span>{decisionRecorded && <span>Accepted medicines <strong>{formatMedlineMoney(items.reduce((sum, item) => sum + Number(item.accepted_line_total ?? 0), 0), 'SYP', locale)}</strong></span>}</div></section>
}

void OrderItemsDecisionPanelLegacy2

export function OrderDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const [currentDetail, setCurrentDetail] = useState(detail)
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null)
  const [tripOrder, setTripOrder] = useState<Record<string, unknown> | null>(null)
  useEffect(() => setCurrentDetail(detail), [detail])
  const order = (currentDetail.order ?? {}) as Record<string, unknown>
  const delivery = (currentDetail.delivery ?? {}) as Record<string, unknown>
  const driver = (delivery.driver ?? {}) as Record<string, unknown>
  const route = (currentDetail.route ?? {}) as Record<string, unknown>
  const invoice = (currentDetail.invoice ?? {}) as Record<string, unknown>
  const timeline = Array.isArray(currentDetail.timeline) ? currentDetail.timeline as Array<Record<string, unknown>> : []
  const items = Array.isArray(order.items) ? order.items as Array<Record<string, any>> : []
  const refresh = async () => { const response = await api.get(`/orders/${String(order.id)}`); setCurrentDetail(response.data) }
  const amount = (key: string) => formatMedlineMoney(invoice[key] ?? order[key] ?? 0, 'SYP', locale)
  const currentStatus = String(delivery.status ?? order.status ?? 'pending')
  const statusLabel = (value: string) => value.replaceAll('_', ' ')
  const readableStatus = statusLabel(currentStatus).replace(/\b\w/g, (letter) => letter.toUpperCase())
  const paymentMethod = String(invoice.payment_method ?? order.payment_method ?? 'cash_on_delivery').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  const deliveryDuration = formatDeliveryDuration(timeline, delivery.completed_at ?? delivery.location_updated_at)
  if (tripOrder) return <OrderDetailPanel detail={tripOrder} onClose={() => setTripOrder(null)} locale={locale} />
  if (selectedDriverId) return <DriverProfilePanel driverId={selectedDriverId} onClose={() => setSelectedDriverId(null)} onOpenOrder={(orderId) => { void api.get(`/orders/${orderId}`).then((response) => setTripOrder(response.data)).catch(() => setTripOrder({ error: 'Unable to load order details.' })) }} />
  if (currentDetail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>Back to queue</button><div className="form-error">{String(currentDetail.error)}</div></section>
  return <section className="content order-detail-content">
    <div className="welcome-row"><div><p className="eyebrow">{locale === 'ar' ? '— · · · · ·? · — · · · · —' : 'ORDER DETAIL'}</p><h1>{String(order.public_id ?? order.id ?? 'Order')}</h1><div className="order-meta"><span className={`order-status status-${currentStatus.replaceAll('_', '-')}`}><i />{readableStatus}</span><span className="muted">{formatMedlineDate(order.created_at, locale)}</span></div></div><button className="ghost-button" onClick={onClose}>{locale === 'ar' ? '— · · · ·? — · · · · · · · · · · · —' : 'Back to queue'}</button></div>
    <div className="order-detail-grid">
      <section className="panel invoice-card"><div className="panel-heading"><div><p className="eyebrow">{locale === 'ar' ? '— · · · · · ·? — · —' : 'INVOICE'}</p><h2>{locale === 'ar' ? '— · · · · · · · · —' : 'Order summary'}</h2></div><span className="detail-total">{amount('total')}</span></div><div className="invoice-lines"><p><span>Subtotal</span><strong>{amount('subtotal')}</strong></p><p><span>Tax ({Number(invoice.tax_rate ?? order.tax_rate ?? 0).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%)</span><strong>{amount('tax_amount')}</strong></p>{(invoice.delivery_distance_km ?? order.delivery_distance_km) != null && <p><span>Delivery distance</span><strong>{Number(invoice.delivery_distance_km ?? order.delivery_distance_km).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km</strong></p>}{(invoice.delivery_rate_per_km ?? order.delivery_rate_per_km) != null && <p><span>Rate at order time</span><strong>SYP {Number(invoice.delivery_rate_per_km ?? order.delivery_rate_per_km).toLocaleString()} / km</strong></p>}<p><span>Delivery fee</span><strong>{amount('delivery_fee')}</strong></p><p className="invoice-grand-total"><span>Total</span><strong>{amount('total')}</strong></p></div><div className="payment-line"><span>Payment method</span><strong className="payment-pill"><CreditCard size={14} />{paymentMethod}</strong></div></section>
      <section className="panel driver-card driver-card-clickable" role="button" tabIndex={0} onClick={() => Number(driver.driver_id ?? delivery.driver_id) > 0 && setSelectedDriverId(Number(driver.driver_id ?? delivery.driver_id))} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); Number(driver.driver_id ?? delivery.driver_id) > 0 && setSelectedDriverId(Number(driver.driver_id ?? delivery.driver_id)) } }}><div className="panel-heading"><div><p className="eyebrow">DRIVER</p><h2>{driver.name ? String(driver.name) : 'Awaiting driver assignment'}</h2></div><span className="driver-avatar">{driver.name ? String(driver.name).slice(0, 1).toUpperCase() : '?'}</span></div>{driver.name ? <><div className="driver-status"><i /> {driver.is_available ? 'Available for delivery' : 'Assigned to delivery'}</div><div className="driver-details"><p><span>Vehicle</span><strong>{String(driver.vehicle_type ?? 'Delivery vehicle')}</strong></p><p><span>Plate</span><strong>{String(driver.vehicle_plate ?? 'Not provided')}</strong></p><p><span>Contact</span><strong>{String(driver.email ?? 'Not provided')}</strong></p></div><span className="driver-view-hint">View driver profile and trip history — ·? ?</span></> : <p className="muted">The driver details will appear here after a driver claims this delivery.</p>}</section>
      <OrderItemsDecisionPanel order={order} items={items} onUpdated={refresh} locale={locale} />
      <section className="panel order-schedule-card"><div className="panel-heading"><div><p className="eyebrow">DELIVERY REQUEST</p><h2>{order.scheduled_delivery_at ? 'Scheduled delivery' : 'As soon as possible'}</h2></div><Clock3 size={22} aria-hidden="true" /></div><p className="muted">{order.scheduled_delivery_at ? formatMedlineDate(order.scheduled_delivery_at, locale) : 'Deliver as soon as a driver is available.'}</p></section>
      <RouteMap route={route} />
      <section className="panel timeline-card"><div className="panel-heading"><div><p className="eyebrow">DELIVERY TIMELINE</p><h2>Delivery progress</h2></div><div className="timeline-heading-right"><span className={`order-status status-${currentStatus.replaceAll('_', '-')}`}><i />{statusLabel(currentStatus).replace(/\b\w/g, (letter) => letter.toUpperCase())}</span><div className="timeline-summary"><span>Total delivery time</span><strong>{deliveryDuration}</strong></div></div></div>{timeline.length === 0 ? <div className="state">No delivery events recorded yet.</div> : <div className="step-timeline">{timeline.map((event, index) => <div className={`timeline-step ${index === timeline.length - 1 ? 'current' : 'complete'}`} key={String(event.id ?? index)}><div className="step-marker">{index + 1}</div><div className="step-content"><strong>{statusLabel(String(event.to_status ?? 'Updated'))}</strong><span>{formatMedlineDate(event.created_at, locale)}</span>{Boolean(event.note) && <small>{String(event.note)}</small>}</div></div>)}</div>}</section>
    </div>
  </section>
}

function DeliveryVerificationPanel({ delivery, role, locale, onUpdated }: { delivery: Record<string, unknown>; role: string; locale: string; onUpdated: () => Promise<void> }) {
  const [pickupCode, setPickupCode] = useState('')
  const [recipientCode, setRecipientCode] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [fieldError, setFieldError] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const verification = (delivery.verification ?? {}) as Record<string, Record<string, unknown>>
  const pickup = verification.pickup ?? { state: 'not_started' }
  const recipient = verification.recipient ?? { state: 'not_started' }
  const ar = locale === 'ar'
  const stateLabels: Record<string, string> = { not_started: ar ? 'لم يبدأ' : 'Not started', code_sent: ar ? 'تم إرسال الرمز' : 'Code sent', verified: ar ? 'تم التحقق' : 'Verified', expired: ar ? 'انتهت الصلاحية' : 'Expired', locked: ar ? 'مقفل' : 'Locked' }
  const stateLabel = (state: unknown) => stateLabels[String(state)] ?? String(state)
  const submit = async (action: string, path: string, body: Record<string, unknown> = {}) => {
    if (busyAction) return
    setBusyAction(action); setMessage(''); setFieldError({})
    try {
      const response = await api.post(`/deliveries/${String(delivery.id)}/${path}`, body, mutationConfig('delivery-verification', Number(delivery.id), action))
      setMessage(String(response.data.message ?? (ar ? 'تم تحديث التحقق.' : 'Verification updated.')))
      if (action === 'verify-pickup') setPickupCode('')
      if (action === 'verify-recipient') setRecipientCode('')
      await onUpdated()
    } catch (error) {
      setMessage(axios.isAxiosError(error) ? String(error.response?.data?.message ?? (ar ? 'تعذر إكمال التحقق.' : 'Unable to complete verification.')) : (ar ? 'تعذر إكمال التحقق.' : 'Unable to complete verification.'))
      await onUpdated().catch(() => undefined)
    } finally { setBusyAction('') }
  }
  const verify = (event: FormEvent<HTMLFormElement>, kind: 'pickup' | 'recipient') => {
    event.preventDefault()
    const code = kind === 'pickup' ? pickupCode : recipientCode
    if (!/^\d{4}$/.test(code)) { setFieldError({ [kind]: ar ? 'أدخل الرمز المكوّن من 4 أرقام.' : 'Enter the complete 4-digit code.' }); return }
    void submit(`verify-${kind}`, `${kind}-verification/verify`, { code })
  }
  const status = String(delivery.status ?? '')
  const roleIsPickupPartner = Boolean(delivery.viewer_is_pickup_partner)
  const roleIsRecipient = Boolean(delivery.viewer_is_recipient)
  const pickupDescription = roleIsPickupPartner
    ? (ar ? 'ابدأ التحقق عند وصول السائق، ثم أدخل الرمز الذي يعرضه عليك قبل تسليم الأدوية.' : 'Start when the driver arrives, then enter the code shown by the driver before handing over medicines.')
    : role === 'driver'
      ? (ar ? 'ستتلقى الرمز عبر البريد. اعرضه على فريق الاستلام ليؤكد تسليم الأدوية لك.' : 'You receive this code by email. Show it to pickup staff so they can confirm the medicines were handed to you.')
      : (ar ? 'تؤكد نقطة التجهيز استلام السائق قبل بدء الرحلة.' : 'The fulfilment partner confirms the driver pickup before the trip begins.')
  const recipientDescription = role === 'driver'
    ? (ar ? 'عند الوصول أرسل الرمز للمستلم، ثم أدخله قبل تسليم الأدوية.' : 'At arrival, email a code to the recipient and enter it before handing over medicines.')
    : roleIsRecipient
      ? (ar ? 'عند وصول السائق سيصلك رمز بالبريد. أعطه للسائق بعد معاينة الطلب.' : 'When the driver arrives, you receive a code by email. Give it to the driver after inspecting the order.')
      : (ar ? 'يتحقق السائق من المستلم قبل إتمام التسليم.' : 'The driver verifies the recipient before completing the handoff.')
  return <section className="panel delivery-verification-panel" aria-labelledby="delivery-verification-heading">
    <div className="panel-heading"><div><p className="eyebrow">{ar ? 'تسليم آمن' : 'SECURE HANDOFF'}</p><h2 id="delivery-verification-heading">{ar ? 'التحقق بخطوتين' : 'Two-step verification'}</h2><p className="muted">{ar ? 'رمزان منفصلان يحميان استلام السائق وتسليم المستلم.' : 'Separate codes protect driver pickup and recipient handoff.'}</p></div><LockKeyhole size={24} aria-hidden="true" /></div>
    <div className="verification-step-list">
      <article className={`verification-step state-${String(pickup.state)}`}><span className="verification-step-number">1</span><div className="verification-step-copy"><div className="verification-step-heading"><strong>{ar ? 'الصيدلية أو المستودع ← السائق' : 'Pickup partner → driver'}</strong><span><ShieldCheck size={14} aria-hidden="true" />{stateLabel(pickup.state)}</span></div><p>{pickupDescription}</p>{Boolean(pickup.expires_at) && pickup.state === 'code_sent' && <small>{ar ? 'تنتهي الصلاحية: ' : 'Expires: '}{formatMedlineDate(pickup.expires_at, locale)} · {Number(pickup.attempts_remaining ?? 0)} {ar ? 'محاولات متبقية' : 'attempts remaining'}</small>}
        {roleIsPickupPartner && Boolean(delivery.can_initiate_pickup_verification) && <button type="button" className="ghost-button verification-send-button" disabled={Boolean(busyAction)} onClick={() => void submit('send-pickup', 'pickup-verification/initiate')}><LockKeyhole size={17} aria-hidden="true" />{busyAction === 'send-pickup' ? (ar ? 'جارٍ الإرسال…' : 'Sending…') : pickup.state === 'not_started' ? (ar ? 'إرسال الرمز إلى السائق' : 'Send code to driver') : (ar ? 'إرسال رمز جديد' : 'Send a new code')}</button>}
        {roleIsPickupPartner && Boolean(delivery.can_verify_pickup) && <form className="verification-code-form" onSubmit={(event) => verify(event, 'pickup')} noValidate><label htmlFor="pickup-verification-code">{ar ? 'رمز السائق المكوّن من 4 أرقام' : 'Driver’s 4-digit pickup code'}</label><div><input id="pickup-verification-code" value={pickupCode} onChange={(event) => { setPickupCode(event.target.value.replace(/\D/g, '').slice(0, 4)); setFieldError({}) }} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4}" maxLength={4} aria-describedby={fieldError.pickup ? 'pickup-code-error' : 'pickup-code-help'} aria-invalid={Boolean(fieldError.pickup)} /><button className="approve-button" type="submit" disabled={Boolean(busyAction)}>{busyAction === 'verify-pickup' ? (ar ? 'جارٍ التحقق…' : 'Verifying…') : (ar ? 'تأكيد استلام السائق' : 'Verify driver pickup')}</button></div><small id="pickup-code-help">{ar ? 'أدخل الرمز الذي يعرضه السائق أمامك.' : 'Enter the code the driver shows you in person.'}</small>{fieldError.pickup && <small id="pickup-code-error" className="field-error" role="alert">{fieldError.pickup}</small>}</form>}
      </div></article>
      <article className={`verification-step state-${String(recipient.state)}`}><span className="verification-step-number">2</span><div className="verification-step-copy"><div className="verification-step-heading"><strong>{ar ? 'السائق ← المستلم' : 'Driver → recipient'}</strong><span><ShieldCheck size={14} aria-hidden="true" />{stateLabel(recipient.state)}</span></div><p>{recipientDescription}</p>{Boolean(recipient.expires_at) && recipient.state === 'code_sent' && <small>{ar ? 'تنتهي الصلاحية: ' : 'Expires: '}{formatMedlineDate(recipient.expires_at, locale)} · {Number(recipient.attempts_remaining ?? 0)} {ar ? 'محاولات متبقية' : 'attempts remaining'}</small>}
        {role === 'driver' && Boolean(delivery.can_initiate_recipient_verification) && <button type="button" className="ghost-button verification-send-button" disabled={Boolean(busyAction)} onClick={() => void submit('send-recipient', 'recipient-verification/initiate')}><LockKeyhole size={17} aria-hidden="true" />{busyAction === 'send-recipient' ? (ar ? 'جارٍ الإرسال…' : 'Sending…') : recipient.state === 'not_started' ? (ar ? 'إرسال الرمز إلى المستلم' : 'Send code to recipient') : (ar ? 'إرسال رمز جديد' : 'Send a new code')}</button>}
        {role === 'driver' && Boolean(delivery.can_verify_recipient) && <form className="verification-code-form" onSubmit={(event) => verify(event, 'recipient')} noValidate><label htmlFor="recipient-verification-code">{ar ? 'رمز المستلم المكوّن من 4 أرقام' : 'Recipient’s 4-digit handoff code'}</label><div><input id="recipient-verification-code" value={recipientCode} onChange={(event) => { setRecipientCode(event.target.value.replace(/\D/g, '').slice(0, 4)); setFieldError({}) }} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4}" maxLength={4} aria-describedby={fieldError.recipient ? 'recipient-code-error' : 'recipient-code-help'} aria-invalid={Boolean(fieldError.recipient)} /><button className="approve-button" type="submit" disabled={Boolean(busyAction)}>{busyAction === 'verify-recipient' ? (ar ? 'جارٍ الإكمال…' : 'Completing…') : (ar ? 'تحقق وأكمل التسليم' : 'Verify & complete handoff')}</button></div><small id="recipient-code-help">{ar ? 'أدخل الرمز الذي يعطيك إياه المستلم شخصياً.' : 'Enter the code the recipient gives you in person.'}</small>{fieldError.recipient && <small id="recipient-code-error" className="field-error" role="alert">{fieldError.recipient}</small>}</form>}
        {role === 'driver' && ['picked_up', 'in_transit'].includes(status) && <button type="button" className="approve-button verification-progress-button" disabled={Boolean(busyAction)} onClick={() => void submit('arrived', 'status', { status: 'arrived' })}><MapPin size={17} aria-hidden="true" />{busyAction === 'arrived' ? (ar ? 'جارٍ التحديث…' : 'Updating…') : (ar ? 'تأكيد الوصول' : 'Mark arrived')}</button>}
      </div></article>
    </div>
    {message && <div className={/unable|incorrect|expired|locked|تعذر|خطأ|انتهت|مقفل/i.test(message) ? 'form-error' : 'form-success'} role="status">{message}</div>}
  </section>
}

function DeliveryDetailPresentation({ delivery, driver, recipient, items, events, route, mapUrl, terminal, role, canAccept, accepting, actionMessage, verificationPanel, onAccept, onClose, onDriverClick, text }: { delivery: Record<string, unknown>; driver: Record<string, unknown>; recipient: Record<string, unknown>; items: Array<Record<string, unknown>>; events: Array<Record<string, unknown>>; route: Record<string, unknown>; mapUrl: string | null; terminal: boolean; role: string; canAccept: boolean; accepting: boolean; actionMessage: string; verificationPanel: ReactNode; onAccept: () => void; onClose: () => void; onDriverClick: () => void; text: (key: string) => string }) {
  const statusLabel = (value: string) => value.replaceAll('_', ' ')
  const currentStatus = statusLabel(deliveryStatusForDisplay(String(delivery.status ?? 'unknown')))
  const deliveryDuration = formatDeliveryDuration(events, delivery.completed_at)
  const acceptanceBanner = <>{canAccept && <div className="delivery-claim-banner"><span><strong>{text('reviewOrderBeforeAccepting')}</strong><small>{text('acceptOrderHint')}</small></span><button className="approve-button driver-accept-job" type="button" disabled={accepting} onClick={onAccept}><Truck size={19} aria-hidden="true" />{accepting ? text('acceptingOrder') : text('acceptThisOrder')}</button></div>}{actionMessage && <div className={actionMessage.toLowerCase().includes('unable') || actionMessage.includes('تعذر') ? 'form-error' : 'form-success'} role="status">{actionMessage}</div>}</>
  const pickupManifest = <section className="panel delivery-pickup-list"><div className="panel-heading"><div><p className="eyebrow">PICKUP MANIFEST</p><h2>Medicines to collect</h2><p className="muted">Confirm every medicine and quantity at the pickup location.</p></div><span className="record-count-badge">{items.length} {items.length === 1 ? 'item' : 'items'}</span></div>{items.length === 0 ? <div className="state">No medicine lines were recorded for this delivery.</div> : <div className="pickup-manifest-items">{items.map((item, index) => <article key={String(item.id ?? index)}><span>{index + 1}</span><div><strong>{String(item.name_en ?? `Medicine ${index + 1}`)}</strong><small>{[item.dosage, item.form, item.manufacturer].filter(Boolean).join(' · ')}</small></div><strong>{Number(item.pickup_quantity ?? 0).toLocaleString()} units</strong></article>)}</div>}</section>
  const pickup = (route.pickup ?? {}) as Record<string, unknown>
  const dropoff = (route.dropoff ?? {}) as Record<string, unknown>
  const pickupLatitude = pickup.latitude
  const pickupLongitude = pickup.longitude
  const destinationLatitude = dropoff.latitude
  const destinationLongitude = dropoff.longitude
  const hasPickupCoordinates = pickupLatitude !== null && pickupLatitude !== undefined && pickupLatitude !== '' && pickupLongitude !== null && pickupLongitude !== undefined && pickupLongitude !== '' && Number.isFinite(Number(pickupLatitude)) && Number.isFinite(Number(pickupLongitude))
  const hasDestinationCoordinates = destinationLatitude !== null && destinationLatitude !== undefined && destinationLatitude !== '' && destinationLongitude !== null && destinationLongitude !== undefined && destinationLongitude !== '' && Number.isFinite(Number(destinationLatitude)) && Number.isFinite(Number(destinationLongitude))
  const pickupTitle = String(pickup.business_name ?? pickup.label ?? text('pickupOrganization'))
  const pickupType = text(String(pickup.type ?? (delivery.source_type === 'patient_order' ? 'pharmacy' : 'warehouse')))
  const pickupContactName = String(pickup.contact_name ?? text('notProvided'))
  const pickupEmail = String(pickup.contact_email ?? '')
  const pickupPhone = String(pickup.contact_phone ?? '')
  const pickupAddress = String(pickup.address ?? text('notProvided'))
  const recipientName = String(recipient.name ?? text('notProvided'))
  const recipientEmail = String(recipient.email ?? '')
  const recipientPhone = String(recipient.phone ?? '')
  const recipientTitle = String(recipient.organization_name ?? recipient.name ?? text('destinationContact'))
  const recipientType = text(String(recipient.recipient_type ?? 'patient'))
  const destinationAddress = String(delivery.delivery_address_snapshot ?? dropoff.label ?? text('privateAddress'))
  const assignmentCard = <section className="panel invoice-card delivery-assignment-card"><div className="panel-heading"><div><p className="eyebrow">ASSIGNMENT</p><h2>{String(delivery.order_public_id ?? delivery.procurement_public_id ?? text('operationalDelivery'))}</h2></div><span className="detail-total">{formatMedlineMoney(delivery.job_price, 'SYP')}</span></div><div className="invoice-lines"><p><span>Drop-off address</span><strong>{String(delivery.delivery_address_snapshot ?? text('privateAddress'))}</strong></p><p><span>Delivery time</span><strong>{delivery.scheduled_for ? formatMedlineDate(delivery.scheduled_for) : 'As soon as possible'}</strong></p><p><span>Vehicle required</span><strong>{deliveryVehicleLabel(delivery.delivery_vehicle_type)}</strong></p>{delivery.delivery_distance_km != null && <p><span>Road distance</span><strong>{Number(delivery.delivery_distance_km).toFixed(2)} km</strong></p>}{delivery.delivery_rate_per_km != null && <p><span>Rate at order time</span><strong>{formatMedlineMoney(delivery.delivery_rate_per_km, 'SYP')} / km</strong></p>}<p className="invoice-grand-total"><span>Your delivery fee</span><strong>{formatMedlineMoney(delivery.job_price, 'SYP')}</strong></p></div><p className="muted payment-line">Driver assignment: {delivery.driver_id ? text('assigned') : text('awaitingDriver')}</p></section>
  const pickupCard = role === 'driver' ? <section className="panel delivery-organization-card">
    <div className="panel-heading"><div><p className="eyebrow">{text('pickupOrganization')}</p><h2>{pickupTitle}</h2></div><span className="recipient-type-badge">{pickupType}</span></div>
    <dl className="delivery-recipient-details">
      <div><span className="recipient-detail-icon" aria-hidden="true"><UserRound size={19} /></span><dt>{text('contactName')}</dt><dd>{pickupContactName}</dd></div>
      <div><span className="recipient-detail-icon" aria-hidden="true"><Mail size={19} /></span><dt>{text('emailAddress')}</dt><dd>{pickupEmail ? <a href={`mailto:${pickupEmail}`}>{pickupEmail}</a> : text('notProvided')}</dd></div>
      <div><span className="recipient-detail-icon" aria-hidden="true"><Phone size={19} /></span><dt>{text('phoneNumber')}</dt><dd>{pickupPhone ? <a href={`tel:${pickupPhone}`}>{pickupPhone}</a> : text('notProvided')}</dd></div>
      <div className="recipient-destination"><span className="recipient-detail-icon" aria-hidden="true"><MapPin size={19} /></span><dt>{text('organizationAddress')}</dt><dd>{pickupAddress}</dd></div>
    </dl>
    {hasPickupCoordinates && <a className="ghost-button recipient-map-link" href={`https://www.openstreetmap.org/?mlat=${Number(pickupLatitude)}&mlon=${Number(pickupLongitude)}&zoom=17`} target="_blank" rel="noreferrer"><Navigation size={17} aria-hidden="true" />{text('openPickupMap')}</a>}
  </section> : null
  const recipientCard = role === 'driver' ? <section className="panel delivery-recipient-card">
    <div className="panel-heading"><div><p className="eyebrow">{text('deliveryRecipient')}</p><h2>{recipientTitle}</h2></div><span className="recipient-type-badge">{recipientType}</span></div>
    <dl className="delivery-recipient-details">
      <div><span className="recipient-detail-icon" aria-hidden="true"><UserRound size={19} /></span><dt>{text('recipientName')}</dt><dd>{recipientName}</dd></div>
      <div><span className="recipient-detail-icon" aria-hidden="true"><Mail size={19} /></span><dt>{text('emailAddress')}</dt><dd>{recipientEmail ? <a href={`mailto:${recipientEmail}`}>{recipientEmail}</a> : text('notProvided')}</dd></div>
      <div><span className="recipient-detail-icon" aria-hidden="true"><Phone size={19} /></span><dt>{text('phoneNumber')}</dt><dd>{recipientPhone ? <a href={`tel:${recipientPhone}`}>{recipientPhone}</a> : text('notProvided')}</dd></div>
      <div className="recipient-destination"><span className="recipient-detail-icon" aria-hidden="true"><MapPin size={19} /></span><dt>{text('deliveryDestination')}</dt><dd>{destinationAddress}</dd></div>
    </dl>
    {hasDestinationCoordinates && <a className="ghost-button recipient-map-link" href={`https://www.openstreetmap.org/?mlat=${Number(destinationLatitude)}&mlon=${Number(destinationLongitude)}&zoom=17`} target="_blank" rel="noreferrer"><Navigation size={17} aria-hidden="true" />{text('openDestinationMap')}</a>}
  </section> : null
  const driverCard = <section className="panel driver-card driver-card-clickable" role="button" tabIndex={0} onClick={onDriverClick} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onDriverClick() } }}><div className="panel-heading"><div><p className="eyebrow">DRIVER</p><h2>{driver.name ? String(driver.name) : 'Awaiting driver assignment'}</h2></div><span className="driver-avatar">{driver.name ? String(driver.name).slice(0, 1).toUpperCase() : '?'}</span></div>{driver.name ? <><div className="driver-status"><i /> {driver.is_available ? 'Available for delivery' : 'Assigned to delivery'}</div><div className="driver-details"><p><span>Vehicle</span><strong>{String(driver.vehicle_type ?? 'Delivery vehicle')}</strong></p><p><span>Plate</span><strong>{String(driver.vehicle_plate ?? 'Not provided')}</strong></p><p><span>Contact</span><strong>{String(driver.email ?? 'Not provided')}</strong></p></div><span className="driver-view-hint">View driver profile and trip history</span></> : <p className="muted">The driver details will appear here after assignment.</p>}</section>
  return <section className="content order-detail-content">
    <div className="welcome-row"><div><p className="eyebrow">{text('deliveryDetail')}</p><h1>{String(delivery.public_id ?? delivery.id ?? 'Delivery')}</h1><p className="muted">{currentStatus} · {String(delivery.completed_at ?? delivery.claimed_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>{text('backToDeliveries')}</button></div>
    <div className="order-detail-grid">
      {acceptanceBanner}
      {verificationPanel}
      {pickupManifest}
      {role === 'driver' ? <div className="delivery-parties-grid">{assignmentCard}{pickupCard}{recipientCard}</div> : <>{assignmentCard}{driverCard}</>}
      <RouteMap route={route} />
      <section className="panel live-location-card"><div className="panel-heading"><div><p className="eyebrow">{text('liveLocation')}</p><h2>{text('driverLocation')}</h2></div></div>{mapUrl && !terminal ? <div><p>{text('latestActivePosition')}</p><p className="muted">{text('updated')}: {String(delivery.location_updated_at ?? text('pending'))}</p><iframe className="delivery-map" title={text('driverLocation')} src={mapUrl} loading="lazy" referrerPolicy="no-referrer" allowFullScreen /></div> : <div className="state">{text('locationActiveOnly')}</div>}</section>
      <section className="panel timeline-card"><div className="panel-heading"><div><p className="eyebrow">{text('eventTimeline')}</p><h2>{text('deliveryProgress')}</h2></div><div className="timeline-heading-right"><span className={`order-status status-${currentStatus.replaceAll('_', '-')}`}><i />{statusLabel(currentStatus).replace(/\b\w/g, (letter) => letter.toUpperCase())}</span><div className="timeline-summary"><span>Total delivery time</span><strong>{deliveryDuration}</strong></div></div></div>{events.length === 0 ? <div className="state">{text('noDeliveryEvents')}</div> : <div className="step-timeline">{events.map((event, index) => <div className={`timeline-step ${index === events.length - 1 ? 'current' : 'complete'}`} key={String(event.id ?? index)}><div className="step-marker">{index + 1}</div><div className="step-content"><strong>{statusLabel(String(event.to_status ?? 'Updated'))}</strong><span>{formatMedlineDate(event.created_at, 'en')}</span>{Boolean(event.note) && <small>{String(event.note)}</small>}</div></div>)}</div>}</section>
    </div>
  </section>
}

export function DeliveryDetailPanel({ detail, onClose, locale, role = 'patient', onAccepted }: { detail: Record<string, unknown>; onClose: () => void; locale: string; role?: string; onAccepted?: () => void }) {
  const [currentDetail, setCurrentDetail] = useState(detail)
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
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
  const items = Array.isArray(currentDetail.items) ? currentDetail.items as Array<Record<string, unknown>> : []
  const events = Array.isArray(currentDetail.events) ? currentDetail.events as Array<Record<string, unknown>> : []
  const mapUrl = deliveryMapEmbedUrl(delivery.last_latitude, delivery.last_longitude)
  const route = (currentDetail.route ?? {}) as Record<string, unknown>
  const driver = (delivery.driver ?? {}) as Record<string, unknown>
  const recipient = (currentDetail.recipient ?? {}) as Record<string, unknown>
  const refreshDetail = async () => {
    if (!delivery.id) return
    const response = await api.get(`/deliveries/${String(delivery.id)}`)
    setCurrentDetail(response.data)
  }
  const acceptOrder = async () => {
    if (accepting || !delivery.id) return
    setAccepting(true); setActionMessage('')
    try {
      await api.post(`/deliveries/${String(delivery.id)}/accept-order`, {}, mutationConfig('order-acceptance', Number(delivery.id), 'accept'))
      await refreshDetail()
      setActionMessage(text('orderAcceptedForDelivery'))
      onAccepted?.()
    } catch (error) { setActionMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? text('unableToAcceptOrder') : text('unableToAcceptOrder')) }
    finally { setAccepting(false) }
  }
  if (currentDetail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>{text('backToDeliveries')}</button><div className="form-error">{String(currentDetail.error)}</div></section>
  const terminal = ['delivered', 'failed', 'cancelled'].includes(String(delivery.status))
  if (selectedDriverId) return <DriverProfilePanel driverId={selectedDriverId} onClose={() => setSelectedDriverId(null)} />
  return <DeliveryDetailPresentation delivery={delivery} driver={driver} recipient={recipient} items={items} events={events} route={route} mapUrl={mapUrl} terminal={terminal} role={role} canAccept={role === 'driver' && Boolean(delivery.can_accept_order)} accepting={accepting} actionMessage={actionMessage} verificationPanel={String(delivery.status) === 'available' ? null : <DeliveryVerificationPanel delivery={delivery} role={role} locale={locale} onUpdated={refreshDetail} />} onAccept={() => void acceptOrder()} onClose={onClose} onDriverClick={() => Number(driver.driver_id ?? delivery.driver_id) > 0 && setSelectedDriverId(Number(driver.driver_id ?? delivery.driver_id))} text={text} />
  return <section className="content"><div className="welcome-row"><div><p className="eyebrow">{text('deliveryDetail')}</p><h1>{String(delivery.public_id ?? delivery.id ?? 'Delivery')}</h1><p className="muted">{String(delivery.status ?? 'unknown').replaceAll('_', ' ')} · {String(delivery.completed_at ?? delivery.claimed_at ?? '')}</p></div><button className="ghost-button" onClick={onClose}>{text('backToDeliveries')}</button></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('assignment')}</p><h2>{String(delivery.order_public_id ?? delivery.procurement_public_id ?? text('operationalDelivery'))}</h2></div></div><p>{text('address')}: {String(delivery.delivery_address_snapshot ?? text('privateAddress'))}</p><p>{text('total')}: {String(delivery.total ?? '0.00')}</p><p className="muted">{text('driverAssignment')}: {delivery.driver_id ? text('assigned') : text('awaitingDriver')}</p></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('liveLocation')}</p><h2>{text('driverLocation')}</h2></div></div>{mapUrl && !terminal ? <div><p>{text('latestActivePosition')}</p><p className="muted">{text('updated')}: {String(delivery.location_updated_at ?? text('pending'))}</p><iframe className="delivery-map" title={text('driverLocation')} src={mapUrl ?? undefined} loading="lazy" referrerPolicy="no-referrer" allowFullScreen /><a className="ghost-button" href={`https://www.openstreetmap.org/?mlat=${String(delivery.last_latitude)}&mlon=${String(delivery.last_longitude)}&zoom=15`} target="_blank" rel="noreferrer">{text('openMap')}</a></div> : <div className="state">{text('locationActiveOnly')}</div>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('eventTimeline')}</p><h2>{text('deliveryProgress')}</h2></div></div>{events.length === 0 ? <div className="state">{text('noDeliveryEvents')}</div> : events.map((event, index) => <div className="activity-item" key={`${String(event.id ?? index)}`}><div className="activity-icon blue">{index + 1}</div><div><strong>{String(event.to_status ?? 'Updated').replaceAll('_', ' ')}</strong><span>{String(event.created_at ?? '')}</span></div></div>)}</section></div></section>
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

function LegacyProcurementDetailPanelV2({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const procurement = (detail.procurement ?? {}) as Record<string, unknown>
  const items = Array.isArray(detail.items) ? detail.items as Array<Record<string, unknown>> : []
  const delivery = (detail.delivery ?? {}) as Record<string, unknown>
  const timeline = Array.isArray(detail.timeline) ? detail.timeline as Array<Record<string, unknown>> : []
  const text = (key: string) => tr(key, locale)
  const subtotal = Number(procurement.subtotal ?? items.reduce((sum, item) => sum + Number(item.line_total ?? 0), 0))
  const deliveryFee = Number(procurement.delivery_fee ?? 0)
  const distanceKm = procurement.delivery_distance_km == null ? null : Number(procurement.delivery_distance_km)
  const ratePerKm = procurement.delivery_rate_per_km == null ? null : Number(procurement.delivery_rate_per_km)
  if (detail.error) return <section className="content"><button className="ghost-button" onClick={onClose}>{text('back')}</button><div className="form-error">{String(detail.error)}</div></section>
  return <section className="content procurement-detail-page">
    <div className="welcome-row"><div><p className="eyebrow">{text('procurementDetail')}</p><h1>{String(procurement.public_id ?? procurement.id ?? 'Procurement')}</h1><p className="muted">{String(procurement.status ?? 'unknown').replaceAll('_', ' ')} · {formatMedlineDate(procurement.created_at)}</p></div><button className="ghost-button" onClick={onClose}>{text('backToProcurement')}</button></div>
    <div className="detail-stat-grid"><div><small>PHARMACY</small><strong>{String(procurement.pharmacy_name ?? text('notRecorded'))}</strong></div><div><small>WAREHOUSE</small><strong>{String(procurement.warehouse_name ?? text('notRecorded'))}</strong></div><div><small>DELIVERY ADDRESS</small><strong>{String(procurement.delivery_address_snapshot ?? text('notRecorded'))}</strong></div><div><small>TOTAL</small><strong className="money-cell">{formatMedlineMoney(procurement.total, 'SYP', locale)}</strong></div></div>
    <div className="dashboard-grid procurement-detail-grid">
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('items')}</p><h2>{text('requestedStock')}</h2></div></div><div className="detail-items-table"><div className="detail-item-head"><span>Medicine</span><span>Requested</span><span>Accepted</span><span>Line total</span></div>{items.length === 0 ? <div className="state">{text('noItems')}</div> : items.map((item) => <div className="detail-item-row" key={String(item.id)}><strong>{String(item.name_en ?? 'Medicine')}<small>{String(item.name_ar ?? '')}</small></strong><span>{String(item.quantity ?? 0)}</span><span>{String(item.accepted_quantity ?? 0)}</span><span className="money-cell">{formatMedlineMoney(item.line_total, 'SYP', locale)}</span></div>)}</div></section>
      <section className="panel procurement-cost-card"><div className="panel-heading"><div><p className="eyebrow">COST SNAPSHOT</p><h2>Delivery and total</h2><p className="muted">This road-route distance and delivery rate are permanently recorded at creation time.</p></div></div><div className="invoice-lines"><p><span>Medicines subtotal</span><strong>{formatMedlineMoney(subtotal, 'SYP', locale)}</strong></p>{distanceKm !== null && <p><span>Road distance</span><strong>{distanceKm.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km</strong></p>}{ratePerKm !== null && <p><span>Rate at order time</span><strong>{formatMedlineMoney(ratePerKm, 'SYP', locale)} / km</strong></p>}<p><span>Delivery fee</span><strong>{formatMedlineMoney(deliveryFee, 'SYP', locale)}</strong></p><p className="invoice-grand-total"><span>Total</span><strong>{formatMedlineMoney(procurement.total, 'SYP', locale)}</strong></p></div></section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('delivery')}</p><h2>{String(delivery.status ?? text('notCreated')).replaceAll('_', ' ')}</h2></div></div>{timeline.length === 0 ? <div className="state">{text('noDeliveryEvents')}</div> : timeline.map((event, index) => <div className="activity-item" key={`${String(event.id ?? index)}`}><div className="activity-icon blue">{index + 1}</div><div><strong>{String(event.to_status ?? 'Updated').replaceAll('_', ' ')}</strong><span>{formatMedlineDate(event.created_at)}</span></div></div>)}</section>
    </div>
  </section>
}

void LegacyProcurementDetailPanelV2

type ProcurementBatchOption = Record<string, unknown>

function procurementBatchAllocationMap(items: Array<Record<string, unknown>>): Record<string, Record<string, number>> {
  return Object.fromEntries(items.map((item) => [String(item.id), Object.fromEntries((Array.isArray(item.batch_options) ? item.batch_options as ProcurementBatchOption[] : []).map((batch) => [String(batch.id), Number(batch.allocated_quantity ?? 0)]))]))
}

function ProcurementBatchAllocationEditor({ item, acceptedQuantity, allocations, onQuantityChange, onBatchChange, locale }: { item: Record<string, unknown>; acceptedQuantity: number; allocations: Record<string, number>; onQuantityChange: (quantity: number) => void; onBatchChange: (inventoryId: string, quantity: number) => void; locale: string }) {
  const options = Array.isArray(item.batch_options) ? item.batch_options as ProcurementBatchOption[] : []
  return <div className="procurement-batch-editor">
    <label className="procurement-quantity-field"><span className="sr-only">Quantity to fulfill for {String(item.name_en ?? 'medicine')}</span><input type="number" min="0" max={Number(item.quantity ?? 0)} value={acceptedQuantity} onChange={(event) => onQuantityChange(Math.max(0, Math.min(Number(item.quantity ?? 0), Math.trunc(Number(event.target.value) || 0))))} /></label>
    <div className="procurement-batch-options" role="group" aria-label={`Warehouse batches for ${String(item.name_en ?? 'medicine')}`}>
      {options.length === 0 ? <span className="form-error">No eligible warehouse batch is available.</span> : options.map((batch) => {
        const id = String(batch.id)
        const max = Number(batch.allocatable_quantity ?? 0)
        const quantity = Number(allocations[id] ?? 0)
        return <label className={`procurement-batch-option ${quantity > 0 ? 'selected' : ''}`} key={id}><span><strong>{String(batch.batch_number ?? `Batch #${id}`)}</strong><small>{batch.expires_at ? `Expires ${formatMedlineDate(batch.expires_at, locale).split(',')[0]}` : 'No expiry recorded'} · {max.toLocaleString()} available · {formatMedlineMoney(batch.unit_price, 'SYP', locale)} each</small>{Boolean(batch.storage_location) && <small>{String(batch.storage_location)}</small>}</span><input aria-label={`Units from ${String(batch.batch_number ?? `batch ${id}`)}`} type="number" min="0" max={max} value={quantity} onChange={(event) => onBatchChange(id, Math.max(0, Math.min(max, Math.trunc(Number(event.target.value) || 0))))} /></label>
      })}
    </div>
  </div>
}

export function ProcurementDetailPanel({ detail, onClose, locale }: { detail: Record<string, unknown>; onClose: () => void; locale: string }) {
  const [record, setRecord] = useState(detail)
  const initialItems = Array.isArray(detail.items) ? detail.items as Array<Record<string, unknown>> : []
  const [acceptedQuantities, setAcceptedQuantities] = useState<Record<string, number>>(() => Object.fromEntries(initialItems.map((item) => [String(item.id), Number(item.quantity ?? 0)])))
  const [batchAllocations, setBatchAllocations] = useState<Record<string, Record<string, number>>>(() => procurementBatchAllocationMap(initialItems))
  const [warehouseNote, setWarehouseNote] = useState('')
  const [decisionMessage, setDecisionMessage] = useState('')
  const [deciding, setDeciding] = useState(false)
  const procurement = (record.procurement ?? {}) as Record<string, unknown>
  const items = Array.isArray(record.items) ? record.items as Array<Record<string, unknown>> : []
  const delivery = (record.delivery ?? {}) as Record<string, unknown>
  const timeline = Array.isArray(record.timeline) ? record.timeline as Array<Record<string, unknown>> : []
  const text = (key: string) => tr(key, locale)
  const subtotal = Number(procurement.subtotal ?? items.reduce((sum, item) => sum + Number(item.line_total ?? 0), 0))
  const deliveryFee = Number(procurement.delivery_fee ?? 0)
  const distanceKm = procurement.delivery_distance_km == null ? null : Number(procurement.delivery_distance_km)
  const ratePerKm = procurement.delivery_rate_per_km == null ? null : Number(procurement.delivery_rate_per_km)
  const role = (() => { try { return String(JSON.parse(localStorage.getItem('medline_user') ?? '{}').role ?? '') } catch { return '' } })()
  const canReview = role === 'warehouse' && String(procurement.status) === 'pending_warehouse_review'
  const canRespondToPartial = role === 'pharmacy' && String(procurement.status) === 'partial_approval_required'
  useEffect(() => {
    setRecord(detail)
    const detailItems = Array.isArray(detail.items) ? detail.items as Array<Record<string, unknown>> : []
    setAcceptedQuantities(Object.fromEntries(detailItems.map((item) => [String(item.id), Number(item.accepted_quantity ?? item.quantity ?? 0) || Number(item.quantity ?? 0)])))
    setBatchAllocations(procurementBatchAllocationMap(detailItems))
  }, [detail])
  const allocateQuantityAcrossBatches = (item: Record<string, unknown>, target: number) => {
    let remaining = target
    const next: Record<string, number> = {}
    const options = Array.isArray(item.batch_options) ? item.batch_options as ProcurementBatchOption[] : []
    options.forEach((batch) => { const quantity = Math.min(remaining, Number(batch.allocatable_quantity ?? 0)); next[String(batch.id)] = quantity; remaining -= quantity })
    setAcceptedQuantities((current) => ({ ...current, [String(item.id)]: target }))
    setBatchAllocations((current) => ({ ...current, [String(item.id)]: next }))
    setDecisionMessage(remaining > 0 ? 'The selected warehouse batches do not have enough available stock for that quantity.' : '')
  }
  const updateBatchAllocation = (item: Record<string, unknown>, inventoryId: string, quantity: number) => {
    const currentItem = batchAllocations[String(item.id)] ?? {}
    const otherAllocated = Object.entries(currentItem).filter(([id]) => id !== inventoryId).reduce((sum, [, value]) => sum + Number(value), 0)
    const adjusted = Math.min(quantity, Math.max(0, Number(item.quantity ?? 0) - otherAllocated))
    const nextItem = { ...currentItem, [inventoryId]: adjusted }
    const total = Object.values(nextItem).reduce((sum, value) => sum + Number(value), 0)
    setBatchAllocations((current) => ({ ...current, [String(item.id)]: nextItem }))
    setAcceptedQuantities((quantities) => ({ ...quantities, [String(item.id)]: Math.min(Number(item.quantity ?? 0), total) }))
    setDecisionMessage('')
  }
  const decide = async (decision: 'accept' | 'partial' | 'reject') => {
    const note = warehouseNote.trim()
    if ((decision === 'partial' || decision === 'reject') && !note) { setDecisionMessage('Add a clear comment for the pharmacy before partially approving or rejecting this request.'); return }
    if (decision === 'partial') {
      const changed = items.some((item) => Number(acceptedQuantities[String(item.id)] ?? item.quantity) < Number(item.quantity ?? 0))
      const included = items.some((item) => Number(acceptedQuantities[String(item.id)] ?? 0) > 0)
      if (!changed) { setDecisionMessage('Reduce at least one requested quantity before approving partially.'); return }
      if (!included) { setDecisionMessage('A partial approval must include at least one unit. Use Reject request when no stock can be supplied.'); return }
    }
    if (decision !== 'reject') {
      const invalidAllocation = items.some((item) => {
        const fulfilled = Number(acceptedQuantities[String(item.id)] ?? 0)
        const allocated = Object.values(batchAllocations[String(item.id)] ?? {}).reduce((sum, value) => sum + Number(value), 0)
        return fulfilled !== allocated || (fulfilled > 0 && allocated === 0)
      })
      if (invalidAllocation) { setDecisionMessage('Allocate the exact fulfilled quantity across one or more eligible warehouse batches.'); return }
    }
    setDeciding(true)
    setDecisionMessage('')
    try {
      await api.post(`/procurement/${String(procurement.id)}/decision`, {
        decision,
        ...(note ? { note } : {}),
        ...(decision !== 'reject' ? { items: items.map((item) => ({ id: Number(item.id), accepted_quantity: Number(acceptedQuantities[String(item.id)] ?? 0), batches: Object.entries(batchAllocations[String(item.id)] ?? {}).filter(([, quantity]) => Number(quantity) > 0).map(([inventoryId, quantity]) => ({ inventory_id: Number(inventoryId), quantity: Number(quantity) })) })) } : {}),
      }, mutationConfig('procurement-decision', Number(procurement.id), decision))
      const response = await api.get(`/procurement/${String(procurement.id)}`)
      setRecord(response.data)
      setDecisionMessage(decision === 'accept' ? 'The request was accepted in full and sent to delivery.' : decision === 'partial' ? 'The adjusted offer was sent to the pharmacy for confirmation before delivery.' : 'The procurement request was rejected.')
    } catch (error) { setDecisionMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to save the warehouse decision.' : 'Unable to save the warehouse decision.') }
    finally { setDeciding(false) }
  }
  const respondToPartial = async (decision: 'approve' | 'reject') => {
    setDeciding(true)
    setDecisionMessage('')
    try {
      await api.post(`/procurement/${String(procurement.id)}/partial-offer/decision`, { decision }, mutationConfig('procurement-partial-offer', Number(procurement.id), decision))
      const response = await api.get(`/procurement/${String(procurement.id)}`)
      setRecord(response.data)
      setDecisionMessage(decision === 'approve' ? 'The partial supply was approved and sent to delivery.' : 'The partial supply was declined and its remaining reservation was released.')
    } catch (error) { setDecisionMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to save the pharmacy decision.' : 'Unable to save the pharmacy decision.') }
    finally { setDeciding(false) }
  }
  if (record.error) return <section className="content"><button className="ghost-button" onClick={onClose}>{text('back')}</button><div className="form-error">{String(record.error)}</div></section>
  return <section className="content procurement-detail-page">
    <div className="welcome-row"><div><p className="eyebrow">{text('procurementDetail')}</p><h1>{String(procurement.public_id ?? procurement.id ?? 'Procurement')}</h1><p className="muted">{String(procurement.status ?? 'unknown').replaceAll('_', ' ')} · {formatMedlineDate(procurement.created_at)}</p></div><button className="ghost-button" onClick={onClose}>{text('backToProcurement')}</button></div>
    <div className="detail-stat-grid"><div><small>PHARMACY</small><strong>{String(procurement.pharmacy_name ?? text('notRecorded'))}</strong></div><div><small>WAREHOUSE</small><strong>{String(procurement.warehouse_name ?? text('notRecorded'))}</strong></div><div><small>DELIVERY ADDRESS</small><strong>{String(procurement.delivery_address_snapshot ?? text('notRecorded'))}</strong></div><div><small>TOTAL</small><strong className="money-cell">{formatMedlineMoney(procurement.total, 'SYP', locale)}</strong></div></div>
    <div className="dashboard-grid procurement-detail-grid">
      <section className="panel procurement-items-card">
        <div className="panel-heading"><div><p className="eyebrow">{text('items')}</p><h2>{canReview ? 'Adjust requested stock' : text('requestedStock')}</h2><p className="muted">{canReview ? 'Enter the quantity this warehouse can fulfill. It cannot exceed the pharmacy request.' : 'Requested and warehouse-approved quantities remain recorded for every medicine.'}</p></div></div>
        <div className="detail-items-table"><div className="detail-item-head"><span>Medicine</span><span>Requested</span><span>{canReview ? 'Quantity to fulfill' : 'Accepted'}</span><span>Requested total</span></div>{items.length === 0 ? <div className="state">{text('noItems')}</div> : items.map((item) => <div className="detail-item-row" key={String(item.id)}><strong>{String(item.name_en ?? 'Medicine')}<small>{String(item.name_ar ?? '')}</small></strong><span>{String(item.quantity ?? 0)}</span>{canReview ? <ProcurementBatchAllocationEditor item={item} acceptedQuantity={Number(acceptedQuantities[String(item.id)] ?? Number(item.quantity ?? 0))} allocations={batchAllocations[String(item.id)] ?? {}} onQuantityChange={(quantity) => allocateQuantityAcrossBatches(item, quantity)} onBatchChange={(inventoryId, quantity) => updateBatchAllocation(item, inventoryId, quantity)} locale={locale} /> : <span>{String(item.accepted_quantity ?? 0)}</span>}<span className="money-cell">{formatMedlineMoney(item.line_total, 'SYP', locale)}</span></div>)}</div>
        {canReview && <div className="procurement-decision-panel"><label><span>Warehouse comment to pharmacy <em>(Required for partial approval or rejection)</em></span><textarea aria-label="Warehouse comment to pharmacy" value={warehouseNote} onChange={(event) => { setWarehouseNote(event.target.value); setDecisionMessage('') }} placeholder="Explain unavailable quantities, substitutions, or why the request cannot be fulfilled." maxLength={1000} /></label><div className="row-actions"><button type="button" className="approve-button" disabled={deciding} onClick={() => void decide('accept')}><FileCheck2 size={18} aria-hidden="true" /> Accept all</button><button type="button" className="partial-button" disabled={deciding} onClick={() => void decide('partial')}><Package size={18} aria-hidden="true" /> Approve partially</button><button type="button" className="reject-button" disabled={deciding} onClick={() => void decide('reject')}><FileX2 size={18} aria-hidden="true" /> Reject request</button></div><p className="muted">Partial approval requires at least one fulfilled unit and at least one reduced unit. Rejected quantities are released back to warehouse stock.</p></div>}
        {Boolean(procurement.warehouse_note) && !canReview && <div className="warehouse-review-note"><strong>Warehouse comment</strong><p>{String(procurement.warehouse_note)}</p></div>}
        {canRespondToPartial && <div className="procurement-partial-response"><div><strong>Confirm the warehouse's partial offer</strong><p>Delivery will be created only after you approve these adjusted quantities. Declining releases all remaining reserved units.</p></div><div className="row-actions"><button type="button" className="approve-button" disabled={deciding} onClick={() => void respondToPartial('approve')}><FileCheck2 size={18} aria-hidden="true" /> Approve partial supply</button><button type="button" className="reject-button" disabled={deciding} onClick={() => void respondToPartial('reject')}><FileX2 size={18} aria-hidden="true" /> Decline partial supply</button></div></div>}
        {decisionMessage && <div className={decisionMessage.startsWith('Unable') || decisionMessage.startsWith('Add') || decisionMessage.startsWith('Reduce') || decisionMessage.startsWith('A partial') || decisionMessage.startsWith('Allocate') || decisionMessage.startsWith('The selected') ? 'form-error' : 'form-success'} role="status">{decisionMessage}</div>}
      </section>
      <section className="panel procurement-schedule-card"><div className="panel-heading"><div><p className="eyebrow">DELIVERY REQUEST</p><h2>{procurement.scheduled_delivery_at ? 'Scheduled delivery' : 'As soon as possible'}</h2></div><Clock3 size={22} aria-hidden="true" /></div><p className="muted">{procurement.scheduled_delivery_at ? formatMedlineDate(procurement.scheduled_delivery_at, locale) : 'Dispatch as soon as the warehouse request is ready.'}</p></section>
      <section className="panel procurement-cost-card"><div className="panel-heading"><div><p className="eyebrow">COST SNAPSHOT</p><h2>Delivery and total</h2><p className="muted">This road-route distance and delivery rate are permanently recorded at creation time.</p></div></div><div className="invoice-lines"><p><span>Medicines subtotal</span><strong>{formatMedlineMoney(subtotal, 'SYP', locale)}</strong></p>{distanceKm !== null && <p><span>Road distance</span><strong>{distanceKm.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km</strong></p>}{ratePerKm !== null && <p><span>Rate at order time</span><strong>{formatMedlineMoney(ratePerKm, 'SYP', locale)} / km</strong></p>}<p><span>Delivery fee</span><strong>{formatMedlineMoney(deliveryFee, 'SYP', locale)}</strong></p><p className="invoice-grand-total"><span>Total</span><strong>{formatMedlineMoney(procurement.total, 'SYP', locale)}</strong></p></div></section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{text('delivery')}</p><h2>{String(delivery.status ?? text('notCreated')).replaceAll('_', ' ')}</h2></div></div>{timeline.length === 0 ? <div className="state">{text('noDeliveryEvents')}</div> : timeline.map((event, index) => <div className="activity-item" key={String(event.id ?? index)}><div className="activity-icon blue">{index + 1}</div><div><strong>{String(event.to_status ?? 'Updated').replaceAll('_', ' ')}</strong><span>{formatMedlineDate(event.created_at)}</span></div></div>)}</section>
    </div>
  </section>
}

function operationsEndpoint(section: string, role: string) {
  if (section === 'partners' || section === 'verification') return '/admin/partners'
  if (section === 'documents') return '/admin/verification-documents'
  if (section === 'users') return '/admin/users'
  if (section === 'inventory') return role === 'admin' ? '/admin/inventory' : '/partner/inventory'
  if (section === 'deliveries') return role === 'admin' ? '/admin/deliveries' : role === 'patient' || role === 'driver' ? '/deliveries/mine' : '/partner/deliveries'
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
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('desc')
  const [loading, setLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null)
  const busyRatingKeys = useRef(new Set<string>())
  const text = (key: string) => tr(key, locale)
  const load = async () => { setLoading(true); try { const response = await api.get('/admin/ratings', { params: { search, status: statusFilter, per_page: perPage, page, sort_by: sortBy, sort_direction: sortDirection } }); const data = response.data.data ?? []; setRows(data); setLastPage(Number(response.data.last_page ?? response.data.meta?.last_page ?? 1)); setTotal(Number(response.data.total ?? response.data.meta?.total ?? data.length)) } catch { setRows([]); setLastPage(1); setTotal(0) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [search, statusFilter, page, perPage, sortBy, sortDirection])
  const moderate = async (id: number, decision: 'hide' | 'restore') => { const key = `${id}:${decision}`; if (busyRatingKeys.current.has(key)) return; const reason = decision === 'hide' ? window.prompt(text('hideReason'), text('unsafeContent')) : null; if (decision === 'hide' && reason === null) return; busyRatingKeys.current.add(key); try { await api.post(`/admin/ratings/${id}/moderate`, { decision, ...(reason ? { reason } : {}) }, mutationConfig('rating-moderate', id, decision)); setMessage(decision === 'hide' ? text('ratingHidden') : text('ratingRestored')); await load() } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to moderate rating.' : 'Unable to moderate rating.') } finally { busyRatingKeys.current.delete(key) } }
  const toggleSort = (column: string) => { if (sortBy === column) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(column); setSortDirection('asc') }; setPage(1) }
  const viewOrder = async (row: Record<string, unknown>) => { if (!row.order_id) return; try { const response = await api.get(`/orders/${String(row.order_id)}`); setSelectedOrder(response.data) } catch { setMessage('Unable to load the order linked to this rating.') } }
  if (selectedOrder) return <OrderDetailPanel detail={selectedOrder} onClose={() => setSelectedOrder(null)} locale={locale} />
  return <section className="content orders-content operations-list-content management-list-content">
    <section className="panel table-panel orders-table-panel operations-table-panel">
      <div className="panel-heading orders-panel-heading"><div><div className="orders-heading-row"><h1>{text('feedbackQueue')}</h1><span className="orders-result-count" aria-live="polite">{loading ? 'Updating' : `${total} ${total === 1 ? 'rating' : 'ratings'}`}</span></div><p className="muted">{text('ratingsGuidance')}</p></div></div>
      {message && <div className="form-success" role="status">{message}</div>}
      <div className="table-controls orders-toolbar management-toolbar" role="search" aria-label="Rating filters"><label className="orders-search-control"><span>{text('searchFeedback')}</span><span className="search-box"><Search size={19} aria-hidden="true" /><input aria-label={text('searchFeedback')} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Order, author, or feedback" /></span></label><label className="orders-status-filter"><span>{text('status')}</span><select aria-label="Filter ratings by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="">All statuses</option><option value="visible">{text('visible')}</option><option value="hidden">{text('hidden')}</option></select></label></div>
      <div className="orders-table-region operations-table-region" role="region" aria-label="Scrollable ratings table" aria-busy={loading} tabIndex={0}>
        <table className="orders-data-table operations-data-table admin-management-table ratings-management-table">
          <caption className="sr-only">{text('ratingsModeration')}</caption>
          <thead><tr><SortableTableHeader label={text('order')} column="public_id" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Author" column="author" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Feedback" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Score" column="score" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label={text('status')} column="status" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label="Created" column="created_at" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /><SortableTableHeader label={text('action')} sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} /></tr></thead>
          <tbody>{loading ? <tr className="orders-state-row"><td colSpan={7}><span className="state" role="status">Loading ratings...</span></td></tr> : rows.length === 0 ? <tr className="orders-state-row"><td colSpan={7}><span className="state" role="status">{text('noRatings')}</span></td></tr> : rows.map((row) => <tr className="orders-data-row" key={String(row.id)} tabIndex={row.order_id ? 0 : undefined} aria-label={row.order_id ? `Open order ${String(row.public_id ?? row.order_id)}` : undefined} onClick={(event) => { if (!row.order_id || (event.target as HTMLElement).closest('button, a, input, select, textarea')) return; void viewOrder(row) }} onKeyDown={(event) => { if (!row.order_id || event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); void viewOrder(row) }}><th scope="row">{row.order_id ? <button type="button" className="order-id-button" onClick={() => void viewOrder(row)}>{String(row.public_id ?? `Order ${row.order_id}`)}</button> : <span className="orders-cell-primary">{String(row.public_id ?? `Rating ${row.id}`)}</span>}</th><td><span className="orders-cell-primary">{String(row.creator_name ?? row.creator_email ?? 'User')}</span></td><td>{String(row.comment ?? 'No comment')}</td><td><strong className="rating-score">{String(row.score ?? '—')}<small>/5</small></strong></td><td><ManagementStatus status={row.hidden_at ? 'hidden' : 'visible'} /></td><td><time dateTime={String(row.created_at ?? '')}>{formatMedlineDate(row.created_at, locale)}</time></td><td><div className="orders-action-cell"><div className="row-actions"><button type="button" className={row.hidden_at ? 'approve-button' : 'reject-button'} aria-label={row.hidden_at ? text('restore') : text('hide')} title={row.hidden_at ? text('restore') : text('hide')} onClick={() => void moderate(Number(row.id), row.hidden_at ? 'restore' : 'hide')}>{row.hidden_at ? <Eye size={19} aria-hidden="true" /> : <FileX2 size={19} aria-hidden="true" />}<span>{row.hidden_at ? text('restore') : text('hide')}</span></button></div></div></td></tr>)}</tbody>
        </table>
      </div>
      <ManagementTableFooter label="ratings" page={page} lastPage={lastPage} perPage={perPage} onPageChange={setPage} onPerPageChange={(size) => { setPerPage(size); setPage(1) }} />
    </section>
  </section>
}

export function deliveryRoutePoints(selectedPharmacy: Record<string, unknown> | null, deliveryPoint: { latitude: number; longitude: number } | null): [[number, number], [number, number]] | null {
  const pharmacyLatitude = Number(selectedPharmacy?.latitude)
  const pharmacyLongitude = Number(selectedPharmacy?.longitude)
  if (!deliveryPoint || !Number.isFinite(pharmacyLatitude) || !Number.isFinite(pharmacyLongitude) || !Number.isFinite(deliveryPoint.latitude) || !Number.isFinite(deliveryPoint.longitude)) return null
  return [[pharmacyLatitude, pharmacyLongitude], [deliveryPoint.latitude, deliveryPoint.longitude]]
}

function CustomerOrderMap({ pharmacies, selectedPharmacy, deliveryPoint, routeGeometry = null, routeLoading = false, onPharmacySelect, onDeliverySelect, interactionMode = 'combined' }: { pharmacies: Array<Record<string, unknown>>; selectedPharmacy: Record<string, unknown> | null; deliveryPoint: { latitude: number; longitude: number } | null; routeGeometry?: unknown; routeLoading?: boolean; onPharmacySelect: (pharmacy: Record<string, unknown>) => void; onDeliverySelect: (latitude: number, longitude: number) => void; interactionMode?: 'pharmacy' | 'delivery' | 'combined' }) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const deliveryMarkerRef = useRef<L.Marker | null>(null)
  const routeLineRef = useRef<L.Polyline | null>(null)
  const selectedPharmacyRef = useRef(selectedPharmacy)
  const pharmacySelectRef = useRef(onPharmacySelect)
  const deliverySelectRef = useRef(onDeliverySelect)
  const interactionModeRef = useRef(interactionMode)
  selectedPharmacyRef.current = selectedPharmacy
  pharmacySelectRef.current = onPharmacySelect
  deliverySelectRef.current = onDeliverySelect
  interactionModeRef.current = interactionMode
  const center: L.LatLngExpression = [33.5138, 36.2765]
  useEffect(() => {
    if (!mapElement.current || mapRef.current) return
    const map = L.map(mapElement.current, { zoomControl: true }).setView(center, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
    map.on('click', (event) => { if (selectedPharmacyRef.current && interactionModeRef.current !== 'pharmacy') deliverySelectRef.current(event.latlng.lat, event.latlng.lng) })
    mapRef.current = map
    return () => { routeLineRef.current = null; map.remove(); mapRef.current = null }
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
      marker.on('click', () => { if (interactionModeRef.current !== 'delivery') pharmacySelectRef.current(pharmacy) })
    })
    if (validPoints.length > 0) map.fitBounds(L.latLngBounds(validPoints.map((point) => [point.latitude, point.longitude] as [number, number])), { padding: [30, 30], maxZoom: 14 })
  }, [pharmacies, interactionMode])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    deliveryMarkerRef.current?.remove()
    deliveryMarkerRef.current = null
    if (!deliveryPoint) return
    deliveryMarkerRef.current = L.marker([deliveryPoint.latitude, deliveryPoint.longitude], { title: 'Delivery address' }).addTo(map).bindPopup('<strong>Delivery address</strong>').openPopup()
  }, [deliveryPoint])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    routeLineRef.current?.remove()
    routeLineRef.current = null
    const routePoints = roadRoutePoints(routeGeometry)
    if (routePoints.length < 2) return
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    routeLineRef.current = L.polyline(routePoints, { color: '#1596c3', weight: 5, opacity: .92, lineCap: 'round', lineJoin: 'round', className: 'delivery-route-line', interactive: false }).addTo(map)
    routeLineRef.current.bindTooltip('Calculated road route', { direction: 'center', permanent: false })
    map.fitBounds(L.latLngBounds(routePoints), { padding: [58, 58], maxZoom: 15, animate: !reducedMotion, duration: reducedMotion ? 0 : .35 })
  }, [routeGeometry])
  useEffect(() => {
    const map = mapRef.current
    const latitude = Number(selectedPharmacy?.latitude)
    const longitude = Number(selectedPharmacy?.longitude)
    if (!map || deliveryPoint || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.flyTo([latitude, longitude], 16, { animate: !reducedMotion, duration: reducedMotion ? 0 : .45 })
    markersRef.current?.eachLayer((layer) => {
      if (!(layer instanceof L.Marker)) return
      const markerPoint = layer.getLatLng()
      if (Math.abs(markerPoint.lat - latitude) < .000001 && Math.abs(markerPoint.lng - longitude) < .000001) layer.openPopup()
    })
  }, [selectedPharmacy, deliveryPoint])
  const instruction = interactionMode === 'pharmacy' ? (selectedPharmacy ? 'Pharmacy selected. Choose Next to select medicine.' : 'Select a pharmacy marker to continue.') : interactionMode === 'delivery' ? (deliveryPoint ? 'Delivery address pinned. Click elsewhere to change it.' : 'Click the map to pin the delivery address.') : !selectedPharmacy ? 'Select a pharmacy marker to continue.' : deliveryPoint ? 'Delivery address pinned. Click elsewhere to change it.' : 'Now click the map to pin the delivery address.'
  const routeReady = roadRoutePoints(routeGeometry).length >= 2
  return <div className="customer-order-map-wrap"><div ref={mapElement} className="customer-order-map" /><div className="map-instruction"><span>{interactionMode === 'delivery' || (interactionMode === 'combined' && selectedPharmacy) ? '3' : '1'}</span>{instruction}</div>{selectedPharmacy && <div className="map-selection-card"><strong>{String(selectedPharmacy.business_name)}</strong><span>{String(selectedPharmacy.address ?? 'Approved pharmacy')}</span>{deliveryPoint && <small><i aria-hidden="true" /> {routeLoading ? 'Calculating road route…' : routeReady ? 'Road route ready' : 'Road route unavailable'}</small>}</div>}</div>
}

function NewOrderPage({ locale, onBack, onCreated }: { locale: string; onBack: () => void; onCreated: (order: Record<string, unknown>) => void }) {
  return <section className="content new-order-page"><div className="new-order-page-nav"><button type="button" className="ghost-button" onClick={onBack}><ChevronRight className="back-chevron" size={16} aria-hidden="true" /> Back to orders</button></div><PatientOrderCreatePanel locale={locale} onCreated={onCreated} /></section>
}

export function PatientOrderCreatePanel({ locale, onCreated }: { locale: string; onCreated?: (order: Record<string, unknown>) => void }) {
  const [pharmacies, setPharmacies] = useState<Array<Record<string, unknown>>>([])
  const [medicines, setMedicines] = useState<Array<Record<string, unknown>>>([])
  const [selectedPharmacy, setSelectedPharmacy] = useState<Record<string, unknown> | null>(null)
  const [pharmacySearch, setPharmacySearch] = useState('')
  const [pharmacySuggestionsOpen, setPharmacySuggestionsOpen] = useState(false)
  const [activePharmacyIndex, setActivePharmacyIndex] = useState(0)
  const [deliveryPoint, setDeliveryPoint] = useState<{ latitude: number; longitude: number } | null>(null)
  const [medicineSearch, setMedicineSearch] = useState('')
  const [medicineId, setMedicineId] = useState('')
  const [medicineSuggestionsOpen, setMedicineSuggestionsOpen] = useState(false)
  const [activeMedicineIndex, setActiveMedicineIndex] = useState(0)
  const [quantity, setQuantity] = useState('1')
  const [items, setItems] = useState<Array<{ medicine: Record<string, any>; quantity: number; prescription: File | null }>>([])
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeStep, setActiveStep] = useState(1)
  const [deliveryRatePerKm, setDeliveryRatePerKm] = useState(DELIVERY_FEE_PER_KM_SYP)
  const [deliveryRates, setDeliveryRates] = useState<Record<string, number>>({ motorcycle: DELIVERY_FEE_PER_KM_SYP })
  const [deliveryVehicleType, setDeliveryVehicleType] = useState<DeliveryVehicleType>('motorcycle')
  const [taxRatePercent, setTaxRatePercent] = useState(0)
  const [deliveryPreference, setDeliveryPreference] = useState<DeliveryPreference>('asap')
  const [scheduledDeliveryAt, setScheduledDeliveryAt] = useState('')

  useEffect(() => { api.get('/partners', { params: { type: 'pharmacy', per_page: 100 } }).then((response) => setPharmacies(response.data.data ?? [])).catch(() => setMessage('Unable to load approved pharmacies.')) }, [])
  useEffect(() => { api.get('/delivery-pricing/current').then((response) => { const nextRates = Object.fromEntries((response.data.rates ?? []).map((rate: Record<string, unknown>) => [String(rate.vehicle_type), Number(rate.rate_per_km)])); const rate = Number(nextRates.motorcycle ?? response.data.rate_per_km); const taxRate = Number(response.data.tax_rate_percent); setDeliveryRates(nextRates); if (Number.isFinite(rate) && rate > 0) setDeliveryRatePerKm(rate); if (Number.isFinite(taxRate) && taxRate >= 0) setTaxRatePercent(taxRate) }).catch(() => undefined) }, [])
  useEffect(() => { setDeliveryRatePerKm(Number(deliveryRates[deliveryVehicleType] ?? DELIVERY_FEE_PER_KM_SYP)) }, [deliveryRates, deliveryVehicleType])
  const roadEstimate = useRoadDeliveryEstimate(selectedPharmacy?.latitude, selectedPharmacy?.longitude, deliveryPoint?.latitude, deliveryPoint?.longitude, deliveryVehicleType)
  const pharmacyOptionLabel = (pharmacy: Record<string, unknown>) => String(pharmacy.business_name ?? pharmacy.name ?? 'Pharmacy')
  const normalizedPharmacySearch = pharmacySearch.trim().toLocaleLowerCase()
  const matchingPharmacies = pharmacies.filter((pharmacy) => `${String(pharmacy.business_name ?? '')} ${String(pharmacy.name ?? '')} ${String(pharmacy.address ?? '')} ${String(pharmacy.license_number ?? '')}`.toLocaleLowerCase().includes(normalizedPharmacySearch)).slice(0, 8)
  const medicineOptionLabel = (medicine: Record<string, unknown>) => [String(medicine.name_en ?? 'Medicine'), medicine.dosage ? String(medicine.dosage) : '', medicine.manufacturer ? String(medicine.manufacturer) : ''].filter(Boolean).join(' · ')
  const normalizedMedicineSearch = medicineSearch.trim().toLocaleLowerCase()
  const matchingMedicines = medicines.filter((medicine) => `${String(medicine.name_en ?? '')} ${String(medicine.name_ar ?? '')} ${String(medicine.manufacturer ?? '')} ${String(medicine.dosage ?? '')} ${String(medicine.form ?? '')}`.toLocaleLowerCase().includes(normalizedMedicineSearch)).slice(0, 8)
  const revealStep = (step: number) => {
    setActiveStep(step)
    window.setTimeout(() => document.getElementById(`order-step-${step}`)?.scrollIntoView?.({ behavior: typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 0)
  }
  const selectPharmacy = (pharmacy: Record<string, unknown>) => {
    setSelectedPharmacy(pharmacy)
    setPharmacySearch(pharmacyOptionLabel(pharmacy))
    setPharmacySuggestionsOpen(false)
    setActivePharmacyIndex(0)
    setDeliveryPoint(null)
    setItems([])
    setMedicineId('')
    setMedicineSearch('')
    setMedicineSuggestionsOpen(false)
    setActiveMedicineIndex(0)
    setMedicines([])
    setMessage('')
    api.get('/medicines', { params: { available_only: true, partner_id: Number(pharmacy.id), per_page: 100 } }).then((response) => setMedicines(response.data.data ?? [])).catch(() => setMessage('Unable to load medicines for this pharmacy.'))
  }
  const updatePharmacySearch = (value: string) => { setPharmacySearch(value); setActivePharmacyIndex(0); setPharmacySuggestionsOpen(true) }
  const updateMedicineSearch = (value: string) => {
    setMedicineSearch(value)
    const exactMatch = medicines.find((medicine) => medicineOptionLabel(medicine).toLocaleLowerCase() === value.toLocaleLowerCase())
    setMedicineId(exactMatch ? String(exactMatch.id) : '')
    setActiveMedicineIndex(0)
    setMedicineSuggestionsOpen(true)
  }
  const selectMedicineSuggestion = (medicine: Record<string, unknown>) => {
    setMedicineSearch(medicineOptionLabel(medicine))
    setMedicineId(String(medicine.id))
    setMedicineSuggestionsOpen(false)
    setActiveMedicineIndex(0)
  }
  const addMedicine = () => {
    const medicine = medicines.find((entry) => String(entry.id) === medicineId)
    const count = Math.max(1, Math.min(100, Number(quantity) || 1))
    if (!medicine) return
    setItems((current) => {
      const existing = current.find((item) => item.medicine.id === medicine.id)
      return existing ? current.map((item) => item.medicine.id === medicine.id ? { ...item, quantity: Math.min(100, item.quantity + count) } : item) : [...current, { medicine, quantity: count, prescription: null }]
    })
    setMedicineId('')
    setMedicineSearch('')
    setMedicineSuggestionsOpen(false)
    setActiveMedicineIndex(0)
    setQuantity('1')
  }
  const missingPrescription = items.some((item) => Boolean(item.medicine.prescription_required) && !item.prescription)
  const deliveryEstimate = roadEstimate.estimate
  const medicineSubtotal = items.reduce((total, item) => total + Number(item.medicine.unit_price ?? 0) * item.quantity, 0)
  const estimatedTax = Math.round(medicineSubtotal * taxRatePercent) / 100
  const estimatedDeliveryFee = deliveryEstimate?.fee ?? 0
  const estimatedTotal = medicineSubtotal + estimatedTax + estimatedDeliveryFee
  const stepComplete = (step: number) => step === 1 ? Boolean(selectedPharmacy) : step === 2 ? items.length > 0 && !missingPrescription : Boolean(deliveryPoint)
  const stepAvailable = (step: number) => step === 1 || (step === 2 && Boolean(selectedPharmacy)) || (step === 3 && Boolean(selectedPharmacy) && items.length > 0 && !missingPrescription)
  const stepState = (step: number) => activeStep === step ? 'current' : stepComplete(step) ? 'complete' : 'upcoming'
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedPharmacy || !deliveryPoint || items.length === 0) { setMessage('Select a pharmacy, add at least one medicine, and pin the delivery location.'); return }
    if (!deliveryEstimate) { setMessage(roadEstimate.error || 'Wait for the road route and route-based fee before submitting.'); return }
    if (missingPrescription) { setMessage('Upload a separate prescription for every medicine marked as prescription required.'); return }
    const scheduledAt = scheduledDeliveryPayload(deliveryPreference, scheduledDeliveryAt)
    if (deliveryPreference === 'scheduled' && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) { setMessage('Choose a future delivery date and time before submitting.'); return }
    setSubmitting(true)
    setMessage('')
    try {
      const response = await api.post('/orders', { pharmacy_id: Number(selectedPharmacy.id), delivery_address_snapshot: `Pinned map location (${deliveryPoint.latitude.toFixed(6)}, ${deliveryPoint.longitude.toFixed(6)})`, delivery_latitude: deliveryPoint.latitude, delivery_longitude: deliveryPoint.longitude, delivery_preference: deliveryPreference, delivery_vehicle_type: deliveryVehicleType, scheduled_delivery_at: scheduledAt, items: items.map((item) => ({ medicine_id: Number(item.medicine.id), quantity: item.quantity })) }, mutationConfig('patient-order', uniqueMutationId('patient-order'), 'create'))
      const order = response.data.order ?? response.data
      const createdItems = Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : []
      for (const selected of items.filter((item) => item.prescription)) {
        const created = createdItems.find((item) => Number(item.medicine_id) === Number(selected.medicine.id))
        if (!created) throw new Error('Created order item could not be matched to its prescription.')
        const form = new FormData()
        form.append('prescription', selected.prescription as File)
        await api.post(`/orders/${String(order.id)}/items/${String(created.id)}/prescription`, form, { headers: mutationConfig('item-prescription', created.id as number, 'upload').headers })
      }
      setSelectedPharmacy(null)
      setPharmacySearch('')
      setPharmacySuggestionsOpen(false)
      setActivePharmacyIndex(0)
      setMedicines([])
      setDeliveryPoint(null)
      setItems([])
      setMedicineId('')
      setMedicineSearch('')
      setMedicineSuggestionsOpen(false)
      setActiveMedicineIndex(0)
      setQuantity('1')
      setDeliveryPreference('asap')
      setDeliveryVehicleType('motorcycle')
      setScheduledDeliveryAt('')
      setActiveStep(1)
      const successMessage = 'Order submitted successfully. It is now shown at the top of your orders list.'
      setMessage(successMessage)
      onCreated?.(order)
    } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to create order.' : 'The order or one of its prescription uploads could not be completed.') }
    finally { setSubmitting(false) }
  }

  return <section className="panel patient-order-create multi-medicine-order">
    <div className="panel-heading new-order-heading"><div><p className="eyebrow">NEW ORDER</p><h1>Create a medicine order</h1><p className="muted">Complete the three steps below. Prescription files stay attached to their specific medicines.</p></div><span className="order-cart-count"><ShoppingCart size={16} aria-hidden="true" /> {items.length} selected</span></div>
    <ol className="order-progress" aria-label="Order creation progress">
      {[['Select Pharmacy', 'Choose an approved pharmacy'], ['Select Medicine', 'Search and attach prescriptions'], ['Select Delivery Address', 'Pin where the order should arrive']].map(([title, description], index) => { const step = index + 1; const state = stepState(step); const available = stepAvailable(step); return <li className={state} aria-current={state === 'current' ? 'step' : undefined} key={title}><button type="button" disabled={!available} aria-label={`${title}${stepComplete(step) ? ', completed' : ''}`} onClick={() => revealStep(step)}><span className="order-progress-marker">{stepComplete(step) && state !== 'current' ? <FileCheck2 size={17} aria-hidden="true" /> : step}</span><span><strong>{title}</strong><small>{description}</small></span></button></li> })}
    </ol>
    <form className="customer-order-form guided-order-form" onSubmit={submit}>
      <section id="order-step-1" className={`order-flow-section map-flow-section ${stepState(1)} ${activeStep === 1 ? 'expanded' : 'collapsed'}`}>
        <button type="button" className="order-flow-heading order-flow-toggle" aria-expanded={activeStep === 1} onClick={() => revealStep(1)}><span className="order-step-number">1</span><div><h2>{selectedPharmacy ? String(selectedPharmacy.business_name) : 'Select Pharmacy'}</h2><p>{selectedPharmacy ? String(selectedPharmacy.address ?? 'Approved pharmacy selected') : 'Select a pharmacy marker to load its available medicines.'}</p></div>{selectedPharmacy && <span className="step-complete-label"><FileCheck2 size={16} aria-hidden="true" /> Selected</span>}<ChevronDown className="order-flow-chevron" size={18} aria-hidden="true" /></button>
        {activeStep === 1 && <div className="order-flow-body">
          <div className="pharmacy-autocomplete-field">
            <label htmlFor="pharmacy-autocomplete">Search for a pharmacy</label>
            <div className="pharmacy-autocomplete-control">
              <span className="pharmacy-autocomplete-input"><Search size={18} aria-hidden="true" /><input id="pharmacy-autocomplete" role="combobox" aria-label="Search pharmacies" aria-autocomplete="list" aria-expanded={pharmacySuggestionsOpen} aria-controls="pharmacy-suggestion-list" aria-activedescendant={pharmacySuggestionsOpen && matchingPharmacies[activePharmacyIndex] ? `pharmacy-option-${String(matchingPharmacies[activePharmacyIndex].id)}` : undefined} value={pharmacySearch} onFocus={() => { setActivePharmacyIndex(0); setPharmacySuggestionsOpen(true) }} onBlur={() => setPharmacySuggestionsOpen(false)} onChange={(event) => updatePharmacySearch(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'ArrowDown') { event.preventDefault(); setPharmacySuggestionsOpen(true); setActivePharmacyIndex((current) => pharmacySuggestionsOpen ? Math.min(current + 1, Math.max(0, matchingPharmacies.length - 1)) : 0) }
                if (event.key === 'ArrowUp') { event.preventDefault(); setPharmacySuggestionsOpen(true); setActivePharmacyIndex((current) => Math.max(0, current - 1)) }
                if (event.key === 'Enter' && pharmacySuggestionsOpen && matchingPharmacies[activePharmacyIndex]) { event.preventDefault(); selectPharmacy(matchingPharmacies[activePharmacyIndex]) }
                if (event.key === 'Escape') { event.preventDefault(); setPharmacySuggestionsOpen(false) }
              }} placeholder="Type a pharmacy name, address, or license number" /></span>
              {pharmacySuggestionsOpen && <ul className="pharmacy-suggestion-list" id="pharmacy-suggestion-list" role="listbox" aria-label="Pharmacy suggestions">
                {matchingPharmacies.length === 0 ? <li className="pharmacy-suggestion-empty" role="status">No matching pharmacies found.</li> : matchingPharmacies.map((pharmacy, index) => <li id={`pharmacy-option-${String(pharmacy.id)}`} className={index === activePharmacyIndex ? 'active' : ''} role="option" aria-selected={Number(pharmacy.id) === Number(selectedPharmacy?.id)} key={String(pharmacy.id)} onMouseEnter={() => setActivePharmacyIndex(index)} onPointerDown={(event) => { event.preventDefault(); selectPharmacy(pharmacy) }}><strong>{pharmacyOptionLabel(pharmacy)}</strong><span>{String(pharmacy.address ?? 'Approved pharmacy')}{pharmacy.license_number ? ` · License ${String(pharmacy.license_number)}` : ''}</span></li>)}
              </ul>}
            </div>
            <small>You can search or select a pharmacy directly from the map.</small>
          </div>
          <CustomerOrderMap pharmacies={pharmacies} selectedPharmacy={selectedPharmacy} deliveryPoint={null} interactionMode="pharmacy" onPharmacySelect={selectPharmacy} onDeliverySelect={() => undefined} />
          <div className="order-step-actions pharmacy-step-actions"><span>{selectedPharmacy ? 'Pharmacy selected. Continue when you are ready to select medicine.' : 'Search for a pharmacy or choose one from the map to continue.'}</span><button type="button" className="primary-button" disabled={!selectedPharmacy} onClick={() => revealStep(2)}>Next: Select Medicine <ChevronRight size={17} aria-hidden="true" /></button></div>
        </div>}
      </section>

      <section id="order-step-2" className={`order-flow-section ${stepState(2)} ${activeStep === 2 ? 'expanded' : 'collapsed'}`} aria-labelledby="medicine-step-title">
        <button type="button" className="order-flow-heading order-flow-toggle" aria-expanded={activeStep === 2} disabled={!stepAvailable(2)} onClick={() => revealStep(2)}><span className="order-step-number">2</span><div><h2 id="medicine-step-title">Select Medicine</h2><p>{selectedPharmacy ? 'Start typing and choose matching medicines from the suggestions.' : 'Select a pharmacy first to load its available catalog.'}</p></div>{items.length > 0 && <span className="step-complete-label"><FileCheck2 size={16} aria-hidden="true" /> {items.length} added</span>}<ChevronDown className="order-flow-chevron" size={18} aria-hidden="true" /></button>
        {activeStep === 2 && <div className="order-flow-body">{selectedPharmacy ? <div className="medicine-picker autocomplete-medicine-picker">
          <div className="medicine-autocomplete-field">
            <label htmlFor="medicine-autocomplete">Medicine</label>
            <div className="medicine-autocomplete-control">
              <span className="medicine-autocomplete-input"><Search size={18} aria-hidden="true" /><input id="medicine-autocomplete" role="combobox" aria-label="Search and select medicine" aria-autocomplete="list" aria-expanded={medicineSuggestionsOpen} aria-controls="medicine-suggestion-list" aria-activedescendant={medicineSuggestionsOpen && matchingMedicines[activeMedicineIndex] ? `medicine-option-${String(matchingMedicines[activeMedicineIndex].id)}` : undefined} value={medicineSearch} onFocus={() => { setActiveMedicineIndex(0); setMedicineSuggestionsOpen(true) }} onBlur={() => setMedicineSuggestionsOpen(false)} onChange={(event) => updateMedicineSearch(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'ArrowDown') { event.preventDefault(); setMedicineSuggestionsOpen(true); setActiveMedicineIndex((current) => medicineSuggestionsOpen ? Math.min(current + 1, Math.max(0, matchingMedicines.length - 1)) : 0) }
                if (event.key === 'ArrowUp') { event.preventDefault(); setMedicineSuggestionsOpen(true); setActiveMedicineIndex((current) => Math.max(0, current - 1)) }
                if (event.key === 'Enter' && medicineSuggestionsOpen && matchingMedicines[activeMedicineIndex]) { event.preventDefault(); selectMedicineSuggestion(matchingMedicines[activeMedicineIndex]) }
                if (event.key === 'Escape') { event.preventDefault(); setMedicineSuggestionsOpen(false) }
              }} placeholder="Start typing a medicine, Arabic name, or manufacturer" /></span>
              {medicineSuggestionsOpen && <ul className="medicine-suggestion-list" id="medicine-suggestion-list" role="listbox" aria-label="Medicine suggestions">
                {matchingMedicines.length === 0 ? <li className="medicine-suggestion-empty" role="status">No matching medicines found.</li> : matchingMedicines.map((medicine, index) => <li id={`medicine-option-${String(medicine.id)}`} className={index === activeMedicineIndex ? 'active' : ''} role="option" aria-selected={String(medicine.id) === medicineId} key={String(medicine.id)} onMouseEnter={() => setActiveMedicineIndex(index)} onPointerDown={(event) => { event.preventDefault(); selectMedicineSuggestion(medicine) }}><strong>{medicineOptionLabel(medicine)}</strong><span>{String(medicine.name_ar ?? medicine.form ?? 'Medicine')}{medicine.prescription_required ? ' · Prescription required' : ''} · {formatMedlineMoney(medicine.unit_price, 'SYP', locale)}</span></li>)}
              </ul>}
            </div>
            {medicineSearch && !medicineId && !medicineSuggestionsOpen && <small>Choose one of the matching suggestions to continue.</small>}
          </div>
          <label>Quantity<input aria-label="Medicine quantity" type="number" min="1" max="100" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <button type="button" className="ghost-button add-medicine-button" disabled={!medicineId} onClick={addMedicine}><Plus size={17} aria-hidden="true" /> Add medicine</button>
        </div> : <div className="order-step-empty"><span>1</span><p>Select a pharmacy on the map to unlock medicine search.</p></div>}
        <div className="selected-medicine-list">{items.length === 0 ? <div className="state">No medicines selected yet.</div> : items.map((item, index) => <article className="selected-medicine-item" key={String(item.medicine.id)}><span className="selected-medicine-index">{index + 1}</span><div className="selected-medicine-copy"><button type="button" className="medicine-name-link" onClick={() => openMedicineDetail(Number(item.medicine.id))}>{String(item.medicine.name_en)}</button><span>{String(item.medicine.dosage ?? item.medicine.form ?? item.medicine.manufacturer ?? '')}</span>{item.medicine.prescription_required && <strong className="prescription-required-label">Prescription required</strong>}</div><label>Quantity<input aria-label={`Quantity for ${String(item.medicine.name_en)}`} type="number" min="1" max="100" value={item.quantity} onChange={(event) => setItems((current) => current.map((entry) => entry.medicine.id === item.medicine.id ? { ...entry, quantity: Math.min(100, Math.max(1, Number(event.target.value) || 1)) } : entry))} /></label><div className="selected-medicine-price"><span>Unit price {formatMedlineMoney(item.medicine.unit_price, 'SYP', locale)}</span><strong>{formatMedlineMoney(Number(item.medicine.unit_price ?? 0) * item.quantity, 'SYP', locale)}</strong></div>{item.medicine.prescription_required ? <label className="item-prescription-field">Prescription for this medicine<input aria-label={`Prescription for ${String(item.medicine.name_en)}`} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setItems((current) => current.map((entry) => entry.medicine.id === item.medicine.id ? { ...entry, prescription: event.target.files?.[0] ?? null } : entry))} required /></label> : <span className="no-prescription-label"><ShieldCheck size={15} aria-hidden="true" /> No prescription required</span>}<button type="button" className="remove-medicine-button" aria-label={`Remove ${String(item.medicine.name_en)}`} onClick={() => setItems((current) => current.filter((entry) => entry.medicine.id !== item.medicine.id))}><Trash2 size={17} aria-hidden="true" /></button></article>)}</div>
        {items.length > 0 && <div className="order-step-actions medicine-step-actions"><span className={missingPrescription ? '' : 'medicine-step-subtotal'}>{missingPrescription ? 'Attach every required prescription before continuing.' : <>Medicine subtotal <strong>{formatMedlineMoney(medicineSubtotal, 'SYP', locale)}</strong></>}</span><button type="button" className="primary-button" disabled={missingPrescription} onClick={() => revealStep(3)}>Next: Select Delivery Address <ChevronRight size={17} aria-hidden="true" /></button></div>}</div>}
      </section>

      <section id="order-step-3" className={`order-flow-section map-flow-section ${stepState(3)} ${activeStep === 3 ? 'expanded' : 'collapsed'}`} aria-labelledby="delivery-step-title">
        <button type="button" className="order-flow-heading order-flow-toggle" aria-expanded={activeStep === 3} disabled={!stepAvailable(3)} onClick={() => revealStep(3)}><span className="order-step-number">3</span><div><h2 id="delivery-step-title">Select Delivery Address</h2><p>{deliveryPoint ? 'Your delivery address is ready. You can change it before submitting.' : stepAvailable(3) ? 'Click the map to place the delivery pin.' : 'Select at least one medicine before continuing.'}</p></div>{deliveryPoint && <span className="step-complete-label"><FileCheck2 size={16} aria-hidden="true" /> Pinned</span>}<ChevronDown className="order-flow-chevron" size={18} aria-hidden="true" /></button>
        {activeStep === 3 && <div className="order-flow-body"><CustomerOrderMap pharmacies={pharmacies} selectedPharmacy={selectedPharmacy} deliveryPoint={deliveryPoint} routeGeometry={deliveryEstimate?.route_geometry} routeLoading={roadEstimate.loading} interactionMode="delivery" onPharmacySelect={() => undefined} onDeliverySelect={(latitude, longitude) => setDeliveryPoint({ latitude, longitude })} />
        <div className={`delivery-point-summary ${deliveryPoint ? 'selected' : ''}`}><div><strong>{deliveryPoint ? 'Delivery location selected' : 'No delivery location yet'}</strong><small>{deliveryPoint ? `${deliveryPoint.latitude.toFixed(6)}, ${deliveryPoint.longitude.toFixed(6)}` : 'Click anywhere on the map above to set the exact delivery point.'}</small></div></div>
        <DeliverySchedulePicker idPrefix="patient-order" preference={deliveryPreference} scheduledAt={scheduledDeliveryAt} onPreferenceChange={(value) => { setDeliveryPreference(value); if (value === 'asap') setScheduledDeliveryAt('') }} onScheduledAtChange={setScheduledDeliveryAt} />
        <DeliveryVehiclePicker idPrefix="patient-order" value={deliveryVehicleType} rates={deliveryRates} onChange={setDeliveryVehicleType} />
        {roadEstimate.loading && <div className="state" role="status">Calculating the road route and delivery fee…</div>}
        {roadEstimate.error && <div className="form-error" role="alert">{roadEstimate.error}</div>}
        {deliveryEstimate && <section className="delivery-estimate-card" aria-label="Road-route delivery cost"><div className="delivery-estimate-copy"><span className="delivery-estimate-icon"><Navigation size={20} aria-hidden="true" /></span><div><strong>Road-route estimate</strong><small>This exact road route, distance, rate, and fee will be stored with the order when submitted.</small></div></div><dl className="delivery-estimate-metrics"><div><dt>Road distance</dt><dd>{deliveryEstimate.distance_km.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km</dd></div><div><dt>Current rate</dt><dd>SYP {deliveryEstimate.rate_per_km.toLocaleString()} / km</dd></div><div className="delivery-estimate-total"><dt>Route-based fee</dt><dd>SYP {deliveryEstimate.fee.toLocaleString()}</dd></div></dl></section>}
        {items.length > 0 && <section className="order-cost-summary" aria-labelledby="order-cost-summary-title"><div className="order-cost-summary-heading"><div><p className="eyebrow">COST SUMMARY</p><h3 id="order-cost-summary-title">Order total</h3></div><strong>{deliveryEstimate ? formatMedlineMoney(estimatedTotal, 'SYP', locale) : '—'}</strong></div><dl><div><dt>Medicine subtotal</dt><dd>{formatMedlineMoney(medicineSubtotal, 'SYP', locale)}</dd></div><div><dt>Tax ({taxRatePercent.toLocaleString(locale === 'ar' ? 'ar' : 'en-GB', { maximumFractionDigits: 2 })}%)</dt><dd>{formatMedlineMoney(estimatedTax, 'SYP', locale)}</dd></div><div><dt>Road-route delivery fee</dt><dd>{deliveryEstimate ? formatMedlineMoney(estimatedDeliveryFee, 'SYP', locale) : deliveryPoint ? 'Calculating route…' : 'Select an address'}</dd></div><div className="order-cost-grand-total"><dt>Total</dt><dd>{deliveryEstimate ? formatMedlineMoney(estimatedTotal, 'SYP', locale) : deliveryPoint ? 'Pending road route' : 'Pending delivery address'}</dd></div></dl><small>Medicine prices, tax, and the exact road route are confirmed and recorded when the order is created.</small></section>}
        <div className="order-submit-bar"><div><strong>{items.length} {items.length === 1 ? 'medicine' : 'medicines'} in this order</strong><span>{missingPrescription ? 'Add every required prescription before submitting.' : roadEstimate.loading ? 'Calculating the road route before submission.' : deliveryPreference === 'scheduled' && scheduledDeliveryAt ? `Requested for ${formatMedlineDate(new Date(scheduledDeliveryAt), locale)}.` : deliveryPoint && items.length > 0 ? 'Ready to submit for pharmacy review and ASAP delivery.' : 'Complete all three steps to continue.'}</span></div><button className="primary-button" type="submit" disabled={submitting || roadEstimate.loading || !deliveryEstimate || !selectedPharmacy || items.length === 0 || !deliveryPoint || missingPrescription || (deliveryPreference === 'scheduled' && !scheduledDeliveryAt)}>{submitting ? 'Creating order…' : 'Create order'}</button></div>
        </div>}
      </section>
      {message && <div className="form-message" role="status">{message}</div>}
    </form>
  </section>
}

function PatientOrderCreatePanelLegacy2({ locale }: { locale: string }) {
  void locale
  const [pharmacies, setPharmacies] = useState<Array<Record<string, unknown>>>([])
  const [medicines, setMedicines] = useState<Array<Record<string, unknown>>>([])
  const [selectedPharmacy, setSelectedPharmacy] = useState<Record<string, unknown> | null>(null)
  const [deliveryPoint, setDeliveryPoint] = useState<{ latitude: number; longitude: number } | null>(null)
  const [medicineSearch, setMedicineSearch] = useState('')
  const [medicineId, setMedicineId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [items, setItems] = useState<Array<{ medicine: Record<string, any>; quantity: number; prescription: File | null }>>([])
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => { api.get('/partners', { params: { type: 'pharmacy', per_page: 100 } }).then((response) => setPharmacies(response.data.data ?? [])).catch(() => setMessage('Unable to load approved pharmacies.')) }, [])
  const selectPharmacy = (pharmacy: Record<string, unknown>) => { setSelectedPharmacy(pharmacy); setItems([]); setMedicineId(''); setMedicines([]); api.get('/medicines', { params: { available_only: true, partner_id: Number(pharmacy.id), per_page: 100 } }).then((response) => setMedicines(response.data.data ?? [])).catch(() => setMessage('Unable to load medicines for this pharmacy.')) }
  const filteredMedicines = medicines.filter((medicine) => `${String(medicine.name_en ?? '')} ${String(medicine.name_ar ?? '')} ${String(medicine.manufacturer ?? '')}`.toLowerCase().includes(medicineSearch.toLowerCase()))
  const addMedicine = () => { const medicine = medicines.find((entry) => String(entry.id) === medicineId); const count = Math.max(1, Math.min(100, Number(quantity) || 1)); if (!medicine) return; setItems((current) => { const existing = current.find((item) => item.medicine.id === medicine.id); return existing ? current.map((item) => item.medicine.id === medicine.id ? { ...item, quantity: Math.min(100, item.quantity + count) } : item) : [...current, { medicine, quantity: count, prescription: null }] }); setMedicineId(''); setQuantity('1') }
  const missingPrescription = items.some((item) => Boolean(item.medicine.prescription_required) && !item.prescription)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedPharmacy || !deliveryPoint || items.length === 0) { setMessage('Select a pharmacy, add at least one medicine, and pin the delivery location.'); return }
    if (missingPrescription) { setMessage('Upload a separate prescription for every medicine marked as prescription required.'); return }
    setSubmitting(true)
    setMessage('')
    try {
      const response = await api.post('/orders', { pharmacy_id: Number(selectedPharmacy.id), delivery_address_snapshot: `Pinned map location (${deliveryPoint.latitude.toFixed(6)}, ${deliveryPoint.longitude.toFixed(6)})`, items: items.map((item) => ({ medicine_id: Number(item.medicine.id), quantity: item.quantity })) }, mutationConfig('patient-order', uniqueMutationId('patient-order'), 'create'))
      const order = response.data.order ?? response.data
      const createdItems = Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : []
      for (const selected of items.filter((item) => item.prescription)) {
        const created = createdItems.find((item) => Number(item.medicine_id) === Number(selected.medicine.id))
        if (!created) throw new Error('Created order item could not be matched to its prescription.')
        const form = new FormData()
        form.append('prescription', selected.prescription as File)
        await api.post(`/orders/${String(order.id)}/items/${String(created.id)}/prescription`, form, { headers: mutationConfig('item-prescription', created.id as number, 'upload').headers })
      }
      setItems([])
      setMedicineId('')
      setMessage('Order submitted. Each required prescription was attached to its medicine for separate pharmacy review.')
    } catch (error) { setMessage(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Unable to create order.' : 'The order or one of its prescription uploads could not be completed.') }
    finally { setSubmitting(false) }
  }
  return <section className="panel patient-order-create multi-medicine-order"><div className="panel-heading"><div><p className="eyebrow">NEW ORDER · 3 STEPS</p><h2>Build a multi-medicine order</h2><p className="muted">Choose one pharmacy, add all required medicines, attach item-specific prescriptions, then pin delivery.</p></div><span className="order-cart-count"><ShoppingCart size={16} /> {items.length} selected</span></div><CustomerOrderMap pharmacies={pharmacies} selectedPharmacy={selectedPharmacy} deliveryPoint={deliveryPoint} onPharmacySelect={selectPharmacy} onDeliverySelect={(latitude, longitude) => setDeliveryPoint({ latitude, longitude })} /><form className="customer-order-form" onSubmit={submit}><div className="order-step-card"><span className="order-step-number">1</span><div><strong>{selectedPharmacy ? String(selectedPharmacy.business_name) : 'Select a pharmacy on the map'}</strong><small>{selectedPharmacy ? 'Now add one or more medicines from this pharmacy.' : 'Click a pharmacy marker to load its available catalog.'}</small></div></div>{selectedPharmacy && <div className="medicine-picker"><label>Search medicines<input value={medicineSearch} onChange={(event) => setMedicineSearch(event.target.value)} placeholder="Name, Arabic name, or manufacturer" /></label><label>Medicine<select value={medicineId} onChange={(event) => setMedicineId(event.target.value)}><option value="">Choose a medicine</option>{filteredMedicines.map((medicine) => <option key={String(medicine.id)} value={String(medicine.id)}>{String(medicine.name_en)}{medicine.prescription_required ? ' · Prescription' : ''}</option>)}</select></label><label>Quantity<input type="number" min="1" max="100" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><button type="button" className="ghost-button add-medicine-button" disabled={!medicineId} onClick={addMedicine}>Add medicine</button></div>}<div className="selected-medicine-list">{items.length === 0 ? <div className="state">No medicines selected yet.</div> : items.map((item, index) => <article className="selected-medicine-item" key={String(item.medicine.id)}><span className="selected-medicine-index">{index + 1}</span><div className="selected-medicine-copy"><button type="button" className="medicine-name-link" onClick={() => openMedicineDetail(Number(item.medicine.id))}>{String(item.medicine.name_en)}</button><span>{String(item.medicine.dosage ?? item.medicine.form ?? item.medicine.manufacturer ?? '')}</span>{item.medicine.prescription_required && <strong className="prescription-required-label">Prescription required</strong>}</div><label>Quantity<input aria-label={`Quantity for ${String(item.medicine.name_en)}`} type="number" min="1" max="100" value={item.quantity} onChange={(event) => setItems((current) => current.map((entry) => entry.medicine.id === item.medicine.id ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) } : entry))} /></label>{item.medicine.prescription_required ? <label className="item-prescription-field">Prescription for this medicine<input aria-label={`Prescription for ${String(item.medicine.name_en)}`} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setItems((current) => current.map((entry) => entry.medicine.id === item.medicine.id ? { ...entry, prescription: event.target.files?.[0] ?? null } : entry))} required /></label> : <span className="no-prescription-label"><ShieldCheck size={15} /> No prescription</span>}<button type="button" className="remove-medicine-button" aria-label={`Remove ${String(item.medicine.name_en)}`} onClick={() => setItems((current) => current.filter((entry) => entry.medicine.id !== item.medicine.id))}><Trash2 size={17} /></button></article>)}</div><div className={`delivery-point-summary ${deliveryPoint ? 'selected' : ''}`}><span className="order-step-number">3</span><div><strong>{deliveryPoint ? 'Delivery location selected' : 'Pin your delivery location'}</strong><small>{deliveryPoint ? `${deliveryPoint.latitude.toFixed(6)}, ${deliveryPoint.longitude.toFixed(6)}` : 'Click the map where you want the driver to deliver.'}</small></div></div><button className="primary-button" type="submit" disabled={submitting || !selectedPharmacy || items.length === 0 || !deliveryPoint || missingPrescription}>{submitting ? 'Creating order...' : `Create order with ${items.length} ${items.length === 1 ? 'medicine' : 'medicines'}`}</button>{message && <div className="form-message" role="status">{message}</div>}</form></section>
}

void PatientOrderCreatePanelLegacy2
void PatientOrderCreatePanelLegacy
function PatientOrderCreatePanelLegacy({ locale: _locale }: { locale: string }) {
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
  const [perPage, setPerPage] = useState(10)
  const [lastPage, setLastPage] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [complaintReport, setComplaintReport] = useState<Record<string, unknown> | null>(null)
  const [createdOrderNotice, setCreatedOrderNotice] = useState<{ id: number; publicId: string } | null>(null)
  const [createdProcurementNotice, setCreatedProcurementNotice] = useState<{ id: number; publicId: string } | null>(null)
  const [deliveryMessage, setDeliveryMessage] = useState('')
  const [pickupPinSendingId, setPickupPinSendingId] = useState<number | null>(null)
  const [inventoryCatalog, setInventoryCatalog] = useState<Array<Record<string, unknown>>>([])
  const [inventoryMedicineSearch, setInventoryMedicineSearch] = useState('')
  const [selectedInventoryMedicine, setSelectedInventoryMedicine] = useState<Record<string, unknown> | null>(null)
  const [inventorySuggestionsOpen, setInventorySuggestionsOpen] = useState(false)
  const [inventoryCatalogLoading, setInventoryCatalogLoading] = useState(false)
  const [inventoryQuantity, setInventoryQuantity] = useState('')
  const [inventoryUnitPrice, setInventoryUnitPrice] = useState('')
  const [inventoryLowStock, setInventoryLowStock] = useState('5')
  const [inventoryBatchNumber, setInventoryBatchNumber] = useState('')
  const [inventoryManufacturedAt, setInventoryManufacturedAt] = useState('')
  const [inventoryExpiresAt, setInventoryExpiresAt] = useState('')
  const [inventoryReceivedAt, setInventoryReceivedAt] = useState('')
  const [inventoryStorageLocation, setInventoryStorageLocation] = useState('')
  const [inventoryMessage, setInventoryMessage] = useState('')
  const [inventorySaving, setInventorySaving] = useState(false)
  const [dataRevision, setDataRevision] = useState(0)
  const busyMutationKeys = useRef(new Set<string>())
  const endpoint = operationsEndpoint(section, role)
  const runMutation = async (key: string, task: () => Promise<void>): Promise<boolean> => { if (busyMutationKeys.current.has(key)) return false; busyMutationKeys.current.add(key); try { await task(); return true } catch (error) { const message = axios.isAxiosError(error) ? error.response?.data?.message ?? 'The operation could not be completed. You can retry the same action safely.' : 'The operation could not be completed. You can retry the same action safely.'; announceAccessibilityMessage(message); window.alert(message); return false } finally { busyMutationKeys.current.delete(key) } }
  const changeStatusFilter = (value: string) => {
    setStatusFilter(value)
    setPage(1)
    if (section !== 'deliveries') return
    const url = new URL(window.location.href)
    if (value) url.searchParams.set('status', value)
    else url.searchParams.delete('status')
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
  }
  useEffect(() => {
    const requestedStatus = section === 'deliveries' ? new URLSearchParams(window.location.search).get('status') ?? '' : ''
    setPage(1)
    setStatusFilter(requestedStatus)
    setDeliveryMessage('')
    setSortBy(section === 'inventory' ? 'name_en' : 'created_at')
    setSortDirection(section === 'inventory' ? 'asc' : 'desc')
  }, [section, endpoint])
  useEffect(() => {
    if (section !== 'orders' || role !== 'patient') return
    const stored = sessionStorage.getItem('medline_order_created')
    if (!stored) return
    sessionStorage.removeItem('medline_order_created')
    try {
      const parsed = JSON.parse(stored) as { id?: number; publicId?: string }
      setCreatedOrderNotice({ id: Number(parsed.id ?? 0), publicId: String(parsed.publicId ?? 'Your order') })
    } catch { setCreatedOrderNotice({ id: 0, publicId: 'Your order' }) }
  }, [section, role])
  useEffect(() => {
    if (section !== 'procurement' || role !== 'pharmacy') return
    const stored = sessionStorage.getItem('medline_procurement_created')
    if (!stored) return
    sessionStorage.removeItem('medline_procurement_created')
    try {
      const parsed = JSON.parse(stored) as { id?: number; publicId?: string }
      setCreatedProcurementNotice({ id: Number(parsed.id ?? 0), publicId: String(parsed.publicId ?? 'Your replenishment order') })
    } catch { setCreatedProcurementNotice({ id: 0, publicId: 'Your replenishment order' }) }
  }, [section, role])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const routeFilters = new URLSearchParams(window.location.search)
    const pickupOnly = section === 'deliveries' && routeFilters.get('pickup_only') === '1'
    const params = section === 'verification'
      ? { search, status: statusFilter || 'pending', sort_by: sortBy, sort_direction: sortDirection, per_page: perPage, page }
      : section === 'documents'
        ? { search, status: statusFilter || 'under_review', sort_by: sortBy, sort_direction: sortDirection, per_page: perPage, page }
        : { search, ...(statusFilter ? { status: statusFilter } : {}), ...(pickupOnly ? { pickup_only: 1 } : {}), sort_by: sortBy, sort_direction: sortDirection, per_page: perPage, page }
    api.get(endpoint, { params }).then((response) => {
      if (cancelled) return
      const data = response.data.data ?? []
      setLastPage(Number(response.data.last_page ?? response.data.meta?.last_page ?? 1))
      setTotalRecords(Number(response.data.total ?? response.data.meta?.total ?? data.length))
      setRows(data.map((item: Record<string, unknown>) => ({ id: Number(item.id ?? 0), primary: String(item.business_name ?? item.name ?? item.name_en ?? item.public_id ?? item.subject ?? item.action ?? `Record ${item.id}`), secondary: String(item.email ?? item.document_type ?? item.name_ar ?? item.manufacturer ?? item.delivery_address_snapshot ?? item.status ?? 'Operational record'), status: String(item.status ?? item.approval_status ?? 'Active'), raw: item })))
    }).catch(() => {
      if (!cancelled) { setRows([]); setLastPage(1); setTotalRecords(0) }
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [endpoint, section, search, page, perPage, statusFilter, sortBy, sortDirection, dataRevision])
  useEffect(() => {
    if (section !== 'inventory' || role !== 'warehouse') { setInventoryCatalog([]); return }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setInventoryCatalogLoading(true)
      api.get('/medicines', { params: { search: inventoryMedicineSearch.trim(), per_page: 50 } })
        .then((response) => { if (!cancelled) setInventoryCatalog(response.data.data ?? []) })
        .catch(() => { if (!cancelled) setInventoryCatalog([]) })
        .finally(() => { if (!cancelled) setInventoryCatalogLoading(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [section, role, inventoryMedicineSearch])
  useEffect(() => { if (section !== 'complaints' || role !== 'admin') { setComplaintReport(null); return } api.get('/admin/reports/complaints').then((response) => setComplaintReport(response.data)).catch(() => setComplaintReport(null)) }, [section, role, rows.length])
  const decidePartner = async (id: number, decision: 'approve' | 'reject') => runMutation(`partner:${id}:${decision}`, async () => { await api.post(`/admin/partners/${id}/decision`, { decision }, mutationConfig('partner-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const decideOrder = async (id: number, decision: 'accept' | 'reject') => runMutation(`order:${id}:${decision}`, async () => { await api.post(`/partner/orders/${id}/decision`, { decision }, mutationConfig('order-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const decidePrescription = async (id: number, decision: 'approve' | 'reject') => runMutation(`prescription:${id}:${decision}`, async () => { await api.post(`/pharmacy/prescriptions/${id}/review`, { decision }, mutationConfig('prescription-review', id, decision)); setRows((current) => current.map((row) => row.id === id ? { ...row, status: decision === 'approve' ? 'pending_pharmacy_review' : 'cancelled' } : row)) })
  void decidePrescription
  const decidePayment = async (id: number, decision: 'approve' | 'reject') => runMutation(`payment:${id}:${decision}`, async () => { await api.post(`/admin/subscriptions/${id}/decision`, { decision }, mutationConfig('subscription-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const updateComplaint = async (id: number, status: 'in_review' | 'resolved') => runMutation(`complaint:${id}:${status}`, async () => { await api.patch(`/complaints/${id}`, { status }, mutationConfig('complaint-status', id, status)); setRows((current) => current.map((row) => row.id === id ? { ...row, status } : row)) })
  const reassignDelivery = async (id: number) => runMutation(`reassign:${id}`, async () => { await api.post(`/admin/deliveries/${id}/reassign`, { reason: 'Administrative reassignment after failed delivery.' }, mutationConfig('delivery-reassign', id, 'failed')); setRows((current) => current.map((row) => row.id === id ? { ...row, status: 'available' } : row)) })
  const sendPickupPin = async (row: Row) => {
    if (pickupPinSendingId !== null) return
    setPickupPinSendingId(row.id)
    setDeliveryMessage('')
    try {
      let confirmation = 'A 4-digit pickup PIN was emailed to the assigned driver.'
      const sent = await runMutation(`pickup-pin:${row.id}`, async () => {
        const response = await api.post(`/deliveries/${row.id}/pickup-verification/initiate`, {}, mutationConfig('delivery-verification', row.id, 'send-pickup'))
        confirmation = String(response.data.message ?? confirmation)
      })
      if (!sent) return
      setDeliveryMessage(confirmation)
      announceAccessibilityMessage(confirmation)
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: 'pickup_started', raw: { ...item.raw, status: 'pickup_started' } } : item))
      setDataRevision((current) => current + 1)
    } finally { setPickupPinSendingId(null) }
  }
  // Kept as the legacy action branch's target; claiming always happens from DeliveryDetailPanel.
  const claimDelivery = async (row: Row) => { await openDetail(row.id) }
  const updateUserStatus = async (id: number, status: 'active' | 'suspended') => runMutation(`user:${id}:${status}`, async () => { await api.patch(`/admin/users/${id}/status`, { status, reason: 'Administrative account review.' }, mutationConfig('user-status', id, status)); setRows((current) => current.map((row) => row.id === id ? { ...row, status } : row)) })
  const decideDocument = async (id: number, decision: 'approve' | 'reject' | 'correction') => runMutation(`document:${id}:${decision}`, async () => { await api.post(`/admin/verification-documents/${id}/decision`, { decision }, mutationConfig('document-decision', id, decision)); setRows((current) => current.filter((row) => row.id !== id)) })
  const inventoryMedicineLabel = (medicine: Record<string, unknown>) => [String(medicine.name_en ?? 'Medicine'), medicine.dosage ? String(medicine.dosage) : '', medicine.manufacturer ? String(medicine.manufacturer) : ''].filter(Boolean).join(' · ')
  const selectInventoryMedicine = (medicine: Record<string, unknown>) => {

    setSelectedInventoryMedicine(medicine)
    setInventoryMedicineSearch(inventoryMedicineLabel(medicine))
    setInventorySuggestionsOpen(false)
    setInventoryQuantity('')
    setInventoryUnitPrice('')
    setInventoryLowStock('5')
    setInventoryBatchNumber('')
    setInventoryManufacturedAt('')
    setInventoryExpiresAt('')
    setInventoryReceivedAt(new Date().toISOString().slice(0, 10))
    setInventoryStorageLocation('')
    setInventoryMessage('')
  }
  const updateInventory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedInventoryMedicine) { setInventoryMessage('Choose an existing medicine from the catalog suggestions first.'); return }


    const payload = { medicine_id: Number(selectedInventoryMedicine.id), quantity: Number(inventoryQuantity), unit_price: Number(inventoryUnitPrice), low_stock_threshold: Number(inventoryLowStock || 5), batch_number: inventoryBatchNumber || null, manufactured_at: inventoryManufacturedAt || null, expires_at: inventoryExpiresAt || null, received_at: inventoryReceivedAt || null, storage_location: inventoryStorageLocation || null }
    const key = `${payload.medicine_id}-${payload.quantity}-${payload.unit_price}-${payload.low_stock_threshold}-${payload.batch_number ?? ''}`
    setInventorySaving(true)
    setInventoryMessage('')
    const saved = await runMutation(`inventory:${key}`, async () => { await api.put('/partner/inventory', payload, mutationConfig('inventory-upsert', key, 'save')) })
    if (saved) {
      const medicineName = String(selectedInventoryMedicine.name_en ?? 'Medicine')
      setInventoryMessage(`${medicineName} batch was added as a separate warehouse stock record.`)
      setSelectedInventoryMedicine(null)
      setInventoryMedicineSearch('')
      setInventoryQuantity('')
      setInventoryUnitPrice('')
      setInventoryLowStock('5')
      setInventoryBatchNumber('')
      setInventoryManufacturedAt('')
      setInventoryExpiresAt('')
      setInventoryReceivedAt('')
      setInventoryStorageLocation('')
      setInventorySuggestionsOpen(false)
      setPage(1)
      setDataRevision((current) => current + 1)
    }
    setInventorySaving(false)
  }
  const updateInventoryStatus = async (row: Row) => {
    const active = Boolean(row.raw?.is_active)
    if (active && !window.confirm(`Deactivate ${row.primary} for pharmacy replenishment? Existing reserved requests stay protected.`)) return
    const saved = await runMutation(`inventory-status:${row.id}:${active ? 'off' : 'on'}`, async () => { await api.patch(`/partner/inventory/${row.id}/status`, { is_active: !active }, mutationConfig('inventory-status', row.id, active ? 'deactivate' : 'activate')) })
    if (saved) { setInventoryMessage(active ? `${row.primary} is hidden from new pharmacy requests.` : `${row.primary} is available for pharmacy requests again.`); setDataRevision((current) => current + 1) }
  }
  const openDetail = async (id: number) => { if (!['orders', 'deliveries', 'complaints', 'procurement'].includes(section)) return; try { const response = await api.get(section === 'complaints' ? `/complaints/${id}` : section === 'procurement' ? `/procurement/${id}` : section === 'deliveries' ? `/deliveries/${id}` : `/orders/${id}`); setDetail(section === 'complaints' ? { ...response.data, _kind: 'complaint' } : section === 'procurement' ? { ...response.data, _kind: 'procurement' } : section === 'deliveries' ? { ...response.data, _kind: 'delivery' } : response.data) } catch { setDetail({ error: section === 'complaints' ? 'Unable to load complaint details.' : section === 'procurement' ? 'Unable to load procurement details.' : section === 'deliveries' ? 'Unable to load delivery details.' : 'Unable to load order details.' }) } }
  const exportAudit = async () => { try { const response = await api.get('/admin/audit-logs/export', { params: { search }, responseType: 'blob' }); const url = window.URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'medline-audit-log.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.URL.revokeObjectURL(url) } catch { setDetail({ error: 'Unable to export audit records.' }) } }
  const toggleSort = (key: string) => { if (sortBy === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(key); setSortDirection('asc') }; setPage(1) }
  if (detail) return detail._kind === 'complaint' ? <ComplaintDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} /> : detail._kind === 'procurement' ? <ProcurementDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} /> : detail._kind === 'delivery' ? <DeliveryDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} role={role} onAccepted={() => setDataRevision((current) => current + 1)} /> : <OrderDetailPanel detail={detail} onClose={() => setDetail(null)} locale={locale} />
  if (section === 'ratings' && role === 'admin') return <RatingQueue locale={locale} />
  const orderListAction = (row: Row) => <button className="ghost-button" aria-label={`View order ${row.primary}`} title={`View order ${row.primary}`} onClick={() => void openDetail(row.id)}><Eye size={22} strokeWidth={2.5} /></button>
  const action = (row: Row) => section === 'verification' ? <div className="row-actions"><button className="approve-button" aria-label={tr('approve', locale)} title={tr('approve', locale)} onClick={() => decidePartner(row.id, 'approve')}><FileCheck2 size={22} strokeWidth={2.5} /></button><button className="reject-button" aria-label={tr('reject', locale)} title={tr('reject', locale)} onClick={() => decidePartner(row.id, 'reject')}><FileX2 size={22} strokeWidth={2.5} /></button></div> : section === 'documents' && role === 'admin' && row.status.includes('review') ? <div className="row-actions"><button className="ghost-button" aria-label={tr('download', locale)} title={tr('download', locale)} onClick={() => void downloadPrivate(`/verification-documents/${row.id}/download`, `medline-document-${row.id}`)}><Eye size={22} strokeWidth={2.5} /></button><button className="approve-button" aria-label={tr('approve', locale)} title={tr('approve', locale)} onClick={() => decideDocument(row.id, 'approve')}><FileCheck2 size={22} strokeWidth={2.5} /></button><button className="reject-button" aria-label={tr('reject', locale)} title={tr('reject', locale)} onClick={() => decideDocument(row.id, 'reject')}><FileX2 size={22} strokeWidth={2.5} /></button></div> : section === 'users' && role === 'admin' ? <div className="row-actions"><button className={row.status === 'suspended' ? 'approve-button' : 'reject-button'} aria-label={row.status === 'suspended' ? tr('reactivate', locale) : tr('suspend', locale)} title={row.status === 'suspended' ? tr('reactivate', locale) : tr('suspend', locale)} onClick={() => updateUserStatus(row.id, row.status === 'suspended' ? 'active' : 'suspended')}>{row.status === 'suspended' ? <FileCheck2 size={22} strokeWidth={2.5} /> : <FileX2 size={22} strokeWidth={2.5} />}</button></div> : section === 'deliveries' && role === 'driver' ? <button className="approve-button driver-accept-job" aria-label={`Review order ${row.primary}`} title={`Review order ${row.primary}`} onClick={() => void claimDelivery(row)}><Eye size={19} strokeWidth={2.5} /><span>Review order</span></button> : section === 'deliveries' && role === 'admin' && row.status === 'failed' ? <div className="row-actions"><button className="approve-button" aria-label={tr('reassign', locale)} title={tr('reassign', locale)} onClick={() => reassignDelivery(row.id)}><FileCheck2 size={22} strokeWidth={2.5} /></button></div> : section === 'orders' && role === 'pharmacy' && row.status.includes('pending') ? <div className="row-actions"><button className="approve-button" aria-label={tr('accept', locale)} title={tr('accept', locale)} onClick={() => decideOrder(row.id, 'accept')}><FileCheck2 size={22} strokeWidth={2.5} /></button><button className="reject-button" aria-label={tr('reject', locale)} title={tr('reject', locale)} onClick={() => decideOrder(row.id, 'reject')}><FileX2 size={22} strokeWidth={2.5} /></button></div> : section === 'procurement' && role === 'warehouse' && row.status.includes('pending') ? <button className="ghost-button" aria-label={`Review procurement ${row.primary}`} title="Review quantities and comment" onClick={() => void openDetail(row.id)}><Eye size={22} strokeWidth={2.5} /></button> : section === 'subscriptions' && row.status.includes('review') ? <div className="row-actions"><button className="ghost-button" aria-label={tr('receipt', locale)} title={tr('receipt', locale)} onClick={() => void downloadPrivate(`/admin/payment-proofs/${String(row.raw?.payment_proof_id ?? row.id)}/download`, `medline-payment-proof-${row.id}`)}><Eye size={22} strokeWidth={2.5} /></button><button className="approve-button" aria-label={tr('approve', locale)} title={tr('approve', locale)} onClick={() => decidePayment(row.id, 'approve')}><FileCheck2 size={22} strokeWidth={2.5} /></button><button className="reject-button" aria-label={tr('reject', locale)} title={tr('reject', locale)} onClick={() => decidePayment(row.id, 'reject')}><FileX2 size={22} strokeWidth={2.5} /></button></div> : section === 'complaints' ? <div className="row-actions"><button className="ghost-button" aria-label={tr('view', locale)} title={tr('view', locale)} onClick={() => void openDetail(row.id)}><Eye size={22} strokeWidth={2.5} /></button>{(row.status === 'open' || row.status === 'in_review') && <button className="approve-button" aria-label={row.status === 'open' ? tr('review', locale) : tr('resolve', locale)} title={row.status === 'open' ? tr('review', locale) : tr('resolve', locale)} onClick={() => updateComplaint(row.id, row.status === 'open' ? 'in_review' : 'resolved')}><FileCheck2 size={22} strokeWidth={2.5} /></button>}</div> : section === 'audit' ? <button className="ghost-button" aria-label={tr('exportCsv', locale)} title={tr('exportCsv', locale)} onClick={() => void exportAudit()}><Eye size={22} strokeWidth={2.5} /></button> : <button className="ghost-button" aria-label={tr('view', locale)} title={tr('view', locale)} onClick={() => void openDetail(row.id)}><Eye size={22} strokeWidth={2.5} /></button>
  const availableQuantity = (row: Row) => Number(row.raw?.quantity ?? 0) - Number(row.raw?.reserved_quantity ?? 0)
  const inventoryIsActive = (row: Row) => row.raw?.is_active !== false && Number(row.raw?.is_active ?? 1) !== 0
  const inventoryIsExpired = (row: Row) => Boolean(row.raw?.expires_at) && String(row.raw?.expires_at).slice(0, 10) <= new Date().toISOString().slice(0, 10)
  const stockIsLow = (row: Row) => availableQuantity(row) <= Number(row.raw?.low_stock_threshold ?? 0)
  const matchesStatus = (row: Row) => !statusFilter || (section === 'inventory' ? statusFilter === 'inactive' ? !inventoryIsActive(row) : statusFilter === 'expired' ? inventoryIsActive(row) && inventoryIsExpired(row) : inventoryIsActive(row) && !inventoryIsExpired(row) && (statusFilter === 'low_stock' ? stockIsLow(row) : !stockIsLow(row)) : row.status === statusFilter)
  const sortValue = (row: Row, key: string): unknown => key === 'available_quantity' ? availableQuantity(row) : key === 'stock_health' ? (stockIsLow(row) ? 0 : 1) : key === 'related_order' ? (row.raw?.order_public_id ?? row.raw?.procurement_public_id ?? '') : row.raw?.[key] ?? (key === 'record' ? row.primary : key === 'details' ? row.secondary : key === 'status' ? row.status : '')
  const displayedRows = [...rows].filter(matchesStatus).sort((left, right) => {
    const leftValue = sortValue(left, sortBy)
    const rightValue = sortValue(right, sortBy)
    const leftNumber = Number(leftValue)
    const rightNumber = Number(rightValue)
    const comparison = Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && String(leftValue).trim() !== '' && String(rightValue).trim() !== '' ? leftNumber - rightNumber : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    return sortDirection === 'asc' ? comparison : -comparison
  })
  const partnerDeliveryStatuses = role === 'pharmacy' || role === 'warehouse'
  const statusOptions: Record<string, Array<[string, string]>> = {
    inventory: [['healthy', 'Healthy'], ['low_stock', 'Low stock'], ['expired', 'Expired'], ['inactive', 'Inactive']],
    procurement: [['pending_warehouse_review', 'Pending warehouse review'], ['partial_approval_required', 'Awaiting pharmacy approval'], ['accepted', 'Accepted'], ['partially_accepted', 'Partially accepted'], ['partial_offer_rejected', 'Partial offer declined'], ['rejected', 'Rejected'], ['completed', 'Completed']],
    deliveries: role === 'driver' ? [['claimed', 'Claimed'], ['pickup_started', 'Pickup started'], ['in_transit', 'In transit'], ['arrived', 'Arrived'], ['delivered', 'Delivered'], ['failed', 'Failed'], ['cancelled', 'Cancelled']] : [['available', 'Available'], ['claimed', partnerDeliveryStatuses ? tr('claimedByDriver', locale) : 'Claimed'], ['pickup_started', partnerDeliveryStatuses ? tr('readyForPickup', locale) : 'Pickup started'], ['in_transit', 'In transit'], ['arrived', 'Arrived'], ['delivered', 'Delivered'], ['failed', 'Failed'], ['cancelled', 'Cancelled']],
    complaints: [['open', 'Open'], ['in_review', 'In review'], ['resolved', 'Resolved'], ['rejected', 'Rejected']],
    verification: [['pending', 'Pending'], ['correction_required', 'Correction required'], ['approved', 'Approved'], ['rejected', 'Rejected']],
    documents: [['under_review', 'Under review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['correction_required', 'Correction required']],
  }
  type OperationalColumn = { label: string; key: string; className: string; render: (row: Row) => ReactNode }
  const statusCell = (row: Row) => { const displayStatus = section === 'deliveries' ? deliveryStatusForDisplay(row.status) : row.status; const label = section === 'deliveries' && partnerDeliveryStatuses && row.status === 'claimed' ? tr('claimedByDriver', locale) : section === 'deliveries' && partnerDeliveryStatuses && row.status === 'pickup_started' ? tr('readyForPickup', locale) : displayStatus.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); return <span className={`order-status status-${displayStatus.replaceAll('_', '-')}`}><i aria-hidden="true" />{label}</span> }
  const dateCell = (row: Row) => { const [date, time] = orderDateParts(row.raw?.created_at ?? row.raw?.updated_at); return <time dateTime={String(row.raw?.created_at ?? row.raw?.updated_at ?? '')}><span>{date}</span>{time && <small>{time}</small>}</time> }
  const inventoryAction = (row: Row) => <div className="row-actions"><button className="ghost-button" type="button" aria-label={`View ${row.primary}`} title={`View ${row.primary}`} onClick={() => openMedicineDetail(Number(row.raw?.medicine_id))}><Eye size={22} strokeWidth={2.5} /></button>{role === 'warehouse' && <button className={inventoryIsActive(row) ? 'reject-button' : 'approve-button'} type="button" aria-label={`${inventoryIsActive(row) ? 'Deactivate' : 'Activate'} ${row.primary} in warehouse inventory`} title={inventoryIsActive(row) ? 'Hide from pharmacy selection' : 'Restore to pharmacy selection'} onClick={() => void updateInventoryStatus(row)}><Power size={20} strokeWidth={2.5} /></button>}</div>
  const canSendPickupPin = (row: Row) => row.status === 'claimed' && (role === 'pharmacy' ? Boolean(row.raw?.order_public_id) : role === 'warehouse' ? Boolean(row.raw?.procurement_public_id) : false)
  const deliveryAction = (row: Row) => role === 'driver'
    ? <button className="ghost-button" type="button" aria-label={`Review delivery job ${row.primary}`} title={`Review delivery job ${row.primary}`} onClick={() => void openDetail(row.id)}><Eye size={22} strokeWidth={2.5} /></button>
    : partnerDeliveryStatuses
      ? <div className="row-actions delivery-pickup-actions"><button className="ghost-button" type="button" aria-label={`View delivery ${row.primary}`} title={`View delivery ${row.primary}`} onClick={() => void openDetail(row.id)}><Eye size={22} strokeWidth={2.5} /></button>{canSendPickupPin(row) && <button className="approve-button pickup-pin-button" type="button" disabled={pickupPinSendingId !== null} aria-label={`${tr('sendPickupPin', locale)} for ${row.primary}`} title={tr('sendPickupPinHint', locale)} onClick={() => void sendPickupPin(row)}><Mail size={18} aria-hidden="true" /><span>{pickupPinSendingId === row.id ? tr('sendingPickupPin', locale) : tr('sendPickupPin', locale)}</span></button>}</div>
      : action(row)
  const defaultColumns: OperationalColumn[] = [
    { label: 'Record', key: 'record', className: 'record', render: (row) => <strong>{row.primary}</strong> },
    { label: 'Details', key: 'details', className: 'details', render: (row) => <span>{row.secondary}</span> },
    { label: 'Status', key: 'status', className: 'status', render: statusCell },
    { label: 'Created', key: 'created_at', className: 'created', render: dateCell },
    { label: 'Action', key: '', className: 'action', render: action },
  ]
  const operationalColumns: OperationalColumn[] = section === 'verification' ? [
    { label: 'Organization', key: 'business_name', className: 'record', render: (row) => <strong>{row.primary}</strong> },
    { label: 'Type', key: 'type', className: 'details', render: (row) => <span className="organization-type-badge">{String(row.raw?.type) === 'warehouse' ? 'Warehouse' : 'Pharmacy'}</span> },
    { label: 'License', key: 'license_number', className: 'details', render: (row) => <span>{String(row.raw?.license_number ?? 'Not provided')}</span> },
    { label: 'Contact', key: 'contact_email', className: 'details', render: (row) => <span>{String(row.raw?.contact_email ?? row.raw?.email ?? 'Not provided')}</span> },
    { label: 'Status', key: 'approval_status', className: 'status', render: statusCell },
    { label: 'Created', key: 'created_at', className: 'created', render: dateCell },
    { label: 'Action', key: '', className: 'action', render: action },
  ] : section === 'inventory' ? [
    { label: 'Medicine', key: 'name_en', className: 'record', render: (row) => <button type="button" className="order-id-button" onClick={() => openMedicineDetail(Number(row.raw?.medicine_id))}>{row.primary}</button> },
    { label: 'Owner', key: 'owner_name', className: 'owner', render: (row) => <span>{String(row.raw?.owner_name ?? row.raw?.owner_type ?? 'Owner not recorded')}</span> },
    { label: 'Available', key: 'available_quantity', className: 'quantity', render: (row) => <strong>{availableQuantity(row).toLocaleString()}</strong> },
    { label: 'Reserved', key: 'reserved_quantity', className: 'quantity', render: (row) => <span>{Number(row.raw?.reserved_quantity ?? 0).toLocaleString()}</span> },
    { label: 'Unit price', key: 'unit_price', className: 'total', render: (row) => <span className="orders-money">{formatMedlineMoney(row.raw?.unit_price, 'SYP', locale)}</span> },
    { label: 'Batch / expiry', key: 'expires_at', className: 'details', render: (row) => <span className="inventory-batch-cell"><strong>{String(row.raw?.batch_number ?? 'Not recorded')}</strong><small>{row.raw?.expires_at ? `Expires ${formatMedlineDate(row.raw.expires_at, locale).split(',')[0]}` : 'No expiry recorded'}</small></span> },
    { label: 'Stock health', key: 'stock_health', className: 'status', render: (row) => <span className={`stock-health ${!inventoryIsActive(row) ? 'inactive' : inventoryIsExpired(row) ? 'expired' : stockIsLow(row) ? 'low' : 'healthy'}`}>{!inventoryIsActive(row) ? 'Inactive' : inventoryIsExpired(row) ? 'Expired' : stockIsLow(row) ? 'Low stock' : 'Healthy'}</span> },
    { label: 'Action', key: '', className: 'action', render: inventoryAction },
  ] : section === 'procurement' ? [
    { label: 'Procurement', key: 'public_id', className: 'record', render: (row) => <button type="button" className="order-id-button" onClick={() => void openDetail(row.id)}>{row.primary}</button> },
    { label: 'Pharmacy', key: 'pharmacy_name', className: 'owner', render: (row) => <span>{String(row.raw?.pharmacy_name ?? 'Pharmacy not recorded')}</span> },
    { label: 'Warehouse', key: 'warehouse_name', className: 'owner', render: (row) => <span>{String(row.raw?.warehouse_name ?? 'Warehouse not recorded')}</span> },
    { label: 'Subtotal', key: 'subtotal', className: 'total', render: (row) => <span className="orders-money">{formatMedlineMoney(row.raw?.subtotal, 'SYP', locale)}</span> },
    { label: 'Delivery', key: 'delivery_fee', className: 'total', render: (row) => <span className="orders-money">{formatMedlineMoney(row.raw?.delivery_fee, 'SYP', locale)}</span> },
    { label: 'Total', key: 'total', className: 'total', render: (row) => <span className="orders-money">{formatMedlineMoney(row.raw?.total, 'SYP', locale)}</span> },
    { label: 'Status', key: 'status', className: 'status', render: statusCell },
    { label: 'Created', key: 'created_at', className: 'created', render: dateCell },
    { label: 'Action', key: '', className: 'action', render: action },
  ] : section === 'deliveries' ? [
    { label: 'Delivery', key: 'public_id', className: 'record', render: (row) => role === 'driver' ? <strong>{row.primary}</strong> : <button type="button" className="order-id-button" onClick={() => void openDetail(row.id)}>{row.primary}</button> },
    { label: 'Related order', key: 'related_order', className: 'details', render: (row) => <span>{String(row.raw?.order_public_id ?? row.raw?.procurement_public_id ?? 'Not recorded')}</span> },
    { label: 'Destination', key: 'delivery_address_snapshot', className: 'destination', render: (row) => <span>{String(row.raw?.delivery_address_snapshot ?? 'Destination not recorded')}</span> },
    { label: 'Delivery time', key: 'scheduled_for', className: 'created', render: (row) => row.raw?.scheduled_for ? <time dateTime={String(row.raw.scheduled_for)}><span>{formatMedlineDate(row.raw.scheduled_for, locale)}</span></time> : <span className="asap-badge"><Clock3 size={14} aria-hidden="true" /> ASAP</span> },
    { label: role === 'driver' ? 'Delivery fee' : 'Total', key: role === 'driver' ? 'job_price' : 'total', className: 'total', render: (row) => <span className="orders-money">{formatMedlineMoney(role === 'driver' ? row.raw?.job_price : row.raw?.total, 'SYP', locale)}</span> },
    { label: 'Status', key: 'status', className: 'status', render: statusCell },
    { label: 'Created', key: 'created_at', className: 'created', render: dateCell },
    { label: 'Action', key: '', className: 'action', render: deliveryAction },
  ] : section === 'complaints' ? [
    { label: 'Complaint', key: 'subject', className: 'record', render: (row) => <button type="button" className="order-id-button operational-record-title" onClick={() => void openDetail(row.id)}><strong>{String(row.raw?.subject ?? 'Complaint')}</strong><small>{String(row.raw?.public_id ?? row.primary)}</small></button> },
    { label: 'Category', key: 'category', className: 'details', render: (row) => <span>{String(row.raw?.category ?? 'Not categorized')}</span> },
    { label: 'Priority', key: 'priority', className: 'details', render: (row) => <span>{String(row.raw?.priority ?? 'Normal')}</span> },
    { label: 'Status', key: 'status', className: 'status', render: statusCell },
    { label: 'Created', key: 'created_at', className: 'created', render: dateCell },
    { label: 'Action', key: '', className: 'action', render: action },
  ] : section === 'audit' ? [
    { label: 'Action', key: 'action', className: 'record', render: (row) => <strong>{String(row.raw?.action ?? row.primary).replaceAll('_', ' ')}</strong> },
    { label: 'Actor', key: 'actor_name', className: 'details', render: (row) => <span>{String(row.raw?.actor_name ?? 'System')}</span> },
    { label: 'Entity', key: 'auditable_type', className: 'details', render: (row) => <span>{String(row.raw?.auditable_type ?? 'Record')} #{String(row.raw?.auditable_id ?? '')}</span> },
    { label: 'IP address', key: 'ip_address', className: 'details', render: (row) => <span>{String(row.raw?.ip_address ?? 'Not recorded')}</span> },
    { label: 'Created', key: 'created_at', className: 'created', render: dateCell },
    { label: 'Export', key: '', className: 'action', render: action },
  ] : defaultColumns
  const reportTotals = (complaintReport?.totals ?? {}) as Record<string, unknown>
  const workspaceTitle = section === 'verification' ? 'Pharmacy & warehouse verification' : section === 'deliveries' && role === 'driver' ? tr('assignedDeliveries', locale) : `${tr(section, locale) || title(section)} ${tr('overview', locale)}`
  const workspaceDescription = section === 'verification' ? 'Review each registration with its pharmacy or warehouse type clearly identified.' : section === 'deliveries' && role === 'driver' ? tr('assignedDeliveryHistoryHint', locale) : 'Search, filter, sort and open any record from one consistent workspace.'
  const recordLabel = section === 'deliveries' && role === 'driver' ? 'delivery' : section === 'verification' ? 'application' : 'record'
  const canOpenDetail = ['orders', 'deliveries', 'complaints', 'procurement'].includes(section)
  const canOpenTableRow = canOpenDetail || section === 'inventory'
  const openOperationalRow = (row: Row) => section === 'inventory' ? openMedicineDetail(Number(row.raw?.medicine_id)) : void openDetail(row.id)
  const orderColumns = [
    { label: 'Order', key: 'public_id', className: 'order' },
    { label: 'Customer', key: 'customer_name', className: 'customer' },
    { label: 'Pharmacy', key: 'pharmacy_name', className: 'pharmacy' },
    { label: 'Driver', key: 'driver_name', className: 'driver' },
    { label: 'Medicines', key: 'medicine_names', className: 'medicines' },
    { label: 'Destination', key: 'delivery_address_snapshot', className: 'destination' },
    { label: 'Total', key: 'total', className: 'total' },
    { label: 'Status', key: 'status', className: 'status' },
    { label: 'Created', key: 'created_at', className: 'created' },
    { label: 'Action', key: '', className: 'action' },
  ] as const
  const orderStatusLabel = (status: string) => status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  const orderDateParts = (value: unknown) => {
    const formatted = formatMedlineDate(value, locale)
    const separator = formatted.lastIndexOf(', ')
    return separator > -1 ? [formatted.slice(0, separator), formatted.slice(separator + 2)] : [formatted, '']
  }

  if (section === 'orders') return (
    <section className="content orders-content">
      <section className="panel table-panel rich-operations-panel orders-table-panel">
        <div className="panel-heading orders-panel-heading">
          <div>
            <div className="orders-heading-row">
              <h1>{tr('orders', locale)} {tr('overview', locale)}</h1>
              <span className="orders-result-count" aria-live="polite">{loading ? 'Updating' : `${totalRecords} ${totalRecords === 1 ? 'order' : 'orders'}`}</span>
            </div>
            <p className="muted">Search, review and manage every order from one place.</p>
          </div>
          {role === 'patient' && <button type="button" className="primary-button create-order-button" onClick={() => { window.history.pushState({}, '', '/orders/new'); window.dispatchEvent(new PopStateEvent('popstate')) }}><Plus size={17} aria-hidden="true" /> Create new order</button>}
        </div>

        {createdOrderNotice && <div className="form-success orders-created-notice" role="status"><FileCheck2 size={20} aria-hidden="true" /><span><strong>{createdOrderNotice.publicId} was created successfully.</strong><small>The newest order is shown first below.</small></span></div>}

        <div className="table-controls orders-toolbar" role="search" aria-label="Order filters">
          <label className="orders-search-control">
            <span>Search orders</span>
            <span className="search-box">
              <Search size={19} aria-hidden="true" />
              <input aria-label={`${tr('search', locale)} ${tr('orders', locale)}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, customer, medicine or destination" />
            </span>
          </label>
          <label className="orders-status-filter">
            <span>Status</span>
            <select aria-label="Filter orders by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}>
              <option value="">All statuses</option>
              <option value="pending_pharmacy_review">Pending pharmacy review</option>
              <option value="prescription_review">Prescription review</option>
              <option value="partial_approval_required">Awaiting patient approval</option>
              <option value="partially_accepted">Partial order approved</option>
              <option value="partial_offer_rejected">Partial offer declined</option>
              <option value="accepted">Accepted</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>

        <div className="orders-table-region" role="region" aria-label="Scrollable orders table" aria-busy={loading} tabIndex={0}>
          <table className="orders-data-table">
            <caption className="sr-only">{tr('orders', locale)} {tr('overview', locale)}</caption>
            <colgroup>{orderColumns.map((column) => <col className={`col-${column.className}`} key={column.label} />)}</colgroup>
            <thead>
              <tr>
                {orderColumns.map((column) => (
                  <th className={`col-${column.className}`} scope="col" key={column.label} aria-sort={column.key ? (sortBy === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}>
                    {column.key ? <button type="button" className={`orders-sort-button ${sortBy === column.key ? 'active' : ''}`} onClick={() => toggleSort(column.key)} title={`Sort by ${column.label}`}><span>{column.label}</span>{sortBy === column.key ? (sortDirection === 'asc' ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />) : <ArrowUpDown aria-hidden="true" />}</button> : column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr className="orders-state-row"><td colSpan={orderColumns.length}><span className="state" role="status" aria-live="polite">{tr('loadingRecords', locale)}</span></td></tr> : displayedRows.length === 0 ? <tr className="orders-state-row"><td colSpan={orderColumns.length}><span className="state" role="status">{tr('noRecordsYet', locale)}</span></td></tr> : displayedRows.map((row) => {
                const [createdDate, createdTime] = orderDateParts(row.raw?.created_at)
                const statusLabel = orderStatusLabel(row.status)
                return <tr className={`orders-data-row ${createdOrderNotice && (createdOrderNotice.id === row.id || createdOrderNotice.publicId === row.primary) ? 'newly-created-order' : ''}`} key={row.id} tabIndex={0} aria-label={`Open order ${row.primary}`} onClick={(event) => { if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return; void openDetail(row.id) }} onKeyDown={(event) => { if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); void openDetail(row.id) }}>
                  <th className="col-order" scope="row" data-label="Order"><button className="order-id-button" type="button" onClick={() => void openDetail(row.id)} title={`Open order ${row.primary}`}>{row.primary}</button></th>
                  <td className="col-customer" data-label="Customer"><span className="orders-cell-primary">{String(row.raw?.customer_name ?? 'Customer not recorded')}</span></td>
                  <td className="col-pharmacy" data-label="Pharmacy">{String(row.raw?.pharmacy_name ?? 'Pharmacy not recorded')}</td>
                  <td className="col-driver" data-label="Driver">{String(row.raw?.driver_name ?? 'Unassigned')}</td>
                  <td className="col-medicines" data-label="Medicines">{String(row.raw?.medicine_names ?? 'No medicines listed')}</td>
                  <td className="col-destination" data-label="Destination">{String(row.raw?.delivery_address_snapshot ?? 'Destination not recorded')}</td>
                  <td className="col-total" data-label="Total"><span className="orders-money"><small>SYP</small> {Number(row.raw?.total ?? 0).toLocaleString(locale === 'ar' ? 'ar' : 'en-GB')}</span></td>
                  <td className="col-status" data-label="Status"><span className={`order-status status-${row.status.replaceAll('_', '-')}`}><i aria-hidden="true" />{statusLabel}</span></td>
                  <td className="col-created" data-label="Created"><time dateTime={String(row.raw?.created_at ?? '')}><span>{createdDate}</span>{createdTime && <small>{createdTime}</small>}</time></td>
                  <td className="col-action" data-label="Action"><div className="orders-action-cell">{orderListAction(row)}</div></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
        <div className="orders-table-footer">
          <label className="orders-page-size">
            <span>Rows per page</span>
            <select aria-label="Rows per page" value={perPage} onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1) }}>
              {[5, 10, 25, 50].map((size) => <option value={size} key={size}>{size}</option>)}
            </select>
          </label>
          <TablePagination page={page} lastPage={lastPage} onPageChange={setPage} />
        </div>
      </section>
    </section>
  )
  return <section className="content orders-content operations-list-content">
    <section className="panel table-panel orders-table-panel operations-table-panel">
      <div className="panel-heading orders-panel-heading"><div><div className="orders-heading-row"><h1>{workspaceTitle}</h1><span className="orders-result-count" aria-live="polite">{loading ? 'Updating' : `${totalRecords} ${totalRecords === 1 ? recordLabel : `${recordLabel}s`}`}</span></div><p className="muted">{workspaceDescription}</p></div>{role === 'pharmacy' && section === 'procurement' && <button type="button" className="primary-button create-order-button" onClick={() => { window.history.pushState({}, '', '/procurement/new'); window.dispatchEvent(new PopStateEvent('popstate')) }}><Plus size={17} aria-hidden="true" /> Replenish inventory</button>}</div>
      {createdProcurementNotice && section === 'procurement' && <div className="form-success orders-created-notice" role="status"><FileCheck2 size={20} aria-hidden="true" /><span><strong>{createdProcurementNotice.publicId} was created successfully.</strong><small>The newest replenishment order is shown first below.</small></span></div>}
      {deliveryMessage && section === 'deliveries' && <div className="form-success orders-created-notice pickup-pin-confirmation" role="status"><Mail size={20} aria-hidden="true" /><span><strong>{deliveryMessage}</strong><small>{tr('pickupPinSentHint', locale)}</small></span></div>}
      {section === 'inventory' && role === 'warehouse' && <div className="warehouse-stock-entry">
        <form className="warehouse-stock-update" onSubmit={updateInventory}>
          <div className="warehouse-stock-intro"><strong>Add warehouse batch</strong><small>Each submission creates a separate batch record with its own quantity, price, expiry, and storage details. New batches are published immediately and every change is audited.</small></div>
          <div className="warehouse-stock-primary-grid">
            <div className="warehouse-catalog-picker warehouse-stock-field" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInventorySuggestionsOpen(false) }}>
              <label htmlFor="warehouse-medicine-search">Medicine catalog</label>
              <span className="search-box"><Search size={18} aria-hidden="true" /><input id="warehouse-medicine-search" role="combobox" aria-label="Search medicine catalog" aria-autocomplete="list" aria-controls="warehouse-inventory-medicine-suggestions" aria-expanded={inventorySuggestionsOpen} autoComplete="off" value={inventoryMedicineSearch} onFocus={() => setInventorySuggestionsOpen(true)} onChange={(event) => { const value = event.target.value; setInventoryMedicineSearch(value); if (!selectedInventoryMedicine || value !== inventoryMedicineLabel(selectedInventoryMedicine)) setSelectedInventoryMedicine(null); setInventorySuggestionsOpen(true); setInventoryMessage('') }} placeholder="Search name, Arabic name, manufacturer, or code" /></span>
              {inventorySuggestionsOpen && <div id="warehouse-inventory-medicine-suggestions" className="warehouse-catalog-suggestions" role="listbox" aria-label="Existing medicine suggestions">{inventoryCatalogLoading ? <div className="warehouse-catalog-state" role="status">Searching catalog...</div> : inventoryCatalog.length === 0 ? <div className="warehouse-catalog-state">No active medicines match this search.</div> : inventoryCatalog.map((medicine) => <button type="button" role="option" aria-selected={Number(selectedInventoryMedicine?.id) === Number(medicine.id)} key={String(medicine.id)} onPointerDown={(event) => event.preventDefault()} onClick={() => selectInventoryMedicine(medicine)}><Package size={18} aria-hidden="true" /><span><strong>{String(medicine.name_en ?? 'Medicine')}</strong><small>{[medicine.name_ar, medicine.dosage, medicine.manufacturer].filter(Boolean).map(String).join(' · ') || 'Catalog medicine'}</small></span></button>)}</div>}
              {selectedInventoryMedicine ? <span className="warehouse-selected-medicine"><FileCheck2 size={15} aria-hidden="true" /><span><strong>{String(selectedInventoryMedicine.name_en)}</strong><small>Existing catalog medicine selected</small></span></span> : <small className="warehouse-field-help">Choose a result from the catalog.</small>}
            </div>
            <label className="warehouse-stock-field"><span>Batch quantity</span><input aria-label="Batch quantity" type="number" min="1" required value={inventoryQuantity} onChange={(event) => setInventoryQuantity(event.target.value)} /><small>Units received in this specific batch.</small></label>
            <label className="warehouse-stock-field"><span>Unit price (SYP)</span><input aria-label="Warehouse unit price" type="number" min="0" step="0.01" required value={inventoryUnitPrice} onChange={(event) => setInventoryUnitPrice(event.target.value)} /><small>Current pharmacy purchase price.</small></label>
            <label className="warehouse-stock-field"><span>Low-stock level</span><input aria-label="Low-stock level" type="number" min="0" value={inventoryLowStock} onChange={(event) => setInventoryLowStock(event.target.value)} /><small>Triggers the low-stock indicator.</small></label>
          </div>
          <div className="warehouse-batch-section">
            <div className="warehouse-batch-heading"><div><strong>Batch traceability</strong><small>Recommended for recalls, FEFO stock rotation, and expiry monitoring.</small></div><span>Optional</span></div>
            <div className="warehouse-batch-grid">
              <label className="warehouse-stock-field"><span>Batch / lot number</span><input aria-label="Batch or lot number" value={inventoryBatchNumber} onChange={(event) => setInventoryBatchNumber(event.target.value)} maxLength={100} /><small>Manufacturer lot identifier.</small></label>
              <label className="warehouse-stock-field"><span>Manufactured date</span><input aria-label="Manufactured date" type="date" max={new Date().toISOString().slice(0, 10)} value={inventoryManufacturedAt} onChange={(event) => setInventoryManufacturedAt(event.target.value)} /><small>Production date on the pack.</small></label>
              <label className="warehouse-stock-field"><span>Expiry date</span><input aria-label="Expiry date" type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={inventoryExpiresAt} onChange={(event) => setInventoryExpiresAt(event.target.value)} /><small>Expired batches are hidden automatically.</small></label>
              <label className="warehouse-stock-field"><span>Date received</span><input aria-label="Date received" type="date" max={new Date().toISOString().slice(0, 10)} value={inventoryReceivedAt} onChange={(event) => setInventoryReceivedAt(event.target.value)} /><small>Warehouse receiving date.</small></label>
              <label className="warehouse-stock-field"><span>Storage location</span><input aria-label="Storage location" value={inventoryStorageLocation} onChange={(event) => setInventoryStorageLocation(event.target.value)} maxLength={150} placeholder="Aisle, shelf, or cold room" /><small>Helps staff locate and rotate stock.</small></label>
            </div>
          </div>
          <div className="warehouse-stock-actions"><button className="primary-button" type="submit" disabled={inventorySaving || !selectedInventoryMedicine}><Package size={17} aria-hidden="true" /> {inventorySaving ? 'Saving stock...' : 'Save stock'}</button></div>
        </form>
        {inventoryMessage && <div className={inventoryMessage.startsWith('Choose') ? 'form-error' : 'form-success'} role="status">{inventoryMessage}</div>}
      </div>}
      {section === 'complaints' && role === 'admin' && complaintReport && <section className="metric-grid"><Metric label="Open complaints" value={String(reportTotals.open ?? 0)} change="Live" icon={<MessageSquare />} tone="orange" /><Metric label="In review" value={String(reportTotals.in_review ?? 0)} change="Live" icon={<History />} tone="violet" /><Metric label="Resolved complaints" value={String(reportTotals.resolved ?? 0)} change="Live" icon={<ShieldCheck />} tone="green" /></section>}
      <div className="table-controls orders-toolbar" role="search" aria-label={`${title(section)} filters`}><label className="orders-search-control"><span>Search {tr(section, locale) || title(section)}</span><span className="search-box"><Search size={19} aria-hidden="true" /><input aria-label={`Search ${tr(section, locale) || title(section)}`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search across all visible fields" /></span></label><label className="orders-status-filter"><span>Status</span><select aria-label={`Filter ${tr(section, locale) || title(section)} by status`} value={statusFilter} onChange={(event) => changeStatusFilter(event.target.value)}><option value="">All statuses</option>{(statusOptions[section] ?? Array.from(new Set(rows.map((row) => row.status))).map((status) => [status, status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())] as [string, string])).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
      <div className="orders-table-region operations-table-region" role="region" aria-label={`Scrollable ${title(section)} table`} aria-busy={loading} tabIndex={0}><table className="orders-data-table operations-data-table"><caption className="sr-only">{tr(section, locale) || title(section)} {tr('overview', locale)}</caption><colgroup>{operationalColumns.map((column) => <col className={`col-${column.className}`} key={column.label} />)}</colgroup><thead><tr>{operationalColumns.map((column) => <th className={`col-${column.className}`} scope="col" key={column.label} aria-sort={column.key ? (sortBy === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}>{column.key ? <button type="button" className={`orders-sort-button ${sortBy === column.key ? 'active' : ''}`} onClick={() => toggleSort(column.key)} title={`Sort by ${column.label}`}><span>{column.label}</span>{sortBy === column.key ? (sortDirection === 'asc' ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />) : <ArrowUpDown aria-hidden="true" />}</button> : column.label}</th>)}</tr></thead><tbody>{loading ? <tr className="orders-state-row"><td colSpan={operationalColumns.length}><span className="state" role="status" aria-live="polite">{tr('loadingRecords', locale)}</span></td></tr> : displayedRows.length === 0 ? <tr className="orders-state-row"><td colSpan={operationalColumns.length}><span className="state" role="status">{tr('noRecordsYet', locale)}</span></td></tr> : displayedRows.map((row) => <tr className={`orders-data-row ${createdProcurementNotice && section === 'procurement' && (createdProcurementNotice.id === row.id || createdProcurementNotice.publicId === row.primary) ? 'newly-created-order' : ''}`} key={row.id} tabIndex={canOpenTableRow ? 0 : undefined} aria-label={canOpenTableRow ? `Open ${section} ${row.primary}` : undefined} onClick={(event) => { if (!canOpenTableRow || (event.target as HTMLElement).closest('button, a, input, select, textarea')) return; openOperationalRow(row) }} onKeyDown={(event) => { if (!canOpenTableRow || event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); openOperationalRow(row) }}>{operationalColumns.map((column, index) => index === 0 ? <th className={`col-${column.className}`} scope="row" data-label={column.label} key={column.label}>{column.render(row)}</th> : <td className={`col-${column.className}`} data-label={column.label} key={column.label}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>
      <div className="orders-table-footer"><label className="orders-page-size"><span>Rows per page</span><select aria-label={`Rows per page for ${title(section)}`} value={perPage} onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1) }}>{[5, 10, 25, 50].map((size) => <option value={size} key={size}>{size}</option>)}</select></label><TablePagination page={page} lastPage={lastPage} onPageChange={setPage} /></div>
    </section>
  </section>
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

void NotificationsPageLegacy
void MedicineAdminPageLegacy
void MedicineEditAdminPage

function RootApp() { return <AppErrorBoundary><App /></AppErrorBoundary> }

export default RootApp
