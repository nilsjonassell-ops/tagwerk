// Reine Hilfen für CalDAV (Apple iCloud Kalender): XML-Antworten lesen und
// Termine in iCalendar umwandeln. Keine Electron-Abhängigkeiten – direkt testbar.

import ICAL from 'ical.js'
import type { CalEvent, Person } from '../shared/types.ts'

export interface DavResponse {
  href: string
  props: Record<string, string>
  /** Rohinhalt einzelner Eigenschaften (für verschachtelte Werte wie resourcetype) */
  raw: Record<string, string>
  ok: boolean
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')

/** Liest eine WebDAV-Multistatus-Antwort – unabhängig davon, welche Namensraum-Präfixe der Server nutzt. */
export function parseMultistatus(xml: string): DavResponse[] {
  const out: DavResponse[] = []
  const responses = xml.match(/<(?:[\w-]+:)?response\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?response>/gi) ?? []
  for (const r of responses) {
    const href = decode((r.match(/<(?:[\w-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?href>/i)?.[1] ?? '').trim())
    const props: Record<string, string> = {}
    const raw: Record<string, string> = {}
    let ok = false
    const propstats = r.match(/<(?:[\w-]+:)?propstat\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?propstat>/gi) ?? []
    for (const ps of propstats) {
      const status = ps.match(/<(?:[\w-]+:)?status\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?status>/i)?.[1] ?? ''
      if (!/\s2\d\d\s/.test(` ${status} `)) continue
      ok = true
      const prop = ps.match(/<(?:[\w-]+:)?prop\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?prop>/i)?.[1] ?? ''
      // Kindelemente der Eigenschaftenliste einzeln herausziehen
      const re = /<([\w-]+:)?([\w-]+)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1?\2>)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(prop))) {
        const name = m[2].toLowerCase()
        const inner = m[3] ?? ''
        raw[name] = inner
        // Für einfache Werte: Text; für verschachtelte (z. B. href in calendar-home-set): innerer href
        const nestedHref = inner.match(/<(?:[\w-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?href>/i)?.[1]
        props[name] = decode((nestedHref ?? inner.replace(/<[^>]+>/g, '')).trim())
      }
    }
    out.push({ href, props, raw, ok })
  }
  return out
}

export const isCalendarCollection = (r: DavResponse) => /<(?:[\w-]+:)?calendar\b/i.test(r.raw.resourcetype ?? '')
export const supportsEvents = (r: DavResponse) => {
  const set = r.raw['supported-calendar-component-set']
  return !set || /name=["']VEVENT["']/i.test(set)
}

/** Löst eine (relative) href gegen die Basisadresse auf. */
export const absolute = (href: string, base: string) => new URL(href, base).toString()

// ---------- iCalendar ----------

export interface ICloudEventMeta {
  calendarId: string
  calendarName: string
  href: string
  etag?: string
}

/**
 * Eine Kalender-Ressource (.ics) → Tagwerk-Termine. Serien werden im Fenster
 * aufgelöst und sind schreibgeschützt (Serien bearbeitest du in Apple Kalender).
 */
export function icsToEvents(ics: string, meta: ICloudEventMeta, from: Date, to: Date): CalEvent[] {
  let comp: ICAL.Component
  try {
    comp = new ICAL.Component(ICAL.parse(ics))
  } catch {
    return []
  }
  const vevents = comp.getAllSubcomponents('vevent')
  const masters = vevents.filter((v) => !v.hasProperty('recurrence-id'))
  const exceptions = vevents.filter((v) => v.hasProperty('recurrence-id'))
  const out: CalEvent[] = []
  for (const ve of masters) {
    const event = new ICAL.Event(ve, { exceptions })
    const uid = event.uid || meta.href
    const allDay = event.startDate?.isDate ?? false
    const reminder = alarmMinutes(ve)
    const base = {
      title: event.summary || '(Ohne Titel)',
      location: event.location || undefined,
      notes: event.description ? String(event.description).slice(0, 4000) : undefined,
      attendees: attendees(ve),
      source: 'icloud' as const,
      remoteId: meta.href,
      etag: meta.etag,
      calendarId: meta.calendarId,
      calendarName: meta.calendarName,
      reminderMinutes: reminder
    }
    const toIso = (t: ICAL.Time) => (t.isDate ? new Date(t.year, t.month - 1, t.day).toISOString() : t.toJSDate().toISOString())
    if (event.isRecurring()) {
      const it = event.iterator()
      let next: ICAL.Time | null
      let guard = 0
      while ((next = it.next()) && guard++ < 1500) {
        const s = next.toJSDate()
        if (s > to) break
        const det = event.getOccurrenceDetails(next)
        const e = det.endDate.toJSDate()
        if (e < from) continue
        out.push({
          ...base,
          id: `ic-${uid}@${next.toString()}`,
          title: det.item.summary || base.title,
          location: det.item.location || base.location,
          start: toIso(det.startDate),
          end: toIso(det.endDate),
          allDay: allDay || undefined,
          readOnly: true
        })
      }
    } else if (event.startDate) {
      const end = event.endDate ?? event.startDate
      const s = event.startDate.toJSDate()
      const e = end.toJSDate()
      if (e < from || s > to) continue
      out.push({ ...base, id: `ic-${uid}`, start: toIso(event.startDate), end: toIso(end), allDay: allDay || undefined })
    }
  }
  return out
}

function attendees(ve: ICAL.Component): Person[] {
  return ve.getAllProperties('attendee').slice(0, 30).map((p) => {
    const mail = String(p.getFirstValue() ?? '').replace(/^mailto:/i, '')
    const cn = p.getParameter('cn')
    return { name: (typeof cn === 'string' && cn) || mail.split('@')[0], email: mail }
  })
}

/** Erste Erinnerung (VALARM, relativ zum Beginn) in Minuten. */
function alarmMinutes(ve: ICAL.Component): number | null | undefined {
  const alarms = ve.getAllSubcomponents('valarm')
  if (!alarms.length) return undefined
  for (const a of alarms) {
    const trig = a.getFirstPropertyValue('trigger')
    if (trig && typeof (trig as ICAL.Duration).toSeconds === 'function') {
      const sec = (trig as ICAL.Duration).toSeconds()
      if (sec <= 0) return Math.round(-sec / 60)
    }
  }
  return undefined
}

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
const dateOnly = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Faltet lange Zeilen nach RFC 5545 (75 Oktette). */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let cur = ''
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (parts.length ? 74 : 75)) {
      parts.push(cur)
      cur = ch
    } else cur += ch
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

/** Tagwerk-Termin → iCalendar-Ressource für Apple Kalender. */
export function eventToIcs(ev: CalEvent, uid: string, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tagwerk//Tagwerk Planer//DE', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp(now)}`]
  if (ev.allDay) {
    const s = new Date(ev.start)
    let e = new Date(ev.end)
    if (dateOnly(e) <= dateOnly(s)) e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1)
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(s)}`, `DTEND;VALUE=DATE:${dateOnly(e)}`)
  } else {
    lines.push(`DTSTART:${stamp(new Date(ev.start))}`, `DTEND:${stamp(new Date(ev.end))}`)
  }
  lines.push(`SUMMARY:${esc(ev.title || 'Termin')}`)
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`)
  if (ev.notes) lines.push(`DESCRIPTION:${esc(ev.notes)}`)
  if (typeof ev.reminderMinutes === 'number') {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title || 'Termin')}`, `TRIGGER:-PT${Math.max(0, ev.reminderMinutes)}M`, 'END:VALARM')
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
