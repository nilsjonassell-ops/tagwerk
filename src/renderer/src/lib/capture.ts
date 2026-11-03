// Ablauf „Aus E-Mail übernehmen“ in der Oberfläche:
// 1. Art wählen (Aufgabe · Notiz · Termin) → 2. Prüfen & ergänzen → 3. Speichern → Bestätigung mit „Öffnen“.
// Beim Wechsel der Art bleiben Eingaben erhalten (Entwürfe je Unterhaltung und Art).
import { buildCapture, type Capture, type CaptureKind } from '@shared/capture'
import { useStore } from './store'

const drafts = new Map<string, unknown>()
const key = (threadId: string, kind: CaptureKind) => `${threadId}:${kind}`

/** Dialog zur gewählten Art öffnen – mit dem, was die Mail hergibt, oder dem zuletzt bearbeiteten Stand */
export function startCapture(threadId: string, kind: CaptureKind) {
  const st = useStore.getState()
  const messages = st.data.emails.filter((m) => m.threadId === threadId).sort((a, b) => a.date.localeCompare(b.date))
  if (!messages.length) return
  const projectId = messages.find((m) => m.projectId)?.projectId
  const { capture, preset } = buildCapture(messages, kind, { projectId })
  if (kind === 'task') st.openDialog({ kind: 'task', preset, suggestionId: capture.suggestionId, capture })
  else if (kind === 'event') st.openDialog({ kind: 'event', preset, suggestionId: capture.suggestionId, capture })
  else st.openDialog({ kind: 'mailnote', suggestionId: capture.suggestionId, title: preset.title ?? capture.subject, body: preset.body ?? '', threadId, projectId, capture })
}

/** Zur anderen Art wechseln: aktuellen Stand merken, anderen Dialog öffnen */
export function switchCapture(capture: Capture, to: CaptureKind, current: unknown) {
  drafts.set(key(capture.threadId, capture.kind), current)
  startCapture(capture.threadId, to)
}

/** Zuvor bearbeiteten Stand dieser Art (nach einem Wechsel zurück) */
export function takeDraft<T>(capture: Capture | undefined): T | undefined {
  if (!capture) return undefined
  return drafts.get(key(capture.threadId, capture.kind)) as T | undefined
}

/** Nach dem Speichern: Entwürfe der Unterhaltung verwerfen */
export function finishCapture(capture: Capture | undefined) {
  if (!capture) return
  for (const k of ['task', 'note', 'event'] as const) drafts.delete(key(capture.threadId, k))
}

/** Direkt zum angelegten Element */
export function openCreated(kind: CaptureKind, id: string) {
  const st = useStore.getState()
  st.openDialog(null)
  if (kind === 'task') {
    st.go('tasks', id)
    st.openDialog({ kind: 'task', id })
  } else if (kind === 'event') st.go('calendar', id)
  else st.go('notes', id)
}

export const KIND_LABEL: Record<CaptureKind, string> = { task: 'Aufgabe', note: 'Notiz', event: 'Termin' }
