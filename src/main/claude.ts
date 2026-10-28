// Anbindung an die Claude API (Anthropic Messages API).
// Läuft ausschließlich im Hauptprozess; der Schlüssel bleibt hier.

import { app, net } from 'electron'
import type { ClaudeRequest, ClaudeResult } from '@shared/types'
import { secrets } from './secrets'
import { log } from './log'

// Nur in Entwicklungs-Builds über eine Umgebungsvariable umlenkbar (für Tests mit einem lokalen Mock).
const ENDPOINT =
  !app.isPackaged && process.env.TAGWERK_API_BASE ? `${process.env.TAGWERK_API_BASE}/v1/messages` : 'https://api.anthropic.com/v1/messages'

export async function sendToClaude(req: ClaudeRequest): Promise<ClaudeResult> {
  const key = secrets.getKey()
  if (!key) return { ok: false, code: 'no-key', error: 'Claude ist nicht verbunden. Hinterlege einen API-Schlüssel in den Einstellungen.' }
  if (typeof req?.model !== 'string' || !req.model.startsWith('claude-') || !Array.isArray(req.messages)) {
    return { ok: false, code: 'bad-request', error: 'Ungültige Anfrage.' }
  }
  if (!net.isOnline() && !ENDPOINT.startsWith('http://127.0.0.1')) return { ok: false, code: 'offline', error: 'Keine Internetverbindung. Claude ist offline nicht verfügbar.' }

  const body = {
    model: req.model,
    max_tokens: Math.min(req.max_tokens ?? 1500, 4000),
    system: String(req.system ?? ''),
    messages: req.messages,
    ...(Array.isArray(req.tools) && req.tools.length ? { tools: req.tools } : {})
  }

  const started = Date.now()
  try {
    const res = await net.fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    })
    const json = (await res.json().catch(() => ({}))) as {
      content?: unknown[]
      stop_reason?: string
      error?: { type?: string; message?: string }
    }
    log.info('claude request', { status: res.status, ms: Date.now() - started, model: req.model })
    if (res.ok) return { ok: true, content: json.content ?? [], stop_reason: json.stop_reason ?? 'end_turn' }
    const type = json.error?.type ?? ''
    if (res.status === 401 || res.status === 403)
      return { ok: false, code: 'auth', error: 'Der API-Schlüssel wurde abgelehnt. Prüfe ihn in den Einstellungen.' }
    if (res.status === 429) return { ok: false, code: 'rate', error: 'Zu viele Anfragen. Versuche es in einer Minute erneut.' }
    if (res.status >= 500 || type === 'overloaded_error')
      return { ok: false, code: 'server', error: 'Claude ist gerade nicht erreichbar. Versuche es gleich noch einmal.' }
    if (res.status === 404 || type === 'not_found_error')
      return { ok: false, code: 'bad-request', error: `Das Modell „${req.model}“ ist für deinen Schlüssel nicht verfügbar. Wähle in den Einstellungen ein anderes.` }
    // Fehlermeldung der API enthält keine Nutzerinhalte; sie wird gekürzt weitergegeben.
    return { ok: false, code: 'bad-request', error: `Anfrage abgelehnt: ${(json.error?.message ?? res.statusText).slice(0, 200)}` }
  } catch (err) {
    log.warn('claude request failed', { name: (err as Error).name })
    return { ok: false, code: net.isOnline() ? 'unknown' : 'offline', error: 'Claude konnte nicht erreicht werden. Prüfe deine Internetverbindung.' }
  }
}

/** Prüft einen Schlüssel mit einer minimalen Anfrage, bevor er gespeichert wird. */
export async function verifyKey(key: string, model: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim())) return { ok: false, error: 'Das sieht nicht wie ein Anthropic-API-Schlüssel aus (beginnt mit „sk-ant-“).' }
  try {
    const res = await net.fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key.trim(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
    })
    if (res.ok) return { ok: true }
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'Der Schlüssel wurde abgelehnt.' }
    if (res.status === 404) return { ok: false, error: `Schlüssel gültig, aber Modell „${model}“ nicht verfügbar. Wähle ein anderes Modell.` }
    if (res.status === 429 || res.status >= 500) return { ok: true } // Schlüssel gültig, Dienst kurz ausgelastet
    return { ok: false, error: `Prüfung fehlgeschlagen (Status ${res.status}).` }
  } catch {
    return { ok: false, error: 'Keine Verbindung zu Anthropic. Prüfe deine Internetverbindung.' }
  }
}
