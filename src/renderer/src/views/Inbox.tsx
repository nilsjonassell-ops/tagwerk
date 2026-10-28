import { useEffect, useMemo, useState } from 'react'
import { Archive, CheckSquare, FlaskConical, Inbox as InboxIcon, Mail, MailOpen, Reply, Search, Send, Sparkles, Star, X, AlertCircle, Clock, Loader2 } from 'lucide-react'
import { groupThreads, type Thread } from '@shared/analysis'
import { useStore } from '@/lib/store'
import { hueFor, initials, mailDate, projectName } from '@/lib/format'
import { archiveThread, markThread, sendReply, taskFromEmail } from '@/lib/actions'
import { draftReply, summarizeThread } from '@/lib/assistant'
import { AccountStatus, Empty, ViewHeader } from '@/components/ui'

type Filter = 'important' | 'unread' | 'reply' | 'all' | 'sent' | 'archive'

const FILTERS: { id: Filter; label: string; icon: typeof Mail }[] = [
  { id: 'important', label: 'Wichtig', icon: Star },
  { id: 'unread', label: 'Ungelesen', icon: Mail },
  { id: 'reply', label: 'Antwort offen', icon: Clock },
  { id: 'all', label: 'Alle', icon: InboxIcon },
  { id: 'sent', label: 'Gesendet', icon: Send },
  { id: 'archive', label: 'Archiv', icon: Archive }
]

