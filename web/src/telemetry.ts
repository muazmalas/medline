const endpoint = import.meta.env.VITE_TELEMETRY_URL ?? ''

function redact(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]')
    .replace(/\b(pin|token|password|prescription|document|phone)\s*[:=]?\s*[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, 500)
}

export function captureWebError(error: unknown, context: string, requestId?: string): void {
  if (!endpoint) return
  const message = error instanceof Error ? error.message : String(error)
  const payload = {
    event: 'web_error',
    error_type: error instanceof Error ? error.name : typeof error,
    message: redact(message),
    context,
    ...(requestId ? { request_id: requestId } : {}),
    app: 'medline_web',
  }
  void fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined)
}
