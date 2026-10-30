// Reine Umwandlungen zwischen Google-API-Objekten und Tagwerk-Datensätzen.
// Keine Electron-Abhängigkeiten – direkt testbar.

import type { CalEvent, Email, Person } from '../shared/types.ts'

// ---------- Kalender ----------

export interface GEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  attendees?: { email: string; displayName?: string; self?: boolean; resource?: boolean; responseStatus?: string }[]
  organizer?: { email?: string; displayName?: string; self?: boolean }
  guestsCanModify?: boolean
  extendedProperties?: { private?: Record<string, string> }
}

function localMidnight(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toISOString()
}

function ymdLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function mapGoogleEvent(e: GEvent, canWrite: boolean): CalEvent | null {
  if (e.status === 'cancelled' || !e.start || !e.end) return null
  const allDay = !!e.start.date
  const start = allDay ? localMidnight(e.start.date!) : new Date(e.start.dateTime!).toISOString()
  const end = allDay ? localMidnight(e.end.date!) : new Date(e.end.dateTime!).toISOString()
  const foreign = !!e.organizer && !e.organizer.self
  return {
    id: `g-${e.id}`,
    remoteId: e.id,
    title: e.summary?.trim() || '(Ohne Titel)',
    start,
    end,
    allDay: allDay || undefined,
    location: e.location || undefined,
    notes: e.description ? htmlToText(e.description).slice(0, 4000) : undefined,
    attendees: (e.attendees ?? [])
      .filter((a) => !a.self && !a.resource && a.responseStatus !== 'declined')
      .slice(0, 50)
      .map((a) => ({ name: a.displayName || a.email.split('@')[0], email: a.email })),
    organizer: foreign ? { name: e.organizer!.displayName || (e.organizer!.email ?? '').split('@')[0], email: e.organizer!.email ?? '' } : undefined,
    webLink: e.htmlLink,
    source: 'google',
    readOnly: !canWrite || (foreign && !e.guestsCanModify) || undefined,
    taskId: e.extendedProperties?.private?.tagwerkTaskId || undefined
  }
}

/** Tagwerk-Termin → Google-Event-Body. Teilnehmende nur bei neuen Terminen. */
export function toGoogleEvent(ev: CalEvent, opts: { includeAttendees: boolean }): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: ev.title,
    location: ev.location ?? '',
    description: ev.notes ?? ''
  }
  if (ev.allDay) {
    const s = ymdLocal(ev.start)
    let e = ymdLocal(ev.end)
    if (e <= s) {
      const d = new Date(ev.start)
      d.setDate(d.getDate() + 1)
      e = ymdLocal(d.toISOString())
    }
    body.start = { date: s }
    body.end = { date: e }
  } else {
    body.start = { dateTime: ev.start }
    body.end = { dateTime: ev.end }
  }
  if (ev.taskId) body.extendedProperties = { private: { tagwerkTaskId: ev.taskId } }
  if (opts.includeAttendees) body.attendees = ev.attendees.filter((a) => /@/.test(a.email)).map((a) => ({ email: a.email, displayName: a.name }))
  return body
}

// ---------- Gmail ----------

export interface GPart {
  mimeType?: string
  filename?: string
  headers?: { name: string; value: string }[]
  body?: { data?: string; size?: number }
  parts?: GPart[]
}

export interface GMessage {
  id: string
  threadId: string
  labelIds?: string[]
  internalDate?: string
  snippet?: string
  payload?: GPart
}

export interface GThread {
  id: string
  historyId?: string
  messages?: GMessage[]
}

export function header(p: GPart | undefined, name: string): string | undefined {
  const n = name.toLowerCase()
  return p?.headers?.find((h) => h.name.toLowerCase() === n)?.value
}

