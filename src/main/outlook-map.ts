// Reine Umwandlungen zwischen Outlook (Microsoft Graph: Mail + Kalender) und Tagwerk.
// Keine Electron-Abhängigkeiten – direkt testbar.

import type { CalEvent, Email, Person } from '../shared/types.ts'
import { asksForReply, htmlToText, stripQuoted } from './google-map.ts'

// ---------- Mail ----------

interface GAddr {
  emailAddress?: { name?: string; address?: string }
}

export interface OMessage {
  id: string
  conversationId?: string
  subject?: string
  bodyPreview?: string
  body?: { contentType?: string; content?: string }
  from?: GAddr
  sender?: GAddr
  toRecipients?: GAddr[]
  receivedDateTime?: string
  sentDateTime?: string
  isRead?: boolean
  importance?: string
  inferenceClassification?: string
  flag?: { flagStatus?: string }
  parentFolderId?: string
  internetMessageId?: string
  /** Von Tagwerk gesetzt: aus welchem Ordner geladen */
  _folder?: 'inbox' | 'sent' | 'archive'
}

const person = (a?: GAddr): Person => ({ name: a?.emailAddress?.name || a?.emailAddress?.address?.split('@')[0] || 'Unbekannt', email: a?.emailAddress?.address ?? '' })
const NOREPLY = /(no-?reply|do-?not-?reply|notifications?|mailer-daemon|newsletter|news@|noreply)/i

/** Outlook-Nachrichten (Posteingang + Gesendet) → Tagwerk-E-Mails, gruppiert über conversationId. */
export function mapOutlookMessages(list: OMessage[], me: string): Email[] {
  const my = me.toLowerCase()
  const byConv = new Map<string, OMessage[]>()
  for (const m of list) {
    const k = m.conversationId ?? m.id
    byConv.set(k, [...(byConv.get(k) ?? []), m])
  }
  const out: Email[] = []
  for (const [conv, msgs] of byConv) {
    msgs.sort((a, b) => (a.receivedDateTime ?? a.sentDateTime ?? '').localeCompare(b.receivedDateTime ?? b.sentDateTime ?? ''))
    msgs.forEach((m, i) => {
      const from = person(m.from ?? m.sender)
      const fromMe = m._folder === 'sent' || from.email.toLowerCase() === my
      const raw = m.body?.content ?? m.bodyPreview ?? ''
      const text = m.body?.contentType === 'html' ? htmlToText(raw) : raw.replace(/\r\n/g, '\n').trim()
      const body = stripQuoted(text)
      const later = msgs.slice(i + 1)
      const repliedByMe = later.some((x) => x._folder === 'sent' || person(x.from).email.toLowerCase() === my)
      const to = (m.toRecipients ?? []).map(person)
      const bulk = NOREPLY.test(from.email)
      out.push({
        id: `o-${m.id}`,
        remoteId: m.id,
        threadId: `o-${conv}`,
        remoteThreadId: conv,
        from: fromMe ? { name: 'Ich', email: from.email || me } : from,
        to,
        subject: m.subject?.trim() || '(Kein Betreff)',
        date: m.receivedDateTime ?? m.sentDateTime ?? new Date().toISOString(),
        body,
        read: m.isRead !== false,
        starred: m.flag?.flagStatus === 'flagged',
        important: !bulk && (m.importance === 'high' || m.inferenceClassification === 'focused'),
        needsReply: !fromMe && !bulk && m._folder === 'inbox' && to.some((p) => p.email.toLowerCase() === my) && asksForReply(body),
        replied: repliedByMe,
        folder: fromMe ? 'sent' : m._folder === 'archive' ? 'archive' : 'inbox',
        rfcMessageId: m.internetMessageId,
        source: 'outlook'
      })
    })
  }
  return out
}

// ---------- Kalender ----------

