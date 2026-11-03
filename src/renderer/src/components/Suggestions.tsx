// „Aus Mails übernehmen“: erkannte Termine, Fristen, Aufgaben und Infos prüfen und übernehmen.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlarmClock, CalendarCheck, CalendarPlus, Check, CheckSquare, ChevronDown, ChevronRight, Clock, Copy, Mail, Paperclip, RotateCcw, StickyNote, X, ListChecks } from 'lucide-react'
import type { SuggestionKind } from '@shared/types'
import { useStore } from '@/lib/store'
import { SOURCE_LABEL } from '@/lib/accounts'
import { acceptMany, acceptSuggestion, canBulk, ignoreSuggestion, reopenSuggestion, snoozeOptions, snoozeSuggestion, undoAccepted, useSuggestions, type SuggestionItem } from '@/lib/suggestions'
import { Empty } from './ui'

type KindFilter = 'all' | SuggestionKind | 'uncertain'
const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'event', label: 'Termine' },
  { id: 'deadline', label: 'Fristen' },
  { id: 'task', label: 'Aufgaben' },
  { id: 'note', label: 'Notizen' },
  { id: 'uncertain', label: 'Unsicher' }
]
const BUCKETS: { id: SuggestionItem['bucket']; label: string }[] = [
  { id: 'today', label: 'Heute prüfen' },
  { id: 'week', label: 'Diese Woche' },
  { id: 'later', label: 'Später' }
]
const KIND_LABEL: Record<SuggestionKind, string> = { event: 'Termin', deadline: 'Frist', task: 'Aufgabe', note: 'Notiz' }

const fDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
const fTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

export function whenLabel(s: SuggestionItem): string | null {
  if (s.kind === 'event' && s.start) {
    const a = new Date(s.start)
    return s.allDay ? `${fDay.format(a)} · ganztägig` : `${fDay.format(a)} · ${fTime.format(a)}–${fTime.format(new Date(s.end!))} Uhr`
  }
  if (s.due) return `fällig ${fDay.format(new Date(`${s.due}T12:00:00`))}${s.dueTime ? `, ${s.dueTime} Uhr` : ''}`
  return null
}

function KindIcon({ kind }: { kind: SuggestionKind }) {
  const I = kind === 'event' ? CalendarPlus : kind === 'deadline' ? AlarmClock : kind === 'task' ? CheckSquare : StickyNote
  return (
    <span className={`sg-icon k-${kind}`} aria-hidden="true">
      <I />
    </span>
  )
}

