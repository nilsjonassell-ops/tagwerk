// Claude-Assistent: Kontextaufbereitung, Werkzeuge (nur als Vorschläge),
// Gesprächsverlauf und Einzelaufgaben wie Zusammenfassungen und Entwürfe.

import { addDays, eventsOnDay, findConflicts, freeBlocks, groupThreads, isActive, sortTasks, ymd, type Thread } from '@shared/analysis'
import type { AppData, ChatMessage, ClaudeResult, Proposal, ProposalKind, Settings } from '@shared/types'
import { uid, useStore } from './store'
import { fDayLong, fTime } from './format'

const TOOLS = [
  {
    name: 'create_task',
    description: 'Schlägt vor, eine neue Aufgabe anzulegen. Wird erst nach Bestätigung durch die Nutzerin/den Nutzer ausgeführt.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        due: { type: 'string', description: 'Fälligkeit als YYYY-MM-DD (optional)' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        projectId: { type: 'string', description: 'ID eines vorhandenen Projekts (optional)' },
        notes: { type: 'string' }
      },
      required: ['title']
    }
  },
  {
    name: 'complete_task',
    description: 'Schlägt vor, eine vorhandene Aufgabe als erledigt zu markieren.',
    input_schema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] }
  },
  {
    name: 'delete_task',
    description: 'Schlägt vor, eine Aufgabe zu löschen. Nur wenn ausdrücklich gewünscht.',
    input_schema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] }
  },
  {
    name: 'create_event',
    description: 'Schlägt einen neuen Kalendertermin vor.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        start: { type: 'string', description: 'ISO 8601 mit Zeitzonen-Offset' },
        end: { type: 'string', description: 'ISO 8601 mit Zeitzonen-Offset' },
        location: { type: 'string' },
        notes: { type: 'string' }
      },
      required: ['title', 'start', 'end']
    }
  },
  {
    name: 'update_event',
    description: 'Schlägt vor, einen vorhandenen Termin zu ändern (z. B. verschieben).',
    input_schema: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        title: { type: 'string' },
        start: { type: 'string', description: 'ISO 8601 mit Zeitzonen-Offset' },
        end: { type: 'string', description: 'ISO 8601 mit Zeitzonen-Offset' },
        location: { type: 'string' }
      },
      required: ['eventId']
    }
  },
  {
    name: 'draft_reply',
    description: 'Erstellt einen Antwortentwurf auf eine E-Mail-Unterhaltung. Der Entwurf wird NICHT gesendet, sondern zur Bearbeitung geöffnet.',
    input_schema: {
      type: 'object',
      properties: { threadId: { type: 'string' }, body: { type: 'string', description: 'Vollständiger Antworttext' } },
      required: ['threadId', 'body']
    }
  }
]

function offsetIso(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')
  const mm = String(Math.abs(off) % 60).padStart(2, '0')
  const local = new Date(d.getTime() + off * 60000).toISOString().slice(0, 19)
  return `${local}${sign}${hh}:${mm}`
}

