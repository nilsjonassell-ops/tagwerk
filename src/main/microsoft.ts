// Microsoft-Anbindung (OneNote über Microsoft Graph): OAuth 2.0 für Desktop-Apps
// mit PKCE und Loopback-Redirect – öffentlicher Client, also ohne Clientschlüssel.
// Läuft ausschließlich im Hauptprozess; Tokens erreichen die Oberfläche nie.

import { app, net, shell } from 'electron'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { CalEvent, Email, OutlookMailAction, OutlookSyncResult, MicrosoftConnectOptions, MicrosoftStatus, MsResult, OneNotePage, OneNoteSaveRequest, OneNoteSection } from '@shared/types'
import { secrets } from './secrets'
import { log } from './log'
import { mapPage, mapSection, noteToOneNoteHtml, oneNoteHtmlToText, type GPage, type GSection } from './onenote-map'
import { mapOutlookEvent, mapOutlookMessages, toOutlookEvent, type OEvent, type OMessage } from './outlook-map'

// Nur in Entwicklungs-Builds auf einen lokalen Test-Server umlenkbar.
const MOCK = !app.isPackaged ? process.env.TAGWERK_MS_BASE : undefined
const TENANT = 'common' // private und geschäftliche Microsoft-Konten
const URLS = MOCK
  ? { auth: `${MOCK}/ms/authorize`, token: `${MOCK}/ms/token`, graph: `${MOCK}/ms/graph/v1.0` }
  : {
      auth: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`,
      token: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
      graph: 'https://graph.microsoft.com/v1.0'
    }

// So wenig wie möglich: eigene OneNote-Notizbücher lesen/schreiben, dazu Name und E-Mail.
const BASE_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read']
const SCOPE = { notes: 'Notes.ReadWrite', mailRead: 'Mail.ReadWrite', mailSend: 'Mail.Send', calendar: 'Calendars.ReadWrite', sync: 'Files.ReadWrite.AppFolder' }

/** In Tagwerk eingebaute App-Registrierung (öffentlicher Client, alle Microsoft-Konten). Eine eigene ID in den Einstellungen hat Vorrang. */
const BUILT_IN_CLIENT_ID = '293e5dfa-72e5-4a58-bd9b-32648cce5a87'

function scopesFor(o: MicrosoftConnectOptions): string[] {
  const s = [...BASE_SCOPES]
  if (o.notes) s.push(SCOPE.notes)
  if (o.mail) s.push(SCOPE.mailRead, SCOPE.mailSend)
  if (o.calendar) s.push(SCOPE.calendar)
  if (o.sync) s.push(SCOPE.sync)
  return s
}
/** Ältere Verbindungen (nur OneNote) kennen ihre Bereiche nicht */
const accountScopes = (a: Account | null) => a?.scopes ?? [...BASE_SCOPES, SCOPE.notes]

const VAULT_CLIENT = 'microsoft-client'
const VAULT_ACCOUNT = 'microsoft-account'

interface Account {
  refreshToken: string
  email: string
  expired?: boolean
  scopes?: string[]
}

type Code = 'offline' | 'expired' | 'not-connected' | 'not-found' | 'unknown'
class MsError extends Error {
  constructor(
    public code: Code,
    message: string
  ) {
    super(message)
  }
}

let accessToken: { token: string; exp: number } | null = null
let pendingAuth: { cancel: () => void } | null = null

const ownClientId = () => secrets.getJson<{ clientId: string }>(VAULT_CLIENT)?.clientId
// Im Test (Mock) nur die ausdrücklich hinterlegte ID, damit die Einrichtung testbar bleibt
const clientId = () => ownClientId() ?? (MOCK && !process.env.TAGWERK_MS_BUILTIN ? undefined : BUILT_IN_CLIENT_ID)
const account = () => secrets.getJson<Account>(VAULT_ACCOUNT)
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function msStatus(): Promise<MicrosoftStatus> {
  const id = clientId()
  const a = account()
  return {
    clientConfigured: !!id,
    builtInClient: !!id && !ownClientId(),
    clientIdHint: id ? `${id.slice(0, 8)}…` : undefined,
    connected: !!a && !a.expired,
    email: a?.email,
    expired: !!a?.expired,
    caps: capsOf(a)
  }
}

function capsOf(a: Account | null): MicrosoftStatus['caps'] {
  const has = (x: string) => !!a && !a.expired && accountScopes(a).some((s) => s.toLowerCase().endsWith(x.toLowerCase()))
  return { notes: has(SCOPE.notes), mail: has(SCOPE.mailRead), calendar: has(SCOPE.calendar), sync: has(SCOPE.sync) }
}

export const msCaps = () => capsOf(account())
export const msEmail = () => account()?.email ?? ''

export async function setClient(id: string): Promise<{ ok: boolean; error?: string }> {
  const v = String(id ?? '').trim()
  // Anwendungs-IDs von Microsoft sind GUIDs
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    return { ok: false, error: 'Das ist keine gültige Anwendungs-ID (Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).' }
  }
  try {
    await secrets.setJson(VAULT_CLIENT, { clientId: v })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function clearClient() {
  secrets.remove(VAULT_CLIENT)
}

// ---------- Anmeldung ----------

export async function connect(opts: MicrosoftConnectOptions): Promise<{ ok: boolean; error?: string; status: MicrosoftStatus }> {
  const id = clientId()
  if (!id) return { ok: false, error: 'Zuerst die Anwendungs-ID hinterlegen.', status: await msStatus() }
  if (!net.isOnline() && !MOCK) return { ok: false, error: 'Keine Internetverbindung.', status: await msStatus() }
  if (!opts.notes && !opts.mail && !opts.calendar && !opts.sync) return { ok: false, error: 'Wähle mindestens Mail, Kalender, OneNote oder Cloud-Speicher.', status: await msStatus() }
  cancelConnect()
  const scopes = scopesFor(opts)
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const state = b64url(randomBytes(16))
  try {
    const { code, redirectUri } = await waitForCode(id, challenge, state, scopes)
    const tok = await tokenRequest({ client_id: id, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri, scope: scopes.join(' ') })
    if (!tok.refresh_token) throw new MsError('unknown', 'Microsoft hat kein Langzeit-Token geliefert. Bitte erneut verbinden.')
    accessToken = { token: tok.access_token, exp: Date.now() + (Number(tok.expires_in) || 3600) * 1000 }
    const email = emailFromIdToken(tok.id_token) ?? (await me().catch(() => '')) ?? ''
    const granted = tok.scope ? tok.scope.split(/\s+/).filter(Boolean) : scopes
    await secrets.setJson(VAULT_ACCOUNT, { refreshToken: tok.refresh_token, email, scopes: granted } satisfies Account)
    log.info('microsoft connected')
    return { ok: true, status: await msStatus() }
  } catch (e) {
    log.warn('microsoft connect failed', { code: e instanceof MsError ? e.code : 'unknown' })
    return { ok: false, error: e instanceof MsError ? e.message : 'Die Anmeldung ist fehlgeschlagen.', status: await msStatus() }
  } finally {
    pendingAuth = null
  }
}

/**
 * Wartet auf die Rückleitung von Microsoft. Microsoft erlaubt für Desktop-Apps
 * „http://localhost“ mit beliebigem Port – je nach System löst der Browser
 * localhost als IPv4 oder IPv6 auf, deshalb wird auf beiden gelauscht.
 */
function waitForCode(id: string, challenge: string, state: string, scopes: string[]): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    const servers: Server[] = []
    let redirectUri = ''
    let done = false
    const timer = setTimeout(() => finish(new MsError('unknown', 'Zeitüberschreitung – die Anmeldung wurde nicht abgeschlossen.')), 5 * 60_000)
    const page = (title: string, text: string) =>
      `<!doctype html><meta charset="utf-8"><title>Tagwerk</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:90vh;color:#1d2523;background:#eef1ff"><div style="text-align:center;max-width:420px"><h1 style="font-weight:600">${title}</h1><p>${text}</p></div>`
    const handler = (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname !== '/') return void res.writeHead(404).end()
      const html = { 'content-type': 'text/html; charset=utf-8' }
      if (url.searchParams.get('state') !== state) return void res.writeHead(400, html).end(page('Ungültige Anfrage', 'Bitte starte die Verbindung in Tagwerk erneut.'))
      const err = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      if (err || !code) {
        res.writeHead(200, html).end(page('Nicht verbunden', 'Der Zugriff wurde nicht erteilt. Du kannst dieses Fenster schließen.'))
        return finish(new MsError('unknown', err === 'access_denied' ? 'Du hast den Zugriff abgelehnt.' : `Microsoft hat die Anmeldung abgebrochen${url.searchParams.get('error_description') ? `: ${url.searchParams.get('error_description')!.slice(0, 160)}` : '.'}`))
      }
      res.writeHead(200, html).end(page('Verbunden', 'Tagwerk ist jetzt mit deinem Microsoft-Konto verbunden. Du kannst dieses Fenster schließen.'))
      finish(null, code)
    }
    const finish = (e: Error | null, code?: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      servers.forEach((s) => s.close())
      if (e) reject(e)
      else resolve({ code: code!, redirectUri })
    }
    pendingAuth = { cancel: () => finish(new MsError('unknown', 'Anmeldung abgebrochen.')) }
    const v4 = createServer(handler)
    servers.push(v4)
    v4.on('error', () => finish(new MsError('unknown', 'Lokaler Anmelde-Port konnte nicht geöffnet werden.')))
    v4.listen(0, '127.0.0.1', () => {
      const port = (v4.address() as AddressInfo).port
      const v6 = createServer(handler)
      v6.on('error', () => {}) // IPv6 nicht verfügbar – egal
      v6.listen(port, '::1')
      servers.push(v6)
      redirectUri = `http://localhost:${port}`
      const authUrl =
        `${URLS.auth}?` +
        new URLSearchParams({
          client_id: id,
          response_type: 'code',
          redirect_uri: redirectUri,
          response_mode: 'query',
          scope: scopes.join(' '),
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
          prompt: 'select_account'
        }).toString()
      if (MOCK) net.fetch(authUrl).catch(() => finish(new MsError('unknown', 'Mock nicht erreichbar')))
      else shell.openExternal(authUrl)
    })
  })
}

