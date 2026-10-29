// Google-Anbindung: OAuth 2.0 für Desktop-Apps (Loopback-Redirect + PKCE),
// verschlüsselte Token-Ablage, Kalender- und Gmail-Zugriffe.
// Läuft ausschließlich im Hauptprozess; Tokens erreichen die Oberfläche nie.

import { app, dialog, BrowserWindow, net, shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type {
  CalEvent,
  Email,
  GoogleCapabilities,
  GoogleConnectOptions,
  GoogleErrorCode,
  GoogleSendParams,
  GoogleStatus,
  GoogleSyncResult,
  GResult
} from '@shared/types'
import { secrets } from './secrets'
import { log } from './log'
import { store } from './store'
import { buildReplyMime, encodeB64Url, mapGoogleEvent, mapGoogleThread, toGoogleEvent, type GEvent, type GThread } from './google-map'

// Nur in Entwicklungs-Builds auf einen lokalen Test-Server umlenkbar.
const MOCK = !app.isPackaged ? process.env.TAGWERK_GOOGLE_BASE : undefined
const URLS = MOCK
  ? { auth: `${MOCK}/o/oauth2/v2/auth`, token: `${MOCK}/token`, revoke: `${MOCK}/revoke`, calendar: `${MOCK}/calendar/v3`, gmail: `${MOCK}/gmail/v1` }
  : {
      auth: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      revoke: 'https://oauth2.googleapis.com/revoke',
      calendar: 'https://www.googleapis.com/calendar/v3',
      gmail: 'https://gmail.googleapis.com/gmail/v1'
    }

// Möglichst enge Berechtigungen: nur Termine in eigenen Kalendern, Gmail ohne endgültiges Löschen.
const SCOPE = {
  calRead: 'https://www.googleapis.com/auth/calendar.events.owned.readonly',
  calWrite: 'https://www.googleapis.com/auth/calendar.events.owned',
  mailRead: 'https://www.googleapis.com/auth/gmail.readonly',
  mailWrite: 'https://www.googleapis.com/auth/gmail.modify'
}

interface ClientCreds {
  clientId: string
  clientSecret: string
}

interface Account {
  refreshToken: string
  scopes: string[]
  email: string
  expired?: boolean
  connectedAt?: number
  /** Ablauf der Anmeldung (Apps im Testmodus: 7 Tage). null = läuft nicht ab */
  refreshExpiresAt?: number | null
}

const TESTING_LIFETIME = 7 * 86400_000

/** Ablaufzeitpunkt der Anmeldung; ältere Verbindungen ohne Angabe werden wie Testmodus behandelt. */
function expiresAt(a: Account | null): number | undefined {
  if (!a || a.expired) return undefined
  if (a.refreshExpiresAt === null) return undefined
  if (typeof a.refreshExpiresAt === 'number') return a.refreshExpiresAt
  return a.connectedAt ? a.connectedAt + TESTING_LIFETIME : undefined
}

/** Für den Planer: Ablaufzeitpunkt der aktuellen Google-Anmeldung. */
export function googleExpiry(): { expiresAt?: number; email?: string } {
  const a = account()
  return { expiresAt: expiresAt(a), email: a?.email }
}

const VAULT_CLIENT = 'google-client'
const VAULT_ACCOUNT = 'google-account'

let accessToken: { token: string; exp: number } | null = null
let pendingAuth: { server: Server; cancel: () => void } | null = null
const threadCache = new Map<string, { historyId?: string; emails: Email[] }>()

class GError extends Error {
  constructor(
    public code: GoogleErrorCode,
    message: string
  ) {
    super(message)
  }
}

const client = () => secrets.getJson<ClientCreds>(VAULT_CLIENT)
const account = () => secrets.getJson<Account>(VAULT_ACCOUNT)

function caps(a: Account | null): GoogleCapabilities {
  const s = new Set(a && !a.expired ? a.scopes : [])
  return {
    calendarRead: s.has(SCOPE.calRead) || s.has(SCOPE.calWrite),
    calendarWrite: s.has(SCOPE.calWrite),
    gmailRead: s.has(SCOPE.mailRead) || s.has(SCOPE.mailWrite),
    gmailWrite: s.has(SCOPE.mailWrite)
  }
}

export async function googleStatus(): Promise<GoogleStatus> {
  const c = client()
  let a = account()
  // Verbindungen aus älteren Versionen kennen ihren Startzeitpunkt nicht: einmalig nachtragen.
  if (a && !a.expired && a.connectedAt === undefined && a.refreshExpiresAt === undefined) {
    a = { ...a, connectedAt: Date.now() }
    await secrets.setJson(VAULT_ACCOUNT, a).catch(() => {})
  }
  return {
    clientConfigured: !!c,
    clientIdHint: c ? `${c.clientId.slice(0, 12)}…` : undefined,
    connected: !!a && !a.expired,
    email: a?.email,
    caps: caps(a),
    expired: !!a?.expired,
    expiresAt: expiresAt(a),
    encrypted: await secrets.encryptionAvailable()
  }
}

// ---------- OAuth-Client ----------

function validClient(c: Partial<ClientCreds>): string | null {
  if (!c.clientId || !/\.apps\.googleusercontent\.com$/.test(c.clientId.trim())) return 'Die Client-ID endet normalerweise auf „.apps.googleusercontent.com“.'
  if (!c.clientSecret || c.clientSecret.trim().length < 10) return 'Der Clientschlüssel fehlt oder ist zu kurz.'
  return null
}

export async function setClient(c: ClientCreds): Promise<{ ok: boolean; error?: string }> {
  const err = validClient(c)
  if (err && !MOCK) return { ok: false, error: err }
  try {
    await secrets.setJson(VAULT_CLIENT, { clientId: c.clientId.trim(), clientSecret: c.clientSecret.trim() })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Liest die in der Google Cloud Console heruntergeladene client_secret_….json */
export async function importClientFile(): Promise<{ ok: boolean; canceled?: boolean; error?: string }> {
  const win = BrowserWindow.getFocusedWindow() ?? undefined
  const res = await dialog.showOpenDialog(win!, {
    title: 'OAuth-Client-Datei von Google auswählen',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
  try {
    const j = JSON.parse(readFileSync(res.filePaths[0], 'utf8')) as { installed?: { client_id?: string; client_secret?: string }; web?: unknown }
    if (!j.installed) {
      return { ok: false, error: j.web ? 'Das ist ein Client vom Typ „Webanwendung“. Lege einen OAuth-Client vom Typ „Desktop-App“ an.' : 'Die Datei enthält keinen OAuth-Client für eine Desktop-App.' }
    }
    return setClient({ clientId: j.installed.client_id ?? '', clientSecret: j.installed.client_secret ?? '' })
  } catch {
    return { ok: false, error: 'Die Datei konnte nicht gelesen werden.' }
  }
}

export function clearClient() {
  secrets.remove(VAULT_CLIENT)
}

// ---------- Anmeldung ----------

export async function connect(opts: GoogleConnectOptions): Promise<{ ok: boolean; error?: string; status: GoogleStatus }> {
  const c = client()
  if (!c) return { ok: false, error: 'Zuerst den OAuth-Client hinterlegen.', status: await googleStatus() }
  if (!opts.calendar && !opts.gmail) return { ok: false, error: 'Wähle mindestens Kalender oder Gmail.', status: await googleStatus() }
  if (!net.isOnline() && !MOCK) return { ok: false, error: 'Keine Internetverbindung.', status: await googleStatus() }
  cancelConnect()

  const scopes = ['openid', 'email']
  if (opts.calendar) scopes.push(opts.write ? SCOPE.calWrite : SCOPE.calRead)
  if (opts.gmail) scopes.push(opts.write ? SCOPE.mailWrite : SCOPE.mailRead)

  const verifier = encodeB64Url(randomBytes(48))
  const challenge = encodeB64Url(createHash('sha256').update(verifier).digest())
  const state = encodeB64Url(randomBytes(16))

  try {
    const { code, redirectUri } = await waitForCode(c.clientId, scopes, challenge, state)
    const tok = await tokenRequest({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
    if (!tok.refresh_token) throw new GError('unknown', 'Google hat kein Langzeit-Token geliefert. Entferne Tagwerk unter myaccount.google.com → Sicherheit → Drittanbieter-Apps und verbinde neu.')
    const granted = String(tok.scope ?? '').split(/\s+/).filter(Boolean)
    const email = emailFromIdToken(tok.id_token) ?? ''
    const now = Date.now()
    await secrets.setJson(VAULT_ACCOUNT, {
      refreshToken: tok.refresh_token,
      scopes: granted,
      email,
      connectedAt: now,
      refreshExpiresAt: tok.refresh_token_expires_in ? now + Number(tok.refresh_token_expires_in) * 1000 : null
    } satisfies Account)
    accessToken = { token: tok.access_token, exp: Date.now() + (Number(tok.expires_in) || 3600) * 1000 }
    threadCache.clear()
    const status = await googleStatus()
    const missing = (opts.calendar && !status.caps.calendarRead) || (opts.gmail && !status.caps.gmailRead)
    log.info('google connected', { scopes: granted.length })
    return { ok: true, status, error: missing ? 'Nicht alle Berechtigungen wurden erteilt. Fehlende Bereiche bleiben getrennt.' : undefined }
  } catch (e) {
    const msg = e instanceof GError ? e.message : 'Die Anmeldung ist fehlgeschlagen.'
    log.warn('google connect failed', { code: e instanceof GError ? e.code : 'unknown' })
    return { ok: false, error: msg, status: await googleStatus() }
  } finally {
    pendingAuth = null
  }
}

function waitForCode(clientId: string, scopes: string[], challenge: string, state: string): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let redirectUri = ''
    const timer = setTimeout(() => finish(new GError('unknown', 'Zeitüberschreitung – die Anmeldung wurde nicht abgeschlossen.')), 5 * 60_000)
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/') {
        res.writeHead(404).end()
        return
      }
      const page = (title: string, text: string) =>
        `<!doctype html><meta charset="utf-8"><title>Tagwerk</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:90vh;color:#1d2523;background:#eef1ef"><div style="text-align:center;max-width:420px"><h1 style="font-weight:500">${title}</h1><p>${text}</p></div>`
      const err = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(page('Ungültige Anfrage', 'Bitte starte die Verbindung in Tagwerk erneut.'))
        return
      }
      if (err || !code) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page('Nicht verbunden', 'Der Zugriff wurde nicht erteilt. Du kannst dieses Fenster schließen.'))
        finish(new GError('unknown', err === 'access_denied' ? 'Du hast den Zugriff abgelehnt.' : 'Google hat die Anmeldung abgebrochen.'))
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page('Verbunden', 'Tagwerk ist jetzt mit deinem Google-Konto verbunden. Du kannst dieses Fenster schließen.'))
      finish(null, code)
    })
    const finish = (e: Error | null, code?: string) => {
      clearTimeout(timer)
      server.close()
      if (e) reject(e)
      else resolve({ code: code!, redirectUri })
    }
    pendingAuth = { server, cancel: () => finish(new GError('unknown', 'Anmeldung abgebrochen.')) }
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const authUrl =
        `${URLS.auth}?` +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: scopes.join(' '),
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: 'false'
        }).toString()
      // Im Testmodus „besucht“ Tagwerk die Mock-Anmeldeseite selbst; sonst öffnet sich der Standardbrowser.
      if (MOCK) net.fetch(authUrl).catch(() => finish(new GError('unknown', 'Mock nicht erreichbar')))
      else shell.openExternal(authUrl)
    })
    server.on('error', () => finish(new GError('unknown', 'Lokaler Anmelde-Port konnte nicht geöffnet werden.')))
  })
}

