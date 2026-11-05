// Web-Vorschau: ersetzt die Brücke zum Electron-Hauptprozess durch eine Browser-Fassung.
// Daten liegen nur in diesem Browser (localStorage). Outlook und Apple Kalender sind
// simulierte Testkonten mit Beispielinhalten – es werden keine echten Konten verbunden
// und nichts verschickt.

import { getWikibooksRecipe, searchWikibooks, WIKI_AGENT } from '@shared/recipe-wiki'
import { shareSim, shareSimHooks } from './share-sim'
import { completeList } from '@shared/lists'
import { DEFAULT_SETTINGS, type AppData, type CalEvent, type CloudStatus, type Email, type GoogleStatus, type ICloudStatus, type MicrosoftStatus, type Settings, type TagwerkApi } from '@shared/types'

// ?person=2 öffnet eine zweite, getrennte Person (eigene Daten) – zum Ausprobieren geteilter Einkaufslisten in zwei Tabs
const PERSON = (() => {
  try {
    const p = new URLSearchParams(location.search).get('person')
    return p && /^[a-z0-9]{1,12}$/i.test(p) && p !== '1' ? `:${p}` : ''
  } catch {
    return ''
  }
})()
const K = { data: `tagwerk-web:data${PERSON}`, settings: `tagwerk-web:settings${PERSON}`, ms: `tagwerk-web:ms${PERSON}`, ic: `tagwerk-web:icloud${PERSON}` }
const read = <T>(k: string): T | null => {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* privates Fenster: dann eben nur bis zum Neuladen */
  }
}
const nowIso = () => new Date().toISOString()
const noop = () => () => {}
const notHere = { ok: false as const, error: 'In der Web-Vorschau nicht verfügbar – das geht nur in der installierten App.', code: 'unknown' as const }

/** Einstellungen wie im Hauptprozess zusammenführen (verschachtelte Objekte, keine Listen) */
function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return (over ?? base) as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k]
    out[k] = b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v) ? merge(b, v) : v
  }
  return out as T
}
/** Wie im Hauptprozess: neue Bereiche/Karten aus Updates ergänzen */
const complete = (s: Settings): Settings => ({ ...s, sidebar: completeList(s.sidebar, DEFAULT_SETTINGS.sidebar), dashboardCards: completeList(s.dashboardCards, DEFAULT_SETTINGS.dashboardCards) })
let settings: Settings = complete(merge(DEFAULT_SETTINGS, read<Partial<Settings>>(K.settings) ?? {}))

// ---------- In-Page-Pop-ups statt eigener Fenster ----------

function toastPopup(title: string, body: string) {
  let host = document.getElementById('web-popups')
  if (!host) {
    host = document.createElement('div')
    host.id = 'web-popups'
    host.setAttribute('role', 'status')
    host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9999;display:grid;gap:8px;max-width:340px'
    document.body.appendChild(host)
  }
  const el = document.createElement('div')
  el.style.cssText =
    'padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.92);backdrop-filter:blur(20px);box-shadow:0 18px 50px -12px rgba(40,40,120,.35),inset 0 0 0 1px rgba(255,255,255,.9);font:13px/1.4 system-ui,sans-serif;color:#12162e'
  const t = document.createElement('b')
  t.textContent = title
  const p = document.createElement('div')
  p.textContent = body
  p.style.cssText = 'color:#474d6b;margin-top:2px;white-space:pre-line'
  const tag = document.createElement('div')
  tag.textContent = 'Pop-up (Web-Vorschau)'
  tag.style.cssText = 'font-size:11px;color:#8086a3;margin-bottom:2px'
  el.append(tag, t, p)
  host.appendChild(el)
  setTimeout(() => el.remove(), 7000)
}

// ---------- Simulierte Testkonten ----------