export function cancelConnect() {
  pendingAuth?.cancel()
  pendingAuth = null
}

function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return
  try {
    const p = JSON.parse(Buffer.from(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    const v = p.email ?? p.preferred_username
    return typeof v === 'string' ? v : undefined
  } catch {
    return
  }
}

interface TokenResponse {
  access_token: string
  scope?: string
  expires_in?: number
  refresh_token?: string
  id_token?: string
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  let res: Response
  try {
    res = await net.fetch(URLS.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() })
  } catch {
    throw new MsError('offline', 'Microsoft ist nicht erreichbar. Prüfe deine Internetverbindung.')
  }
  const j = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string }
  if (res.ok && j.access_token) return j
  if (j.error === 'invalid_grant' || j.error === 'interaction_required') throw new MsError('expired', 'Die Microsoft-Anmeldung ist abgelaufen oder wurde widerrufen. Bitte neu verbinden.')
  if (j.error === 'invalid_client' || j.error === 'unauthorized_client')
    throw new MsError('unknown', 'Microsoft lehnt die Anwendungs-ID ab. Prüfe in der App-Registrierung, dass „Öffentliche Clientflows zulassen“ aktiv ist und http://localhost als Umleitungs-URI eingetragen ist.')
  throw new MsError('unknown', `Microsoft-Anmeldung fehlgeschlagen (${(j.error_description ?? j.error ?? String(res.status)).slice(0, 160)}).`)
}

