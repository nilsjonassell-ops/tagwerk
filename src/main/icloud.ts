// Apple Kalender über iCloud (CalDAV). Anmeldung mit Apple-ID und einem
// App-spezifischen Passwort – das normale Apple-ID-Passwort wird nie verwendet.
// Läuft ausschließlich im Hauptprozess; Zugangsdaten erreichen die Oberfläche nie.

import { app, net } from 'electron'
import { randomUUID } from 'node:crypto'
import type { CalEvent, ICloudCalendar, ICloudStatus, MsResult } from '@shared/types'
import { secrets } from './secrets'
import { log } from './log'
import { absolute, eventToIcs, icsToEvents, isCalendarCollection, parseMultistatus, supportsEvents } from './caldav-map'

const MOCK = !app.isPackaged ? process.env.TAGWERK_ICLOUD_BASE : undefined
const ROOT = MOCK ?? 'https://caldav.icloud.com/'
const VAULT = 'icloud-account'

interface Account {
  appleId: string
  password: string
  homeUrl: string
  calendars: (ICloudCalendar & { ctag?: string })[]
  defaultCalendarId?: string
}

type Code = 'offline' | 'expired' | 'not-connected' | 'not-found' | 'unknown'
class DavError extends Error {
  constructor(
    public code: Code,
    message: string
  ) {
    super(message)
  }
}

const account = () => secrets.getJson<Account>(VAULT)

function publicStatus(a: Account | null, error?: string): ICloudStatus {
  return {
    connected: !!a,
    appleId: a?.appleId,
    calendars: (a?.calendars ?? []).map(({ ctag: _c, ...c }) => c),
    defaultCalendarId: a?.defaultCalendarId,
    error
  }
}

export async function icloudStatus(): Promise<ICloudStatus> {
  return publicStatus(account())
}

/** Zugangsdaten gehen nur an iCloud (bzw. im Test an den Test-Server) – nie an eine Adresse aus fremden Daten */
function allowedUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const root = new URL(ROOT)
    if (u.host === root.host && u.protocol === root.protocol) return true
    return u.protocol === 'https:' && (u.hostname === 'icloud.com' || u.hostname.endsWith('.icloud.com'))
  } catch {
    return false
  }
}

/** Gehört die Adresse zu einem Kalender dieses Kontos? */
function inOwnCalendar(a: Account, href: string, calendarId?: string): boolean {
  const cals = a.calendars.filter((c) => !calendarId || c.id === calendarId)
  return cals.some((c) => href.startsWith(c.id.endsWith('/') ? c.id : `${c.id}/`))
}

