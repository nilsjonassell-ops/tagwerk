import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckSquare, Gavel, ListChecks, NotebookPen, Plus, Search, Sparkles, Trash2, Users, Loader2 } from 'lucide-react'
import { extractTaskCandidates } from '@shared/analysis'
import type { Note } from '@shared/types'
import { useStore } from '@/lib/store'
import { fDayMed, fTime, mailDate } from '@/lib/format'
import { addTask, createNote, deleteNote, newTask } from '@/lib/actions'
import { suggestTasksFromNote } from '@/lib/assistant'
import { Dialog, Empty, Segmented, ViewHeader } from '@/components/ui'
import { OneNoteBrowser, OneNoteSaveButton } from '@/components/OneNote'

export function NotesView() {
  const data = useStore((s) => s.data)
  const selectedId = useStore((s) => s.selection.notes)
  const select = useStore((s) => s.select)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | 'meeting'>('all')
  // Quelle: eigene Notizen oder OneNote (gemerkt pro Gerät)
  const [source, setSourceState] = useState<'tagwerk' | 'onenote'>(() => {
    try {
      return localStorage.getItem('tagwerk.notes.source') === 'onenote' ? 'onenote' : 'tagwerk'
    } catch {
      return 'tagwerk'
    }
  })
  const setSource = (v: 'tagwerk' | 'onenote') => {
    setSourceState(v)
    try {
      localStorage.setItem('tagwerk.notes.source', v)
    } catch {
      /* egal */
    }
  }
  useEffect(() => {
    const on = (e: Event) => setSource((e as CustomEvent).detail === 'onenote' ? 'onenote' : 'tagwerk')
    window.addEventListener('tagwerk:notes-source', on)
    return () => window.removeEventListener('tagwerk:notes-source', on)
  }, [])

  const notes = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...data.notes]
      .filter((n) => kind === 'all' || n.kind === 'meeting')
      .filter((n) => !q || [n.title, n.body, n.decisions, n.nextSteps].some((x) => x?.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [data.notes, query, kind])
  const selected = data.notes.find((n) => n.id === selectedId)

  return (
    <>
      <ViewHeader title="Notizen">
        <Segmented
          label="Quelle"
          value={source}
          onChange={setSource}
          options={[
            { id: 'tagwerk', label: 'Tagwerk' },
            { id: 'onenote', label: 'OneNote' }
          ]}
        />
        <button className="btn small" onClick={() => (setSource('tagwerk'), createNote({ kind: 'meeting', title: '' }))}>
          <Users /> Meetingnotiz
        </button>
        <button className="btn small" onClick={() => (setSource('tagwerk'), createNote())}>
          <Plus /> Notiz
        </button>
      </ViewHeader>
      <div className="view-body" style={{ overflow: 'hidden' }}>
        {source === 'onenote' ? (
          <OneNoteBrowser />
        ) : (
        <div className="split two">
          <div className="list-pane">
            <div className="search-box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="search-input">
                <Search />
                <input className="input" type="search" placeholder="Notizen durchsuchen" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Notizen durchsuchen" />
              </div>
              <div className="segmented" role="group" aria-label="Art">
                <button aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
                  Alle
                </button>
                <button aria-pressed={kind === 'meeting'} onClick={() => setKind('meeting')}>
                  Meetings
                </button>
              </div>
            </div>
            {notes.length === 0 ? (
              <Empty icon={<NotebookPen />} title={query ? 'Keine Treffer' : 'Noch keine Notizen'}>
                {query ? 'Versuche einen anderen Begriff.' : 'Mit der Schnellnotiz-Tastenkombination hältst du Gedanken von überall fest.'}
              </Empty>
            ) : (
              notes.map((n) => (
                <button key={n.id} className={`note-row ${n.id === selectedId ? 'selected' : ''}`} onClick={() => select('notes', n.id)}>
                  <span className="t">
                    {n.kind === 'meeting' ? <Users aria-label="Meeting" /> : <NotebookPen aria-hidden="true" />}
                    <span>{n.title || 'Ohne Titel'}</span>
                  </span>
                  <span className="p">{n.body.replace(/\s+/g, ' ').slice(0, 140) || 'Leer'}</span>
                  <span className="d">{mailDate(n.updatedAt)}</span>
                </button>
              ))
            )}
          </div>
          {selected ? (
            <NoteEditor key={selected.id} note={selected} />
          ) : (
            <div className="editor">
              <Empty icon={<NotebookPen />} title="Keine Notiz ausgewählt">
                Wähle eine Notiz oder lege eine neue an.
              </Empty>
            </div>
          )}
        </div>
        )}
      </div>
    </>
  )
}