/** Kompakter, strukturierter Überblick über die Daten für das Modell. */
export function buildContext(data: AppData, settings: Settings, now = new Date(), opts: { bodiesFor?: string[] } = {}): string {
  const proj = (id?: string) => (id ? data.projects.find((p) => p.id === id)?.name : undefined)
  const lines: string[] = []
  lines.push(`Jetzt: ${fDayLong.format(now)}, ${fTime.format(now)} Uhr (${offsetIso(now)}). Arbeitszeit ${settings.workHours.start}–${settings.workHours.end} Uhr.`)
  const sources = [data.sources.demo ? 'Demo-Datenquelle (Beispieldaten, kein echtes Konto)' : null, ...data.sources.icsImports.map((i) => `Kalenderimport „${i.name}“ (schreibgeschützt)`)].filter(Boolean)
  lines.push(`Datenquellen: ${sources.length ? sources.join('; ') : 'nur lokale Einträge'}. Kein echtes E-Mail-Konto verbunden.`)

  lines.push('\n## Termine (heute bis +7 Tage)')
  for (let i = 0; i <= 7; i++) {
    const day = addDays(now, i)
    const evs = eventsOnDay(data.events, day)
    if (!evs.length) continue
    lines.push(`### ${fDayLong.format(day)}`)
    for (const e of evs) {
      const time = e.allDay ? 'ganztägig' : `${fTime.format(new Date(e.start))}–${fTime.format(new Date(e.end))}`
      const att = e.attendees.length ? ` | mit ${e.attendees.map((a) => a.name).join(', ')}` : ''
      lines.push(`- [${e.id}] ${time} ${e.title}${e.location ? ` | ${e.location}` : ''}${att}${proj(e.projectId) ? ` | Projekt ${proj(e.projectId)}` : ''}${e.readOnly ? ' | schreibgeschützt' : ''}${e.notes ? ` | Notiz: ${e.notes.slice(0, 160)}` : ''}`)
    }
    const conflicts = findConflicts(evs, settings.transitionBufferMinutes)
    for (const c of conflicts) lines.push(`  ! ${c.kind === 'overlap' ? 'Überschneidung' : `knapper Übergang (${c.gapMinutes} Min.)`}: ${c.a.title} / ${c.b.title}`)
    const free = freeBlocks(evs, day, settings.workHours, settings.focusMinMinutes, i === 0 ? now : undefined)
    if (free.length) lines.push(`  frei: ${free.map((f) => `${fTime.format(f.start)}–${fTime.format(f.end)}`).join(', ')}`)
  }

  lines.push('\n## Offene Aufgaben')
  const tasks = sortTasks(data.tasks.filter(isActive)).slice(0, 60)
  if (!tasks.length) lines.push('(keine)')
  for (const t of tasks) {
    lines.push(`- [${t.id}] ${t.title} | Priorität ${t.priority}${t.due ? ` | fällig ${t.due}${t.due < ymd(now) ? ' (ÜBERFÄLLIG)' : ''}` : ''}${t.status === 'doing' ? ' | in Arbeit' : ''}${proj(t.projectId) ? ` | Projekt ${proj(t.projectId)}` : ''}${t.recurrence !== 'none' ? ` | wiederkehrend ${t.recurrence}` : ''}`)
  }

  lines.push('\n## Posteingang')
  const threads = groupThreads(data.emails).filter((t) => t.folder === 'inbox').slice(0, 30)
  for (const th of threads) {
    const flags = [th.unread && 'ungelesen', th.important && 'wichtig', th.needsReply && 'Antwort erwartet'].filter(Boolean).join(', ')
    lines.push(`- [${th.id}] „${th.subject}“ von ${th.latest.from.name} <${th.latest.from.email}>, ${th.messages.length} Nachricht(en), zuletzt ${th.latest.date.slice(0, 16)}${flags ? ` | ${flags}` : ''}${proj(th.projectId) ? ` | Projekt ${proj(th.projectId)}` : ''}`)
    const withBody = settings.claude.includeEmailBodies || opts.bodiesFor?.includes(th.id)
    if (withBody) lines.push(threadText(th, 1200).replace(/^/gm, '    '))
  }
  if (!settings.claude.includeEmailBodies) lines.push('(E-Mail-Inhalte werden nur auf ausdrückliche Anfrage mitgeschickt – frage nach, wenn du den Inhalt brauchst.)')

  lines.push('\n## Projekte')
  for (const p of data.projects) lines.push(`- [${p.id}] ${p.name} (${p.status}): ${p.summary} Nächste Schritte: ${p.nextSteps.join('; ') || '–'}`)

  lines.push('\n## Notizen (Titel)')
  for (const n of data.notes.slice(0, 20)) lines.push(`- [${n.id}] ${n.title || 'Ohne Titel'}${n.kind === 'meeting' ? ' (Meeting)' : ''}${proj(n.projectId) ? ` | ${proj(n.projectId)}` : ''}`)

  if (data.docs.length) {
    lines.push('\n## Dokumente (nur Titel, Inhalte nicht verfügbar)')
    for (const d of data.docs) lines.push(`- ${d.title} (${d.kind})${proj(d.projectId) ? ` | ${proj(d.projectId)}` : ''}`)
  }
  return lines.join('\n')
}

export function threadText(th: Thread, maxPerMsg = 3000): string {
  return th.messages
    .map((m) => `Von ${m.from.name} am ${new Date(m.date).toLocaleString('de-DE')}${m.folder === 'sent' ? ' (gesendet)' : ''}:\n${m.body.slice(0, maxPerMsg)}`)
    .join('\n---\n')
}