export function cancelConnect() {
  pendingAuth?.cancel()
  pendingAuth = null
}

function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return typeof payload.email === 'string' ? payload.email : undefined
  } catch {
    return
  }
}

interface TokenResponse {
  access_token: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  id_token?: string
  /** Nur bei zeitlich begrenzten Tokens (z. B. App im Testmodus) */
  refresh_token_expires_in?: number
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  let res: Response
  try {
    res = await net.fetch(URLS.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString()
    })
  } catch {
    throw new GError('offline', 'Google ist nicht erreichbar. Prüfe deine Internetverbindung.')
  }
  const j = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string }
  if (res.ok && j.access_token) return j
  if (j.error === 'invalid_grant') throw new GError('expired', 'Die Google-Anmeldung ist abgelaufen oder wurde widerrufen. Bitte neu verbinden.')
  if (j.error === 'invalid_client' || j.error === 'unauthorized_client') throw new GError('unknown', 'Google lehnt den OAuth-Client ab. Prüfe Client-ID und Clientschlüssel.')
  throw new GError('unknown', `Google-Anmeldung fehlgeschlagen (${j.error ?? res.status}).`)
}

async function getAccessToken(force = false): Promise<string> {
  if (!force && accessToken && accessToken.exp - 60_000 > Date.now()) return accessToken.token
  const c = client()
  const a = account()
  if (!c || !a) throw new GError('not-connected', 'Google ist nicht verbunden.')
  if (a.expired) throw new GError('expired', 'Die Google-Anmeldung ist abgelaufen. Bitte neu verbinden.')
  try {
    const tok = await tokenRequest({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: a.refreshToken, grant_type: 'refresh_token' })
    accessToken = { token: tok.access_token, exp: Date.now() + (Number(tok.expires_in) || 3600) * 1000 }
    return tok.access_token
  } catch (e) {
    if (e instanceof GError && e.code === 'expired') {
      await secrets.setJson(VAULT_ACCOUNT, { ...a, expired: true })
      accessToken = null
    }
    throw e
  }
}