async function getAccessToken(): Promise<string> {
  if (accessToken && accessToken.exp - 60_000 > Date.now()) return accessToken.token
  const id = clientId()
  const a = account()
  if (!id || !a) throw new MsError('not-connected', 'Microsoft ist nicht verbunden.')
  if (a.expired) throw new MsError('expired', 'Die Microsoft-Anmeldung ist abgelaufen. Bitte neu verbinden.')
  try {
    const tok = await tokenRequest({ client_id: id, refresh_token: a.refreshToken, grant_type: 'refresh_token', scope: accountScopes(a).join(' ') })
    accessToken = { token: tok.access_token, exp: Date.now() + (Number(tok.expires_in) || 3600) * 1000 }
    // Microsoft tauscht das Langzeit-Token bei jeder Erneuerung aus
    if (tok.refresh_token && tok.refresh_token !== a.refreshToken) await secrets.setJson(VAULT_ACCOUNT, { ...a, refreshToken: tok.refresh_token })
    return tok.access_token
  } catch (e) {
    if (e instanceof MsError && e.code === 'expired') {
      await secrets.setJson(VAULT_ACCOUNT, { ...a, expired: true })
      accessToken = null
    }
    throw e
  }
}

export async function disconnect(): Promise<MicrosoftStatus> {
  cancelConnect()
  secrets.remove(VAULT_ACCOUNT)
  accessToken = null
  return msStatus()
}