function systemPrompt(userName: string) {
  return `Du bist der in die Desktop-App „Tagwerk“ eingebaute Assistent${userName ? ` von ${userName}` : ''}. Du hilfst, den Tag zu organisieren: Kalender, E-Mails, Aufgaben, Notizen und Projekte.

Regeln:
- Antworte auf Deutsch, knapp und konkret. Nutze kurze Absätze oder einfache Aufzählungen mit „-“. Kein Markdown außer **fett** für einzelne Schlüsselbegriffe.
- Stütze dich ausschließlich auf den mitgelieferten Kontext. Erfinde keine Termine, Personen, Inhalte oder Fakten. Wenn Informationen fehlen oder unklar sind, sag das und stelle eine Rückfrage.
- Du kannst Aktionen nur VORSCHLAGEN (Werkzeuge). Die Nutzerin/der Nutzer bestätigt jede Aktion selbst. Behaupte nie, etwas sei erledigt, gesendet oder geändert, bevor die Bestätigung im Verlauf steht.
- Schlage Löschungen nur vor, wenn sie ausdrücklich gewünscht sind. E-Mails werden nie gesendet – du kannst nur Entwürfe vorschlagen.
- Verwende für Werkzeuge ausschließlich IDs aus dem Kontext (in eckigen Klammern).
- Weise bei Bedarf darauf hin, dass Daten aus der Demo-Datenquelle stammen.
- Zeitangaben für Werkzeuge immer als ISO 8601 mit dem lokalen Zeitzonen-Offset.`
}

// ---------- Gesprächsverlauf → API-Nachrichten ----------

interface ApiBlock {
  type: string
  id?: string
  name?: string
  input?: unknown
  text?: string
}

const STATUS_TEXT: Record<Proposal['status'], string> = {
  pending: 'Noch nicht entschieden – die Nutzerin/der Nutzer hat diesen Vorschlag weder bestätigt noch abgelehnt.',
  confirmed: 'Von der Nutzerin/dem Nutzer bestätigt und ausgeführt.',
  rejected: 'Von der Nutzerin/dem Nutzer abgelehnt. Nicht ausgeführt.',
  failed: 'Bestätigt, aber nicht ausführbar.'
}

export function toApiMessages(history: ChatMessage[]): unknown[] {
  const out: { role: 'user' | 'assistant'; content: unknown }[] = []
  let pendingResults: unknown[] = []
  for (const m of history.slice(-24)) {
    if (m.error) continue
    if (m.role === 'assistant') {
      const content = (m.raw as ApiBlock[] | undefined) ?? [{ type: 'text', text: m.text }]
      if (out.length && out[out.length - 1].role === 'assistant') continue
      if (!out.length) continue // Verlauf muss mit einer Nutzernachricht beginnen
      out.push({ role: 'assistant', content })
      pendingResults = (m.proposals ?? []).map((p) => ({
        type: 'tool_result',
        tool_use_id: p.id,
        content: STATUS_TEXT[p.status] + (p.note ? ` ${p.note}` : '')
      }))
    } else {
      const content = [...pendingResults, { type: 'text', text: m.text }]
      pendingResults = []
      if (out.length && out[out.length - 1].role === 'user') {
        ;(out[out.length - 1].content as unknown[]).push({ type: 'text', text: m.text })
      } else out.push({ role: 'user', content })
    }
  }
  return out
}

const KIND_SET = new Set<ProposalKind>(['create_task', 'complete_task', 'delete_task', 'create_event', 'update_event', 'draft_reply'])

export function parseResponse(content: unknown[]): { text: string; proposals: Proposal[] } {
  const blocks = content as ApiBlock[]
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim()
  const proposals: Proposal[] = blocks
    .filter((b) => b.type === 'tool_use' && KIND_SET.has(b.name as ProposalKind))
    .map((b) => ({ id: b.id!, kind: b.name as ProposalKind, payload: (b.input ?? {}) as Record<string, unknown>, status: 'pending' }))
  return { text, proposals }
}

// ---------- Senden ----------