export async function disconnect(): Promise<GoogleStatus> {
  const a = account()
  cancelConnect()
  if (a?.refreshToken) {
    // Zugriff bei Google widerrufen; Fehler hier verhindern das lokale Trennen nicht.
    net.fetch(`${URLS.revoke}?token=${encodeURIComponent(a.refreshToken)}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } }).catch(() => {})
  }
  secrets.remove(VAULT_ACCOUNT)
  accessToken = null
  threadCache.clear()
  return googleStatus()
}

// ---------- API-Aufrufe ----------

async function api<T>(url: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await getAccessToken()
  let res: Response
  try {
    res = await net.fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } })
  } catch {
    throw new GError('offline', 'Google ist nicht erreichbar. Prüfe deine Internetverbindung.')
  }
  if (res.status === 401 && !retried) {
    await getAccessToken(true)
    return api<T>(url, init, true)
  }
  if (res.status === 204) return null as T
  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string; errors?: { reason?: string }[] } }
  if (res.ok) return j as T
  const reason = j.error?.errors?.[0]?.reason ?? j.error?.status ?? ''
  log.warn('google api error', { status: res.status, reason: String(reason).slice(0, 40) })
  if (res.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(`${reason} ${j.error?.message}`)) {
    const which = url.includes('/gmail/') ? 'Gmail API' : 'Google Calendar API'
    throw new GError('api-disabled', `Die ${which} ist in deinem Google-Cloud-Projekt nicht aktiviert.`)
  }
  if (res.status === 403 && /insufficient|PERMISSION_DENIED|forbidden/i.test(String(reason))) throw new GError('scope', 'Für diese Aktion fehlt die Berechtigung. Verbinde Google mit Schreibzugriff neu.')
  if (res.status === 404 || res.status === 410) throw new GError('not-found', 'Der Eintrag existiert bei Google nicht mehr.')
  if (res.status === 409 || res.status === 412) throw new GError('conflict', 'Der Eintrag wurde inzwischen bei Google geändert. Synchronisiere und versuche es erneut.')
  if (res.status === 429 || (res.status === 403 && /rateLimit|userRateLimit/i.test(String(reason)))) throw new GError('rate', 'Google drosselt gerade die Anfragen. Versuche es gleich noch einmal.')
  throw new GError('unknown', `Google-Fehler (${res.status}).`)
}

async function wrap<T>(fn: () => Promise<T>): Promise<GResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    if (e instanceof GError) return { ok: false, code: e.code, error: e.message }
    log.warn('google unexpected', { name: (e as Error).name })
    return { ok: false, code: 'unknown', error: 'Unerwarteter Fehler bei Google.' }
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    })
  )
  return out
}

// ---------- Synchronisation ----------

export async function sync(): Promise<GoogleSyncResult> {
  const syncedAt = new Date().toISOString()
  const a = account()
  if (!a || a.expired) return { ok: false, syncedAt, errors: { general: a?.expired ? 'Google-Anmeldung abgelaufen – bitte neu verbinden.' : 'Google ist nicht verbunden.' }, status: await googleStatus() }
  const c = caps(a)
  const errors: GoogleSyncResult['errors'] = {}
  let events: CalEvent[] | undefined
  let emails: Email[] | undefined

  if (c.calendarRead) {
    const r = await wrap(() => fetchEvents(c.calendarWrite))
    if (r.ok) events = r.value
    else errors.calendar = r.error
  }
  if (c.gmailRead) {
    const r = await wrap(() => fetchInbox(a.email))
    if (r.ok) emails = r.value
    else errors.gmail = r.error
  }
  const status = await googleStatus()
  if (status.expired) errors.general = 'Google-Anmeldung abgelaufen – bitte neu verbinden.'
  log.info('google sync', { events: events?.length ?? -1, emails: emails?.length ?? -1 })
  return { ok: !errors.calendar && !errors.gmail && !errors.general, syncedAt, events, emails, errors, status }
}

async function fetchEvents(canWrite: boolean): Promise<CalEvent[]> {
  const now = Date.now()
  const out: CalEvent[] = []
  let pageToken: string | undefined
  let pages = 0
  do {
    const q = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: new Date(now - 30 * 86400_000).toISOString(),
      timeMax: new Date(now + 120 * 86400_000).toISOString(),
      maxResults: '250',
      ...(pageToken ? { pageToken } : {})
    })
    const r = await api<{ items?: GEvent[]; nextPageToken?: string }>(`${URLS.calendar}/calendars/primary/events?${q}`)
    for (const e of r.items ?? []) {
      const m = mapGoogleEvent(e, canWrite)
      if (m) out.push(m)
    }
    pageToken = r.nextPageToken
  } while (pageToken && ++pages < 8)
  return out
}

async function fetchInbox(me: string): Promise<Email[]> {
  // Ausgeblendete Gmail-Kategorien (z. B. Werbung, Soziale Netzwerke) gar nicht erst laden.
  const allowed = new Set(['promotions', 'social', 'updates', 'forums'])
  const hidden = (store.getSettings().gmailHiddenCategories ?? []).filter((c) => allowed.has(c))
  const q = new URLSearchParams({ labelIds: 'INBOX', maxResults: '40' })
  if (hidden.length) q.set('q', hidden.map((c) => `-category:${c}`).join(' '))
  const list = await api<{ threads?: { id: string; historyId?: string }[] }>(`${URLS.gmail}/users/me/threads?${q}`)
  const threads = list.threads ?? []
  const results = await pool(threads, 6, async (t) => {
    const cached = threadCache.get(t.id)
    if (cached && cached.historyId && cached.historyId === t.historyId) return cached.emails
    const full = await api<GThread>(`${URLS.gmail}/users/me/threads/${encodeURIComponent(t.id)}?format=full`)
    const emails = mapGoogleThread(full, me)
    threadCache.set(t.id, { historyId: full.historyId ?? t.historyId, emails })
    return emails
  })
  // Nicht mehr im Posteingang → aus dem Cache entfernen
  const ids = new Set(threads.map((t) => t.id))
  for (const k of threadCache.keys()) if (!ids.has(k)) threadCache.delete(k)
  return results.flat()
}

// ---------- Schreibaktionen ----------

export function createEvent(ev: CalEvent, notify: boolean) {
  return wrap(async () => {
    if (!caps(account()).calendarWrite) throw new GError('scope', 'Tagwerk hat nur Lesezugriff auf deinen Kalender.')
    const body = toGoogleEvent(ev, { includeAttendees: true })
    const r = await api<GEvent>(`${URLS.calendar}/calendars/primary/events?sendUpdates=${notify ? 'all' : 'none'}`, { method: 'POST', body: JSON.stringify(body) })
    return mapGoogleEvent(r, true)!
  })
}

export function updateEvent(ev: CalEvent, notify: boolean) {
  return wrap(async () => {
    if (!ev.remoteId) throw new GError('not-found', 'Termin ohne Google-ID.')
    if (!caps(account()).calendarWrite) throw new GError('scope', 'Tagwerk hat nur Lesezugriff auf deinen Kalender.')
    const body = toGoogleEvent(ev, { includeAttendees: false })
    const r = await api<GEvent>(`${URLS.calendar}/calendars/primary/events/${encodeURIComponent(ev.remoteId)}?sendUpdates=${notify ? 'all' : 'none'}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    })
    return mapGoogleEvent(r, true)!
  })
}