async function dav(url: string, method: string, auth: { appleId: string; password: string }, body?: string, headers: Record<string, string> = {}): Promise<Response> {
  if (!allowedUrl(url)) throw new DavError('unknown', 'Unerwartete Kalender-Adresse – aus Sicherheitsgründen abgebrochen.')
  let res: Response
  try {
    res = await net.fetch(url, {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`${auth.appleId}:${auth.password}`).toString('base64')}`,
        ...(body ? { 'content-type': method === 'PUT' ? 'text/calendar; charset=utf-8' : 'application/xml; charset=utf-8' } : {}),
        ...headers
      },
      body,
      redirect: 'follow'
    })
  } catch {
    throw new DavError('offline', 'iCloud ist nicht erreichbar. Prüfe deine Internetverbindung.')
  }
  if (res.status === 401 || res.status === 403)
    throw new DavError('expired', 'iCloud hat die Anmeldung abgelehnt. Prüfe die Apple-ID und erstelle ggf. ein neues App-spezifisches Passwort.')
  if (res.status === 404) throw new DavError('not-found', 'Nicht gefunden – der Termin wurde in Apple Kalender vielleicht gelöscht.')
  if (res.status === 412) throw new DavError('unknown', 'Der Termin wurde inzwischen in Apple Kalender geändert. Tagwerk lädt den aktuellen Stand – bitte noch einmal versuchen.')
  if (res.status >= 400) throw new DavError('unknown', `iCloud-Fehler (${res.status}).`)
  return res
}

const PROP_PRINCIPAL = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>'
const PROP_HOME = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>'
const PROP_CALS =
  '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><cs:getctag/><a:calendar-color/><d:current-user-privilege-set/></d:prop></d:propfind>'

/** Anmeldung prüfen und Kalender finden (Principal → Kalender-Zuhause → Kalender). */
async function discover(auth: { appleId: string; password: string }): Promise<{ homeUrl: string; calendars: (ICloudCalendar & { ctag?: string })[] }> {
  const p = parseMultistatus(await (await dav(ROOT, 'PROPFIND', auth, PROP_PRINCIPAL, { depth: '0' })).text())
  const principal = p.find((r) => r.props['current-user-principal'])?.props['current-user-principal']
  if (!principal) throw new DavError('unknown', 'iCloud hat kein Kalenderkonto geliefert.')
  const principalUrl = absolute(principal, ROOT)
  const h = parseMultistatus(await (await dav(principalUrl, 'PROPFIND', auth, PROP_HOME, { depth: '0' })).text())
  const home = h.find((r) => r.props['calendar-home-set'])?.props['calendar-home-set']
  if (!home) throw new DavError('unknown', 'iCloud hat keinen Kalenderordner geliefert.')
  const homeUrl = absolute(home, principalUrl)
  return { homeUrl, calendars: await listCalendars(homeUrl, auth) }
}

async function listCalendars(homeUrl: string, auth: { appleId: string; password: string }) {
  const list = parseMultistatus(await (await dav(homeUrl, 'PROPFIND', auth, PROP_CALS, { depth: '1' })).text())
  return list
    .filter((r) => r.ok && isCalendarCollection(r) && supportsEvents(r))
    .map((r) => ({
      id: absolute(r.href, homeUrl),
      name: r.props.displayname || 'Kalender',
      color: (r.props['calendar-color'] || '').slice(0, 7) || undefined,
      enabled: true,
      // Abonnierte/geteilte Kalender ohne Schreibrecht
      readOnly: r.raw['current-user-privilege-set'] ? !/<(?:[\w-]+:)?(write|write-content|all)\b/i.test(r.raw['current-user-privilege-set']) : undefined,
      ctag: r.props.getctag
    }))
}

export async function connect(appleId: string, password: string): Promise<{ ok: boolean; error?: string; status: ICloudStatus }> {
  const id = String(appleId ?? '').trim()
  const pw = String(password ?? '').replace(/\s+/g, '')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id)) return { ok: false, error: 'Bitte deine Apple-ID (E-Mail-Adresse) eingeben.', status: await icloudStatus() }
  // App-spezifische Passwörter haben die Form xxxx-xxxx-xxxx-xxxx
  if (!/^[a-z]{4}-?[a-z]{4}-?[a-z]{4}-?[a-z]{4}$/i.test(pw) && !MOCK)
    return { ok: false, error: 'Das sieht nicht nach einem App-spezifischen Passwort aus (Form: abcd-efgh-ijkl-mnop). Dein normales Apple-ID-Passwort funktioniert hier nicht.', status: await icloudStatus() }
  try {
    const auth = { appleId: id, password: pw }
    const { homeUrl, calendars } = await discover(auth)
    if (!calendars.length) throw new DavError('unknown', 'In deinem iCloud-Konto wurde kein Kalender gefunden.')
    const prev = account()
    const enabled = new Set(prev?.calendars.filter((c) => c.enabled).map((c) => c.id))
    await secrets.setJson(VAULT, {
      appleId: id,
      password: pw,
      homeUrl,
      calendars: calendars.map((c) => ({ ...c, enabled: prev ? enabled.has(c.id) : true })),
      defaultCalendarId: prev?.defaultCalendarId ?? calendars.find((c) => !c.readOnly)?.id
    } satisfies Account)
    log.info('icloud connected', { calendars: calendars.length })
    return { ok: true, status: await icloudStatus() }
  } catch (e) {
    log.warn('icloud connect failed', { code: e instanceof DavError ? e.code : 'unknown' })
    return { ok: false, error: e instanceof DavError ? e.message : 'Die Verbindung zu iCloud ist fehlgeschlagen.', status: await icloudStatus() }
  }
}

export async function disconnect(): Promise<ICloudStatus> {
  secrets.remove(VAULT)
  return icloudStatus()
}

export async function setCalendars(enabledIds: string[], defaultId?: string): Promise<ICloudStatus> {
  const a = account()
  if (!a) return icloudStatus()
  const on = new Set(enabledIds.map(String))
  await secrets.setJson(VAULT, {
    ...a,
    calendars: a.calendars.map((c) => ({ ...c, enabled: on.has(c.id) })),
    defaultCalendarId: defaultId && a.calendars.some((c) => c.id === defaultId) ? defaultId : a.defaultCalendarId
  })
  return icloudStatus()
}

const pad = (n: number) => String(n).padStart(2, '0')
const davTime = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

export async function sync(): Promise<{ ok: boolean; syncedAt: string; events?: CalEvent[]; error?: string }> {
  const syncedAt = new Date().toISOString()
  const a = account()
  if (!a) return { ok: false, syncedAt, error: 'iCloud ist nicht verbunden.' }
  try {
    const now = Date.now()
    const from = new Date(now - 30 * 86400_000)
    const to = new Date(now + 120 * 86400_000)
    const body = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${davTime(from)}" end="${davTime(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`
    const events: CalEvent[] = []
    // Neue Kalender (z. B. in Apple Kalender angelegt) mitnehmen
    const fresh = await listCalendars(a.homeUrl, a).catch(() => a.calendars)
    const known = new Map(a.calendars.map((c) => [c.id, c]))
    const calendars = fresh.map((c) => ({ ...c, enabled: known.get(c.id)?.enabled ?? true }))
    for (const cal of calendars.filter((c) => c.enabled)) {
      const res = await dav(cal.id, 'REPORT', a, body, { depth: '1' })
      for (const r of parseMultistatus(await res.text())) {
        const data = r.props['calendar-data']
        if (!data) continue
        const evs = icsToEvents(data, { calendarId: cal.id, calendarName: cal.name, href: absolute(r.href, cal.id), etag: r.props.getetag }, from, to)
        events.push(...evs.map((e) => (cal.readOnly ? { ...e, readOnly: true } : e)))
      }
    }
    await secrets.setJson(VAULT, { ...a, calendars })
    lastCtags = ctagKey(calendars)
    log.info('icloud sync', { events: events.length })
    return { ok: true, syncedAt, events }
  } catch (e) {
    return { ok: false, syncedAt, error: e instanceof DavError ? e.message : 'iCloud-Abgleich fehlgeschlagen.' }
  }
}

