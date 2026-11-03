// „Aus Mails übernehmen“: erkannte Termine, Fristen, Aufgaben und Infos prüfen und übernehmen.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlarmClock, ArrowRight, CalendarCheck, CalendarPlus, Check, CheckSquare, ChevronDown, ChevronRight, Clock, Copy, Mail, Merge, Paperclip, RefreshCw, Repeat, RotateCcw, Scissors, StickyNote, Tag, X, ListChecks } from 'lucide-react'
import type { SuggestionKind } from '@shared/types'
import { useStore } from '@/lib/store'
import { SOURCE_LABEL } from '@/lib/accounts'
import { acceptMany, acceptSuggestion, addRule, excludeSender, ignoreMail, canBulk, canMerge, createSplit, ignoreSuggestion, mergeSuggestions, reopenSuggestion, snoozeOptions, snoozeSuggestion, splitParts, undoAccepted, useSuggestions, type SuggestionItem } from '@/lib/suggestions'
import { Dialog, Switch } from './ui'
import { useAccounts } from '@/lib/accounts'
import { detectAll } from '@shared/mail-insights'
import { Ban, EyeOff, Info, Pause } from 'lucide-react'
import { Empty } from './ui'

type KindFilter = 'all' | SuggestionKind | 'uncertain'
const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'event', label: 'Termine' },
  { id: 'deadline', label: 'Fristen' },
  { id: 'task', label: 'Aufgaben' },
  { id: 'note', label: 'Notizen' },
  { id: 'uncertain', label: 'Wartet auf Prüfung' }
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
  const cfg = useStore((s) => s.settings.mailInsights)
  if (!cfg.introDone) return <SuggestionsIntro />
  return <SuggestionsList />
}

