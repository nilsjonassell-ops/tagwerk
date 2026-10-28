// Fachliche Aktionen. Alles, was Daten löscht, Nachrichten versendet oder
// wichtige Termine ändert, läuft über eine ausdrückliche Bestätigung.

import { nextDue, ymd } from '@shared/analysis'
import type { CalEvent, Email, Note, Proposal, Task } from '@shared/types'
import { confirm, confirmWithOption, uid, useStore } from './store'
import { fDayMed, fTime } from './format'

const S = () => useStore.getState()
const nowIso = () => new Date().toISOString()

// ---------- Aufgaben ----------

export function newTask(partial: Partial<Task> & { title: string }): Task {
  return {
    id: uid('t'),
    priority: 'medium',
    status: 'open',
    recurrence: 'none',
    createdAt: nowIso(),
    source: 'local',
    ...partial
  }
}

export function addTask(t: Task, toast = true) {
  S().mutate((d) => ({ ...d, tasks: [t, ...d.tasks] }), toast ? { toast: `Aufgabe „${short(t.title)}“ angelegt`, undoable: true } : undefined)
}

export function saveTask(t: Task) {
  S().mutate((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === t.id ? t : x)) }))
}

export function toggleTask(id: string) {
  const t = S().data.tasks.find((x) => x.id === id)
  if (!t) return
  if (t.status === 'done') {
    S().mutate((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === id ? { ...x, status: 'open', completedAt: undefined, archived: false } : x)) }))
    return
  }
  S().mutate(
    (d) => {
      const tasks = d.tasks.map((x) => (x.id === id ? { ...x, status: 'done' as const, completedAt: nowIso() } : x))
      const nd = t.recurrence !== 'none' ? nextDue(t.due ?? ymd(new Date()), t.recurrence) : undefined
      if (nd) tasks.unshift({ ...t, id: uid('t'), status: 'open', due: nd, createdAt: nowIso(), completedAt: undefined, source: 'local' })
      return { ...d, tasks }
    },
    { toast: t.recurrence !== 'none' ? `Erledigt – nächste Wiederholung angelegt` : `„${short(t.title)}“ erledigt`, undoable: true }
  )
}

export async function deleteTask(id: string) {
  const t = S().data.tasks.find((x) => x.id === id)
  if (!t) return false
  const ok = await confirm({
    title: 'Aufgabe löschen?',
    body: `„${t.title}“ wird gelöscht. Du kannst das direkt danach noch rückgängig machen.`,
    confirmLabel: 'Löschen',
    danger: true
  })
  if (!ok) return false
  S().mutate((d) => ({ ...d, tasks: d.tasks.filter((x) => x.id !== id) }), { toast: 'Aufgabe gelöscht', undoable: true })
  return true
}

export function archiveCompleted() {
  const n = S().data.tasks.filter((t) => t.status === 'done' && !t.archived).length
  if (!n) return
  S().mutate((d) => ({ ...d, tasks: d.tasks.map((t) => (t.status === 'done' ? { ...t, archived: true } : t)) }), {
    toast: `${n} erledigte ${n === 1 ? 'Aufgabe' : 'Aufgaben'} archiviert`,
    undoable: true
  })
}

// ---------- Termine ----------

export interface SaveEventOptions {
  /** Ziel für neue Termine */
  target?: 'google' | 'local'
  /** Teilnehmende über Google benachrichtigen (nur neue Google-Termine) */
  notify?: boolean
}

const googleFail = (what: string, err: string) => S().toast(`${what}: ${err}`, { tone: 'error' })

