// Vorschläge aus E-Mails in der Oberfläche: berechnen, einsortieren, übernehmen,
// ignorieren, zurückstellen und rückgängig machen. Angelegt wird nur nach Bestätigung.

import { useMemo } from 'react'
import type { CalEvent, MailRule, MailSuggestion, SuggestionState, Task } from '@shared/types'
import { detectAll, findDuplicate, suggestionBucket, suggestionWhen } from '@shared/mail-insights'
import { confirm, uid, useStore } from './store'
import { deleteEvent, newTask, saveEvent, saveTask } from './actions'

const S = () => useStore.getState()
const nowIso = () => new Date().toISOString()

export interface SuggestionItem extends MailSuggestion {
  state?: SuggestionState
  bucket: 'today' | 'week' | 'later'
  duplicate: ReturnType<typeof findDuplicate>
  projectId?: string
  /** Projekt kommt aus einer Regel */
  ruleId?: string
  /** Eine spätere Mail ändert Zeit oder Frist eines schon übernommenen Eintrags */
  change?: SuggestionChange
}

export interface SuggestionChange {
  kind: 'event' | 'task'
  id: string
  title: string
  oldLabel: string
  newLabel: string
}

/** Regel passt auf Absender oder Betreff */
export function ruleFor(rules: MailRule[] | undefined, s: Pick<MailSuggestion, 'from' | 'subject'>): MailRule | undefined {
  const from = `${s.from.name} ${s.from.email}`.toLowerCase()
  const subj = s.subject.toLowerCase()
  return (rules ?? []).find((r) => r.contains.trim() && (r.field === 'from' ? from : subj).includes(r.contains.trim().toLowerCase()))
}