/** „Name <a@b.de>, "Nachname, Vorname" <c@d.de>, e@f.de“ → Personen */
export function parseAddressList(s: string | undefined): Person[] {
  if (!s) return []
  const out: Person[] = []
  let cur = ''
  let quoted = false
  let angle = 0
  for (const ch of s) {
    if (ch === '"') quoted = !quoted
    if (!quoted && ch === '<') angle++
    if (!quoted && ch === '>') angle = Math.max(0, angle - 1)
    if (ch === ',' && !quoted && angle === 0) {
      push(cur)
      cur = ''
    } else cur += ch
  }
  push(cur)
  return out

  function push(raw: string) {
    const t = raw.trim()
    if (!t) return
    const m = t.match(/^(.*?)\s*<([^>]+)>\s*$/)
    if (m) {
      const name = m[1].trim().replace(/^"|"$/g, '').replace(/\\"/g, '"')
      out.push({ name: name || m[2].split('@')[0], email: m[2].trim() })
    } else if (t.includes('@')) out.push({ name: t.split('@')[0], email: t })
  }
}

export function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

export function encodeB64Url(s: string | Buffer): string {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', euro: '€', ndash: '–', mdash: '—', hellip: '…' }

export function htmlToText(html: string): string {
  if (!/<[a-z!/][^>]*>/i.test(html) && !/&[a-z#0-9]+;/i.test(html)) return html.trim()
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Entfernt zitierten Verlauf („Am … schrieb …:“, „On … wrote:“, „>“-Zeilen). */
export function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const intro = /^\s*(Am|On)\s.{4,200}(schrieb|wrote)\b[^\n]{0,80}:\s*$/i
    // Gmail bricht die Einleitungszeile oft um: „Am … um 10:00 schrieb Max“ / „Mustermann <…>:“
    if (intro.test(l) || (/^\s*(Am|On)\s/.test(l) && intro.test(`${l} ${lines[i + 1] ?? ''}`) && /:\s*$/.test(lines[i + 1] ?? ''))) break
    if (/^-{2,}\s*(Original Message|Ursprüngliche Nachricht)\s*-{2,}/i.test(l)) break
    if (/^\s*>/.test(l)) continue
    out.push(l)
  }
  const res = out.join('\n').trim()
  return res || text.trim()
}

function findPart(p: GPart | undefined, mime: string): GPart | undefined {
  if (!p) return
  if (p.mimeType === mime && p.body?.data && !p.filename) return p
  for (const c of p.parts ?? []) {
    const f = findPart(c, mime)
    if (f) return f
  }
}

export function messageBody(m: GMessage): string {
  const plain = findPart(m.payload, 'text/plain')
  if (plain?.body?.data) return stripQuoted(decodeB64Url(plain.body.data)).slice(0, 20000)
  const html = findPart(m.payload, 'text/html')
  if (html?.body?.data) return stripQuoted(htmlToText(decodeB64Url(html.body.data))).slice(0, 20000)
  return (m.snippet ?? '').slice(0, 2000)
}

const ASKS = /\?|\b(bitte|kannst du|könntest du|können sie|könnten sie|würdest du|würden sie|bestätig|rückmeldung|melde dich|gib mir bescheid|sag mir bescheid|lass mich wissen|antworte|please|could you|can you|let me know|confirm)/i

/** Erwartet die Nachricht eine Reaktion? (Frage oder Bitte im eigenen, nicht zitierten Text) */
export function asksForReply(body: string): boolean {
  return ASKS.test(body.slice(0, 3000))
}

const NOREPLY = /(no-?reply|do-?not-?reply|notifications?|mailer-daemon|newsletter|news@|info@|noreply)/i

/** Gmail-Thread → Tagwerk-E-Mails. „Antwort erwartet“ wird heuristisch bestimmt. */
export function mapGoogleThread(t: GThread, me: string): Email[] {
  const myMail = me.toLowerCase()
  const msgs = [...(t.messages ?? [])].sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0))
  return msgs.map((m, i) => {
    const labels = m.labelIds ?? []
    const from = parseAddressList(header(m.payload, 'From'))[0] ?? { name: 'Unbekannt', email: '' }
    const to = parseAddressList(header(m.payload, 'To'))
    const fromMe = from.email.toLowerCase() === myMail || labels.includes('SENT')
    const later = msgs.slice(i + 1)
    const repliedByMe = later.some((x) => (x.labelIds ?? []).includes('SENT') || (parseAddressList(header(x.payload, 'From'))[0]?.email ?? '').toLowerCase() === myMail)
    const bulk = !!header(m.payload, 'List-Unsubscribe') || /bulk|list/i.test(header(m.payload, 'Precedence') ?? '') || NOREPLY.test(from.email)
    const addressedToMe = to.some((p) => p.email.toLowerCase() === myMail)
    const inInbox = labels.includes('INBOX')
    const body = messageBody(m)
    return {
      id: `g-${m.id}`,
      remoteId: m.id,
      threadId: `g-${t.id}`,
      remoteThreadId: t.id,
      from: fromMe ? { name: 'Ich', email: from.email || me } : from,
      to,
      subject: header(m.payload, 'Subject') || '(Kein Betreff)',
      date: new Date(Number(m.internalDate ?? Date.now())).toISOString(),
      body,
      read: !labels.includes('UNREAD'),
      starred: labels.includes('STARRED'),
      important: labels.includes('IMPORTANT') && !bulk,
      needsReply: !fromMe && !bulk && addressedToMe && inInbox && asksForReply(body),
      replied: repliedByMe,
      folder: fromMe ? 'sent' : inInbox ? 'inbox' : 'archive',
      rfcMessageId: header(m.payload, 'Message-ID') || header(m.payload, 'Message-Id'),
      references: header(m.payload, 'References'),
      source: 'google'
    } satisfies Email
  })
}

function encodeWord(s: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

function formatAddress(p: Person): string {
  if (!p.name || p.name === p.email) return p.email
  const n = /^[\x20-\x7e]*$/.test(p.name) ? `"${p.name.replace(/"/g, '\\"')}"` : encodeWord(p.name)
  return `${n} <${p.email}>`
}

/** Baut eine RFC-5322-Antwort (UTF-8, base64) mit korrekter Thread-Verkettung. */
export function buildReplyMime(p: { from: string; to: Person[]; subject: string; body: string; inReplyTo?: string; references?: string }): string {
  const subject = /^(re|aw):/i.test(p.subject.trim()) ? p.subject.trim() : `Re: ${p.subject.trim()}`
  const refs = [p.references, p.inReplyTo].filter(Boolean).join(' ').trim()
  const b64 = Buffer.from(p.body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n')
  const headers = [
    `From: ${p.from}`,
    `To: ${p.to.map(formatAddress).join(', ')}`,
    `Subject: ${encodeWord(subject)}`,
    ...(p.inReplyTo ? [`In-Reply-To: ${p.inReplyTo}`] : []),
    ...(refs ? [`References: ${refs}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64'
  ]
  return `${headers.join('\r\n')}\r\n\r\n${b64}`
}
