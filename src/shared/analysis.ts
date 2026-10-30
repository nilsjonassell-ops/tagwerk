// Reine Logik ohne UI- oder Electron-Abhängigkeiten: Konflikte, freie Zeit,
// Fälligkeiten, Wiederholungen, Tagesbriefing und Aufgaben-Erkennung.

import type { AppData, CalEvent, Email, FocusEntry, Note, Priority, Recurrence, Task } from './types.ts'

const MIN = 60_000

export function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Termine, die den gegebenen Tag berühren, nach Beginn sortiert. */
export function eventsOnDay(events: CalEvent[], day: Date): CalEvent[] {
  const s = startOfDay(day).getTime()
  const e = s + 24 * 60 * MIN
  return events
    .filter((ev) => new Date(ev.start).getTime() < e && new Date(ev.end).getTime() > s)
    .sort((a, b) => a.start.localeCompare(b.start))
}

export interface Conflict {
  kind: 'overlap' | 'tight'
  a: CalEvent
  b: CalEvent
  /** bei 'tight': Minuten zwischen Ende a und Beginn b */
  gapMinutes?: number
}

/**
 * Erkennt Überschneidungen und zu knappe Übergänge an einem Tag.
 * Knapp = Lücke kleiner als der Puffer UND unterschiedliche Orte
 * (oder Puffer 0 Minuten bei direkt anschließenden Terminen an verschiedenen Orten).
 */
export function findConflicts(dayEvents: CalEvent[], bufferMinutes: number): Conflict[] {
  const timed = dayEvents.filter((e) => !e.allDay).sort((a, b) => a.start.localeCompare(b.start))
  const out: Conflict[] = []
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i]
      const b = timed[j]
      const aEnd = new Date(a.end).getTime()
      const bStart = new Date(b.start).getTime()
      if (bStart < aEnd) {
        out.push({ kind: 'overlap', a, b })
      } else if (j === i + 1) {
        const gap = Math.round((bStart - aEnd) / MIN)
        const differentPlace = normPlace(a.location) !== normPlace(b.location)
        if (gap < bufferMinutes && differentPlace && (a.location || b.location)) {
          out.push({ kind: 'tight', a, b, gapMinutes: gap })
        }
      }
    }
  }
  return out
}

function normPlace(p?: string): string {
  const s = (p ?? '').trim().toLowerCase()
  if (!s || /^(online|teams|zoom|meet|google meet|video)/.test(s)) return 'online'
  return s
}

export function eventHasConflict(ev: CalEvent, conflicts: Conflict[]): Conflict | undefined {
  return conflicts.find((c) => c.a.id === ev.id || c.b.id === ev.id)
}

export interface FreeBlock {
  start: Date
  end: Date
  minutes: number
}

/** Freie Blöcke innerhalb der Arbeitszeit, optional ab einem Zeitpunkt (z. B. jetzt). */
export function freeBlocks(
  dayEvents: CalEvent[],
  day: Date,
  workHours: { start: number; end: number },
  minMinutes: number,
  from?: Date
): FreeBlock[] {
  const base = startOfDay(day)
  let cursor = new Date(base.getTime() + workHours.start * 60 * MIN)
  const endOfWork = new Date(base.getTime() + workHours.end * 60 * MIN)
  if (from && from > cursor) cursor = roundUp(from, 15)
  const busy = dayEvents
    .filter((e) => !e.allDay)
    .map((e) => ({ s: new Date(e.start), e: new Date(e.end) }))
    .sort((a, b) => a.s.getTime() - b.s.getTime())
  const out: FreeBlock[] = []
  for (const b of busy) {
    if (b.e <= cursor) continue
    if (b.s > cursor) {
      const end = b.s < endOfWork ? b.s : endOfWork
      pushBlock(out, cursor, end, minMinutes)
    }
    if (b.e > cursor) cursor = b.e
    if (cursor >= endOfWork) break
  }
  if (cursor < endOfWork) pushBlock(out, cursor, endOfWork, minMinutes)
  return out
}