const fDayT = (iso: string) => new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fDayD = (ymd: string, time?: string) => `${new Date(`${ymd}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}${time ? `, ${time}` : ''}`

/** Alle Vorschläge mit Bearbeitungsstand. Wird bei jeder Mail-Änderung neu berechnet (lokal, schnell). */
export function useSuggestions() {
  const emails = useStore((s) => s.data.emails)
  const states = useStore((s) => s.data.suggestions)
  const events = useStore((s) => s.data.events)
  const tasks = useStore((s) => s.data.tasks)
  const notes = useStore((s) => s.data.notes)
  const cfg = useStore((s) => s.settings.mailInsights)
  const rules = useStore((s) => s.settings.mailRules)
  return useMemo(() => {
    if (!cfg?.enabled) return { open: [], snoozed: [], done: [], ignored: [], all: [] as SuggestionItem[] }
    const now = new Date()
    const projOf = new Map(emails.map((m) => [m.threadId, m.projectId]))
    const raw = detectAll(emails, { now, sources: cfg.sources, kinds: cfg.kinds })
    const all: SuggestionItem[] = raw.map((s) => {
      const rule = ruleFor(rules, s)
      return {
        ...s,
        state: states?.[s.id],
        bucket: suggestionBucket(s, now),
        duplicate: findDuplicate(s, { events, tasks, notes }),
        projectId: rule?.projectId ?? projOf.get(s.threadId),
        ruleId: rule?.id
      }
    })
    // Änderung erkennen: in derselben Unterhaltung wurde schon ein Termin/eine Frist übernommen,
    // und eine neuere Mail nennt eine andere Zeit → alt und neu nebeneinander zeigen
    for (const s of all) {
      if (s.state) continue
      const timed = s.kind === 'event' ? 'event' : s.due ? 'task' : null
      if (!timed) continue
      const prev = all
        .filter((p) => p.threadId === s.threadId && p.state?.status === 'done' && p.state.created?.kind === timed && p.mailDate < s.mailDate)
        .sort((a, b) => b.mailDate.localeCompare(a.mailDate))[0]
      if (!prev) continue
      if (timed === 'event') {
        const ev = events.find((e) => e.id === prev.state!.created!.id)
        if (ev && s.start && Math.abs(new Date(ev.start).getTime() - new Date(s.start).getTime()) > 60_000)
          s.change = { kind: 'event', id: ev.id, title: ev.title, oldLabel: fDayT(ev.start), newLabel: fDayT(s.start) }
      } else {
        const t = tasks.find((x) => x.id === prev.state!.created!.id && x.status !== 'done')
        if (t && s.due && (t.due !== s.due || (s.dueTime && t.dueTime !== s.dueTime)))
          s.change = { kind: 'task', id: t.id, title: t.title, oldLabel: t.due ? fDayD(t.due, t.dueTime) : 'ohne Datum', newLabel: fDayD(s.due, s.dueTime) }
      }
      if (s.change) s.duplicate = null
    }
    const byWhen = (a: SuggestionItem, b: SuggestionItem) => suggestionWhen(a).getTime() - suggestionWhen(b).getTime()
    const due = (st?: SuggestionState) => st?.status === 'snoozed' && st.until && new Date(st.until).getTime() <= now.getTime()
    return {
      all,
      open: all.filter((s) => !s.state || due(s.state)).sort(byWhen),
      snoozed: all.filter((s) => s.state?.status === 'snoozed' && !due(s.state)).sort(byWhen),
      done: all.filter((s) => s.state?.status === 'done').sort((a, b) => (b.state!.at > a.state!.at ? 1 : -1)),
      ignored: all.filter((s) => s.state?.status === 'ignored')
    }
  }, [emails, states, events, tasks, notes, cfg, rules])
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
  if (s.change) return void applyChange(s)
  if (s.kind === 'event') {
    S().openDialog({
      kind: 'event',
      suggestionId: s.id,
      series: s.recurrence,
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
export const canBulk = (s: SuggestionItem) => s.kind !== 'event' && !s.uncertain && !s.duplicate && !s.change
/** Zusammenführen: Aufgaben, Fristen und Notizen */
export const canMerge = (s: SuggestionItem) => s.kind !== 'event' && !s.change

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

/** Änderung übernehmen: vorhandenen Eintrag auf die neue Zeit/Frist setzen (mit den üblichen Rückfragen) */
export async function applyChange(s: SuggestionItem): Promise<void> {
  const c = s.change
  if (!c) return
  const d = S().data
  if (c.kind === 'event') {
    const ev = d.events.find((e) => e.id === c.id)
    if (!ev || !s.start) return
    const dur = new Date(ev.end).getTime() - new Date(ev.start).getTime()
    const end = s.end && !s.allDay ? s.end : new Date(new Date(s.start).getTime() + dur).toISOString()
    const next: CalEvent = { ...ev, start: s.start, end }
    if (!(await saveEvent(next, false))) return
  } else {
    const t = d.tasks.find((x) => x.id === c.id)
    if (!t) return
    saveTask({ ...t, due: s.due, dueTime: s.dueTime ?? t.dueTime })
    S().toast(`Fälligkeit von „${t.title.slice(0, 40)}“ auf ${c.newLabel} geändert`)
  }
  markCreated(s.id, c.kind, c.id)
}

/** Mehrere Vorschläge zu einer Aufgabe zusammenführen (Dialog zur Prüfung) */
export function mergeSuggestions(list: SuggestionItem[]) {
  const ok = list.filter(canMerge)
  if (ok.length < 2) return
  const dues = ok.map((s) => s.due).filter(Boolean).sort() as string[]
  const first = ok[0]
  const t = newTask({
    title: first.title,
    due: dues[0],
    priority: ok.some((s) => s.kind === 'deadline') ? 'high' : 'medium',
    projectId: ok.find((s) => s.projectId)?.projectId,
    notes: ok.map((s) => `• ${s.title}${s.due ? ` (bis ${fDayD(s.due)})` : ''}\n  „${s.kind === 'note' ? (s.noteBody ?? s.context) : s.context}“ – ${s.from.name || s.from.email}`).join('\n'),
    origin: { kind: 'email', refId: first.threadId, label: fromLabel(first) }
  })
  S().openDialog({ kind: 'task', preset: t, mergeIds: ok.map((s) => s.id) })
}

/** Aufgabe aufteilen: Teile aus „… und …“, Aufzählungen oder Zeilen */
export function splitParts(s: SuggestionItem): string[] {
  const src = s.kind === 'note' && s.noteBody ? s.noteBody : s.title.replace(/^[^:]{3,60}:\s+/, '')
  const parts = src
    .split(/\n|;|,\s+(?=\p{Ll})|\s+(?:und|sowie|außerdem)\s+(?=\p{Ll}|die|den|das|einen?)/u)
    .map((x) => x.replace(/^[-•*]\s*/, '').trim())
    .filter((x) => x.length > 2)
  return parts.length > 1 ? parts.map((x) => x.charAt(0).toUpperCase() + x.slice(1)) : [s.title, '']
}

/** Aufgeteilte Aufgaben anlegen (nach Prüfung im Dialog) */
export function createSplit(s: SuggestionItem, titles: string[]) {
  const list = titles.map((x) => x.trim()).filter(Boolean)
  if (!list.length) return
  const base = taskFromSuggestion(s)
  const tasks = list.map((title) => ({ ...base, id: uid('t'), title }))
  S().mutate((d) => ({ ...d, tasks: [...tasks, ...d.tasks], suggestions: { ...(d.suggestions ?? {}), [s.id]: { status: 'done', at: nowIso(), created: { kind: 'task', id: tasks[0].id } } } }), {
    toast: `${tasks.length} Aufgaben angelegt`,
    undoable: true
  })
}

// ---------- Wiedervorlage für Unterhaltungen ----------

export function setFollowUp(threadId: string, at: Date | null) {
  S().mutate((d) => {
    const m = { ...(d.followUps ?? {}) }
    if (at) m[threadId] = { at: at.toISOString(), setAt: nowIso() }
    else delete m[threadId]
    return { ...d, followUps: m }
  })
  if (at) S().toast(`Wiedervorlage ${at.toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} – Tagwerk erinnert dich, falls bis dahin keine neue Nachricht kommt.`)
}

/** Aktive Wiedervorlage (erledigt, sobald nach dem Setzen eine neue Nachricht in der Unterhaltung kam) */
export function activeFollowUp(threadId: string, d = S().data) {
  const f = d.followUps?.[threadId]
  if (!f) return null
  const newer = d.emails.some((m) => m.threadId === threadId && m.date > f.setAt)
  return newer ? null : f
}

/** Regel „Absender → Projekt“ anlegen */
export function addRule(field: MailRule['field'], contains: string, projectId: string) {
  const st = S()
  const rules = st.settings.mailRules ?? []
  const existing = rules.find((r) => r.field === field && r.contains.toLowerCase() === contains.toLowerCase())
  const next = existing ? rules.map((r) => (r === existing ? { ...r, projectId } : r)) : [...rules, { id: uid('r'), field, contains, projectId }]
  void st.updateSettings({ mailRules: next })
  const p = st.data.projects.find((x) => x.id === projectId)
  st.toast(`Regel gespeichert: ${field === 'from' ? 'Mails von' : 'Betreff mit'} „${contains}“ → ${p?.name ?? 'Projekt'}`)
}