/** Komplette Ansicht im Posteingang */
export function SuggestionsPane() {
  const { open, snoozed, done, ignored } = useSuggestions()
  const go = useStore((s) => s.go)
  const openDialog = useStore((s) => s.openDialog)
  const [kind, setKind] = useState<KindFilter>('all')
  const [sel, setSel] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [showDone, setShowDone] = useState(false)
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null)

  const list = useMemo(() => open.filter((s) => kind === 'all' || (kind === 'uncertain' ? s.uncertain : s.kind === kind)), [open, kind])
  const counts = useMemo(() => {
    const c: Partial<Record<KindFilter, number>> = { all: open.length, uncertain: open.filter((s) => s.uncertain).length }
    for (const s of open) c[s.kind] = (c[s.kind] ?? 0) + 1
    return c
  }, [open])
  const current = list.find((s) => s.id === sel) ?? null

  // Tastatur: J/K bewegen, Enter übernehmen, I ignorieren, L später, Leertaste Details, X auswählen, O Mail öffnen
  const listRef = useRef(list)
  listRef.current = list
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [role=dialog], button') || e.metaKey || e.ctrlKey || e.altKey) return
      const l = listRef.current
      const i = l.findIndex((s) => s.id === sel)
      const move = (d: number) => {
        const n = l[Math.max(0, Math.min(l.length - 1, (i < 0 ? -1 : i) + d))]
        if (n) {
          setSel(n.id)
          document.getElementById(`sg-${n.id}`)?.scrollIntoView({ block: 'nearest' })
        }
      }
      const s = l[i]
      if (e.key === 'j' || e.key === 'ArrowDown') move(1)
      else if (e.key === 'k' || e.key === 'ArrowUp') move(-1)
      else if (!s) return
      else if (e.key === 'Enter') acceptSuggestion(s)
      else if (e.key === 'i' || e.key === 'Delete') {
        ignoreSuggestion(s)
        move(1)
      } else if (e.key === 'l') setSnoozeFor(s.id)
      else if (e.key === ' ') setExpanded(expanded === s.id ? null : s.id)
      else if (e.key === 'x' && picking && canBulk(s)) setPicked((p) => toggle(p, s.id))
      else if (e.key === 'o') go('inbox', s.threadId)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, expanded, picking, go])

  const bulkable = list.filter(canBulk)
  const pickedItems = list.filter((s) => picked.has(s.id))

  return (
    <section className="suggest-pane" aria-label="Aus Mails übernehmen">
      <div className="sg-head">
        <div>
          <h2>Aus Mails übernehmen</h2>
          <p className="hint">Erkannt in deinen E-Mails – angelegt wird erst, wenn du es bestätigst.</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {bulkable.length > 1 && (
            <button className={`btn small ${picking ? 'primary' : 'ghost'}`} onClick={() => (setPicking(!picking), setPicked(new Set()))}>
              <ListChecks /> {picking ? 'Auswahl beenden' : 'Mehrere übernehmen'}
            </button>
          )}
          <button className="btn small ghost" onClick={() => openDialog({ kind: 'settings', section: 'general' })} title="Welche Konten und Arten geprüft werden">
            Einstellungen
          </button>
        </div>
      </div>
      <div className="sg-filters" role="tablist" aria-label="Art">
        {KIND_FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={kind === f.id} className={`chip ${kind === f.id ? 'on' : ''}`} onClick={() => setKind(f.id)}>
            {f.label}
            {counts[f.id] ? <span className="count">{counts[f.id]}</span> : null}
          </button>
        ))}
      </div>

      {picking && (
        <div className="sg-bulk" role="region" aria-label="Mehrfachauswahl">
          <span>
            {pickedItems.length ? `${pickedItems.length} ausgewählt` : 'Eindeutige Aufgaben, Fristen und Notizen auswählen'} · Termine und unsichere Angaben prüfst du einzeln.
          </span>
          <button className="link" onClick={() => setPicked(new Set(bulkable.map((s) => s.id)))}>
            Alle eindeutigen
          </button>
          <button
            className="btn small primary"
            disabled={!pickedItems.length}
            onClick={() => {
              acceptMany(pickedItems)
              setPicked(new Set())
              setPicking(false)
            }}
          >
            <Check /> {pickedItems.length || ''} übernehmen
          </button>
        </div>
      )}

      <div className="sg-scroll">
        {list.length === 0 && (
          <Empty icon={<CalendarCheck />} title={open.length ? 'Nichts in dieser Auswahl' : 'Alles geprüft'}>
            {open.length ? 'Wähle oben eine andere Art.' : 'Neue Termine, Fristen und Aufgaben aus deinen Mails erscheinen hier.'}
          </Empty>
        )}
        {BUCKETS.map((b) => {
          const items = list.filter((s) => s.bucket === b.id)
          if (!items.length) return null
          return (
            <div key={b.id} className="sg-group">
              <div className="sg-group-head">
                {b.label} <span className="count">{items.length}</span>
              </div>
              {items.map((s) => (
                <SuggestionCard
                  key={s.id}
                  s={s}
                  selected={s.id === current?.id}
                  expanded={expanded === s.id}
                  onSelect={() => setSel(s.id)}
                  onToggle={() => setExpanded(expanded === s.id ? null : s.id)}
                  picking={picking}
                  picked={picked.has(s.id)}
                  onPick={() => setPicked((p) => toggle(p, s.id))}
                  snoozeOpen={snoozeFor === s.id}
                  setSnoozeOpen={(v) => setSnoozeFor(v ? s.id : null)}
                />
              ))}
            </div>
          )
        })}

        <Collapsible label="Zurückgestellt" count={snoozed.length} open={showSnoozed} setOpen={setShowSnoozed}>
          {snoozed.map((s) => (
            <MiniRow key={s.id} s={s} note={`bis ${new Date(s.state!.until!).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`} action={{ label: 'Jetzt prüfen', icon: <RotateCcw />, run: () => reopenSuggestion(s.id) }} />
          ))}
        </Collapsible>
        <Collapsible label="Erledigt" count={done.length} open={showDone} setOpen={setShowDone}>
          {done.map((s) => (
            <MiniRow key={s.id} s={s} note={createdLabel(s)} action={{ label: 'Rückgängig', icon: <RotateCcw />, run: () => void undoAccepted(s) }} />
          ))}
        </Collapsible>
        <Collapsible label="Ignoriert" count={ignored.length} open={showIgnored} setOpen={setShowIgnored}>
          {ignored.map((s) => (
            <MiniRow key={s.id} s={s} action={{ label: 'Wiederherstellen', icon: <RotateCcw />, run: () => reopenSuggestion(s.id) }} />
          ))}
        </Collapsible>
        <p className="hint sg-keys">
          <kbd>J</kbd>/<kbd>K</kbd> wählen · <kbd>Enter</kbd> übernehmen · <kbd>L</kbd> später · <kbd>I</kbd> ignorieren · <kbd>Leertaste</kbd> Details · <kbd>O</kbd> Mail öffnen
        </p>
      </div>
    </section>
  )
}