export async function saveEvent(ev: CalEvent, isNew: boolean, opts: SaveEventOptions = {}): Promise<boolean> {
  const prev = S().data.events.find((e) => e.id === ev.id)
  if (prev?.readOnly) {
    S().toast(prev.source === 'google' ? 'Diesen Termin kannst du in Tagwerk nicht ändern (nur Lesezugriff oder fremder Termin).' : 'Importierte Termine sind schreibgeschützt.', { tone: 'error' })
    return false
  }

  // Neuer Termin in Google Kalender
  if (isNew && opts.target === 'google') {
    const r = await window.tagwerk.google.createEvent({ ...ev, source: 'google' }, !!opts.notify)
    if (!r.ok) return googleFail('Termin nicht angelegt', r.error), false
    S().mutate((d) => ({ ...d, events: [...d.events, { ...r.value, projectId: ev.projectId }] }), { toast: `„${short(ev.title)}“ in Google Kalender angelegt` })
    return true
  }

  let notify = false
  if (!isNew && prev) {
    const timeChanged = prev.start !== ev.start || prev.end !== ev.end
    if (timeChanged && prev.attendees.length > 0) {
      const when = `${fDayMed.format(new Date(ev.start))}, ${fTime.format(new Date(ev.start))}–${fTime.format(new Date(ev.end))} Uhr`
      if (prev.source === 'google') {
        const r = await confirmWithOption({
          title: 'Termin verschieben?',
          body: `„${prev.title}“ hat ${prev.attendees.length} Teilnehmende. Neue Zeit: ${when}. Die Änderung wird in Google Kalender gespeichert.`,
          confirmLabel: 'Verschieben',
          option: { label: 'Teilnehmende per E-Mail benachrichtigen', initial: false }
        })
        if (!r.ok) return false
        notify = r.checked
      } else {
        const ok = await confirm({
          title: 'Termin verschieben?',
          body: `„${prev.title}“ hat ${prev.attendees.length} Teilnehmende. Neue Zeit: ${when}.${ev.source === 'demo' ? ' (Demo-Kalender – es werden keine Einladungen verschickt.)' : ''}`,
          confirmLabel: 'Verschieben'
        })
        if (!ok) return false
      }
    }
  }

  if (!isNew && prev?.source === 'google') {
    const r = await window.tagwerk.google.updateEvent(ev, notify)
    if (!r.ok) return googleFail('Termin nicht gespeichert', r.error), false
    const saved = { ...r.value, id: ev.id, projectId: ev.projectId }
    S().mutate((d) => ({ ...d, events: d.events.map((e) => (e.id === ev.id ? saved : e)) }), { toast: 'In Google Kalender gespeichert' })
    return true
  }

  S().mutate(
    (d) => ({ ...d, events: isNew ? [...d.events, ev] : d.events.map((e) => (e.id === ev.id ? ev : e)) }),
    { toast: isNew ? `Termin „${short(ev.title)}“ angelegt` : 'Termin gespeichert', undoable: true }
  )
  return true
}

export async function deleteEvent(id: string): Promise<boolean> {
  const ev = S().data.events.find((e) => e.id === id)
  if (!ev) return false
  if (ev.readOnly) {
    S().toast(ev.source === 'google' ? 'Diesen Termin kannst du in Tagwerk nicht löschen.' : 'Importierte Termine sind schreibgeschützt. Entferne den Import in den Einstellungen.', { tone: 'error' })
    return false
  }
  const base = `„${ev.title}“ am ${fDayMed.format(new Date(ev.start))}`
  if (ev.source === 'google') {
    const opts = {
      title: 'Termin in Google Kalender löschen?',
      body: `${base} wird aus deinem Google Kalender gelöscht. Das lässt sich in Tagwerk nicht rückgängig machen.`,
      confirmLabel: 'Löschen',
      danger: true
    }
    let notify = false
    if (ev.attendees.length) {
      const r = await confirmWithOption({ ...opts, option: { label: `${ev.attendees.length} Teilnehmende über die Absage benachrichtigen`, initial: false } })
      if (!r.ok) return false
      notify = r.checked
    } else if (!(await confirm(opts))) return false
    const r = await window.tagwerk.google.deleteEvent(ev.remoteId!, notify)
    if (!r.ok && r.code !== 'not-found') return googleFail('Termin nicht gelöscht', r.error), false
    S().mutate((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }), { toast: 'Termin in Google Kalender gelöscht' })
    return true
  }
  const ok = await confirm({ title: 'Termin löschen?', body: `${base} wird aus deinem Kalender entfernt.`, confirmLabel: 'Löschen', danger: true })
  if (!ok) return false
  S().mutate((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }), { toast: 'Termin gelöscht', undoable: true })
  return true
}

// ---------- E-Mail ----------