function pushBlock(out: FreeBlock[], s: Date, e: Date, min: number) {
  const minutes = Math.round((e.getTime() - s.getTime()) / MIN)
  if (minutes >= min) out.push({ start: new Date(s), end: new Date(e), minutes })
}

function roundUp(d: Date, step: number): Date {
  const ms = step * MIN
  return new Date(Math.ceil(d.getTime() / ms) * ms)
}

/** Gebuchte Stunden innerhalb der Arbeitszeit – für „übervoller Tag“. */
export function bookedMinutes(dayEvents: CalEvent[]): number {
  return dayEvents
    .filter((e) => !e.allDay)
    .reduce((sum, e) => sum + (new Date(e.end).getTime() - new Date(e.start).getTime()) / MIN, 0)
}

// ---- Aufgaben ----

export function isActive(t: Task): boolean {
  return t.status !== 'done' && !t.archived
}

export function isOverdue(t: Task, today: Date): boolean {
  return isActive(t) && !!t.due && t.due < ymd(today)
}

export function isDueToday(t: Task, today: Date): boolean {
  return isActive(t) && t.due === ymd(today)
}

const PRIO_RANK = { high: 0, medium: 1, low: 2 } as const

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const ad = a.due ?? '9999-99-99'
    const bd = b.due ?? '9999-99-99'
    if (ad !== bd) return ad.localeCompare(bd)
    return PRIO_RANK[a.priority] - PRIO_RANK[b.priority]
  })
}

/** Nächstes Fälligkeitsdatum einer wiederkehrenden Aufgabe. */
export function nextDue(due: string, rec: Recurrence): string | undefined {
  if (rec === 'none') return undefined
  const d = parseYmd(due)
  switch (rec) {
    case 'daily':
      return ymd(addDays(d, 1))
    case 'weekdays': {
      let n = addDays(d, 1)
      while (n.getDay() === 0 || n.getDay() === 6) n = addDays(n, 1)
      return ymd(n)
    }
    case 'weekly':
      return ymd(addDays(d, 7))
    case 'monthly': {
      const day = d.getDate()
      const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()
      n.setDate(Math.min(day, last))
      return ymd(n)
    }
  }
}

// ---- E-Mail ----

export interface Thread {
  id: string
  subject: string
  messages: Email[]
  latest: Email
  unread: boolean
  important: boolean
  needsReply: boolean
  participants: string[]
  projectId?: string
  folder: Email['folder']
}

export function groupThreads(emails: Email[]): Thread[] {
  const map = new Map<string, Email[]>()
  for (const e of emails) {
    const arr = map.get(e.threadId) ?? []
    arr.push(e)
    map.set(e.threadId, arr)
  }
  const threads: Thread[] = []
  for (const [id, msgs] of map) {
    msgs.sort((a, b) => a.date.localeCompare(b.date))
    const latest = msgs[msgs.length - 1]
    const inbound = msgs.filter((m) => m.folder !== 'sent')
    threads.push({
      id,
      subject: msgs[0].subject.replace(/^(re|aw|fwd|wg):\s*/i, ''),
      messages: msgs,
      latest,
      unread: msgs.some((m) => !m.read),
      important: msgs.some((m) => m.important),
      needsReply: inbound.length > 0 && inbound[inbound.length - 1].needsReply && !inbound[inbound.length - 1].replied,
      participants: [...new Set(msgs.map((m) => m.from.name))],
      projectId: msgs.find((m) => m.projectId)?.projectId,
      folder: inbound.length ? inbound[inbound.length - 1].folder : latest.folder
    })
  }
  return threads.sort((a, b) => b.latest.date.localeCompare(a.latest.date))
}

// ---- Tagesbriefing ----

export interface BriefItem {
  tone: 'alert' | 'attention' | 'info'
  text: string
  target?: { view: string; id?: string }
}