function NoteEditor({ note }: { note: Note }) {
  const data = useStore((s) => s.data)
  const mutate = useStore((s) => s.mutate)
  const openDialog = useStore((s) => s.openDialog)
  const go = useStore((s) => s.go)
  const [draft, setDraft] = useState(note)
  const [saved, setSaved] = useState(true)

  // Automatisch speichern (verzögert)
  useEffect(() => {
    if (draft === note) return
    setSaved(false)
    const t = setTimeout(() => {
      // oneNote-Verknüpfung kommt aus dem Speicher, nicht aus dem Entwurf
      mutate((d) => ({ ...d, notes: d.notes.map((n) => (n.id === draft.id ? { ...draft, oneNote: n.oneNote, updatedAt: new Date().toISOString() } : n)) }))
      setSaved(true)
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const set = <K extends keyof Note>(k: K, v: Note[K]) => setDraft((x) => ({ ...x, [k]: v }))
  const ev = data.events.find((e) => e.id === draft.eventId)
  const upcoming = data.events
    .filter((e) => new Date(e.start).getTime() > Date.now() - 14 * 86400_000 && new Date(e.start).getTime() < Date.now() + 30 * 86400_000)
    .sort((a, b) => a.start.localeCompare(b.start))

  return (
    <div className="editor">
      <div className="editor-inner">
        <div className="editor-toolbar">
          <select className="select" value={draft.kind} onChange={(e) => set('kind', e.target.value as Note['kind'])} aria-label="Art der Notiz">
            <option value="note">Notiz</option>
            <option value="meeting">Meetingnotiz</option>
          </select>
          <select className="select" value={draft.projectId ?? ''} onChange={(e) => set('projectId', e.target.value || undefined)} aria-label="Projekt">
            <option value="">Kein Projekt</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {draft.kind === 'meeting' && (
            <select className="select" value={draft.eventId ?? ''} onChange={(e) => set('eventId', e.target.value || undefined)} aria-label="Zugehöriger Termin">
              <option value="">Kein Termin verknüpft</option>
              {upcoming.map((e) => (
                <option key={e.id} value={e.id}>
                  {fDayMed.format(new Date(e.start))} {fTime.format(new Date(e.start))} · {e.title}
                </option>
              ))}
            </select>
          )}
          {ev && (
            <button className="btn small ghost" onClick={() => go('calendar', ev.id)}>
              <CalendarDays /> Termin öffnen
            </button>
          )}
          <div style={{ flex: 1 }} />
          <span className="saved-hint" aria-live="polite">
            {saved ? 'Gespeichert' : 'Speichert …'}
          </span>
          <OneNoteSaveButton note={{ ...draft, oneNote: note.oneNote }} />
          <button className="btn small" onClick={() => openDialog({ kind: 'extract', noteId: draft.id })} title="Aufgaben aus dieser Notiz vorschlagen">
            <ListChecks /> Aufgaben vorschlagen
          </button>
          <button className="btn small ghost icon-btn" onClick={() => deleteNote(draft.id)} aria-label="Notiz löschen">
            <Trash2 />
          </button>
        </div>
        <input className="title-input" value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder={draft.kind === 'meeting' ? 'Meeting' : 'Titel'} aria-label="Titel" autoFocus={!draft.title} />
        <div style={{ height: 12 }} />
        <textarea
          className="body-input"
          value={draft.body}
          onChange={(e) => set('body', e.target.value)}
          placeholder={draft.kind === 'meeting' ? 'Notizen aus dem Meeting …\n\nTipp: Zeilen mit „- [ ]“ oder „TODO:“ werden als Aufgaben erkannt.' : 'Schreib los …'}
          aria-label="Notiztext"
          rows={Math.max(10, draft.body.split('\n').length + 2)}
        />
        {draft.kind === 'meeting' && (
          <>
            <div className="section-label">
              <Gavel /> Entscheidungen
            </div>
            <textarea className="section-input" value={draft.decisions ?? ''} onChange={(e) => set('decisions', e.target.value)} placeholder="Was wurde entschieden?" aria-label="Entscheidungen" />
            <div className="section-label">
              <CheckSquare /> Nächste Schritte
            </div>
            <textarea className="section-input" value={draft.nextSteps ?? ''} onChange={(e) => set('nextSteps', e.target.value)} placeholder="Eine Aufgabe pro Zeile" aria-label="Nächste Schritte" />
          </>
        )}
      </div>
    </div>
  )
}

export function ExtractTasksDialog({ noteId }: { noteId: string }) {
  const data = useStore((s) => s.data)
  const claude = useStore((s) => s.claude)
  const online = useStore((s) => s.online)
  const aiOn = useStore((s) => s.settings.claude.enabled)
  const close = () => useStore.getState().openDialog(null)
  const note = data.notes.find((n) => n.id === noteId)
  const [items, setItems] = useState<{ title: string; on: boolean; by: 'local' | 'claude' }[]>(() => (note ? extractTaskCandidates(note).map((t) => ({ title: t, on: true, by: 'local' as const })) : []))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const existing = new Set(data.tasks.filter((t) => t.status !== 'done').map((t) => t.title.toLowerCase()))
  if (!note) return null

  const askClaude = async () => {
    setLoading(true)
    setError('')
    const r = await suggestTasksFromNote(note.title, [note.body, note.decisions && `Entscheidungen:\n${note.decisions}`, note.nextSteps && `Nächste Schritte:\n${note.nextSteps}`].filter(Boolean).join('\n\n'))
    setLoading(false)
    if (!r.ok) return setError(r.error)
    setItems((cur) => {
      const have = new Set(cur.map((c) => c.title.toLowerCase()))
      return [...cur, ...r.items.filter((t) => !have.has(t.toLowerCase())).map((t) => ({ title: t, on: true, by: 'claude' as const }))]
    })
  }

  const create = () => {
    const chosen = items.filter((i) => i.on && i.title.trim())
    for (const i of chosen) {
      addTask(newTask({ title: i.title.trim(), projectId: note.projectId, origin: { kind: note.kind === 'meeting' ? 'meeting' : 'note', refId: note.id, label: `Aus „${note.title || 'Notiz'}“` } }), false)
    }
    useStore.getState().toast(`${chosen.length} ${chosen.length === 1 ? 'Aufgabe' : 'Aufgaben'} angelegt`)
    close()
  }

  const n = items.filter((i) => i.on).length
  return (
    <Dialog
      title="Aufgaben aus Notiz anlegen"
      onClose={close}
      footer={
        <>
          {aiOn ? (
            <button className="btn left" onClick={askClaude} disabled={!claude.configured || !online || loading} title={!claude.configured ? 'Claude ist nicht verbunden' : undefined}>
              {loading ? <Loader2 className="spin" /> : <Sparkles />} Claude fragen
            </button>
          ) : (
            <span className="left" />
          )}
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={create} disabled={!n}>
            {n ? `${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'} anlegen` : 'Nichts ausgewählt'}
          </button>
        </>
      }
    >
      <p>Prüfe die Vorschläge. Nur ausgewählte Aufgaben werden angelegt.</p>
      {items.length === 0 && !loading && (
        <div className="hint">
          In der Notiz wurden keine Aufgaben erkannt. Schreibe Zeilen mit „- [ ] …“, „TODO: …“ oder nutze den Abschnitt „Nächste Schritte“{aiOn && claude.configured ? ' – oder frag Claude.' : '.'}
        </div>
      )}
      <div className="list">
        {items.map((it, i) => (
          <label key={i} className="list-row" style={{ minHeight: 36 }}>
            <input type="checkbox" className="box-check" checked={it.on} onChange={(e) => setItems((c) => c.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
            <input className="input" style={{ flex: 1, height: 28 }} value={it.title} onChange={(e) => setItems((c) => c.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label="Aufgabentitel" />
            {it.by === 'claude' && <span className="tag accent">Claude</span>}
            {existing.has(it.title.toLowerCase()) && <span className="tag attention">existiert schon</span>}
          </label>
        ))}
      </div>
      {error && <div className="error-text">{error}</div>}
    </Dialog>
  )
}