const threadOf = (threadId: string) => S().data.emails.filter((m) => m.threadId === threadId)
const isGoogleThread = (threadId: string) => threadOf(threadId).some((m) => m.source === 'google')
const remoteThread = (threadId: string) => threadOf(threadId).find((m) => m.remoteThreadId)?.remoteThreadId

/** Gelesen/ungelesen. Bei Gmail wird der Status auch bei Google gesetzt (falls erlaubt). */
export async function markThread(threadId: string, patch: Partial<Email>) {
  const prev = S().data
  S().mutate((d) => ({ ...d, emails: d.emails.map((m) => (m.threadId === threadId && m.folder !== 'sent' ? { ...m, ...patch } : m)) }))
  if (isGoogleThread(threadId) && patch.read !== undefined && S().google.caps.gmailWrite) {
    const id = remoteThread(threadId)!
    const r = await window.tagwerk.google.modifyThread(id, patch.read ? [] : ['UNREAD'], patch.read ? ['UNREAD'] : [])
    if (!r.ok) {
      S().replaceData(prev)
      googleFail('Gmail nicht aktualisiert', r.error)
    }
  }
}

export async function archiveThread(threadId: string) {
  const apply = () =>
    S().mutate((d) => ({ ...d, emails: d.emails.map((m) => (m.threadId === threadId && m.folder === 'inbox' ? { ...m, folder: 'archive' } : m)) }))
  if (isGoogleThread(threadId)) {
    if (!S().google.caps.gmailWrite) return S().toast('Tagwerk hat nur Lesezugriff auf Gmail.', { tone: 'error' })
    const id = remoteThread(threadId)!
    const r = await window.tagwerk.google.modifyThread(id, [], ['INBOX'])
    if (!r.ok) return googleFail('Nicht archiviert', r.error)
    apply()
    S().toast('In Gmail archiviert', {
      undo: async () => {
        const u = await window.tagwerk.google.modifyThread(id, ['INBOX'], [])
        if (u.ok) S().mutate((d) => ({ ...d, emails: d.emails.map((m) => (m.threadId === threadId && m.folder === 'archive' ? { ...m, folder: 'inbox' } : m)) }))
        else googleFail('Rückgängig fehlgeschlagen', u.error)
      }
    })
    return
  }
  const prev = S().data
  apply()
  S().toast('Unterhaltung archiviert', { undo: () => S().replaceData(prev) })
}

/** Versendet eine Antwort – nur nach Bestätigung. Im Demo-Postfach wird nichts verschickt. */
export async function sendReply(threadId: string, body: string): Promise<boolean> {
  const msgs = threadOf(threadId).sort((a, b) => a.date.localeCompare(b.date))
  const last = [...msgs].reverse().find((m) => m.folder !== 'sent')
  if (!last || !body.trim()) return false

  if (last.source === 'google') {
    const g = S().google
    if (!g.caps.gmailWrite) {
      S().toast('Tagwerk hat nur Lesezugriff auf Gmail. Verbinde Google mit Schreibzugriff, um zu senden.', { tone: 'error' })
      return false
    }
    const ok = await confirm({
      title: 'E-Mail senden?',
      body: `Die Antwort an ${last.from.name} <${last.from.email}> wird jetzt über Gmail (${g.email}) versendet. Versendete E-Mails lassen sich nicht zurückholen.`,
      confirmLabel: 'Senden'
    })
    if (!ok) return false
    const r = await window.tagwerk.google.send({
      remoteThreadId: last.remoteThreadId!,
      to: [last.from],
      subject: last.subject,
      body: body.trim(),
      inReplyTo: last.rfcMessageId,
      references: last.references
    })
    if (!r.ok) return googleFail('Nicht gesendet', r.error), false
    S().mutate(
      (d) => ({
        ...d,
        emails: [...d.emails.map((m) => (m.threadId === threadId && m.folder !== 'sent' ? { ...m, replied: true, read: true, needsReply: false } : m)), { ...r.value, threadId }]
      }),
      { toast: `Antwort an ${last.from.name} gesendet` }
    )
    return true
  }

  const demo = last.source === 'demo'
  const ok = await confirm({
    title: demo ? 'Antwort im Demo-Postfach ablegen?' : 'Antwort lokal ablegen?',
    body: demo
      ? `Es ist kein echtes E-Mail-Konto verbunden. Die Antwort an ${last.from.name} wird nur lokal als „gesendet“ abgelegt und nicht verschickt.`
      : `Diese Unterhaltung gehört zu keinem verbundenen Konto. Die Antwort wird nur lokal abgelegt.`,
    confirmLabel: 'Lokal ablegen'
  })
  if (!ok) return false
  const reply: Email = {
    id: uid('m'),
    threadId,
    from: { name: 'Ich', email: 'ich@beispiel.de' },
    to: [last.from],
    subject: last.subject.startsWith('Re:') ? last.subject : `Re: ${last.subject}`,
    date: nowIso(),
    body: body.trim(),
    read: true,
    important: false,
    needsReply: false,
    replied: false,
    folder: 'sent',
    projectId: last.projectId,
    source: last.source
  }
  S().mutate(
    (d) => ({
      ...d,
      emails: [...d.emails.map((m) => (m.threadId === threadId && m.folder !== 'sent' ? { ...m, replied: true, read: true } : m)), reply]
    }),
    { toast: 'Antwort lokal abgelegt (nicht versendet)', undoable: true }
  )
  return true
}