async function wrap<T>(fn: (a: Account) => Promise<T>): Promise<MsResult<T>> {
  const a = account()
  if (!a) return { ok: false, error: 'iCloud ist nicht verbunden.', code: 'not-connected' }
  try {
    return { ok: true, value: await fn(a) }
  } catch (e) {
    if (e instanceof DavError) return { ok: false, error: e.message, code: e.code }
    return { ok: false, error: 'iCloud ist gerade nicht erreichbar.', code: 'unknown' }
  }
}

/** Liest eine einzelne Ressource neu (für ETag und die gespeicherte Fassung). */
async function readBack(a: Account, href: string, calendarId: string): Promise<CalEvent> {
  const res = await dav(href, 'GET', a)
  const etag = res.headers.get('etag') ?? undefined
  const cal = a.calendars.find((c) => c.id === calendarId)
  const now = Date.now()
  const evs = icsToEvents(await res.text(), { calendarId, calendarName: cal?.name ?? 'iCloud', href, etag }, new Date(now - 3650 * 86400_000), new Date(now + 3650 * 86400_000))
  if (!evs[0]) throw new DavError('unknown', 'iCloud hat den Termin nicht bestätigt.')
  return evs[0]
}

export function createEvent(ev: CalEvent, calendarId?: string): Promise<MsResult<CalEvent>> {
  return wrap(async (a) => {
    const calId = calendarId ?? a.defaultCalendarId ?? a.calendars.find((c) => c.enabled && !c.readOnly)?.id
    if (!calId) throw new DavError('unknown', 'Kein beschreibbarer Apple-Kalender gefunden.')
    const cal = a.calendars.find((c) => c.id === calId)
    if (!cal || cal.readOnly) throw new DavError('unknown', 'Dieser Apple-Kalender ist nicht (mehr) beschreibbar.')
    const uid = `${randomUUID()}@tagwerk`
    const href = absolute(`${encodeURIComponent(uid)}.ics`, calId.endsWith('/') ? calId : `${calId}/`)
    await dav(href, 'PUT', a, eventToIcs(ev, uid), { 'if-none-match': '*' })
    await absorbOwnChange(a)
    return readBack(a, href, calId)
  })
}

