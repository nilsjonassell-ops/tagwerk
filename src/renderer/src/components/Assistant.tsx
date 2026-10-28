import { useEffect, useRef, useState } from 'react'
import { ArrowUp, CalendarPlus, CalendarClock, Check, CheckSquare, Eraser, Mail, Sparkles, Trash2, X, WifiOff, Ban, AlertCircle } from 'lucide-react'
import type { ChatMessage, Proposal } from '@shared/types'
import { confirm, useStore } from '@/lib/store'
import { askAssistant, setProposalStatus } from '@/lib/assistant'
import { applyProposal } from '@/lib/actions'
import { fDayMed, fTime, PRIORITY_LABEL, modKey } from '@/lib/format'

const SUGGESTIONS = [
  'Was ist heute wirklich wichtig?',
  'Wo habe ich diese Woche Zeit für konzentriertes Arbeiten?',
  'Welche Termine kollidieren und wie löse ich das?',
  'Welche E-Mails sollte ich heute beantworten?'
]

export function AssistantPanel() {
  const chat = useStore((s) => s.data.chat)
  const claude = useStore((s) => s.claude)
  const online = useStore((s) => s.online)
  const seed = useStore((s) => s.assistantSeed)
  const setAssistant = useStore((s) => s.setAssistant)
  const openDialog = useStore((s) => s.openDialog)
  const mutate = useStore((s) => s.mutate)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const send = async (text: string, bodiesFor?: string[]) => {
    const t = text.trim()
    if (!t || busy) return
    setInput('')
    setBusy(true)
    try {
      await askAssistant(t, { bodiesFor })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (seed && claude.configured && online) {
      useStore.getState().set({ assistantSeed: undefined })
      send(seed.text, seed.bodiesFor)
    } else inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, claude.configured])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.length, busy])

  const clear = async () => {
    if (!chat.length) return
    const ok = await confirm({ title: 'Verlauf löschen?', body: 'Der gesamte Gesprächsverlauf mit Claude wird gelöscht.', confirmLabel: 'Verlauf löschen', danger: true })
    if (ok) mutate((d) => ({ ...d, chat: [] }), { toast: 'Verlauf gelöscht', undoable: true })
  }

  return (
    <aside className="assistant" aria-label="Claude-Assistent">
      <div className="assistant-head drag">
        <span className="name">
          <Sparkles aria-hidden="true" /> Claude
        </span>
        <div className="spacer" />
        <div className="row no-drag" style={{ gap: 2 }}>
          <button className="btn ghost small icon-btn" onClick={clear} disabled={!chat.length} title="Verlauf löschen" aria-label="Verlauf löschen">
            <Eraser />
          </button>
          <button className="btn ghost small icon-btn" onClick={() => setAssistant(false)} title={`Schließen (${modKey()}+J)`} aria-label="Assistent schließen">
            <X />
          </button>
        </div>
      </div>

      {!claude.configured ? (
        <div className="connect-card">
          <h3>Claude ist nicht verbunden</h3>
          <p>Hinterlege deinen Anthropic-API-Schlüssel, um Fragen zu Kalender, Aufgaben und E-Mails zu stellen, Zusammenfassungen und Antwortentwürfe zu erhalten.</p>
          <p className="hint">Der Schlüssel wird verschlüsselt im Schlüsselspeicher deines Betriebssystems abgelegt. Daten gehen nur an Anthropic, wenn du eine Frage stellst.</p>
          <button className="btn primary" onClick={() => openDialog({ kind: 'settings', section: 'claude' })}>
            Claude verbinden
          </button>
        </div>
      ) : (
        <>
          <div className="chat" ref={scrollRef} aria-live="polite">
            {chat.length === 0 && (
              <div className="chat-intro">
                <h3>Wobei kann ich helfen?</h3>
                <p style={{ margin: '0 0 12px' }}>Ich kenne deine Termine, Aufgaben, Projekte und den Posteingang. Aktionen schlage ich nur vor – du bestätigst sie.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="suggestion" onClick={() => send(s)} disabled={!online}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chat.map((m) => (
              <Message key={m.id} m={m} />
            ))}
            {busy && (
              <div className="typing" aria-label="Claude denkt nach">
                <i />
                <i />
                <i />
              </div>
            )}
          </div>
          <div className="chat-input">
            {!online && (
              <div className="banner offline" style={{ borderRadius: 8, marginBottom: 8, border: 0 }}>
                <WifiOff /> Offline – Claude ist erst wieder mit Internetverbindung verfügbar.
              </div>
            )}
            <div className="box">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = `${e.target.scrollHeight}px`
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
                placeholder={online ? 'Frag nach deinem Tag, Terminen oder E-Mails …' : 'Offline'}
                disabled={!online}
                aria-label="Nachricht an Claude"
              />
              <button className="btn primary small icon-btn" onClick={() => send(input)} disabled={!input.trim() || busy || !online} aria-label="Senden">
                <ArrowUp />
              </button>
            </div>
            <div className="note">Claude kann sich irren. Aktionen werden erst nach deiner Bestätigung ausgeführt.</div>
          </div>
        </>
      )}
    </aside>
  )
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === 'user') return <div className="msg user selectable">{m.text}</div>
  return (
    <div className={`msg assistant ${m.error ? 'error' : ''}`}>
      {m.error ? (
        <div className="text row" style={{ alignItems: 'flex-start' }}>
          <AlertCircle size={15} style={{ marginTop: 3, flexShrink: 0 }} /> <span>{m.text}</span>
        </div>
      ) : (
        <div className="text selectable">{renderText(m.text)}</div>
      )}
      {m.proposals?.map((p) => (
        <ProposalCard key={p.id} msgId={m.id} p={p} />
      ))}
    </div>
  )
}