// ---------- Graph-Aufrufe ----------

async function graph(path: string, init: RequestInit = {}, raw = false, retried = false): Promise<Response> {
  const token = await getAccessToken()
  let res: Response
  try {
    res = await net.fetch(`${URLS.graph}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } })
  } catch {
    throw new MsError('offline', 'Microsoft ist nicht erreichbar.')
  }
  if (res.status === 401 && !retried) {
    accessToken = null
    return graph(path, init, raw, true)
  }
  if (res.status === 404) throw new MsError('not-found', 'Nicht gefunden – der Eintrag wurde in Outlook oder OneNote vielleicht gelöscht.')
  if (res.status === 429) throw new MsError('unknown', 'Microsoft bittet um eine kurze Pause. Gleich noch einmal versuchen.')
  if (!res.ok && !raw) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } }
    // Persönliche Konten ohne OneNote-Notizbuch liefern einen eigenen Fehler
    if (j.error?.code === '10008' || /exceeded the maximum number of sections/i.test(j.error?.message ?? '')) throw new MsError('unknown', 'Dein OneNote ist zu groß für eine Gesamtabfrage. Wähle einen Abschnitt aus.')
    throw new MsError('unknown', `Microsoft-Fehler (${(j.error?.message ?? String(res.status)).slice(0, 140)}).`)
  }
  return res
}

/** OneDrive-App-Ordner für den Cloud-Abgleich: liefert die Antwort ungeprüft (404 = Datei fehlt). */
export async function driveFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await getAccessToken()
  let res: Response
  try {
    res = await net.fetch(`${URLS.graph}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } })
  } catch {
    throw new MsError('offline', 'OneDrive ist nicht erreichbar.')
  }
  if (res.status === 401 && !retried) {
    accessToken = null
    return driveFetch(path, init, true)
  }
  return res
}

/** Fehlertext für die Oberfläche */
export const msErrorText = (e: unknown) => (e instanceof MsError ? e.message : 'OneDrive ist gerade nicht erreichbar.')

const json = async <T>(path: string, init?: RequestInit) => (await (await graph(path, init)).json()) as T

async function me(): Promise<string> {
  const r = await json<{ mail?: string; userPrincipalName?: string }>('/me?$select=mail,userPrincipalName')
  return r.mail ?? r.userPrincipalName ?? ''
}