export function updateEvent(ev: CalEvent): Promise<MsResult<CalEvent>> {
  return wrap(async (a) => {
    if (!ev.remoteId || !ev.calendarId) throw new DavError('not-found', 'Termin ohne iCloud-Kennung.')
    if (!inOwnCalendar(a, ev.remoteId, ev.calendarId)) throw new DavError('not-found', 'Der Termin gehört zu keinem deiner Apple-Kalender.')
    // UID der Ressource beibehalten
    const cur = await dav(ev.remoteId, 'GET', a)
    const text = await cur.text()
    const uid = text.match(/^UID:(.+)$/m)?.[1]?.trim() ?? `${randomUUID()}@tagwerk`
    await dav(ev.remoteId, 'PUT', a, eventToIcs(ev, uid), ev.etag ? { 'if-match': ev.etag } : {})
    await absorbOwnChange(a)
    return readBack(a, ev.remoteId, ev.calendarId)
  })
}

export function deleteEvent(ev: CalEvent): Promise<MsResult<null>> {
  return wrap(async (a) => {
    if (!ev.remoteId) throw new DavError('not-found', 'Termin ohne iCloud-Kennung.')
    if (!inOwnCalendar(a, ev.remoteId)) throw new DavError('not-found', 'Der Termin gehört zu keinem deiner Apple-Kalender.')
    await dav(ev.remoteId, 'DELETE', a, undefined, ev.etag ? { 'if-match': ev.etag } : {})
    await absorbOwnChange(a)
    return null
  })
}

// ---------- Live-Abgleich über die Kalender-Prüfsumme (ctag) ----------

let lastCtags = ''
let timer: NodeJS.Timeout | null = null
const ctagKey = (cals: { id: string; ctag?: string; enabled: boolean }[]) =>
  cals
    .filter((c) => c.enabled)
    .map((c) => `${c.id}=${c.ctag ?? ''}`)
    .sort()
    .join('|')

/** Eigene Änderung sofort als bekannten Stand übernehmen – sonst würde sie als „neu von außen“ erkannt. */
async function absorbOwnChange(a: Account) {
  if (!lastCtags) return
  try {
    const cals = await listCalendars(a.homeUrl, a)
    const known = new Map(a.calendars.map((c) => [c.id, c.enabled]))
    lastCtags = ctagKey(cals.map((c) => ({ ...c, enabled: known.get(c.id) ?? true })))
  } catch {
    /* nächste Prüfung holt es nach */
  }
}

export function startICloudWatch(onChange: () => void) {
  if (timer) clearTimeout(timer)
  let delay = 10_000
  const tick = async () => {
    try {
      const a = account()
      if (!a || !net.isOnline() || !lastCtags) {
        delay = 15_000
        return
      }
      const cals = await listCalendars(a.homeUrl, a)
      const known = new Map(a.calendars.map((c) => [c.id, c.enabled]))
      const key = ctagKey(cals.map((c) => ({ ...c, enabled: known.get(c.id) ?? true })))
      if (key !== lastCtags) {
        lastCtags = key
        onChange()
      }
      delay = 10_000
    } catch {
      delay = Math.min(120_000, delay * 2)
    } finally {
      timer = setTimeout(tick, delay)
    }
  }
  timer = setTimeout(tick, delay)
}