export function deleteEvent(remoteId: string, notify: boolean) {
  return wrap(async () => {
    if (!caps(account()).calendarWrite) throw new GError('scope', 'Tagwerk hat nur Lesezugriff auf deinen Kalender.')
    await api(`${URLS.calendar}/calendars/primary/events/${encodeURIComponent(remoteId)}?sendUpdates=${notify ? 'all' : 'none'}`, { method: 'DELETE' })
    return null
  })
}

const ALLOWED_LABELS = new Set(['UNREAD', 'INBOX', 'STARRED'])

export function modifyThread(remoteThreadId: string, add: string[], remove: string[]) {
  return wrap(async () => {
    if (!caps(account()).gmailWrite) throw new GError('scope', 'Tagwerk hat nur Lesezugriff auf Gmail.')
    const a = add.filter((l) => ALLOWED_LABELS.has(l))
    const r = remove.filter((l) => ALLOWED_LABELS.has(l))
    await api(`${URLS.gmail}/users/me/threads/${encodeURIComponent(remoteThreadId)}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: a, removeLabelIds: r }) })
    threadCache.delete(remoteThreadId)
    return null
  })
}

export function send(p: GoogleSendParams) {
  return wrap(async () => {
    const a = account()
    if (!caps(a).gmailWrite) throw new GError('scope', 'Tagwerk hat nur Lesezugriff auf Gmail. Verbinde Google mit Schreibzugriff, um zu senden.')
    if (!p.to.length || !p.to.every((t) => /^[^@\s]+@[^@\s]+$/.test(t.email))) throw new GError('unknown', 'Ungültige Empfängeradresse.')
    if (!p.body.trim()) throw new GError('unknown', 'Die Nachricht ist leer.')
    const raw = encodeB64Url(buildReplyMime({ from: a!.email, to: p.to, subject: p.subject, body: p.body, inReplyTo: p.inReplyTo, references: p.references }))
    const r = await api<{ id: string; threadId: string }>(`${URLS.gmail}/users/me/messages/send`, { method: 'POST', body: JSON.stringify({ raw, threadId: p.remoteThreadId }) })
    threadCache.delete(p.remoteThreadId)
    log.info('gmail sent')
    const email: Email = {
      id: `g-${r.id}`,
      remoteId: r.id,
      threadId: `g-${r.threadId}`,
      remoteThreadId: r.threadId,
      from: { name: 'Ich', email: a!.email },
      to: p.to,
      subject: /^(re|aw):/i.test(p.subject) ? p.subject : `Re: ${p.subject}`,
      date: new Date().toISOString(),
      body: p.body,
      read: true,
      important: false,
      needsReply: false,
      replied: false,
      folder: 'sent',
      source: 'google'
    }
    return email
  })
}

export function wipeGoogle() {
  accessToken = null
  threadCache.clear()
}