export function taskFromEmail(threadId: string) {
  const msgs = S().data.emails.filter((m) => m.threadId === threadId)
  const first = msgs[0]
  if (!first) return
  S().openDialog({
    kind: 'task',
    preset: {
      title: `Antworten: ${first.subject.replace(/^(re|aw):\s*/i, '')}`,
      projectId: first.projectId,
      priority: msgs.some((m) => m.important) ? 'high' : 'medium',
      due: ymd(new Date()),
      origin: { kind: 'email', refId: threadId, label: `E-Mail von ${first.from.name}` }
    }
  })
}

// ---------- Notizen ----------

export function createNote(partial: Partial<Note> = {}): Note {
  const n: Note = { id: uid('n'), title: '', body: '', kind: 'note', createdAt: nowIso(), updatedAt: nowIso(), ...partial }
  S().mutate((d) => ({ ...d, notes: [n, ...d.notes] }))
  S().go('notes', n.id)
  return n
}

export function meetingNoteFor(ev: CalEvent) {
  const existing = S().data.notes.find((n) => n.eventId === ev.id)
  if (existing) return S().go('notes', existing.id)
  createNote({
    title: ev.title,
    kind: 'meeting',
    eventId: ev.id,
    projectId: ev.projectId,
    body: ev.attendees.length ? `Teilnehmende: ${ev.attendees.map((a) => a.name).join(', ')}\n\n` : ''
  })
}

export async function deleteNote(id: string) {
  const n = S().data.notes.find((x) => x.id === id)
  if (!n) return
  const ok = await confirm({ title: 'Notiz löschen?', body: `„${n.title || 'Ohne Titel'}“ wird gelöscht.`, confirmLabel: 'Löschen', danger: true })
  if (!ok) return
  S().mutate((d) => ({ ...d, notes: d.notes.filter((x) => x.id !== id) }), { toast: 'Notiz gelöscht', undoable: true })
  S().select('notes', undefined)
}

// ---------- Vorschläge des Assistenten ----------