export function InboxView() {
  const data = useStore((s) => s.data)
  const selectedId = useStore((s) => s.selection.inbox)
  const select = useStore((s) => s.select)
  const openDialog = useStore((s) => s.openDialog)
  const google = useStore((s) => s.google)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('')

  const allThreads = useMemo(() => groupThreads(data.emails), [data.emails])
  const counts = useMemo(() => {
    const inbox = allThreads.filter((t) => t.folder === 'inbox')
    return {
      important: inbox.filter((t) => t.important).length,
      unread: inbox.filter((t) => t.unread).length,
      reply: inbox.filter((t) => t.needsReply).length,
      all: inbox.length
    } as Partial<Record<Filter, number>>
  }, [allThreads])

  const threads = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allThreads.filter((t) => {
      const inSent = t.messages.some((m) => m.folder === 'sent')
      const ok =
        filter === 'sent' ? inSent
        : filter === 'archive' ? t.folder === 'archive'
        : t.folder === 'inbox' && (filter === 'all' || (filter === 'important' && t.important) || (filter === 'unread' && t.unread) || (filter === 'reply' && t.needsReply))
      if (!ok) return false
      if (projectFilter && t.projectId !== projectFilter) return false
      if (!q) return true
      return t.messages.some((m) => [m.subject, m.body, m.from.name, m.from.email, projectName(data, m.projectId)].some((x) => x?.toLowerCase().includes(q)))
    })
  }, [allThreads, filter, query, projectFilter, data])

  const selected = allThreads.find((t) => t.id === selectedId)

  // Beim Öffnen als gelesen markieren
  useEffect(() => {
    if (selected?.unread) {
      const t = setTimeout(() => markThread(selected.id, { read: true }), 600)
      return () => clearTimeout(t)
    }
  }, [selected?.id, selected?.unread])

  // Tastatur: j/k zum Navigieren, e archivieren, r antworten
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [role=dialog]') || e.metaKey || e.ctrlKey) return
      const idx = threads.findIndex((t) => t.id === selectedId)
      if (e.key === 'j' || e.key === 'ArrowDown') {
        const n = threads[Math.min(threads.length - 1, idx + 1)]
        if (n) select('inbox', n.id)
        e.preventDefault()
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        const n = threads[Math.max(0, idx - 1)]
        if (n) select('inbox', n.id)
        e.preventDefault()
      } else if (e.key === 'e' && selected && selected.folder === 'inbox') {
        archiveThread(selected.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [threads, selectedId, selected, select])

  return (
    <>
      <ViewHeader title="Posteingang">
        <AccountStatus kind="gmail" />
        <button className="btn small ghost" onClick={() => openDialog({ kind: 'settings', section: 'sources' })}>
          Konten
        </button>
      </ViewHeader>
      {data.sources.demo && (
        <div className="banner" role="note">
          <FlaskConical />
          <span>
            {google.caps.gmailRead
              ? 'Neben deinem Gmail-Postfach sind noch Beispiel-Mails aus der Demo-Datenquelle sichtbar. Darauf geantwortet wird nur lokal.'
              : 'Beispiel-Postfach aus der Demo-Datenquelle. Antworten werden nur lokal abgelegt, nichts wird verschickt.'}
          </span>
          <button className="btn small" onClick={() => openDialog({ kind: 'settings', section: 'sources' })}>
            {google.caps.gmailRead ? 'Demo entfernen' : 'Gmail verbinden'}
          </button>
        </div>
      )}
      <div className="view-body" style={{ overflow: 'hidden' }}>
        <div className="split">
          <nav className="filters" aria-label="Filter">
            {FILTERS.map((f) => (
              <button key={f.id} className="nav-item" aria-current={filter === f.id ? 'page' : undefined} onClick={() => setFilter(f.id)}>
                <f.icon aria-hidden="true" />
                <span className="label">{f.label}</span>
                {counts[f.id] ? <span className="count">{counts[f.id]}</span> : null}
              </button>
            ))}
            {data.projects.length > 0 && <div className="group-label">Nach Projekt</div>}
            {data.projects.map((p) => (
              <button key={p.id} className="nav-item" aria-current={projectFilter === p.id ? 'page' : undefined} onClick={() => setProjectFilter(projectFilter === p.id ? '' : p.id)}>
                <span className="project-dot" style={{ background: `hsl(${p.hue} 40% 50%)` }} />
                <span className="label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
              </button>
            ))}
          </nav>

          <div className="list-pane">
            <div className="search-box">
              <div className="search-input">
                <Search />
                <input className="input" type="search" placeholder="Person, Projekt oder Thema" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="E-Mails durchsuchen" />
              </div>
            </div>
            {threads.length === 0 ? (
              <Empty icon={<InboxIcon />} title={query || projectFilter ? 'Keine Treffer' : 'Hier ist nichts'}>
                {query || projectFilter ? 'Passe Suche oder Filter an.' : 'Keine Unterhaltungen in diesem Ordner.'}
              </Empty>
            ) : (
              <div role="listbox" aria-label="Unterhaltungen">
                {threads.map((t) => (
                  <ThreadRow key={t.id} t={t} selected={t.id === selectedId} onClick={() => select('inbox', t.id)} />
                ))}
              </div>
            )}
          </div>

          {selected ? (
            <Reader key={selected.id} thread={selected} onTask={() => taskFromEmail(selected.id)} />
          ) : (
            <div className="reader">
              <Empty icon={<MailOpen />} title="Keine Unterhaltung ausgewählt">
                Wähle links eine E-Mail. Mit <kbd>J</kbd> und <kbd>K</kbd> springst du durch die Liste.
              </Empty>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ThreadRow({ t, selected, onClick }: { t: Thread; selected: boolean; onClick: () => void }) {
  return (
    <button role="option" aria-selected={selected} className={`thread-row ${t.unread ? 'unread' : ''} ${selected ? 'selected' : ''}`} onClick={onClick}>
      <span className="dot-col">{t.unread && <span className="unread-dot" aria-label="ungelesen" />}</span>
      <span className="body">
        <span className="top">
          <span className="from">
            {t.participants.join(', ')}
            {t.messages.length > 1 ? ` (${t.messages.length})` : ''}
          </span>
          <span className="date">{mailDate(t.latest.date)}</span>
        </span>
        <span className="subject">{t.subject}</span>
        <span className="preview">{t.latest.body.replace(/\s+/g, ' ').slice(0, 160)}</span>
        {(t.important || t.needsReply) && (
          <span className="flags">
            {t.important && <span className="tag accent">Wichtig</span>}
            {t.needsReply && <span className="tag attention">Antwort offen</span>}
          </span>
        )}
      </span>
    </button>
  )
}

function Reader({ thread, onTask }: { thread: Thread; onTask: () => void }) {
  const claude = useStore((s) => s.claude)
  const online = useStore((s) => s.online)
  const settings = useStore((s) => s.settings)
  const openDialog = useStore((s) => s.openDialog)
  const data = useStore((s) => s.data)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([thread.latest.id]))
  const [summary, setSummary] = useState<{ state: 'idle' | 'loading' | 'done' | 'error'; text?: string }>({ state: 'idle' })
  const [composer, setComposer] = useState<{ open: boolean; body: string; drafting: boolean; instruction: string; error?: string }>({ open: false, body: '', drafting: false, instruction: '' })

  // Entwurf aus dem Assistenten übernehmen (wird nie automatisch gesendet)
  const pendingDraft = useStore((s) => s.pendingDraft)
  useEffect(() => {
    if (pendingDraft?.threadId === thread.id) {
      setComposer((c) => ({ ...c, open: true, body: pendingDraft.body }))
      useStore.getState().set({ pendingDraft: undefined })
    }
  }, [pendingDraft, thread.id])

  const claudeReady = claude.configured && online
  const google = useStore((s) => s.google)
  const isGmail = thread.messages.some((m) => m.source === 'google')
  const canModify = !isGmail || google.caps.gmailWrite
  const readOnlyHint = isGmail && !google.caps.gmailWrite ? 'Nur Lesezugriff auf Gmail' : undefined
  const claudeHint = !claude.configured ? 'Claude ist nicht verbunden' : !online ? 'Offline' : undefined
  const proj = projectName(data, thread.projectId)
  const lastInbound = [...thread.messages].reverse().find((m) => m.folder !== 'sent')

  const doSummary = async () => {
    setSummary({ state: 'loading' })
    const r = await summarizeThread(thread)
    setSummary(r.ok ? { state: 'done', text: r.text } : { state: 'error', text: r.error })
  }
  const doDraft = async () => {
    setComposer((c) => ({ ...c, open: true, drafting: true, error: undefined }))
    setTimeout(() => document.querySelector('.composer')?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
    const r = await draftReply(thread, composer.instruction, settings.userName)
    setComposer((c) => ({ ...c, drafting: false, body: r.ok ? r.text : c.body, error: r.ok ? undefined : r.error }))
    setTimeout(() => document.querySelector('.composer')?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
  }
  const doSend = async () => {
    if (await sendReply(thread.id, composer.body)) setComposer({ open: false, body: '', drafting: false, instruction: '' })
  }

  return (
    <article className="reader" aria-label={thread.subject}>
      <div className="reader-head">
        <h2 className="selectable">{thread.subject}</h2>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {thread.important && <span className="tag accent">Wichtig</span>}
          {thread.needsReply && <span className="tag attention">Antwort offen</span>}
          {lastInbound?.replied && <span className="tag ok">Beantwortet</span>}
          {proj && <span className="tag">{proj}</span>}
          <span className="hint">{thread.messages.length} {thread.messages.length === 1 ? 'Nachricht' : 'Nachrichten'}</span>
        </div>
        <div className="reader-toolbar">
          <button className="btn small" onClick={() => (setComposer((c) => ({ ...c, open: true })), setTimeout(() => document.querySelector('.composer')?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50))}>
            <Reply /> Antworten
          </button>
          <button className="btn small" onClick={doDraft} disabled={!claudeReady || composer.drafting} title={claudeHint}>
            <Sparkles /> Antwort entwerfen
          </button>
          <button className="btn small" onClick={doSummary} disabled={!claudeReady || summary.state === 'loading'} title={claudeHint}>
            <Sparkles /> Zusammenfassen
          </button>
          <button className="btn small" onClick={onTask}>
            <CheckSquare /> Aufgabe
          </button>
          <div style={{ flex: 1 }} />
          {thread.folder === 'inbox' && (
            <button className="btn small ghost" onClick={() => archiveThread(thread.id)} title={readOnlyHint ?? 'Archivieren (E)'} disabled={!canModify}>
              <Archive /> Archivieren
            </button>
          )}
          <button className="btn small ghost icon-btn" onClick={() => markThread(thread.id, { read: false })} title={readOnlyHint ?? 'Als ungelesen markieren'} aria-label="Als ungelesen markieren" disabled={!canModify}>
            <Mail />
          </button>
        </div>
        {!claude.configured && (
          <div className="hint" style={{ marginTop: 8 }}>
            Zusammenfassen und Entwerfen brauchen Claude.{' '}
            <button className="link" onClick={() => openDialog({ kind: 'settings', section: 'claude' })}>
              Claude verbinden
            </button>
          </div>
        )}
      </div>

      <div className="reader-body">
        {summary.state !== 'idle' && (
          <div className="ai-block" aria-live="polite">
            <div className="ai-head">
              <Sparkles /> Zusammenfassung von Claude
              <div style={{ flex: 1 }} />
              <button className="btn ghost small icon-btn" onClick={() => setSummary({ state: 'idle' })} aria-label="Zusammenfassung ausblenden">
                <X />
              </button>
            </div>
            {summary.state === 'loading' && (
              <div className="row hint">
                <Loader2 className="spin" size={14} /> Wird zusammengefasst …
              </div>
            )}
            {summary.state === 'done' && <div className="ai-text selectable">{summary.text}</div>}
            {summary.state === 'error' && (
              <div className="row error-text">
                <AlertCircle size={14} /> {summary.text}
              </div>
            )}
          </div>
        )}

        {thread.messages.map((m) => {
          const open = expanded.has(m.id) || thread.messages.length <= 2
          return (
            <div key={m.id} className={`message ${open ? '' : 'collapsed'}`}>
              <div className="head" onClick={() => setExpanded((s) => new Set(s.has(m.id) ? [...s].filter((x) => x !== m.id) : [...s, m.id]))} style={{ cursor: 'pointer' }}>
                <span className="avatar" style={{ ['--h' as string]: hueFor(m.from.email) }}>{initials(m.from.name)}</span>
                <span className="who">
                  <b>{m.folder === 'sent' ? 'Ich' : m.from.name}</b>
                  <span>{m.folder === 'sent' ? `an ${m.to.map((t) => t.name).join(', ')}${m.source === 'demo' ? ' · lokal abgelegt, nicht versendet' : ''}` : m.from.email}</span>
                </span>
                <span className="hint">{new Date(m.date).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="text selectable">{open ? m.body : m.body.replace(/\s+/g, ' ')}</div>
            </div>
          )
        })}

        {composer.open && (
          <div className="composer">
            <div className="to">
              An: {lastInbound?.from.name} &lt;{lastInbound?.from.email}&gt;
              {thread.messages[0].source === 'demo' && <span className="tag demo" style={{ marginLeft: 'auto' }}>wird nicht versendet</span>}
              {isGmail && <span className="tag" style={{ marginLeft: 'auto' }}>{google.caps.gmailWrite ? `über Gmail · ${google.email}` : 'nur Lesezugriff – Senden nicht möglich'}</span>}
            </div>
            <textarea
              value={composer.drafting ? 'Claude schreibt einen Entwurf …' : composer.body}
              onChange={(e) => setComposer((c) => ({ ...c, body: e.target.value }))}
              disabled={composer.drafting}
              placeholder="Deine Antwort …"
              aria-label="Antworttext"
              autoFocus
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') doSend()
              }}
            />
            {composer.error && <div className="error-text" style={{ padding: '0 14px 8px' }}>{composer.error}</div>}
            <div className="foot">
              <input
                className="input"
                style={{ height: 28, flex: 1, fontSize: 'var(--fs-sm)' }}
                placeholder={claudeReady ? 'Hinweis für Claude, z. B. „Termin bestätigen, Telefonnummer im Header zusagen“' : 'Claude nicht verfügbar'}
                value={composer.instruction}
                onChange={(e) => setComposer((c) => ({ ...c, instruction: e.target.value }))}
                disabled={!claudeReady}
                onKeyDown={(e) => e.key === 'Enter' && claudeReady && doDraft()}
              />
              <button className="btn small" onClick={doDraft} disabled={!claudeReady || composer.drafting}>
                <Sparkles /> {composer.body ? 'Neu entwerfen' : 'Entwerfen'}
              </button>
              <button className="btn small ghost" onClick={() => setComposer({ open: false, body: '', drafting: false, instruction: '' })}>
                Verwerfen
              </button>
              <button className="btn small primary" onClick={doSend} disabled={!composer.body.trim() || composer.drafting || !canModify} title={readOnlyHint}>
                <Send /> Senden …
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