/** Regelbasiertes „Das Wichtigste heute“ – ohne KI, vollständig nachvollziehbar. */
export function buildBrief(
  data: AppData,
  now: Date,
  opts: { workHours: { start: number; end: number }; bufferMinutes: number; focusMinMinutes: number }
): BriefItem[] {
  const items: BriefItem[] = []
  const today = eventsOnDay(data.events, now)
  const conflicts = findConflicts(today, opts.bufferMinutes)
  for (const c of conflicts) {
    if (c.kind === 'overlap') {
      items.push({
        tone: 'alert',
        text: `„${c.a.title}“ überschneidet sich mit „${c.b.title}“ (${hm(c.b.start)} Uhr).`,
        target: { view: 'calendar', id: c.b.id }
      })
    } else {
      items.push({
        tone: 'attention',
        text: `Nur ${c.gapMinutes} Min. zwischen „${c.a.title}“ und „${c.b.title}“ – Ortswechsel einplanen.`,
        target: { view: 'calendar', id: c.b.id }
      })
    }
  }
  const overdue = data.tasks.filter((t) => isOverdue(t, now))
  if (overdue.length) {
    items.push({
      tone: 'alert',
      text: overdue.length === 1 ? `„${overdue[0].title}“ ist überfällig.` : `${overdue.length} Aufgaben sind überfällig.`,
      target: { view: 'tasks' }
    })
  }
  const dueHigh = data.tasks.filter((t) => isDueToday(t, now) && t.priority === 'high')
  for (const t of dueHigh.slice(0, 2)) {
    items.push({ tone: 'attention', text: `Heute fällig: „${t.title}“.`, target: { view: 'tasks', id: t.id } })
  }
  const threads = groupThreads(data.emails.filter((e) => e.folder === 'inbox'))
  const waiting = threads.filter((t) => t.important && t.needsReply)
  if (waiting.length) {
    items.push({
      tone: 'attention',
      text:
        waiting.length === 1
          ? `${waiting[0].latest.from.name} wartet auf deine Antwort zu „${waiting[0].subject}“.`
          : `${waiting.length} wichtige E-Mails warten auf eine Antwort.`,
      target: { view: 'inbox', id: waiting.length === 1 ? waiting[0].id : undefined }
    })
  }
  const booked = bookedMinutes(today)
  const workMinutes = (opts.workHours.end - opts.workHours.start) * 60
  if (booked > workMinutes * 0.75) {
    items.push({ tone: 'attention', text: `Volles Programm: ${Math.round(booked / 60)} Stunden in Terminen.` })
  }
  const free = freeBlocks(today, now, opts.workHours, opts.focusMinMinutes, now)
  if (free.length) {
    const f = free[0]
    items.push({
      tone: 'info',
      text: `Freie Zeit zum konzentrierten Arbeiten: ${hmDate(f.start)}–${hmDate(f.end)} Uhr.`,
      target: { view: 'calendar' }
    })
  }
  const next = today.find((e) => !e.allDay && new Date(e.start) > now)
  if (next) {
    items.push({
      tone: 'info',
      text: `Nächster Termin: „${next.title}“ um ${hm(next.start)} Uhr${next.location ? `, ${next.location}` : ''}.`,
      target: { view: 'calendar', id: next.id }
    })
  }
  const rank = { alert: 0, attention: 1, info: 2 }
  return items.map((it, i) => ({ it, i })).sort((a, b) => rank[a.it.tone] - rank[b.it.tone] || a.i - b.i).map((x) => x.it)
}

export function hm(iso: string): string {
  return hmDate(new Date(iso))
}

export function hmDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ---- Meeting-Vorbereitung ----