const ME = 'test.nils@outlook.de'
const day = (d: number, h: number, m = 0) => {
  const x = new Date()
  x.setDate(x.getDate() + d)
  x.setHours(h, m, 0, 0)
  return x.toISOString()
}
function outlookMails(): Email[] {
  const mk = (id: string, name: string, email: string, subject: string, body: string, d: number, h: number, extra: Partial<Email> = {}): Email => ({
    id: `o-${id}`,
    remoteId: id,
    threadId: `o-c${id}`,
    remoteThreadId: `c${id}`,
    from: { name, email },
    to: [{ name: 'Nils', email: ME }],
    subject,
    date: day(d, h),
    body,
    read: false,
    important: true,
    needsReply: false,
    replied: false,
    folder: 'inbox',
    source: 'outlook',
    ...extra
  })
  return [
    mk('w1', 'Frau Becker', 'becker@hausverwaltung.de', 'Wohnungsübergabe', 'Guten Tag Herr Sell,\n\npasst Ihnen Donnerstag um 17 Uhr für die Übergabe? Bitte kurz bestätigen.\n\nViele Grüße\nBecker', 0, 7, { needsReply: true }),
    mk('w2', 'Prof. Weber', 'weber@uni.example.de', 'Abgabe Seminararbeit', 'Sehr geehrte Studierende,\n\ndie Seminararbeit muss bis spätestens 24.11. abgegeben werden.\n\nMit freundlichen Grüßen\nProf. Weber', -1, 9),
    mk('w3', 'Tutor Jonas', 'tutor@uni.example.de', 'Tutorium Mathe', 'Hallo zusammen,\n\ndas Tutorium ist ab jetzt jeden Dienstag um 16 Uhr in Raum A 104.\n\nViele Grüße', -1, 15, { important: false }),
    mk('w4', 'Reisebüro', 'service@reise.example.de', 'Ihre Buchung', 'Vielen Dank für Ihre Buchung.\nBuchungsnummer: RB-48213\nTreffpunkt: Hauptbahnhof, Gleis 5\nGesamtbetrag: 129,00 €', -2, 10, { important: false, hasAttachments: true })
  ]
}
function outlookEvents(): CalEvent[] {
  return [
    { id: 'o-e1', remoteId: 'e1', title: 'Sprechstunde Prof. Weber', start: day(1, 10), end: day(1, 10, 30), attendees: [], location: 'Raum B 2.14', source: 'outlook', reminderMinutes: 15 },
    { id: 'o-e2', remoteId: 'e2', title: 'Werkstudenten-Meeting', start: day(2, 14), end: day(2, 15), attendees: [{ name: 'Lea', email: 'lea@firma.example.de' }], location: 'Teams', source: 'outlook', organizer: { name: 'Lea', email: 'lea@firma.example.de' }, readOnly: true }
  ]
}
const icloudCals = [
  { id: 'web-cal-privat', name: 'Privat', color: '#34c759', enabled: true },
  { id: 'web-cal-uni', name: 'Uni', color: '#ff9500', enabled: true }
]
function icloudEvents(enabled: string[]): CalEvent[] {
  const all: CalEvent[] = [
    { id: 'ic-1', remoteId: 'web-cal-privat/1.ics', calendarId: 'web-cal-privat', calendarName: 'Privat', title: 'Laufen', start: day(1, 7), end: day(1, 8), attendees: [], source: 'icloud' },
    { id: 'ic-2', remoteId: 'web-cal-uni/2.ics', calendarId: 'web-cal-uni', calendarName: 'Uni', title: 'Klausur Statistik', start: day(4, 10), end: day(4, 12), attendees: [], location: 'Hörsaal 3', source: 'icloud', reminderMinutes: 60 }
  ]
  return all.filter((e) => enabled.includes(e.calendarId!))
}

let ms: MicrosoftStatus = read<MicrosoftStatus>(K.ms) ?? { clientConfigured: true, builtInClient: true, connected: false, expired: false, caps: { notes: false, mail: false, calendar: false, sync: false } }
let ic: ICloudStatus = read<ICloudStatus>(K.ic) ?? { connected: false, calendars: [] }
const google: GoogleStatus = { clientConfigured: false, connected: false, expired: false, encrypted: true, caps: { calendarRead: false, calendarWrite: false, gmailRead: false, gmailWrite: false } }
const cloud: CloudStatus = { available: false, enabled: false, syncing: false, devices: [], deviceName: 'Web-Vorschau' }
const ok = <T>(value: T) => ({ ok: true as const, value })
const wikiFetch = async (url: string) => {
  const res = await fetch(url, { headers: { 'Api-User-Agent': WIKI_AGENT } })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}