async function wrap<T>(fn: () => Promise<T>): Promise<MsResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    if (e instanceof MsError) return { ok: false, error: e.message, code: e.code }
    log.warn('onenote failed', { msg: (e as Error).message?.slice(0, 80) })
    return { ok: false, error: 'Microsoft ist gerade nicht erreichbar.', code: 'unknown' }
  }
}

/** Alle Abschnitte samt Notizbuch – für die Seitenleiste und das Speichern-Ziel. */
export function sections(): Promise<MsResult<OneNoteSection[]>> {
  return wrap(async () => {
    const out: OneNoteSection[] = []
    let next: string | undefined = '/me/onenote/sections?$select=id,displayName,links&$expand=parentNotebook($select=id,displayName)&$top=100'
    for (let i = 0; next && i < 10; i++) {
      const r: { value?: GSection[]; '@odata.nextLink'?: string } = await json(next)
      out.push(...(r.value ?? []).map(mapSection))
      next = r['@odata.nextLink']?.replace(URLS.graph, '')
    }
    return out.sort((a, b) => a.notebook.localeCompare(b.notebook, 'de') || a.name.localeCompare(b.name, 'de'))
  })
}

/** Seiten eines Abschnitts – oder die zuletzt geänderten Seiten insgesamt. */
export function pages(sectionId?: string): Promise<MsResult<OneNotePage[]>> {
  return wrap(async () => {
    const sel = '$select=id,title,createdDateTime,lastModifiedDateTime,links&$expand=parentSection($select=id,displayName)&$orderby=lastModifiedDateTime desc'
    const path = sectionId ? `/me/onenote/sections/${encodeURIComponent(sectionId)}/pages?${sel}&$top=100` : `/me/onenote/pages?${sel}&$top=60`
    const r = await json<{ value?: GPage[] }>(path)
    return (r.value ?? []).map(mapPage)
  })
}

export function pageText(pageId: string): Promise<MsResult<string>> {
  return wrap(async () => {
    const res = await graph(`/me/onenote/pages/${encodeURIComponent(pageId)}/content`)
    return oneNoteHtmlToText(await res.text()).slice(0, 60_000)
  })
}

/** Legt eine Seite an. Mit replacePageId wird die frühere Fassung danach entfernt (= aktualisieren). */
export function savePage(req: OneNoteSaveRequest): Promise<MsResult<OneNotePage>> {
  return wrap(async () => {
    if (!req.sectionId) throw new MsError('unknown', 'Wähle einen OneNote-Abschnitt.')
    const res = await graph(`/me/onenote/sections/${encodeURIComponent(req.sectionId)}/pages`, {
      method: 'POST',
      headers: { 'content-type': 'text/html' },
      body: noteToOneNoteHtml(req.note, req.meta)
    })
    const page = mapPage((await res.json()) as GPage)
    if (req.replacePageId && req.replacePageId !== page.id) {
      await graph(`/me/onenote/pages/${encodeURIComponent(req.replacePageId)}`, { method: 'DELETE' }, true).catch(() => {})
    }
    return page
  })
}


// ---------- Outlook Mail ----------

const MAIL_SELECT = '$select=id,conversationId,subject,body,from,sender,toRecipients,receivedDateTime,sentDateTime,isRead,importance,inferenceClassification,flag,internetMessageId,hasAttachments'
// Nur Text statt HTML, Zeiten in UTC
const PREFER = { prefer: 'outlook.body-content-type="text", outlook.timezone="UTC"' }

let mailSeen = ''
let calSeen = ''