function SuggestionsList() {
  const { open, snoozed, done, ignored, all } = useSuggestions()
  const cfg = useStore((s) => s.settings.mailInsights)
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

  const list = useMemo(() => {
    const l = open.filter((s) => kind === 'all' || (kind === 'uncertain' ? s.uncertain : s.kind === kind))
    // Vorschläge einer Unterhaltung bleiben zusammen – in der frühesten Gruppe
    const order = { today: 0, week: 1, later: 2 } as const
    const best = new Map<string, SuggestionItem['bucket']>()
    for (const s of l) {
      const b = best.get(s.threadId)
      if (!b || order[s.bucket] < order[b]) best.set(s.threadId, s.bucket)
    }
    return l.map((s) => (best.get(s.threadId) === s.bucket ? s : { ...s, bucket: best.get(s.threadId)! }))
  }, [open, kind])
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
      else if (e.key === 'Enter') (s.conflict ? setExpanded(s.id) : acceptSuggestion(s))
      else if (e.key === 'i' || e.key === 'Delete') {
        ignoreSuggestion(s)
        move(1)
      } else if (e.key === 'l') setSnoozeFor(s.id)
      else if (e.key === ' ') setExpanded(expanded === s.id ? null : s.id)
      else if (e.key === 'x' && picking && canMerge(s)) setPicked((p) => toggle(p, s.id))
      else if (e.key === 'o') go('inbox', s.threadId)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, expanded, picking, go])

  const bulkable = list.filter(canBulk)
  const mergeable = list.filter(canMerge)
  const pickedItems = list.filter((s) => picked.has(s.id))
  const pickedBulk = pickedItems.filter(canBulk)

  return (
    <section className="suggest-pane" aria-label="Aus Mails übernehmen">
      <div className="sg-head">
        <div>
          <h2>Aus Mails übernehmen</h2>
          <CheckStatus />
        </div>
        <div className="row" style={{ gap: 6 }}>
          <label className="row sg-pause" title="Prüfung anhalten – Vorhandenes bleibt erhalten">
            <span className="hint">Prüfung</span>
            <Switch label="Prüfung an" checked={!cfg.paused} onChange={(v) => void useStore.getState().updateSettings({ mailInsights: { ...cfg, paused: !v } })} />
          </label>
          {mergeable.length > 1 && (
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
            {pickedItems.length ? `${pickedItems.length} ausgewählt` : 'Aufgaben, Fristen und Notizen auswählen'} · Termine und unsichere Angaben werden nicht ungeprüft übernommen.
          </span>
          {bulkable.length > 0 && (
            <button className="link" onClick={() => setPicked(new Set(bulkable.map((s) => s.id)))}>
              Alle eindeutigen
            </button>
          )}
          <button
            className="btn small"
            disabled={pickedItems.length < 2}
            title="Zu einer Aufgabe zusammenführen (vorher prüfen)"
            onClick={() => {
              mergeSuggestions(pickedItems)
              setPicked(new Set())
              setPicking(false)
            }}
          >
            <Merge /> Zusammenführen
          </button>
          <button
            className="btn small primary"
            disabled={!pickedBulk.length}
            title={pickedItems.length > pickedBulk.length ? `${pickedItems.length - pickedBulk.length} unsichere bitte einzeln prüfen` : undefined}
            onClick={() => {
              acceptMany(pickedBulk)
              setPicked(new Set())
              setPicking(false)
            }}
          >
            <Check /> {pickedBulk.length || ''} übernehmen
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
              {groupByThread(items).map((g) => (
                <ThreadGroup key={g.threadId} items={g.items}>
                {g.items.map((s) => (
                <SuggestionCard
                  key={s.id}
                  s={s}
                  all={all}
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
                </ThreadGroup>
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

/** Vorschläge derselben Unterhaltung zusammenhalten (Reihenfolge des ersten Auftretens) */
function groupByThread(items: SuggestionItem[]): { threadId: string; items: SuggestionItem[] }[] {
  const out: { threadId: string; items: SuggestionItem[] }[] = []
  for (const s of items) {
    const g = out.find((x) => x.threadId === s.threadId)
    if (g) g.items.push(s)
    else out.push({ threadId: s.threadId, items: [s] })
  }
  return out
}

function ThreadGroup({ items, children }: { items: SuggestionItem[]; children: React.ReactNode }) {
  if (items.length < 2) return <>{children}</>
  return (
    <div className="sg-thread" role="group" aria-label={`Unterhaltung: ${items[0].subject}`}>
      <div className="sg-thread-head">
        <Mail /> {items[0].subject.replace(/^((re|aw|fwd?|wg)\s*:\s*)+/gi, '')} <span className="hint">· {items.length} Vorschläge aus einer Unterhaltung</span>
      </div>
      {children}
    </div>
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
  all: SuggestionItem[]
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
      className={`sg-card ${p.selected ? 'selected' : ''} ${p.expanded ? 'expanded' : ''} ${s.change ? 'is-change' : ''}`}
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
          disabled={!canMerge(s)}
          title={canMerge(s) ? (bulk ? 'Auswählen' : 'Auswählen – zum Zusammenführen; übernehmen bitte einzeln') : 'Termine bitte einzeln prüfen'}
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
        {s.change ? (
          <div className="sg-change">
            <span className="tag attention">
              <RefreshCw /> Änderung
            </span>
            <span className="old">{s.change.oldLabel}</span>
            <ArrowRight />
            <b>{s.change.newLabel}</b>
            <span className="hint">· {s.change.kind === 'event' ? 'Termin' : 'Aufgabe'} „{s.change.title}“</span>
          </div>
        ) : null}
        <div className="sg-when">
          {when && !s.change && <span>{when}</span>}
          {s.recurrence && (
            <span className="tag" title="Wiederkehrend – beim Übernehmen wählst du „nur dieser“ oder „ganze Serie“">
              <Repeat /> {s.recurrence.label}
            </span>
          )}
          {s.ruleId && projectLabel(s.projectId) && (
            <span className="tag" title="Projekt aus deiner Regel">
              <Tag /> {projectLabel(s.projectId)}
            </span>
          )}
          {s.conflict ? (
            <span className="tag alert" title={s.reason}>
              widersprüchlich
            </span>
          ) : s.uncertain ? (
            <span className="tag attention" title={s.reason}>
              unsicher
            </span>
          ) : !s.change && !s.manual ? (
            <span className="sg-ok" title={s.basis}>
              <Check /> eindeutig
            </span>
          ) : null}
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
            <div className="sg-basis">
              <Info /> {s.basis}
            </div>
            {s.reason && !s.conflict && (
              <div className="sg-reason">
                <Clock /> {s.reason} – bitte vor dem Übernehmen prüfen.
              </div>
            )}
            {s.conflict && (
              <div className="sg-conflict">
                <div className="sg-reason">
                  <Clock /> {s.conflict.label}. Was ist gemeint?
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {s.conflict.options.map((o) => (
                    <button key={o.label} className="btn small" onClick={() => acceptSuggestion(s, o)}>
                      <CalendarPlus /> {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {s.kind === 'note' && s.noteBody ? <pre className="sg-note selectable">{s.noteBody}</pre> : <blockquote className="selectable">„{s.context}“</blockquote>}
            {s.duplicate && (
              <div className="hint">
                Möglicherweise schon vorhanden: <b>{s.duplicate.title}</b>
              </div>
            )}
            <div className="sg-detail-actions">
              <button className="link" onClick={() => go('inbox', s.threadId)}>
                <Mail /> Zur Mail
              </button>
              {(s.kind === 'task' || s.kind === 'deadline') && !s.change && (
                <button className="link" onClick={() => useStore.getState().openDialog({ kind: 'split', suggestionId: s.id })}>
                  <Scissors /> Aufteilen
                </button>
              )}
              <RuleQuick s={s} />
              {!s.manual && (
                <button className="link" onClick={() => ignoreMail(s.mailId, p.all)} title="Alle Vorschläge aus dieser einen Mail ausblenden – andere Mails sind nicht betroffen">
                  <EyeOff /> Für diese Mail nicht wieder vorschlagen
                </button>
              )}
              {s.from.email && (
                <button className="link" onClick={() => void excludeSender(s.from.email)} title="Mails dieses Absenders nicht mehr prüfen (nach Rückfrage)">
                  <Ban /> Absender ausschließen …
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="sg-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn small primary"
          onClick={() => (s.conflict ? !p.expanded && p.onToggle() : acceptSuggestion(s))}
          title={s.conflict ? 'Erst entscheiden, welches Datum gemeint ist' : 'Prüfen und übernehmen (Enter)'}
        >
          {s.change ? <RefreshCw /> : s.kind === 'event' ? <CalendarPlus /> : s.kind === 'note' ? <StickyNote /> : <CheckSquare />} {s.change ? 'Aktualisieren' : s.conflict ? 'Entscheiden' : 'Übernehmen'}
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
  const cfg = useStore((st) => st.settings.mailInsights)
  const emails = useStore((st) => st.data.emails)
  const states = useStore((st) => st.data.suggestions)
  // Vor dem Einstieg in die Vorschläge: wie bisher nur erkannte Termine dieser Mail anbieten (seit 1.6.0 vorhanden)
  const early = useMemo<SuggestionItem[]>(() => {
    if (cfg.introDone || !cfg.enabled || cfg.paused) return []
    return detectAll(emails.filter((m) => m.threadId === threadId), { kinds: ['event'], exclude: cfg.excludeSenders })
      .filter((s) => !states?.[s.id])
      .map((s) => ({ ...s, bucket: 'today' as const, duplicate: null }))
  }, [cfg, emails, states, threadId])
  const items = cfg.introDone ? open.filter((s) => s.threadId === threadId) : early
  const finished = done.filter((s) => s.threadId === threadId)
  if (!items.length && !finished.length) return null
  return (
    <div className="mail-suggest" role="note" aria-label="Erkannt in dieser Mail">
      {items.map((s) => (
        <div key={s.id} className="ms-row">
          <KindIcon kind={s.kind} />
          <span className="ms-text">
            <b>
              {s.change ? `Änderung: ${s.change.oldLabel} → ${s.change.newLabel}` : `${KIND_LABEL[s.kind]}: ${whenLabel(s) ?? s.title}`}
              {s.uncertain && (
                <span className="tag attention" title={s.reason} style={{ marginLeft: 6 }}>
                  unsicher
                </span>
              )}
            </b>
            <span>{s.kind === 'note' ? s.noteBody?.split('\n').slice(0, 2).join(' · ') : `„${s.context}“`}</span>
          </span>
          <button className="btn small primary" onClick={() => acceptSuggestion(s)}>
            {s.change ? 'Aktualisieren' : 'Übernehmen'}
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

function projectLabel(id?: string): string | undefined {
  return id ? useStore.getState().data.projects.find((p) => p.id === id)?.name : undefined
}

/** „Mails von X immer Projekt Y vorschlagen“ direkt an der Karte */
function RuleQuick({ s }: { s: SuggestionItem }) {
  const projects = useStore((st) => st.data.projects)
  const [open, setOpen] = useState(false)
  if (!projects.length) return null
  const who = s.from.email || s.from.name
  if (!open)
    return (
      <button className="link" onClick={() => setOpen(true)} title="Regel: Mails von diesem Absender bekommen automatisch ein Projekt">
        <Tag /> {s.ruleId ? 'Regel ändern' : 'Projekt für Absender merken'}
      </button>
    )
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="hint">Mails von {who} →</span>
      <select
        className="select"
        autoFocus
        defaultValue={s.projectId ?? ''}
        onChange={(e) => {
          if (e.target.value) addRule('from', who, e.target.value)
          setOpen(false)
        }}
        aria-label="Projekt für diesen Absender"
      >
        <option value="">Projekt wählen …</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </span>
  )
}

/** Aufteilen: eine Bitte mit mehreren Teilen wird zu mehreren Aufgaben */
export function SplitDialog({ suggestionId }: { suggestionId: string }) {
  const { all } = useSuggestions()
  const s = all.find((x) => x.id === suggestionId)
  const close = () => useStore.getState().openDialog(null)
  const [parts, setParts] = useState<string[]>(() => (s ? splitParts(s) : []))
  if (!s) return null
  const valid = parts.filter((x) => x.trim()).length
  return (
    <Dialog
      title="Vorschlag aufteilen"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            disabled={!valid}
            onClick={() => {
              createSplit(s, parts)
              close()
            }}
          >
            {valid} {valid === 1 ? 'Aufgabe' : 'Aufgaben'} anlegen
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        Jede Zeile wird eine eigene Aufgabe{s.due ? ` (fällig ${new Date(`${s.due}T12:00:00`).toLocaleDateString('de-DE')})` : ''}, alle mit Verweis auf die Mail.
      </p>
      <blockquote className="sg-split-src">„{s.context}“</blockquote>
      <div className="sg-split">
        {parts.map((p, i) => (
          <div key={i} className="row" style={{ gap: 6 }}>
            <input className="input" value={p} onChange={(e) => setParts(parts.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Aufgabe ${i + 1}`} placeholder="Weitere Aufgabe" />
            <button className="btn ghost small icon-btn" onClick={() => setParts(parts.filter((_, j) => j !== i))} aria-label="Entfernen" disabled={parts.length < 2}>
              <X />
            </button>
          </div>
        ))}
        <button className="link" style={{ justifySelf: 'start' }} onClick={() => setParts([...parts, ''])}>
          + Weitere Aufgabe
        </button>
      </div>
    </Dialog>
  )
}

/** „Prüft Gmail, Outlook · zuletzt 11:53“ bzw. pausiert */
function CheckStatus() {
  const cfg = useStore((s) => s.settings.mailInsights)
  const google = useStore((s) => s.google)
  const gSync = useStore((s) => s.googleSync)
  const ms = useAccounts((s) => s.ms)
  const oSync = useAccounts((s) => s.outlookSync)
  const demo = useStore((s) => s.data.sources.demo)
  if (cfg.paused)
    return (
      <p className="hint row" style={{ gap: 6 }}>
        <Pause size={13} /> Pausiert – es werden keine Mails ausgewertet.
      </p>
    )
  const boxes = [google.connected && google.caps.gmailRead && (!cfg.sources.length || cfg.sources.includes('google')) && 'Gmail', ms.connected && ms.caps.mail && (!cfg.sources.length || cfg.sources.includes('outlook')) && 'Outlook', demo && (!cfg.sources.length || cfg.sources.includes('demo')) && 'Beispiel-Mails'].filter(Boolean)
  const last = Math.max(gSync.lastSync ? new Date(gSync.lastSync).getTime() : 0, oSync.lastSync ? new Date(oSync.lastSync).getTime() : 0)
  return (
    <p className="hint">
      {boxes.length ? `Prüft ${boxes.join(', ')}` : 'Kein Postfach verbunden'}
      {last ? ` · zuletzt geprüft ${new Date(last).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''} · angelegt wird erst, wenn du bestätigst.
    </p>
  )
}

/** Erstes Aktivieren: mit wenigen Arten beginnen und vorab sehen, was erkannt würde */
function SuggestionsIntro() {
  const cfg = useStore((s) => s.settings.mailInsights)
  const emails = useStore((s) => s.data.emails)
  const [kinds, setKinds] = useState<SuggestionKind[]>(['event', 'deadline'])
  const preview = useMemo(() => detectAll(emails, { kinds, sources: cfg.sources, exclude: cfg.excludeSenders }).slice(0, 5), [emails, kinds, cfg.sources, cfg.excludeSenders])
  const toggleKind = (k: SuggestionKind, on: boolean) => setKinds(on ? [...new Set([...kinds, k])] : kinds.filter((x) => x !== k))
  const start = () => void useStore.getState().updateSettings({ mailInsights: { ...cfg, kinds, introDone: true, paused: false } })
  const names: [SuggestionKind, string, string][] = [
    ['event', 'Termine', '„Treffen am 12.11. um 17 Uhr“'],
    ['deadline', 'Fristen', '„bis spätestens Mittwoch“'],
    ['task', 'Aufgaben', '„Könntest du … schicken?“'],
    ['note', 'Infos für Notizen', 'Buchungsnummer, Raum, Link']
  ]
  return (
    <section className="suggest-pane sg-intro" aria-label="Vorschläge aus Mails einrichten">
      <div className="sg-head">
        <div>
          <h2>Aus Mails übernehmen</h2>
          <p className="hint">Tagwerk liest deine Mails lokal auf diesem PC und schlägt Termine, Fristen, Aufgaben und Infos vor – ohne KI, ohne Server. Angelegt wird nur, was du bestätigst.</p>
        </div>
      </div>
      <div className="sg-scroll">
        <div className="sg-intro-kinds">
          <b>Womit möchtest du beginnen?</b>
          <span className="hint">Du kannst später jederzeit weitere Arten einschalten.</span>
          <div className="sg-intro-grid">
            {names.map(([k, label, ex]) => (
              <label key={k} className={`sg-intro-kind ${kinds.includes(k) ? 'on' : ''}`}>
                <input type="checkbox" className="box-check" checked={kinds.includes(k)} onChange={(e) => toggleKind(k, e.target.checked)} />
                <KindIcon kind={k} />
                <span>
                  <b>{label}</b>
                  <small>{ex}</small>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="sg-group-head">Vorschau aus deinen Mails {preview.length ? <span className="count">{preview.length}</span> : null}</div>
        {preview.length ? (
          preview.map((s) => (
            <div key={s.id} className="sg-mini sg-preview">
              <KindIcon kind={s.kind} />
              <span className="sg-mini-text">
                <b>{s.title}</b>
                <span className="hint">
                  {whenLabel({ ...s, bucket: 'later', duplicate: null } as SuggestionItem) ?? KIND_LABEL[s.kind]} · {s.from.name || s.from.email}
                  {s.uncertain ? ' · unsicher' : ''}
                </span>
              </span>
            </div>
          ))
        ) : (
          <p className="hint" style={{ padding: '0 8px' }}>In den Mails der letzten 30 Tage wurde dafür noch nichts gefunden.</p>
        )}
        <div className="row" style={{ gap: 10, margin: '16px 8px' }}>
          <button className="btn primary" onClick={start} disabled={!kinds.length}>
            <Check /> Prüfung starten
          </button>
          <span className="hint">Konten, Arten und ausgeschlossene Absender änderst du unter Einstellungen → Allgemein.</span>
        </div>
      </div>
    </section>
  )
}