export interface OEvent {
  id: string
  subject?: string
  bodyPreview?: string
  body?: { contentType?: string; content?: string }
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  isAllDay?: boolean
  isCancelled?: boolean
  isOrganizer?: boolean
  location?: { displayName?: string }
  attendees?: (GAddr & { type?: string; status?: { response?: string } })[]
  organizer?: GAddr
  webLink?: string
  isReminderOn?: boolean
  reminderMinutesBeforeStart?: number
  showAs?: string
  type?: string
  seriesMasterId?: string
}

/** Graph liefert mit „Prefer: outlook.timezone="UTC"“ Zeiten ohne Zone – als UTC lesen. */
const utc = (s?: string) => (s ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`).toISOString() : '')

function localMidnight(isoUtc: string): string {
  // Ganztägig: Graph liefert 00:00 in der Kalenderzone – als lokales Datum übernehmen
  const d = isoUtc.slice(0, 10).split('-').map(Number)
  return new Date(d[0], d[1] - 1, d[2]).toISOString()
}

export function mapOutlookEvent(e: OEvent, me: string): CalEvent | null {
  if (e.isCancelled || !e.start?.dateTime || !e.end?.dateTime) return null
  const allDay = !!e.isAllDay
  const start = allDay ? localMidnight(e.start.dateTime) : utc(e.start.dateTime)
  const end = allDay ? localMidnight(e.end.dateTime) : utc(e.end.dateTime)
  const foreign = e.isOrganizer === false
  const notes = e.body?.content ? (e.body.contentType === 'html' ? htmlToText(e.body.content) : e.body.content).trim().slice(0, 4000) : undefined
  return {
    id: `o-${e.id}`,
    remoteId: e.id,
    title: e.subject?.trim() || '(Ohne Titel)',
    start,
    end,
    allDay: allDay || undefined,
    location: e.location?.displayName || undefined,
    notes: notes || undefined,
    attendees: (e.attendees ?? [])
      .filter((a) => a.emailAddress?.address?.toLowerCase() !== me.toLowerCase() && a.type !== 'resource' && a.status?.response !== 'declined')
      .slice(0, 50)
      .map(person),
    organizer: foreign ? person(e.organizer) : undefined,
    webLink: e.webLink,
    source: 'outlook',
    // Fremde Einladungen und einzelne Serientermine bearbeitest du in Outlook
    readOnly: foreign || e.type === 'occurrence' || e.type === 'exception' || undefined,
    reminderMinutes: e.isReminderOn === false ? null : typeof e.reminderMinutesBeforeStart === 'number' ? e.reminderMinutesBeforeStart : undefined
  }
}

/** Tagwerk-Termin → Graph-Event-Body. Teilnehmende nur bei neuen Terminen. */
export function toOutlookEvent(ev: CalEvent, opts: { includeAttendees: boolean; timeZone: string }): Record<string, unknown> {
  const body: Record<string, unknown> = {
    subject: ev.title,
    body: { contentType: 'text', content: ev.notes ?? '' },
    location: { displayName: ev.location ?? '' },
    isAllDay: !!ev.allDay
  }
  if (ev.allDay) {
    const day = (iso: string) => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00`
    }
    let endDay = day(ev.end)
    if (endDay <= day(ev.start)) {
      const n = new Date(ev.start)
      n.setDate(n.getDate() + 1)
      endDay = day(n.toISOString())
    }
    body.start = { dateTime: day(ev.start), timeZone: opts.timeZone }
    body.end = { dateTime: endDay, timeZone: opts.timeZone }
  } else {
    body.start = { dateTime: ev.start.replace(/Z$/, ''), timeZone: 'UTC' }
    body.end = { dateTime: ev.end.replace(/Z$/, ''), timeZone: 'UTC' }
  }
  if (ev.reminderMinutes === null) body.isReminderOn = false
  else if (typeof ev.reminderMinutes === 'number') {
    body.isReminderOn = true
    body.reminderMinutesBeforeStart = ev.reminderMinutes
  }
  if (opts.includeAttendees)
    body.attendees = ev.attendees.filter((a) => /@/.test(a.email)).map((a) => ({ emailAddress: { address: a.email, name: a.name }, type: 'required' }))
  return body
}