async function fetchMail(me: string): Promise<Email[]> {
  const inbox = await json<{ value?: OMessage[] }>(`/me/mailFolders/inbox/messages?${MAIL_SELECT}&$orderby=receivedDateTime desc&$top=40`, { headers: PREFER })
  // Eigene Antworten, damit „beantwortet“ stimmt und Unterhaltungen vollständig sind
  const sent = await json<{ value?: OMessage[] }>(`/me/mailFolders/sentitems/messages?${MAIL_SELECT}&$orderby=sentDateTime desc&$top=25`, { headers: PREFER }).catch(() => ({ value: [] as OMessage[] }))
  const convs = new Set((inbox.value ?? []).map((m) => m.conversationId))
  const list = [
    ...(inbox.value ?? []).map((m) => ({ ...m, _folder: 'inbox' as const })),
    ...(sent.value ?? []).filter((m) => convs.has(m.conversationId)).map((m) => ({ ...m, _folder: 'sent' as const }))
  ]
  mailSeen = await newestMail().catch(() => mailSeen)
  return mapOutlookMessages(list, me)
}

async function fetchCalendar(me: string): Promise<CalEvent[]> {
  const now = Date.now()
  const q = new URLSearchParams({
    startDateTime: new Date(now - 30 * 86400_000).toISOString(),
    endDateTime: new Date(now + 120 * 86400_000).toISOString(),
    $top: '250',
    $select: 'id,subject,body,start,end,isAllDay,isCancelled,isOrganizer,location,attendees,organizer,webLink,isReminderOn,reminderMinutesBeforeStart,type'
  })
  const out: CalEvent[] = []
  let next: string | undefined = `/me/calendarView?${q}`
  for (let i = 0; next && i < 8; i++) {
    const r: { value?: OEvent[]; '@odata.nextLink'?: string } = await json(next, { headers: PREFER })
    for (const e of r.value ?? []) {
      const m = mapOutlookEvent(e, me)
      if (m) out.push(m)
    }
    next = r['@odata.nextLink']?.replace(URLS.graph, '')
  }
  calSeen = await newestEvent().catch(() => calSeen)
  return out
}

export async function outlookSync(opts?: { only?: 'mail' | 'calendar' }): Promise<OutlookSyncResult> {
  const syncedAt = new Date().toISOString()
  const a = account()
  if (!a || a.expired) return { ok: false, syncedAt, errors: { general: a?.expired ? 'Microsoft-Anmeldung abgelaufen – bitte neu verbinden.' : 'Microsoft ist nicht verbunden.' } }
  const c = capsOf(a)
  const errors: OutlookSyncResult['errors'] = {}
  let emails: Email[] | undefined
  let events: CalEvent[] | undefined
  if (c.mail && opts?.only !== 'calendar') {
    const r = await wrap(() => fetchMail(a.email))
    if (r.ok) emails = r.value
    else errors.mail = r.error
  }
  if (c.calendar && opts?.only !== 'mail') {
    const r = await wrap(() => fetchCalendar(a.email))
    if (r.ok) events = r.value
    else errors.calendar = r.error
  }
  log.info('outlook sync', { emails: emails?.length ?? -1, events: events?.length ?? -1 })
  return { ok: !errors.mail && !errors.calendar, syncedAt, emails, events, errors }
}

export function mailAction(ids: string[], action: OutlookMailAction): Promise<MsResult<null>> {
  return wrap(async () => {
    for (const id of ids.slice(0, 50)) {
      const path = `/me/messages/${encodeURIComponent(id)}`
      const patch = (body: unknown) => graph(path, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const move = (dest: string) => graph(`${path}/move`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ destinationId: dest }) })
      if (action === 'read' || action === 'unread') await patch({ isRead: action === 'read' })
      else if (action === 'flag' || action === 'unflag') await patch({ flag: { flagStatus: action === 'flag' ? 'flagged' : 'notFlagged' } })
      else if (action === 'archive') await move('archive')
      else if (action === 'unarchive' || action === 'untrash') await move('inbox')
      else if (action === 'trash') await move('deleteditems')
    }
    return null
  })
}

