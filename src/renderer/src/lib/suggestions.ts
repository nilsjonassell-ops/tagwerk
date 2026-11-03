// Vorschläge aus E-Mails in der Oberfläche: berechnen, einsortieren, übernehmen,
// ignorieren, zurückstellen und rückgängig machen. Angelegt wird nur nach Bestätigung.

import { useMemo } from 'react'
import type { MailSuggestion, SuggestionState, Task } from '@shared/types'
import { detectAll, findDuplicate, suggestionBucket, suggestionWhen } from '@shared/mail-insights'
import { confirm, uid, useStore } from './store'
import { deleteEvent, newTask } from './actions'

const S = () => useStore.getState()
const nowIso = () => new Date().toISOString()

export interface SuggestionItem extends MailSuggestion {
  state?: SuggestionState
  bucket: 'today' | 'week' | 'later'
  duplicate: ReturnType<typeof findDuplicate>
  projectId?: string
}

/** Alle Vorschläge mit Bearbeitungsstand. Wird bei jeder Mail-Änderung neu berechnet (lokal, schnell). */
export function useSuggestions() {
  const emails = useStore((s) => s.data.emails)
  const states = useStore((s) => s.data.suggestions)
  const events = useStore((s) => s.data.events)
  const tasks = useStore((s) => s.data.tasks)
  const notes = useStore((s) => s.data.notes)
  const cfg = useStore((s) => s.settings.mailInsights)
  return useMemo(() => {
    if (!cfg?.enabled) return { open: [], snoozed: [], done: [], ignored: [], all: [] as SuggestionItem[] }
    const now = new Date()
    const projOf = new Map(emails.map((m) => [m.threadId, m.projectId]))
    const all: SuggestionItem[] = detectAll(emails, { now, sources: cfg.sources, kinds: cfg.kinds }).map((s) => ({
      ...s,
      state: states?.[s.id],
      bucket: suggestionBucket(s, now),
      duplicate: findDuplicate(s, { events, tasks, notes }),
      projectId: projOf.get(s.threadId)
    }))
    const byWhen = (a: SuggestionItem, b: SuggestionItem) => suggestionWhen(a).getTime() - suggestionWhen(b).getTime()
    const due = (st?: SuggestionState) => st?.status === 'snoozed' && st.until && new Date(st.until).getTime() <= now.getTime()
    return {
      all,
      open: all.filter((s) => !s.state || due(s.state)).sort(byWhen),
      snoozed: all.filter((s) => s.state?.status === 'snoozed' && !due(s.state)).sort(byWhen),
      done: all.filter((s) => s.state?.status === 'done').sort((a, b) => (b.state!.at > a.state!.at ? 1 : -1)),
      ignored: all.filter((s) => s.state?.status === 'ignored')
    }
  }, [emails, states, events, tasks, notes, cfg])
}

function setState(id: string, st: SuggestionState | null) {
  S().mutate((d) => {
    const m = { ...(d.suggestions ?? {}) }
    if (st) m[id] = st
    else delete m[id]
    return { ...d, suggestions: m }
  })
}

export function markCreated(id: string, kind: 'event' | 'task' | 'note', createdId: string) {
  setState(id, { status: 'done', at: nowIso(), created: { kind, id: createdId } })
}

export function ignoreSuggestion(s: MailSuggestion) {
  setState(s.id, { status: 'ignored', at: nowIso() })
  S().toast('Vorschlag ignoriert', { undo: () => setState(s.id, null) })
}