export function relatedToEvent(data: AppData, ev: CalEvent) {
  const emails = new Set(ev.attendees.map((a) => a.email.toLowerCase()))
  const words = keywords(ev.title)
  const mails = data.emails.filter(
    (m) =>
      (ev.projectId && m.projectId === ev.projectId) ||
      emails.has(m.from.email.toLowerCase()) ||
      words.some((w) => m.subject.toLowerCase().includes(w))
  )
  const notes = data.notes.filter(
    (n) => n.eventId === ev.id || (ev.projectId && n.projectId === ev.projectId)
  )
  const docs = data.docs.filter((d) => ev.projectId && d.projectId === ev.projectId)
  const tasks = data.tasks.filter((t) => isActive(t) && ev.projectId && t.projectId === ev.projectId)
  return { emails: groupThreads(mails).slice(0, 5), notes, docs, tasks }
}

const STOP = new Set(['und', 'mit', 'für', 'der', 'die', 'das', 'zum', 'zur', 'call', 'meeting', 'termin', 'sync', 'weekly', 'jour', 'fixe'])

function keywords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-zäöüß0-9]+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
}

// ---- Aufgaben aus Notizen ----

/**
 * Erkennt Aufgaben-Kandidaten in Notizen: Checkbox-Zeilen, „TODO:“, „Aufgabe:“
 * und Aufzählungspunkte im Abschnitt „Nächste Schritte“.
 */
export function extractTaskCandidates(note: Pick<Note, 'body' | 'nextSteps'>): string[] {
  const out: string[] = []
  const push = (s: string) => {
    const t = s.trim().replace(/[.;]$/, '')
    if (t.length > 2 && !out.includes(t)) out.push(t)
  }
  const lines = (note.body ?? '').split(/\r?\n/)
  let inNext = false
  for (const raw of lines) {
    const line = raw.trim()
    if (/^#*\s*(nächste schritte|next steps|to-?dos?)\s*:?$/i.test(line)) {
      inNext = true
      continue
    }
    if (/^#+\s/.test(line) || (line.endsWith(':') && !/^[-*•]/.test(line))) inNext = false
    let m = line.match(/^[-*•]?\s*\[ \]\s+(.+)/)
    if (m) {
      push(m[1])
      continue
    }
    m = line.match(/^(?:[-*•]\s*)?(?:todo|aufgabe|to-do)\s*:\s*(.+)/i)
    if (m) {
      push(m[1])
      continue
    }
    if (inNext) {
      m = line.match(/^[-*•]\s+(.+)/)
      if (m) push(m[1])
    }
  }
  for (const raw of (note.nextSteps ?? '').split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s*(\[ \]\s*)?/, '')
    if (line) push(line)
  }
  return out
}

// ---- Suche ----

export interface SearchHit {
  kind: 'task' | 'event' | 'email' | 'note' | 'project'
  id: string
  title: string
  detail: string
}

export function search(data: AppData, query: string, limit = 30): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const has = (...s: (string | undefined)[]) => s.some((x) => x?.toLowerCase().includes(q))
  const proj = (id?: string) => data.projects.find((p) => p.id === id)?.name
  const hits: SearchHit[] = []
  for (const p of data.projects) if (has(p.name, p.summary)) hits.push({ kind: 'project', id: p.id, title: p.name, detail: 'Projekt' })
  for (const t of data.tasks)
    if (!t.archived && has(t.title, t.notes, proj(t.projectId)))
      hits.push({ kind: 'task', id: t.id, title: t.title, detail: t.status === 'done' ? 'Aufgabe · erledigt' : `Aufgabe${t.due ? ` · fällig ${t.due}` : ''}` })
  for (const e of data.events)
    if (has(e.title, e.location, e.notes, ...e.attendees.map((a) => a.name), proj(e.projectId)))
      hits.push({ kind: 'event', id: e.id, title: e.title, detail: `Termin · ${new Date(e.start).toLocaleDateString('de-DE')}` })
  for (const th of groupThreads(data.emails))
    if (th.messages.some((m) => has(m.subject, m.from.name, m.from.email, m.body, proj(m.projectId))))
      hits.push({ kind: 'email', id: th.id, title: th.subject, detail: `E-Mail · ${th.latest.from.name}` })
  for (const n of data.notes)
    if (has(n.title, n.body, n.decisions, n.nextSteps, proj(n.projectId)))
      hits.push({ kind: 'note', id: n.id, title: n.title || 'Ohne Titel', detail: n.kind === 'meeting' ? 'Meetingnotiz' : 'Notiz' })
  return hits.slice(0, limit)
}

