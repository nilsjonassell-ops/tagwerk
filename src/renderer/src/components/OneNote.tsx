// OneNote in der Notizen-Ansicht: Notizbücher/Abschnitte durchblättern, Seiten lesen,
// in OneNote öffnen oder als Tagwerk-Notiz übernehmen – und Tagwerk-Notizen nach OneNote speichern.

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ExternalLink, Globe, Loader2, NotebookTabs, RefreshCw, Search, Upload } from 'lucide-react'
import type { Note, OneNotePage } from '@shared/types'
import { useStore } from '@/lib/store'
import { mailDate } from '@/lib/format'
import { createNote } from '@/lib/actions'
import { openInOneNote, saveNoteToOneNote, useOneNote } from '@/lib/onenote'
import { Dialog, Empty } from '@/components/ui'

const RECENT = ''

/** Linke Liste + Lesebereich für OneNote-Seiten. */
export function OneNoteBrowser() {
  const status = useOneNote((s) => s.status)
  const sections = useOneNote((s) => s.sections)
  const pagesBy = useOneNote((s) => s.pages)
  const loading = useOneNote((s) => s.loading)
  const error = useOneNote((s) => s.error)
  const openDialog = useStore((s) => s.openDialog)
  const [section, setSection] = useState<string>(RECENT)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | undefined>()

  useEffect(() => {
    void useOneNote.getState().refreshStatus()
  }, [])
  useEffect(() => {
    if (!status.connected) return
    void useOneNote.getState().loadSections()
    void useOneNote.getState().loadPages(section)
  }, [status.connected, section])

  const pages = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (pagesBy[section] ?? []).filter((p) => !q || p.title.toLowerCase().includes(q) || p.section.toLowerCase().includes(q))
  }, [pagesBy, section, query])
  const page = pages.find((p) => p.id === selected) ?? (pagesBy[section] ?? []).find((p) => p.id === selected)
  const notebooks = useMemo(() => {
    const m = new Map<string, typeof sections>()
    for (const s of sections) m.set(s.notebook, [...(m.get(s.notebook) ?? []), s])
    return [...m.entries()]
  }, [sections])

  if (!status.connected) {
    return (
      <div className="onenote-empty">
        <Empty icon={<NotebookTabs />} title={status.expired ? 'OneNote-Anmeldung abgelaufen' : 'OneNote ist noch nicht verbunden'}>
          {status.expired ? 'Verbinde dein Microsoft-Konto neu – das dauert nur ein paar Sekunden.' : 'Verbinde dein Microsoft-Konto, um deine Notizbücher hier zu lesen und Tagwerk-Notizen nach OneNote zu speichern.'}
          <div style={{ marginTop: 12 }}>
            <button className="btn primary small" onClick={() => openDialog({ kind: 'settings', section: 'sources' })}>
              OneNote verbinden
            </button>
          </div>
        </Empty>
      </div>
    )
  }

  return (
    <div className="split two">
      <div className="list-pane">
        <div className="search-box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <select className="select" style={{ flex: 1, minWidth: 0 }} value={section} onChange={(e) => (setSection(e.target.value), setSelected(undefined))} aria-label="Abschnitt">
              <option value={RECENT}>Zuletzt bearbeitet</option>
              {notebooks.map(([nb, list]) => (
                <optgroup key={nb} label={nb}>
                  {list.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              className="btn small ghost icon-btn"
              title="Neu laden"
              aria-label="Neu laden"
              onClick={() => {
                useOneNote.setState({ text: {} })
                void useOneNote.getState().loadSections(true)
                void useOneNote.getState().loadPages(section, true)
              }}
            >
              {loading ? <Loader2 className="spin" /> : <RefreshCw />}
            </button>
          </div>
          <div className="search-input">
            <Search />
            <input className="input" type="search" placeholder="Seiten durchsuchen" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="OneNote-Seiten durchsuchen" />
          </div>
        </div>
        {error && <div className="callout" style={{ margin: '0 12px 8px' }}>{error}</div>}
        {!pagesBy[section] && loading ? (
          <div className="onenote-loading">
            <Loader2 className="spin" /> Lade Seiten …
          </div>
        ) : pages.length === 0 ? (
          <Empty icon={<NotebookTabs />} title={query ? 'Keine Treffer' : 'Keine Seiten'}>
            {query ? 'Versuche einen anderen Begriff.' : 'In diesem Abschnitt gibt es noch keine Seiten.'}
          </Empty>
        ) : (
          pages.map((p) => (
            <button key={p.id} className={`note-row onenote-row ${p.id === selected ? 'selected' : ''}`} onClick={() => setSelected(p.id)}>
              <span className="t">
                <NotebookTabs aria-hidden="true" />
                <span>{p.title}</span>
              </span>
              <span className="p">{p.section}</span>
              <span className="d">{mailDate(p.modified)}</span>
            </button>
          ))
        )}
      </div>
      {page ? (
        <OneNoteReader key={page.id} page={page} notebook={sections.find((s) => s.id === page.sectionId)?.notebook} />
      ) : (
        <div className="editor">
          <Empty icon={<NotebookTabs />} title="Keine Seite ausgewählt">
            Wähle links eine OneNote-Seite. Bilder, Zeichnungen und Anhänge siehst du in OneNote selbst.
          </Empty>
        </div>
      )}
    </div>
  )
}

function OneNoteReader({ page, notebook }: { page: OneNotePage; notebook?: string }) {
  const text = useOneNote((s) => s.text[page.id])
  const select = useStore((s) => s.select)
  useEffect(() => {
    void useOneNote.getState().loadText(page.id)
  }, [page.id])

  const adopt = () => {
    const n = createNote({ title: page.title, body: text ?? '' })
    useStore.getState().mutate((d) => ({ ...d, notes: d.notes.map((x) => (x.id === n.id ? { ...x, oneNote: { pageId: page.id, sectionId: page.sectionId, webUrl: page.webUrl, clientUrl: page.clientUrl, savedAt: new Date().toISOString() } } : x)) }))
    useStore.getState().toast('Als Tagwerk-Notiz übernommen')
    select('notes', n.id)
    window.dispatchEvent(new CustomEvent('tagwerk:notes-source', { detail: 'tagwerk' }))
  }

  return (
    <div className="editor">
      <div className="editor-inner">
        <div className="editor-toolbar">
          <span className="onenote-crumb">
            <NotebookTabs /> {notebook ? `${notebook} › ` : ''}
            {page.section}
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn small" onClick={adopt} disabled={text === undefined} title="Eine Kopie als Tagwerk-Notiz anlegen">
            <ArrowDownToLine /> Als Tagwerk-Notiz
          </button>
          <button className="btn small ghost" onClick={() => openInOneNote(page, 'web')} title="Im Browser öffnen" disabled={!page.webUrl}>
            <Globe /> Web
          </button>
          <button className="btn small primary" onClick={() => openInOneNote(page, 'app')} disabled={!page.clientUrl && !page.webUrl}>
            <ExternalLink /> In OneNote öffnen
          </button>
        </div>
        <h1 className="onenote-title selectable">{page.title}</h1>
        <div className="onenote-meta">
          Zuletzt geändert {new Date(page.modified).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
        {text === undefined ? (
          <div className="onenote-loading">
            <Loader2 className="spin" /> Lade Inhalt …
          </div>
        ) : (
          <div className="onenote-body selectable">
            {text.split('\n').map((line, i) => {
              const todo = line.match(/^\[( |x)\]\s?(.*)$/)
              if (todo)
                return (
                  <div key={i} className={`on-todo ${todo[1] === 'x' ? 'done' : ''}`}>
                    <span className="box" aria-hidden="true" />
                    {todo[2]}
                  </div>
                )
              if (/^- /.test(line)) return <div key={i} className="on-li">{line.slice(2)}</div>
              return line.trim() ? <p key={i}>{line}</p> : <div key={i} className="on-gap" />
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** Knopf in der Notiz-Werkzeugleiste: speichern bzw. aktualisieren und öffnen. */
export function OneNoteSaveButton({ note }: { note: Note }) {
  const status = useOneNote((s) => s.status)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    void useOneNote.getState().refreshStatus()
  }, [])
  if (!status.connected) return null
  return (
    <>
      {note.oneNote && (
        <button className="btn small ghost icon-btn" onClick={() => openInOneNote(note.oneNote!)} title="In OneNote öffnen" aria-label="In OneNote öffnen">
          <ExternalLink />
        </button>
      )}
      <button className="btn small" onClick={() => setOpen(true)} title={note.oneNote ? `Zuletzt nach OneNote gespeichert: ${mailDate(note.oneNote.savedAt)}` : 'Als Seite in OneNote speichern'}>
        <Upload /> {note.oneNote ? 'Aktualisieren' : 'OneNote'}
      </button>
      {open && <OneNoteSaveDialog note={note} onClose={() => setOpen(false)} />}
    </>
  )
}

function OneNoteSaveDialog({ note, onClose }: { note: Note; onClose: () => void }) {
  const sections = useOneNote((s) => s.sections)
  const loaded = useOneNote((s) => s.sectionsLoaded)
  const error = useOneNote((s) => s.error)
  const remembered = useStore((s) => s.settings.oneNoteSectionId)
  const [target, setTarget] = useState(note.oneNote?.sectionId ?? remembered ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void useOneNote.getState().loadSections()
  }, [])
  useEffect(() => {
    if (loaded && !sections.some((s) => s.id === target) && sections[0]) setTarget(sections[0].id)
  }, [loaded, sections, target])
  const notebooks = useMemo(() => {
    const m = new Map<string, typeof sections>()
    for (const s of sections) m.set(s.notebook, [...(m.get(s.notebook) ?? []), s])
    return [...m.entries()]
  }, [sections])
  const replacing = note.oneNote?.sectionId === target

  const save = async () => {
    setBusy(true)
    const ok = await saveNoteToOneNote(note, target)
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Dialog
      title={note.oneNote ? 'In OneNote aktualisieren' : 'Nach OneNote speichern'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={save} disabled={!target || busy}>
            {busy ? <Loader2 className="spin" /> : <Upload />} {replacing ? 'Aktualisieren' : 'Speichern'}
          </button>
        </>
      }
    >
      <p>
        „{note.title || 'Ohne Titel'}“ wird als Seite in OneNote angelegt – mit Aufzählungen, Aufgaben-Häkchen
        {note.kind === 'meeting' ? ', Entscheidungen und nächsten Schritten' : ''}.
      </p>
      <label className="field">
        <span>Abschnitt</span>
        {!loaded ? (
          <div className="onenote-loading">
            <Loader2 className="spin" /> Lade Notizbücher …
          </div>
        ) : (
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            {notebooks.map(([nb, list]) => (
              <optgroup key={nb} label={nb}>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </label>
      {replacing && <div className="hint">Die frühere Fassung in diesem Abschnitt wird durch die aktuelle ersetzt.</div>}
      {error && <div className="error-text">{error}</div>}
    </Dialog>
  )
}