const toggle = (p: Set<string>, id: string) => {
  const n = new Set(p)
  if (n.has(id)) n.delete(id)
  else n.add(id)
  return n
}

function createdLabel(s: SuggestionItem): string {
  const c = s.state?.created
  if (!c) return 'erledigt'
  return c.kind === 'event' ? 'als Termin angelegt' : c.kind === 'task' ? 'als Aufgabe angelegt' : 'als Notiz angelegt'
}

function SuggestionCard(p: {
  s: SuggestionItem
  selected: boolean
  expanded: boolean
  onSelect: () => void
  onToggle: () => void
  picking: boolean
  picked: boolean
  onPick: () => void
  snoozeOpen: boolean
  setSnoozeOpen: (v: boolean) => void
}) {
  const { s } = p
  const go = useStore((st) => st.go)
  const multi = useStore((st) => new Set(st.data.emails.map((m) => m.source)).size > 1)
  const when = whenLabel(s)
  const bulk = canBulk(s)
  return (
    <div
      id={`sg-${s.id}`}
      className={`sg-card ${p.selected ? 'selected' : ''} ${p.expanded ? 'expanded' : ''}`}
      onClick={() => {
        p.onSelect()
        p.onToggle()
      }}
      role="group"
      aria-label={`${KIND_LABEL[s.kind]}: ${s.title}`}
    >
      {p.picking && (
        <input
          type="checkbox"
          className="box-check sg-pick"
          checked={p.picked}
          disabled={!bulk}
          title={bulk ? 'Auswählen' : 'Bitte einzeln prüfen'}
          onClick={(e) => e.stopPropagation()}
          onChange={p.onPick}
          aria-label={`${s.title} auswählen`}
        />
      )}
      <KindIcon kind={s.kind} />
      <div className="sg-main">
        <div className="sg-title">
          <b>{s.title}</b>
        </div>
        <div className="sg-when">
          {when && <span>{when}</span>}
          {s.uncertain && (
            <span className="tag attention" title={s.reason}>
              unsicher
            </span>
          )}
          {s.duplicate && (
            <span className="tag" title={`Ähnlich: ${s.duplicate.title}`}>
              <Copy /> schon vorhanden?
            </span>
          )}
          {s.hasAttachments && (
            <span className="tag" title="Die Mail hat einen Anhang – zur Prüfung in der Mail öffnen">
              <Paperclip /> Anhang
            </span>
          )}
        </div>
        <div className="sg-meta">
          {multi && <span className={`mc-acc acc-${s.source}`}>{SOURCE_LABEL[s.source] ?? ''}</span>}
          <span className="sg-from">{s.from.name || s.from.email}</span>
          <span className="sg-subj">{s.subject}</span>
          {s.followUps ? <span className="hint">+{s.followUps} {s.followUps === 1 ? 'Nachtrag' : 'Nachträge'}</span> : null}
        </div>
        {p.expanded && (
          <div className="sg-details" onClick={(e) => e.stopPropagation()}>
            {s.reason && (
              <div className="sg-reason">
                <Clock /> {s.reason} – bitte vor dem Übernehmen prüfen.
              </div>
            )}
            {s.kind === 'note' && s.noteBody ? <pre className="sg-note selectable">{s.noteBody}</pre> : <blockquote className="selectable">„{s.context}“</blockquote>}
            {s.duplicate && (
              <div className="hint">
                Möglicherweise schon vorhanden: <b>{s.duplicate.title}</b>
              </div>
            )}
            <button className="link" onClick={() => go('inbox', s.threadId)}>
              <Mail /> Zur Mail
            </button>
          </div>
        )}
      </div>
      <div className="sg-actions" onClick={(e) => e.stopPropagation()}>
        <button className="btn small primary" onClick={() => acceptSuggestion(s)} title="Prüfen und übernehmen (Enter)">
          {s.kind === 'event' ? <CalendarPlus /> : s.kind === 'note' ? <StickyNote /> : <CheckSquare />} Übernehmen
        </button>
        <div className="sg-more">
          <button className="btn ghost small icon-btn" onClick={() => p.setSnoozeOpen(!p.snoozeOpen)} title="Später (L)" aria-label="Später" aria-expanded={p.snoozeOpen}>
            <Clock />
          </button>
          <button className="btn ghost small icon-btn" onClick={() => ignoreSuggestion(s)} title="Ignorieren (I)" aria-label="Ignorieren">
            <X />
          </button>
        </div>
        {p.snoozeOpen && <SnoozeMenu onPick={(d) => (snoozeSuggestion(s, d), p.setSnoozeOpen(false))} onClose={() => p.setSnoozeOpen(false)} />}
      </div>
    </div>
  )
}

