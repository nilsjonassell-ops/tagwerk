// „Aus E-Mail übernehmen“: Was wird aus der Mail übernommen, was muss geprüft werden, was fehlt?
// Reine Logik ohne Oberfläche – die Dialoge zeigen das Ergebnis an (renderer/lib/capture.ts).
import type { AppData, CalEvent, Email, Note, Task } from './types.ts'
import { cleanSubject, detectMailSuggestions } from './mail-insights.ts'

export type CaptureKind = 'task' | 'note' | 'event'
/** Herkunft einer Angabe: aus der Mail erkannt · erkannt, aber bitte prüfen · nicht gefunden */
export type CaptureOrigin = 'mail' | 'check' | 'missing'

export interface Capture {
  threadId: string
  kind: CaptureKind
  /** Absendername (oder Adresse) der maßgeblichen Mail */
  from: string
  fromEmail?: string
  subject: string
  date: string
  snippet: string
  origin: Partial<Record<'title' | 'when' | 'due' | 'body' | 'project', CaptureOrigin>>
  /** Warum eine Angabe zu prüfen ist (aus der Erkennung) */
  reason?: string
  /** ID des erkannten Vorschlags – wird beim Anlegen als übernommen markiert */
  suggestionId?: string
}

export interface CaptureResult {
  capture: Capture
  preset: Partial<Task> & Partial<CalEvent> & Partial<Note>
}

/** Maßgeblich ist die letzte eingegangene Nachricht der Unterhaltung (eigene Antworten zählen nicht). */
function lastInbound(messages: Email[]): Email {
  return [...messages].reverse().find((m) => m.folder !== 'sent') ?? messages[messages.length - 1]
}

export function buildCapture(messages: Email[], kind: CaptureKind, opts: { now?: Date; projectId?: string } = {}): CaptureResult {
  const last = lastInbound(messages)
  const who = last.from.name || last.from.email
  const subject = cleanSubject(last.subject)
  const capture: Capture = {
    threadId: last.threadId,
    kind,
    from: who,
    fromEmail: last.from.email || undefined,
    subject,
    date: last.date,
    snippet: last.body.replace(/\s+/g, ' ').trim().slice(0, 160),
    origin: { title: 'mail', project: opts.projectId ? 'mail' : undefined }
  }
  const projectId = opts.projectId

  if (kind === 'event') {
    const found = detectMailSuggestions(last, { kinds: ['event'], now: opts.now })[0]
    capture.suggestionId = found?.id
    capture.origin.when = found?.start ? (found.uncertain ? 'check' : 'mail') : 'missing'
    if (found?.uncertain) capture.reason = found.reason ?? 'Angabe unvollständig'
    return {
      capture,
      preset: {
        title: subject,
        start: found?.start,
        end: found?.end,
        allDay: found?.allDay,
        projectId,
        mailRef: last.threadId,
        notes: `Aus der E-Mail von ${who}${found ? `:\n„${found.context}“` : ''}`
      }
    }
  }

  if (kind === 'task') {
    const found = detectMailSuggestions(last, { kinds: ['deadline', 'task'], now: opts.now })[0]
    capture.suggestionId = found?.id
    capture.origin.due = found?.due ? (found.uncertain ? 'check' : 'mail') : 'missing'
    if (found?.uncertain) capture.reason = found.reason ?? 'Angabe unvollständig'
    return {
      capture,
      preset: {
        title: found?.title ?? subject,
        due: found?.due,
        dueTime: found?.dueTime,
        priority: last.important ? 'high' : 'medium',
        projectId,
        notes: found ? `„${found.context}“` : undefined,
        origin: { kind: 'email', refId: last.threadId, label: `E-Mail von ${who}` }
      }
    }
  }

  const found = detectMailSuggestions(last, { kinds: ['note'], now: opts.now })[0]
  capture.suggestionId = found?.id
  capture.origin.body = 'mail'
  const excerpt = last.body.replace(/\n{3,}/g, '\n\n').trim().slice(0, 600)
  return {
    capture,
    preset: {
      title: subject,
      body: `${found?.noteBody ? `${found.noteBody}\n\n` : ''}${excerpt}\n\n– E-Mail von ${who}, ${new Date(last.date).toLocaleDateString('de-DE')}`,
      projectId,
      mailRef: last.threadId
    }
  }
}

/** Gibt es aus dieser Unterhaltung schon ein Element dieser Art? (gegen versehentlich doppelte Einträge) */
export function existingFromThread(data: Pick<AppData, 'tasks' | 'events' | 'notes'>, threadId: string, kind: CaptureKind): { id: string; title: string } | undefined {
  const hit =
    kind === 'task'
      ? data.tasks.find((t) => t.origin?.kind === 'email' && t.origin.refId === threadId)
      : kind === 'event'
        ? data.events.find((e) => e.mailRef === threadId)
        : data.notes.find((n) => n.mailRef === threadId)
  return hit ? { id: hit.id, title: hit.title } : undefined
}
