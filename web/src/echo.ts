import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

declare global {
  interface Window { Pusher: typeof Pusher }
}

window.Pusher = Pusher

export function createMedlineEcho(token: string) {
  const apiUrl = String(import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api/v1')
  const apiOrigin = apiUrl.replace(/\/api\/v1\/?$/, '')
  return new Echo({
    broadcaster: 'reverb',
    key: String(import.meta.env.VITE_REVERB_APP_KEY ?? 'medline-local-key'),
    wsHost: String(import.meta.env.VITE_REVERB_HOST ?? window.location.hostname),
    wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
    forceTLS: String(import.meta.env.VITE_REVERB_SCHEME ?? 'http') === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: `${apiOrigin}/broadcasting/auth`,
    auth: { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  })
}