/** Entfernt archivierte Aufgaben und alten Chatverlauf gemäß Aufbewahrungsregeln. */
export function applyRetention(data: AppData, now: Date, archivedTasksDays: number, chatDays: number): AppData {
  const taskCut = archivedTasksDays > 0 ? now.getTime() - archivedTasksDays * 86400_000 : -Infinity
  const chatCut = chatDays > 0 ? now.getTime() - chatDays * 86400_000 : -Infinity
  return {
    ...data,
    tasks: data.tasks.filter((t) => !(t.archived && t.completedAt && new Date(t.completedAt).getTime() < taskCut)),
    chat: data.chat.filter((m) => new Date(m.createdAt).getTime() >= chatCut)
  }
}

// ---------- Aufgaben in freie Zeit einplanen (ohne KI) ----------

export interface PlanSlot {
  taskId: string
  start: Date
  end: Date
  /** Liegt nach dem Fälligkeitsdatum */
  late: boolean
}

export interface PlanOptions {
  workHours: { start: number; end: number }
  /** Arbeitstage, die durchsucht werden (inkl. heute) */
  days?: number
  /** Puffer nach jedem geplanten Block in Minuten */
  bufferMinutes?: number
  /** Dauer pro Aufgabe in Minuten (sonst nach Priorität) */
  durations?: Record<string, number>
  /** Höchstens so viele Aufgaben */
  limit?: number
}

export const DEFAULT_TASK_MINUTES: Record<Priority, number> = { high: 60, medium: 45, low: 30 }

/** Offene Aufgaben in sinnvoller Reihenfolge: überfällig → nach Fälligkeit → nach Priorität. */
export function planCandidates(tasks: Task[], events: CalEvent[], now: Date): Task[] {
  const planned = new Set(events.filter((e) => e.taskId && new Date(e.end) > now).map((e) => e.taskId))
  return tasks
    .filter((t) => t.status !== 'done' && !t.archived && !planned.has(t.id))
    .sort((a, b) => {
      const da = a.due ?? '9999-99-99'
      const db = b.due ?? '9999-99-99'
      if (da !== db) return da < db ? -1 : 1
      return PLAN_RANK[a.priority] - PLAN_RANK[b.priority]
    })
}

const PLAN_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