/** Antwort auf eine Nachricht (Outlook verkettet die Unterhaltung selbst). */
export function reply(messageId: string, body: string): Promise<MsResult<null>> {
  return wrap(async () => {
    await graph(`/me/messages/${encodeURIComponent(messageId)}/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ comment: String(body).slice(0, 100_000) })
    })
    return null
  })
}

// ---------- Outlook Kalender ----------

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function createEvent(ev: CalEvent, notify: boolean): Promise<MsResult<CalEvent>> {
  return wrap(async () => {
    const body = toOutlookEvent(ev, { includeAttendees: notify, timeZone: tz() })
    const r = await json<OEvent>('/me/events', { method: 'POST', headers: { 'content-type': 'application/json', ...PREFER }, body: JSON.stringify(body) })
    const m = mapOutlookEvent(r, msEmail())
    if (!m) throw new MsError('unknown', 'Outlook hat den Termin nicht bestätigt.')
    return m
  })
}

export function updateEvent(ev: CalEvent): Promise<MsResult<CalEvent>> {
  return wrap(async () => {
    if (!ev.remoteId) throw new MsError('not-found', 'Termin ohne Outlook-Kennung.')
    const body = toOutlookEvent(ev, { includeAttendees: false, timeZone: tz() })
    const r = await json<OEvent>(`/me/events/${encodeURIComponent(ev.remoteId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json', ...PREFER }, body: JSON.stringify(body) })
    const m = mapOutlookEvent(r, msEmail())
    if (!m) throw new MsError('unknown', 'Outlook hat den Termin nicht bestätigt.')
    return m
  })
}

export function deleteEvent(remoteId: string): Promise<MsResult<null>> {
  return wrap(async () => {
    await graph(`/me/events/${encodeURIComponent(remoteId)}`, { method: 'DELETE' }, true)
    return null
  })
}

// ---------- Live-Abgleich ----------

async function newestMail(): Promise<string> {
  const r = await json<{ value?: { id: string; lastModifiedDateTime?: string }[] }>('/me/mailFolders/inbox/messages?$select=id,lastModifiedDateTime&$orderby=lastModifiedDateTime desc&$top=1')
  const m = r.value?.[0]
  // Gesamtzahl gehört dazu, damit auch gelöschte/verschobene Mails auffallen
  const f = await json<{ totalItemCount?: number; unreadItemCount?: number }>('/me/mailFolders/inbox?$select=totalItemCount,unreadItemCount')
  return `${m?.id ?? ''}@${m?.lastModifiedDateTime ?? ''}#${f.totalItemCount ?? 0}/${f.unreadItemCount ?? 0}`
}

async function newestEvent(): Promise<string> {
  const r = await json<{ value?: { id: string; lastModifiedDateTime?: string }[] }>('/me/events?$select=id,lastModifiedDateTime&$orderby=lastModifiedDateTime desc&$top=1')
  const e = r.value?.[0]
  return `${e?.id ?? ''}@${e?.lastModifiedDateTime ?? ''}`
}

let watchTimer: NodeJS.Timeout | null = null

/** Alle paar Sekunden prüfen, ob sich in Outlook etwas geändert hat – geladen wird erst dann. */
export function startOutlookWatch(onChange: (what: 'mail' | 'calendar') => void) {
  if (watchTimer) clearTimeout(watchTimer)
  let delay = 3000
  const tick = async () => {
    try {
      const a = account()
      if (!a || a.expired || !net.isOnline()) {
        delay = 5000
        return
      }
      const c = capsOf(a)
      if (c.mail && mailSeen) {
        const h = await newestMail()
        if (h !== mailSeen) {
          mailSeen = h
          onChange('mail')
        }
      }
      if (c.calendar && calSeen) {
        const h = await newestEvent()
        if (h !== calSeen) {
          calSeen = h
          onChange('calendar')
        }
      }
      delay = 3000
    } catch {
      delay = Math.min(60_000, delay * 2)
    } finally {
      watchTimer = setTimeout(tick, delay)
    }
  }
  watchTimer = setTimeout(tick, delay)
}