function SnoozeMenu({ onPick, onClose }: { onPick: (d: Date) => void; onClose: () => void }) {
  const [custom, setCustom] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    setTimeout(() => document.addEventListener('mousedown', off), 0)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', off)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])
  return (
    <div className="sg-snooze" ref={ref} role="menu" aria-label="Wiedervorlage">
      {snoozeOptions().map((o) => (
        <button key={o.label} role="menuitem" onClick={() => onPick(o.at)}>
          {o.label}
          <span className="hint">{o.at.toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </button>
      ))}
      <div className="sg-snooze-custom">
        <input className="input" type="date" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Eigenes Datum" />
        <button className="btn small" disabled={!custom} onClick={() => onPick(new Date(`${custom}T08:00:00`))}>
          OK
        </button>
      </div>
    </div>
  )
}

function Collapsible(p: { label: string; count: number; open: boolean; setOpen: (v: boolean) => void; children: React.ReactNode }) {
  if (!p.count) return null
  return (
    <div className="sg-collapse">
      <button className="sg-collapse-head" onClick={() => p.setOpen(!p.open)} aria-expanded={p.open}>
        {p.open ? <ChevronDown /> : <ChevronRight />} {p.label} <span className="count">{p.count}</span>
      </button>
      {p.open && <div>{p.children}</div>}
    </div>
  )
}

function MiniRow({ s, note, action }: { s: SuggestionItem; note?: string; action: { label: string; icon: React.ReactNode; run: () => void } }) {
  return (
    <div className="sg-mini">
      <KindIcon kind={s.kind} />
      <span className="sg-mini-text">
        <b>{s.title}</b>
        <span className="hint">
          {whenLabel(s) ?? s.from.name}
          {note ? ` · ${note}` : ''}
        </span>
      </span>
      <button className="btn ghost small" onClick={action.run}>
        {action.icon} {action.label}
      </button>
    </div>
  )
}

/** Kompakte Vorschläge zu einer geöffneten Mail (ersetzt die frühere reine Terminerkennung) */
export function ThreadSuggestions({ threadId }: { threadId: string }) {
  const { open, done } = useSuggestions()
  const items = open.filter((s) => s.threadId === threadId)
  const finished = done.filter((s) => s.threadId === threadId)
  if (!items.length && !finished.length) return null
  return (
    <div className="mail-suggest" role="note" aria-label="Erkannt in dieser Mail">
      {items.map((s) => (
        <div key={s.id} className="ms-row">
          <KindIcon kind={s.kind} />
          <span className="ms-text">
            <b>
              {KIND_LABEL[s.kind]}: {whenLabel(s) ?? s.title}
              {s.uncertain && (
                <span className="tag attention" title={s.reason} style={{ marginLeft: 6 }}>
                  unsicher
                </span>
              )}
            </b>
            <span>{s.kind === 'note' ? s.noteBody?.split('\n').slice(0, 2).join(' · ') : `„${s.context}“`}</span>
          </span>
          <button className="btn small primary" onClick={() => acceptSuggestion(s)}>
            Übernehmen
          </button>
          <button className="btn ghost small icon-btn" onClick={() => ignoreSuggestion(s)} aria-label="Ignorieren" title="Ignorieren">
            <X />
          </button>
        </div>
      ))}
      {finished.map((s) => (
        <div key={s.id} className="ms-row done">
          <span className="ms-icon">
            <CalendarCheck />
          </span>
          <span className="ms-text">
            <b>
              {KIND_LABEL[s.kind]} {createdLabel(s)}
            </b>
            <span>{s.title}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

/** Anzahl offener Vorschläge für die Navigation */
export function useOpenSuggestionCount(): number {
  return useSuggestions().open.length
}