/** Führt einen bestätigten Vorschlag aus. Gibt eine Statusnotiz zurück. */
export async function applyProposal(p: Proposal): Promise<{ ok: boolean; note: string }> {
  const d = S().data
  const pl = p.payload as Record<string, string | string[] | undefined>
  switch (p.kind) {
    case 'create_task': {
      const title = String(pl.title ?? '').trim()
      if (!title) return { ok: false, note: 'Kein Titel angegeben.' }
      const projectId = d.projects.some((x) => x.id === pl.projectId) ? String(pl.projectId) : undefined
      const prio = (['high', 'medium', 'low'] as const).includes(pl.priority as 'high') ? (pl.priority as Task['priority']) : 'medium'
      const due = /^\d{4}-\d{2}-\d{2}$/.test(String(pl.due ?? '')) ? String(pl.due) : undefined
      addTask(newTask({ title, priority: prio, due, projectId, notes: pl.notes as string | undefined, origin: { kind: 'assistant', refId: p.id, label: 'Von Claude vorgeschlagen' } }), false)
      return { ok: true, note: 'Aufgabe angelegt.' }
    }
    case 'complete_task': {
      const t = d.tasks.find((x) => x.id === pl.taskId)
      if (!t) return { ok: false, note: 'Aufgabe nicht gefunden.' }
      if (t.status !== 'done') toggleTask(t.id)
      return { ok: true, note: 'Als erledigt markiert.' }
    }
    case 'delete_task': {
      const t = d.tasks.find((x) => x.id === pl.taskId)
      if (!t) return { ok: false, note: 'Aufgabe nicht gefunden.' }
      S().mutate((x) => ({ ...x, tasks: x.tasks.filter((y) => y.id !== t.id) }), { toast: 'Aufgabe gelöscht', undoable: true })
      return { ok: true, note: 'Aufgabe gelöscht.' }
    }
    case 'create_event': {
      const start = new Date(String(pl.start))
      const end = new Date(String(pl.end))
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return { ok: false, note: 'Ungültige Zeitangabe.' }
      const ev: CalEvent = {
        id: uid('e'),
        title: String(pl.title ?? 'Termin'),
        start: start.toISOString(),
        end: end.toISOString(),
        location: (pl.location as string) || undefined,
        attendees: [],
        notes: (pl.notes as string) || undefined,
        source: 'local'
      }
      if (S().google.caps.calendarWrite) {
        const r = await window.tagwerk.google.createEvent({ ...ev, source: 'google' }, false)
        if (!r.ok) return { ok: false, note: r.error }
        S().mutate((x) => ({ ...x, events: [...x.events, r.value] }), { toast: 'In Google Kalender angelegt' })
        return { ok: true, note: 'In Google Kalender angelegt.' }
      }
      S().mutate((x) => ({ ...x, events: [...x.events, ev] }), { toast: 'Termin angelegt', undoable: true })
      return { ok: true, note: 'Termin angelegt.' }
    }
    case 'update_event': {
      const ev = d.events.find((x) => x.id === pl.eventId)
      if (!ev) return { ok: false, note: 'Termin nicht gefunden.' }
      if (ev.readOnly) return { ok: false, note: 'Dieser Termin ist schreibgeschützt.' }
      const next: CalEvent = { ...ev }
      if (pl.title) next.title = String(pl.title)
      if (pl.location) next.location = String(pl.location)
      if (pl.start) next.start = new Date(String(pl.start)).toISOString()
      if (pl.end) next.end = new Date(String(pl.end)).toISOString()
      if (new Date(next.end) <= new Date(next.start)) return { ok: false, note: 'Ende liegt vor dem Beginn.' }
      if (ev.source === 'google') {
        // Vorschläge des Assistenten benachrichtigen Teilnehmende nie automatisch.
        const r = await window.tagwerk.google.updateEvent(next, false)
        if (!r.ok) return { ok: false, note: r.error }
        S().mutate((x) => ({ ...x, events: x.events.map((e) => (e.id === ev.id ? { ...r.value, id: ev.id, projectId: ev.projectId } : e)) }), { toast: 'In Google Kalender geändert' })
        return { ok: true, note: 'In Google Kalender geändert (ohne Benachrichtigung der Teilnehmenden).' }
      }
      S().mutate((x) => ({ ...x, events: x.events.map((e) => (e.id === ev.id ? next : e)) }), { toast: 'Termin geändert', undoable: true })
      return { ok: true, note: 'Termin geändert.' }
    }
    case 'draft_reply': {
      // Entwürfe werden nie direkt gesendet – sie öffnen sich im Posteingang zur Bearbeitung.
      if (!d.emails.some((m) => m.threadId === pl.threadId)) return { ok: false, note: 'Unterhaltung nicht gefunden.' }
      S().set({ pendingDraft: { threadId: String(pl.threadId), body: String(pl.body ?? '') } })
      S().go('inbox', String(pl.threadId))
      return { ok: true, note: 'Entwurf im Posteingang geöffnet – vor dem Senden prüfen.' }
    }
  }
}

const short = (s: string) => (s.length > 40 ? s.slice(0, 39) + '…' : s)