/** Verteilt Aufgaben der Reihe nach auf die erste passende Lücke in der Arbeitszeit. */
export function planTasks(tasks: Task[], events: CalEvent[], now: Date, opts: PlanOptions): PlanSlot[] {
  const horizon = opts.days ?? 5
  const buffer = opts.bufferMinutes ?? 10
  const limit = opts.limit ?? 10
  // Werktage ab heute sammeln
  const days: Date[] = []
  for (let d = startOfDay(now); days.length < horizon; d = addDays(d, 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(d)
  }
  // Bestehende Termine mit Puffer danach, damit kein Block direkt anschließt
  const busy: CalEvent[] = events
    .filter((e) => !e.allDay)
    .map((e) => ({ ...e, end: new Date(new Date(e.end).getTime() + buffer * MIN).toISOString() }))
  const out: PlanSlot[] = []
  for (const t of tasks) {
    if (out.length >= limit) break
    const minutes = opts.durations?.[t.id] ?? DEFAULT_TASK_MINUTES[t.priority]
    let placed: PlanSlot | null = null
    for (const day of days) {
      const onDay = eventsOnDay(busy, day)
      const from = ymd(day) === ymd(now) ? now : undefined
      const slot = freeBlocks(onDay, day, opts.workHours, minutes, from)[0]
      if (slot) {
        const start = slot.start
        const end = new Date(start.getTime() + minutes * MIN)
        placed = { taskId: t.id, start, end, late: !!t.due && ymd(start) > t.due }
        break
      }
    }
    if (!placed) continue
    out.push(placed)
    // Belegt den Block inkl. Puffer, damit die nächste Aufgabe dahinter landet
    busy.push({
      id: `plan-${t.id}`,
      title: '',
      start: placed.start.toISOString(),
      end: new Date(placed.end.getTime() + buffer * MIN).toISOString(),
      attendees: [],
      source: 'local'
    })
  }
  return out
}

// ---------- Fokus-Statistik ----------

export interface FocusStats {
  todayMinutes: number
  todaySessions: number
  weekMinutes: number
  /** Aufeinanderfolgende Tage (bis heute bzw. gestern) mit Fokuszeit */
  streak: number
  /** Minuten der letzten 7 Tage, ältester zuerst */
  last7: { day: string; minutes: number }[]
}

export function focusStats(log: FocusEntry[] | undefined, now: Date): FocusStats {
  const byDay = new Map<string, { m: number; n: number }>()
  for (const e of log ?? []) {
    const k = ymd(new Date(e.start))
    const v = byDay.get(k) ?? { m: 0, n: 0 }
    v.m += e.minutes
    v.n += 1
    byDay.set(k, v)
  }
  const today = ymd(now)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = ymd(addDays(startOfDay(now), i - 6))
    return { day: d, minutes: byDay.get(d)?.m ?? 0 }
  })
  let streak = 0
  let cursor = startOfDay(now)
  if (!byDay.has(today)) cursor = addDays(cursor, -1)
  while (byDay.has(ymd(cursor))) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return {
    todayMinutes: byDay.get(today)?.m ?? 0,
    todaySessions: byDay.get(today)?.n ?? 0,
    weekMinutes: last7.reduce((a, b) => a + b.minutes, 0),
    streak,
    last7
  }
}

// ---------- Benachrichtigungen ----------

const hhmmToMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Liegt die Uhrzeit in den Ruhezeiten (auch über Mitternacht, z. B. 22:00–07:00)? */
export function inQuietHours(now: Date, quiet: { enabled: boolean; from: string; to: string }): boolean {
  if (!quiet.enabled) return false
  const t = now.getHours() * 60 + now.getMinutes()
  const a = hhmmToMin(quiet.from)
  const b = hhmmToMin(quiet.to)
  if (a === b) return false
  return a < b ? t >= a && t < b : t >= a || t < b
}

/** Welche neu eingetroffenen Mails gemeldet werden sollen – je Unterhaltung die neueste. */
export function mailsToNotify(before: Email[], after: Email[], me: string | undefined, mode: 'off' | 'important' | 'all', vipSenders: string[]): Email[] {
  if (mode === 'off' || before.length === 0) return []
  const known = new Set(before.map((e) => e.remoteId ?? e.id))
  const vip = vipSenders.map((v) => v.trim().toLowerCase()).filter(Boolean)
  const isVip = (addr: string) => {
    const a = addr.toLowerCase()
    return vip.some((v) => (v.startsWith('@') ? a.endsWith(v) : a === v))
  }
  const fresh = after.filter((e) => !known.has(e.remoteId ?? e.id) && e.folder === 'inbox' && !e.read && e.from.email.toLowerCase() !== (me ?? '').toLowerCase())
  const relevant = mode === 'all' ? fresh : fresh.filter((e) => e.important || e.needsReply || isVip(e.from.email))
  const byThread = new Map<string, Email>()
  for (const e of [...relevant].sort((a, b) => b.date.localeCompare(a.date))) if (!byThread.has(e.threadId)) byThread.set(e.threadId, e)
  return [...byThread.values()]
}