// Testhaken für die Oberflächen-Tests (nur Web-Vorschau)
;(globalThis as unknown as { __tagwerkShareSim: typeof shareSimHooks }).__tagwerkShareSim = shareSimHooks
/** Simulierte Konten antworten wie im echten Netz mit kurzer Verzögerung */
const net = () => new Promise((r) => setTimeout(r, 600))

export const webApi: TagwerkApi = {
  platform: { platform: 'win32', version: 'web' },
  data: {
    load: async () => read<AppData>(K.data),
    save: async (d) => write(K.data, d),
    exportJson: async () => {
      const blob = new Blob([JSON.stringify(read(K.data), null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `tagwerk-web-export-${nowIso().slice(0, 10)}.json`
      a.click()
      return { ok: true, path: a.download }
    },
    wipe: async () => {
      for (const k of Object.values(K)) localStorage.removeItem(k)
      location.reload()
    },
    onExternalNote: noop
  },
  settings: {
    get: async () => settings,
    set: async (patch) => {
      settings = complete(merge(settings, patch))
      write(K.settings, settings)
      return settings
    }
  },
  claude: {
    status: async () => ({ configured: false, encrypted: true }),
    setKey: async () => ({ ok: false, error: 'In der Web-Vorschau nicht verfügbar.' }),
    clearKey: async () => {},
    send: async () => ({ ok: false, error: 'In der Web-Vorschau nicht verfügbar.', code: 'no-key' })
  },
  ics: { import: async () => ({ ok: false, error: 'Kalenderdateien importierst du in der installierten App.' }) },
  google: {
    status: async () => google,
    setClient: async () => ({ ok: false, error: 'Gmail lässt sich in der Web-Vorschau nicht verbinden.' }),
    importClientFile: async () => ({ ok: false, error: 'Gmail lässt sich in der Web-Vorschau nicht verbinden.' }),
    clearClient: async () => {},
    connect: async () => ({ ok: false, error: 'Gmail lässt sich in der Web-Vorschau nicht verbinden – teste mit dem simulierten Outlook-Konto.', status: google }),
    cancelConnect: async () => {},
    disconnect: async () => google,
    sync: async () => ({ ok: false, syncedAt: nowIso(), errors: { general: 'nicht verbunden' }, status: google }),
    onChanged: noop,
    createEvent: async () => notHere,
    updateEvent: async () => notHere,
    deleteEvent: async () => notHere,
    modifyThread: async () => notHere,
    trashThread: async () => notHere,
    send: async () => notHere
  },
  microsoft: {
    status: async () => ms,
    setClient: async () => ({ ok: true }),
    clearClient: async () => {},
    connect: async (o) => {
      await new Promise((r) => setTimeout(r, 600))
      ms = { ...ms, connected: true, email: ME, caps: { notes: false, mail: !!o.mail, calendar: !!o.calendar, sync: false, share: !!o.share } }
      write(K.ms, ms)
      toastPopup('Simuliertes Testkonto verbunden', 'In der Web-Vorschau wird kein echtes Microsoft-Konto verbunden. OneNote und Cloud-Speicher gibt es nur in der App.')
      return { ok: true, status: ms }
    },
    cancelConnect: async () => {},
    disconnect: async () => {
      ms = { ...ms, connected: false, email: undefined, caps: { notes: false, mail: false, calendar: false, sync: false } }
      write(K.ms, ms)
      return ms
    },
    sync: async (o) => ({
      ok: true,
      syncedAt: nowIso(),
      emails: ms.caps.mail && o?.only !== 'calendar' ? outlookMails() : undefined,
      events: ms.caps.calendar && o?.only !== 'mail' ? outlookEvents() : undefined,
      errors: {}
    }),
    mailAction: async () => ok(null),
    reply: async () => {
      toastPopup('Antwort (simuliert)', 'In der Web-Vorschau wird nichts verschickt.')
      return ok(null)
    },
    createEvent: async (ev) => (await net(), ok({ ...ev, id: `o-${crypto.randomUUID()}`, source: 'outlook' as const })),
    updateEvent: async (ev) => ok(ev),
    deleteEvent: async () => ok(null),
    onChanged: noop,
    sections: async () => notHere,
    pages: async () => notHere,
    pageText: async () => notHere,
    savePage: async () => notHere,
    open: async () => {}
  },
  icloud: {
    status: async () => ic,
    connect: async () => {
      await new Promise((r) => setTimeout(r, 500))
      ic = { connected: true, appleId: 'test@icloud.com', calendars: icloudCals, defaultCalendarId: 'web-cal-privat' }
      write(K.ic, ic)
      return { ok: true, status: ic }
    },
    disconnect: async () => {
      ic = { connected: false, calendars: [] }
      write(K.ic, ic)
      return ic
    },
    setCalendars: async (ids, def) => {
      ic = { ...ic, calendars: ic.calendars.map((c) => ({ ...c, enabled: ids.includes(c.id) })), defaultCalendarId: def ?? ic.defaultCalendarId }
      write(K.ic, ic)
      return ic
    },
    sync: async () => ({ ok: true, syncedAt: nowIso(), events: ic.connected ? icloudEvents(ic.calendars.filter((c) => c.enabled).map((c) => c.id)) : [] }),
    createEvent: async (ev, cal) => {
      await net()
      const c = ic.calendars.find((x) => x.id === (cal ?? ic.defaultCalendarId))
      return ok({ ...ev, id: `ic-${crypto.randomUUID()}`, source: 'icloud' as const, calendarId: c?.id, calendarName: c?.name, remoteId: `${c?.id}/x.ics` })
    },
    updateEvent: async (ev) => ok(ev),
    deleteEvent: async () => ok(null),
    onChanged: noop
  },
  // Andocken gibt es nur in der installierten App
  dock: { onState: noop, setHold: () => {} },
  cloud: {
    status: async () => cloud,
    setEnabled: async () => cloud,
    syncNow: async () => cloud,
    ack: async () => {},
    onStatus: noop,
    onPatch: noop,
    onSettings: noop
  },
  weather: {
    get: async (city) => {
      try {
        const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&name=${encodeURIComponent(city)}`)).json()
        const r = g.results?.[0]
        if (!r) return { ok: false, error: 'Ort nicht gefunden' }
        const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${r.latitude}&longitude=${r.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`)).json()
        return { ok: true, city: r.name, temperature: w.current?.temperature_2m, code: w.current?.weather_code, max: w.daily?.temperature_2m_max?.[0], min: w.daily?.temperature_2m_min?.[0], precipitation: w.daily?.precipitation_probability_max?.[0] }
      } catch {
        return { ok: false, error: 'Wetter nicht erreichbar' }
      }
    }
  },
  // Rezepte kommen auch in der Vorschau echt aus dem Wikibooks-Kochbuch (die API erlaubt Abrufe aus dem Browser)
  recipes: {
    search: (q) => searchWikibooks(wikiFetch, q),
    get: (page) => getWikibooksRecipe(wikiFetch, page)
  },
  shopping: shareSim,
  app: {
    notify: async (req) => {
      toastPopup(req.title, [req.body, ...(req.lines ?? [])].filter(Boolean).join('\n'))
      return { shown: true }
    },
    onNavigate: noop,
    onOpen: noop,
    onCommand: noop
  },
  popup: { onItems: noop, ready: () => {}, size: () => {}, action: () => {} },
  updates: {
    status: async () => ({ state: 'dev', current: 'Web-Vorschau' }),
    check: async () => ({ state: 'dev', current: 'Web-Vorschau' }),
    install: () => {},
    onStatus: noop
  },
  focus: { signal: () => {}, onAction: noop },
  quickNote: { save: async () => {}, close: () => {} }
}