export function snoozeSuggestion(s: MailSuggestion, until: Date) {
  setState(s.id, { status: 'snoozed', at: nowIso(), until: until.toISOString() })
  S().toast(`Wiedervorlage ${until.toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, { undo: () => setState(s.id, null) })
}

export function reopenSuggestion(id: string) {
  setState(id, null)
}

/** Wiedervorlage-Zeitpunkte */
export function snoozeOptions(now = new Date()): { label: string; at: Date }[] {
  const d = (days: number, h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, 0)
  const evening = now.getHours() < 17 ? d(0, 18) : null
  const monday = d(((8 - now.getDay()) % 7) || 7, 8)
  return [...(evening ? [{ label: 'Heute Abend', at: evening }] : []), { label: 'Morgen früh', at: d(1, 8) }, { label: 'Nächste Woche', at: monday }]
}

const fromLabel = (s: MailSuggestion) => `E-Mail von ${s.from.name || s.from.email}`
const sourceNote = (s: MailSuggestion) => `Aus der E-Mail von ${s.from.name || s.from.email}${s.from.email ? ` <${s.from.email}>` : ''} („${s.subject}“):\n„${s.context}“`

/** Vorbereitete Aufgabe aus einem Vorschlag (für Dialog und Mehrfachübernahme) */
export function taskFromSuggestion(s: SuggestionItem): Task {
  return newTask({
    title: s.title,
    due: s.due,
    dueTime: s.dueTime,
    priority: s.kind === 'deadline' ? 'high' : 'medium',
    projectId: s.projectId,
    notes: sourceNote(s),
    origin: { kind: 'email', refId: s.threadId, label: fromLabel(s) }
  })
}

/** Übernehmen: öffnet den passenden Dialog vorausgefüllt – angelegt wird erst dort. */
export function acceptSuggestion(s: SuggestionItem) {
  if (s.kind === 'event') {
    S().openDialog({
      kind: 'event',
      suggestionId: s.id,
      preset: { title: s.title, start: s.start, end: s.end, allDay: s.allDay, projectId: s.projectId, notes: sourceNote(s), mailRef: s.threadId }
    })
  } else if (s.kind === 'note') {
    S().openDialog({ kind: 'mailnote', suggestionId: s.id, title: s.title, body: `${s.noteBody ?? s.context}\n\n${sourceNote(s)}`, threadId: s.threadId, projectId: s.projectId })
  } else {
    const t = taskFromSuggestion(s)
    S().openDialog({ kind: 'task', suggestionId: s.id, preset: t })
  }
}

/** Mehrere eindeutige Aufgaben/Fristen/Notizen auf einmal anlegen (Termine bleiben zur Einzelprüfung). */
export function acceptMany(list: SuggestionItem[]) {
  const ok = list.filter(canBulk)
  if (!ok.length) return
  const prev = S().data
  const tasks: Task[] = []
  const notes: { id: string; s: SuggestionItem }[] = []
  const marks: Record<string, SuggestionState> = {}
  for (const s of ok) {
    if (s.kind === 'note') {
      const id = uid('n')
      notes.push({ id, s })
      marks[s.id] = { status: 'done', at: nowIso(), created: { kind: 'note', id } }
    } else {
      const t = taskFromSuggestion(s)
      tasks.push(t)
      marks[s.id] = { status: 'done', at: nowIso(), created: { kind: 'task', id: t.id } }
    }
  }
  S().mutate(
    (d) => ({
      ...d,
      tasks: [...tasks, ...d.tasks],
      notes: [...notes.map(({ id, s }) => ({ id, title: s.title, body: `${s.noteBody ?? s.context}\n\n${sourceNote(s)}`, kind: 'note' as const, projectId: s.projectId, mailRef: s.threadId, createdAt: nowIso(), updatedAt: nowIso() })), ...d.notes],
      suggestions: { ...(d.suggestions ?? {}), ...marks }
    }),
    undefined
  )
  S().toast(`${ok.length} ${ok.length === 1 ? 'Vorschlag' : 'Vorschläge'} übernommen`, { undo: () => S().replaceData({ ...S().data, tasks: prev.tasks, notes: prev.notes, suggestions: prev.suggestions }) })
}

/** Ohne Einzelprüfung übernehmbar: eindeutig, kein Termin, keine mögliche Dublette */
export const canBulk = (s: SuggestionItem) => s.kind !== 'event' && !s.uncertain && !s.duplicate

/** Übernahme rückgängig machen: Angelegtes entfernen (nach Rückfrage), Vorschlag wieder öffnen */
export async function undoAccepted(s: SuggestionItem): Promise<void> {
  const c = s.state?.created
  if (!c) return reopenSuggestion(s.id)
  const d = S().data
  if (c.kind === 'task') {
    const t = d.tasks.find((x) => x.id === c.id)
    if (t && !(await confirm({ title: 'Übernahme rückgängig machen?', body: `Die Aufgabe „${t.title}“ wird gelöscht und der Vorschlag wieder geöffnet.`, confirmLabel: 'Rückgängig', danger: true }))) return
    S().mutate((x) => ({ ...x, tasks: x.tasks.filter((y) => y.id !== c.id) }))
  } else if (c.kind === 'note') {
    const n = d.notes.find((x) => x.id === c.id)
    if (n && !(await confirm({ title: 'Übernahme rückgängig machen?', body: `Die Notiz „${n.title}“ wird gelöscht und der Vorschlag wieder geöffnet.`, confirmLabel: 'Rückgängig', danger: true }))) return
    S().mutate((x) => ({ ...x, notes: x.notes.filter((y) => y.id !== c.id) }))
  } else if (c.kind === 'event') {
    // Termine (auch in Outlook/Google/Apple) löscht die vorhandene Funktion – mit ihrer eigenen Rückfrage
    if (d.events.some((e) => e.id === c.id) && !(await deleteEvent(c.id))) return
  }
  reopenSuggestion(s.id)
}