export async function askAssistant(userText: string, opts: { bodiesFor?: string[] } = {}): Promise<void> {
  const st = useStore.getState()
  const userMsg: ChatMessage = { id: uid('c'), role: 'user', text: userText, createdAt: new Date().toISOString() }
  st.mutate((d) => ({ ...d, chat: [...d.chat, userMsg] }))
  const history = useStore.getState().data.chat
  const ctx = buildContext(useStore.getState().data, st.settings, new Date(), opts)
  const res = await window.tagwerk.claude.send({
    model: st.settings.claude.model,
    system: `${systemPrompt(st.settings.userName)}\n\n# Aktueller Kontext\n${ctx}`,
    messages: toApiMessages(history),
    tools: TOOLS,
    max_tokens: 1500
  })
  appendResult(res)
}

function appendResult(res: ClaudeResult) {
  const st = useStore.getState()
  if (!res.ok) {
    const msg: ChatMessage = { id: uid('c'), role: 'assistant', text: res.error, error: true, createdAt: new Date().toISOString() }
    st.mutate((d) => ({ ...d, chat: [...d.chat, msg] }))
    if (res.code === 'auth' || res.code === 'no-key') st.refreshClaude()
    return
  }
  const { text, proposals } = parseResponse(res.content)
  const msg: ChatMessage = {
    id: uid('c'),
    role: 'assistant',
    text: text || (proposals.length ? 'Mein Vorschlag:' : '(keine Antwort)'),
    proposals,
    raw: res.content,
    createdAt: new Date().toISOString()
  }
  st.mutate((d) => ({ ...d, chat: [...d.chat, msg] }))
}

export function setProposalStatus(msgId: string, propId: string, status: Proposal['status'], note?: string, payload?: Record<string, unknown>) {
  useStore.getState().mutate((d) => ({
    ...d,
    chat: d.chat.map((m) =>
      m.id !== msgId
        ? m
        : { ...m, proposals: m.proposals?.map((p) => (p.id === propId ? { ...p, status, note, payload: payload ?? p.payload } : p)) }
    )
  }))
}

// ---------- Einzelaufgaben ----------

async function oneShot(system: string, prompt: string, maxTokens = 900): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const st = useStore.getState()
  const res = await window.tagwerk.claude.send({
    model: st.settings.claude.model,
    system,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens
  })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, text: parseResponse(res.content).text }
}

export function summarizeThread(th: Thread) {
  return oneShot(
    'Du fasst E-Mail-Verläufe für eine vielbeschäftigte Person auf Deutsch zusammen. Nur Inhalte aus dem Verlauf verwenden, nichts erfinden. Format: 1–2 Sätze Kern, dann „Offen:“ mit Punkten, die eine Antwort oder Entscheidung brauchen, inkl. Fristen. Keine Überschriften, keine Markdown-Formatierung außer „-“ für Punkte.',
    `Betreff: ${th.subject}\n\n${threadText(th)}`
  )
}

export function draftReply(th: Thread, instruction: string, userName: string) {
  return oneShot(
    `Du schreibst Antwortentwürfe auf Deutsch im Namen von ${userName || 'der Nutzerin/dem Nutzer'}. Passe Anrede und Tonfall (du/Sie) an den Verlauf an. Erfinde keine Zusagen, Termine oder Fakten; markiere fehlende Angaben mit [eckigen Klammern]. Gib nur den Antworttext aus, ohne Betreff und ohne Vorbemerkung.`,
    `Verlauf:\n${threadText(th)}\n\nHinweis für die Antwort: ${instruction || 'Kurz und freundlich antworten.'}`,
    700
  )
}

export async function suggestTasksFromNote(title: string, body: string): Promise<{ ok: true; items: string[] } | { ok: false; error: string }> {
  const r = await oneShot(
    'Du extrahierst konkrete Aufgaben aus Notizen. Gib ausschließlich eine Liste zurück, eine Aufgabe pro Zeile, beginnend mit „- “, formuliert als kurze Handlung (max. 10 Wörter). Nur Aufgaben, die tatsächlich in der Notiz stehen oder sich direkt daraus ergeben. Wenn es keine gibt, antworte mit „- (keine)“.',
    `Notiz „${title}“:\n${body}`,
    500
  )
  if (!r.ok) return r
  const items = r.text
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter((l) => l && l !== '(keine)')
  return { ok: true, items }
}
