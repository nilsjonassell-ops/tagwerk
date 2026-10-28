// Fachliche Aktionen. Alles, was Daten löscht, Nachrichten versendet oder
// wichtige Termine ändert, läuft über eine ausdrückliche Bestätigung.

import { nextDue, ymd } from '@shared/analysis'
import type { CalEvent, Email, Note, Proposal, Task } from '@shared/types'
import { confirm, uid, useStore } from './store'
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

export async function saveEvent(ev: CalEvent, isNew: boolean): Promise<boolean> {
  const prev = S().data.events.find((e) => e.id === ev.id)
  if (prev?.readOnly) {
    S().toast('Importierte Termine sind schreibgeschützt.', { tone: 'error' })
    return false
  }
  if (!isNew && prev) {
    const timeChanged = prev.start !== ev.start || prev.end !== ev.end
    const important = prev.attendees.length > 0
    if (timeChanged && important) {
      const ok = await confirm({
        title: 'Termin verschieben?',
        body: `„${prev.title}“ hat ${prev.attendees.length} Teilnehmende. Neue Zeit: ${fDayMed.format(new Date(ev.start))}, ${fTime.format(new Date(ev.start))}–${fTime.format(new Date(ev.end))} Uhr.${ev.source === 'demo' ? ' (Demo-Kalender – es werden keine Einladungen verschickt.)' : ''}`,
        confirmLabel: 'Verschieben'
      })
      if (!ok) return false
    }
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
    S().toast('Importierte Termine sind schreibgeschützt. Entferne den Import in den Einstellungen.', { tone: 'error' })
    return false
  }
  const ok = await confirm({
    title: 'Termin löschen?',
    body: `„${ev.title}“ am ${fDayMed.format(new Date(ev.start))} wird aus deinem Kalender entfernt.`,
    confirmLabel: 'Löschen',
    danger: true
  })
  if (!ok) return false
  S().mutate((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }), { toast: 'Termin gelöscht', undoable: true })
  return true
}

// ---------- E-Mail ----------

export function markThread(threadId: string, patch: Partial<Email>) {
  S().mutate((d) => ({ ...d, emails: d.emails.map((m) => (m.threadId === threadId && m.folder !== 'sent' ? { ...m, ...patch } : m)) }))
}

export function archiveThread(threadId: string) {
  S().mutate((d) => ({ ...d, emails: d.emails.map((m) => (m.threadId === threadId && m.folder === 'inbox' ? { ...m, folder: 'archive' } : m)) }), {
    toast: 'Unterhaltung archiviert',
    undoable: true
  })
}

/** Versendet eine Antwort – nur nach Bestätigung. Im Demo-Postfach wird nichts verschickt. */
export async function sendReply(threadId: string, body: string): Promise<boolean> {
  const msgs = S().data.emails.filter((m) => m.threadId === threadId).sort((a, b) => a.date.localeCompare(b.date))
  const last = [...msgs].reverse().find((m) => m.folder !== 'sent')
  if (!last || !body.trim()) return false
  const demo = last.source === 'demo'
  const ok = await confirm({
    title: demo ? 'Antwort im Demo-Postfach ablegen?' : 'E-Mail senden?',
    body: demo
      ? `Es ist kein echtes E-Mail-Konto verbunden. Die Antwort an ${last.from.name} wird nur lokal als „gesendet“ abgelegt und nicht verschickt.`
      : `Die Antwort an ${last.from.name} <${last.from.email}> wird jetzt versendet.`,
    confirmLabel: demo ? 'Lokal ablegen' : 'Senden'
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
    { toast: demo ? 'Antwort lokal abgelegt (Demo, nicht versendet)' : 'Antwort gesendet', undoable: demo }
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
      S().mutate((x) => ({ ...x, events: [...x.events, ev] }), { toast: 'Termin angelegt', undoable: true })
      return { ok: true, note: 'Termin angelegt.' }
    }
    case 'update_event': {
      const ev = d.events.find((x) => x.id === pl.eventId)
      if (!ev) return { ok: false, note: 'Termin nicht gefunden.' }
      if (ev.readOnly) return { ok: false, note: 'Importierter Termin ist schreibgeschützt.' }
      const next: CalEvent = { ...ev }
      if (pl.title) next.title = String(pl.title)
      if (pl.location) next.location = String(pl.location)
      if (pl.start) next.start = new Date(String(pl.start)).toISOString()
      if (pl.end) next.end = new Date(String(pl.end)).toISOString()
      if (new Date(next.end) <= new Date(next.start)) return { ok: false, note: 'Ende liegt vor dem Beginn.' }
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