/** Sehr kleines Rendering: **fett** und Zeilenumbrüche. */
function renderText(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>))
}

function ProposalCard({ msgId, p }: { msgId: string; p: Proposal }) {
  const data = useStore((s) => s.data)
  const [draftBody, setDraftBody] = useState(String(p.payload.body ?? ''))
  const pl = p.payload as Record<string, string>
  const task = pl.taskId ? data.tasks.find((t) => t.id === pl.taskId) : undefined
  const ev = pl.eventId ? data.events.find((e) => e.id === pl.eventId) : undefined
  const thread = pl.threadId ? data.emails.find((e) => e.threadId === pl.threadId) : undefined
  const proj = pl.projectId ? data.projects.find((x) => x.id === pl.projectId)?.name : undefined
  const when = (s?: string) => (s && !isNaN(Date.parse(s)) ? `${fDayMed.format(new Date(s))}, ${fTime.format(new Date(s))}` : '')

  const meta: Record<Proposal['kind'], { icon: typeof Check; label: string; action: string; danger?: boolean }> = {
    create_task: { icon: CheckSquare, label: 'Aufgabe anlegen', action: 'Anlegen' },
    complete_task: { icon: Check, label: 'Aufgabe erledigen', action: 'Als erledigt markieren' },
    delete_task: { icon: Trash2, label: 'Aufgabe löschen', action: 'Löschen', danger: true },
    create_event: { icon: CalendarPlus, label: 'Termin anlegen', action: 'Anlegen' },
    update_event: { icon: CalendarClock, label: 'Termin ändern', action: 'Ändern' },
    draft_reply: { icon: Mail, label: 'Antwortentwurf', action: 'Im Posteingang bearbeiten' }
  }
  const M = meta[p.kind]
  const body = (() => {
    switch (p.kind) {
      case 'create_task':
        return (
          <>
            <div>{pl.title}</div>
            <div className="detail">{[pl.due && `fällig ${new Date(pl.due + 'T12:00').toLocaleDateString('de-DE')}`, pl.priority && `Priorität ${PRIORITY_LABEL[pl.priority as 'high']}`, proj].filter(Boolean).join(' · ')}</div>
          </>
        )
      case 'complete_task':
      case 'delete_task':
        return <div>{task ? task.title : pl._title ? pl._title : <span className="error-text">Aufgabe nicht gefunden</span>}</div>
      case 'create_event':
        return (
          <>
            <div>{pl.title}</div>
            <div className="detail">
              {when(pl.start)} – {pl.end ? fTime.format(new Date(pl.end)) : ''}
              {pl.location ? ` · ${pl.location}` : ''}
            </div>
          </>
        )
      case 'update_event':
        return (
          <>
            <div>{ev ? ev.title : <span className="error-text">Termin nicht gefunden</span>}</div>
            {ev && (
              <div className="detail">
                {pl.start ? `${when(pl._fromStart ?? ev.start)} → ${when(pl.start)}` : ''}
                {pl.title ? ` · neuer Titel: ${pl.title}` : ''}
                {pl.location ? ` · Ort: ${pl.location}` : ''}
                {ev.attendees.length ? ` · ${ev.attendees.length} Teilnehmende${ev.source === 'google' ? ', werden nicht benachrichtigt' : ''}` : ''}
              </div>
            )}
          </>
        )
      case 'draft_reply':
        return (
          <>
            <div className="detail">an {thread?.from.name ?? 'unbekannt'} · „{thread?.subject}“</div>
            {p.status === 'pending' ? (
              <textarea className="textarea" value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={6} aria-label="Entwurf bearbeiten" />
            ) : (
              <div className="detail" style={{ whiteSpace: 'pre-wrap' }}>{draftBody.slice(0, 200)}{draftBody.length > 200 ? '…' : ''}</div>
            )}
          </>
        )
    }
  })()

  const run = async () => {
    const payload =
      p.kind === 'draft_reply' ? { ...p.payload, body: draftBody }
      : p.kind === 'update_event' && ev ? { ...p.payload, _fromStart: ev.start, _fromTitle: ev.title }
      : p.kind === 'complete_task' || p.kind === 'delete_task' ? { ...p.payload, _title: task?.title }
      : p.payload
    const r = await applyProposal({ ...p, payload })
    setProposalStatus(msgId, p.id, r.ok ? 'confirmed' : 'failed', r.note, payload)
  }

  return (
    <div className={`proposal ${p.status !== 'pending' ? 'done' : ''}`}>
      <div className="p-head">
        <M.icon aria-hidden="true" /> Vorschlag: {M.label}
      </div>
      <div className="p-body">{body}</div>
      {p.status === 'pending' ? (
        <div className="p-actions">
          <button className={`btn small ${M.danger ? 'danger' : 'primary'}`} onClick={run}>
            {M.action}
          </button>
          <button className="btn small ghost" onClick={() => setProposalStatus(msgId, p.id, 'rejected')}>
            Ablehnen
          </button>
        </div>
      ) : (
        <div className="p-status">
          {p.status === 'confirmed' ? <Check /> : p.status === 'rejected' ? <Ban /> : <AlertCircle />}
          {p.status === 'confirmed' ? p.note ?? 'Ausgeführt' : p.status === 'rejected' ? 'Abgelehnt' : p.note ?? 'Nicht ausführbar'}
        </div>
      )}
    </div>
  )
}
