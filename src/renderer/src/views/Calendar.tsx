import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, FileText, Mail, MapPin, NotebookPen, Pencil, Plus, Sparkles, Trash2, Users, X, CheckSquare, Lock } from 'lucide-react'
import { addDays, eventsOnDay, findConflicts, freeBlocks, relatedToEvent, startOfDay, ymd, type Conflict } from '@shared/analysis'
import type { CalEvent } from '@shared/types'
import { useStore } from '@/lib/store'
import { durationLabel, fDayLong, fDayMed, fMonthYear, fTime, fWeekdayShort, minutesBetween, projectHue, projectName } from '@/lib/format'
import { deleteEvent, meetingNoteFor } from '@/lib/actions'
import { Segmented, SourceTag, ViewHeader } from '@/components/ui'

type Mode = 'day' | 'week' | 'month'
const HOUR_PX = 48

export function CalendarView() {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const selectedId = useStore((s) => s.selection.calendar)
  const select = useStore((s) => s.select)
  const openDialog = useStore((s) => s.openDialog)
  const [mode, setMode] = useState<Mode>('week')
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const selected = data.events.find((e) => e.id === selectedId)

  // Ausgewählten Termin in den sichtbaren Zeitraum holen
  useEffect(() => {
    if (selected) {
      const d = startOfDay(new Date(selected.start))
      setAnchor((a) => (visibleDays(mode, a).some((x) => x.getTime() === d.getTime()) ? a : d))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [role=dialog]')) return
      if (e.key === 't' || e.key === 'T') setAnchor(startOfDay(new Date()))
      else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) step(-1)
      else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) step(1)
      else if (e.key === 'd') setMode('day')
      else if (e.key === 'w') setMode('week')
      else if (e.key === 'm') setMode('month')
      else if (e.key === 'Escape' && selectedId) select('calendar', undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const step = (dir: number) => {
    setAnchor((a) => {
      if (mode === 'day') return addDays(a, dir)
      if (mode === 'week') return addDays(a, dir * 7)
      return new Date(a.getFullYear(), a.getMonth() + dir, 1)
    })
  }

  const days = visibleDays(mode, anchor)
  const label =
    mode === 'month'
      ? fMonthYear.format(anchor)
      : mode === 'day'
        ? fDayLong.format(anchor)
        : `${days[0].getDate()}.${days[0].getMonth() !== days[6].getMonth() ? ` ${days[0].toLocaleDateString('de-DE', { month: 'short' })}` : ''} – ${days[6].getDate()}. ${days[6].toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`

  return (
    <>
      <ViewHeader title="Kalender">
        {data.sources.demo && <SourceTag source="demo" />}
        <button className="btn small" onClick={() => openDialog({ kind: 'event', preset: { start: defaultStart(anchor) } })}>
          <Plus /> Termin
        </button>
      </ViewHeader>
      <div className="view-body" style={{ overflow: 'hidden' }}>
        <div className="cal">
          <div className="cal-toolbar">
            <div className="range" aria-live="polite">
              {label}
            </div>
            <div style={{ flex: 1 }} />
            <button className="btn small" onClick={() => setAnchor(startOfDay(new Date()))} title="Heute (T)">
              Heute
            </button>
            <button className="btn small icon-btn" onClick={() => step(-1)} aria-label="Zurück">
              <ChevronLeft />
            </button>
            <button className="btn small icon-btn" onClick={() => step(1)} aria-label="Weiter">
              <ChevronRight />
            </button>
            <Segmented
              label="Ansicht"
              value={mode}
              onChange={setMode}
              options={[
                { id: 'day', label: 'Tag' },
                { id: 'week', label: 'Woche' },
                { id: 'month', label: 'Monat' }
              ]}
            />
          </div>
          <div className="cal-body">
            <div className="cal-main">
              {mode === 'month' ? (
                <MonthGrid anchor={anchor} events={data.events} onPickDay={(d) => (setAnchor(d), setMode('day'))} />
              ) : (
                <TimeGrid days={days} events={data.events} settings={settings} />
              )}
            </div>
            {selected && <EventDetail ev={selected} onClose={() => select('calendar', undefined)} />}
          </div>
        </div>
      </div>
    </>
  )
}

function defaultStart(anchor: Date) {
  const d = new Date(anchor)
  const now = new Date()
  if (ymd(d) === ymd(now)) d.setHours(now.getHours() + 1, 0, 0, 0)
  else d.setHours(10, 0, 0, 0)
  return d.toISOString()
}

function visibleDays(mode: Mode, anchor: Date): Date[] {
  if (mode === 'day') return [anchor]
  if (mode === 'week') {
    const monday = addDays(anchor, -((anchor.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  }
  return []
}

// ---------- Zeitraster (Tag / Woche) ----------

function layoutDay(evs: CalEvent[]): Map<string, { col: number; cols: number }> {
  const out = new Map<string, { col: number; cols: number }>()
  const sorted = [...evs].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end))
  let cluster: CalEvent[] = []
  let clusterEnd = 0
  const flush = () => {
    const colEnds: number[] = []
    const assign: [string, number][] = []
    for (const e of cluster) {
      const s = new Date(e.start).getTime()
      let c = colEnds.findIndex((x) => x <= s)
      if (c === -1) c = colEnds.length
      colEnds[c] = new Date(e.end).getTime()
      assign.push([e.id, c])
    }
    for (const [id, c] of assign) out.set(id, { col: c, cols: colEnds.length })
    cluster = []
  }
  for (const e of sorted) {
    const s = new Date(e.start).getTime()
    if (cluster.length && s >= clusterEnd) flush()
    cluster.push(e)
    clusterEnd = Math.max(clusterEnd, new Date(e.end).getTime())
  }
  if (cluster.length) flush()
  return out
}

function TimeGrid({ days, events, settings }: { days: Date[]; events: CalEvent[]; settings: ReturnType<typeof useStore.getState>['settings'] }) {
  const data = useStore((s) => s.data)
  const selectedId = useStore((s) => s.selection.calendar)
  const select = useStore((s) => s.select)
  const openDialog = useStore((s) => s.openDialog)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (settings.workHours.start - 1) * HOUR_PX)
  }, [settings.workHours.start, days.length])

  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`
  const perDay = days.map((d) => {
    const evs = eventsOnDay(events, d)
    const timed = evs.filter((e) => !e.allDay)
    return {
      day: d,
      allDay: evs.filter((e) => e.allDay),
      timed,
      layout: layoutDay(timed),
      conflicts: findConflicts(timed, settings.transitionBufferMinutes),
      free: ymd(d) < ymd(now) || d.getDay() === 0 || d.getDay() === 6 ? [] : freeBlocks(timed, d, settings.workHours, settings.focusMinMinutes, ymd(d) === ymd(now) ? now : undefined)
    }
  })

  const createAt = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const minutes = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 4) * 15
    const start = new Date(day)
    start.setHours(0, minutes, 0, 0)
    openDialog({ kind: 'event', preset: { start: start.toISOString(), end: new Date(start.getTime() + 3600_000).toISOString() } })
  }

  return (
    <>
      <div className="week-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {perDay.map(({ day, allDay }) => (
          <div key={day.toISOString()} className={`day-label ${ymd(day) === ymd(now) ? 'is-today' : ''}`}>
            {fWeekdayShort.format(day)}
            <b>{day.getDate()}</b>
            {allDay.length > 0 && (
              <div className="allday">
                {allDay.map((e) => (
                  <button key={e.id} className="cal-event allday-chip" style={{ ['--h' as string]: projectHue(data, e.projectId) }} onClick={() => select('calendar', e.id)}>
                    {e.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="week-scroll" ref={scrollRef}>
        <div className="week-grid" style={{ gridTemplateColumns: cols, height: HOUR_PX * 24 }}>
          <div className="hour-col">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="hour" style={{ height: HOUR_PX }}>
                {h > 0 && <span>{String(h).padStart(2, '0')}:00</span>}
              </div>
            ))}
          </div>
          {perDay.map(({ day, timed, layout, conflicts, free }) => {
            const isToday = ymd(day) === ymd(now)
            return (
              <div key={day.toISOString()} className={`day-col ${isToday ? 'is-today' : ''}`} onDoubleClick={(e) => (e.target as HTMLElement).classList.contains('slot') && createAt(day, e)}>
                {Array.from({ length: 48 }, (_, i) => (
                  <div key={i} className={`slot ${i % 2 ? 'half' : ''}`} style={{ height: HOUR_PX / 2 }} />
                ))}
                <div className="offhours" style={{ top: 0, height: settings.workHours.start * HOUR_PX }} />
                <div className="offhours" style={{ top: settings.workHours.end * HOUR_PX, bottom: 0 }} />
                {free.map((f, i) => (
                  <div key={i} className="focus-block" style={{ top: minutesOfDay(f.start) * (HOUR_PX / 60), height: f.minutes * (HOUR_PX / 60) }}>
                    frei · {durationLabel(f.minutes)}
                  </div>
                ))}
                {timed.map((e) => {
                  const s = new Date(e.start)
                  const startMin = Math.max(0, (s.getTime() - day.getTime()) / 60000)
                  const endMin = Math.min(1440, (new Date(e.end).getTime() - day.getTime()) / 60000)
                  const l = layout.get(e.id) ?? { col: 0, cols: 1 }
                  const c = conflicts.find((x) => x.a.id === e.id || x.b.id === e.id)
                  const height = Math.max(20, (endMin - startMin) * (HOUR_PX / 60) - 2)
                  return (
                    <button
                      key={e.id}
                      className={`cal-event ${selectedId === e.id ? 'selected' : ''} ${c ? (c.kind === 'overlap' ? 'conflict' : 'tight') : ''} ${new Date(e.end) < now ? 'past' : ''}`}
                      style={{
                        top: startMin * (HOUR_PX / 60) + 1,
                        height,
                        left: `calc(${(l.col / l.cols) * 100}% + 3px)`,
                        width: `calc(${100 / l.cols}% - 6px)`,
                        ['--h' as string]: projectHue(data, e.projectId)
                      }}
                      onClick={() => select('calendar', e.id)}
                      onDoubleClick={() => openDialog({ kind: 'event', id: e.id })}
                      title={c ? (c.kind === 'overlap' ? 'Überschneidung mit einem anderen Termin' : `Knapper Übergang (${c.gapMinutes} Min.)`) : undefined}
                    >
                      <span className="t">{e.title}</span>
                      {height > 34 && (
                        <span className="s">
                          {fTime.format(s)}–{fTime.format(new Date(e.end))}
                          {e.location && height > 52 ? ` · ${e.location}` : ''}
                        </span>
                      )}
                    </button>
                  )
                })}
                {isToday && <div className="now-line" style={{ top: minutesOfDay(now) * (HOUR_PX / 60) }} />}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()

// ---------- Monat ----------

function MonthGrid({ anchor, events, onPickDay }: { anchor: Date; events: CalEvent[]; onPickDay: (d: Date) => void }) {
  const data = useStore((s) => s.data)
  const select = useStore((s) => s.select)
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = addDays(first, -((first.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const todayKey = ymd(new Date())
  return (
    <>
      <div className="month-dow">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="month">
        {cells.map((d) => {
          const evs = eventsOnDay(events, d)
          const conflicts = findConflicts(evs, 0).filter((c) => c.kind === 'overlap')
          return (
            <div key={d.toISOString()} className={`month-cell ${d.getMonth() !== anchor.getMonth() ? 'other' : ''} ${ymd(d) === todayKey ? 'is-today' : ''}`}>
              <div className="row" style={{ gap: 6 }}>
                <button className="num" onClick={() => onPickDay(d)} aria-label={`${fDayLong.format(d)} öffnen`}>
                  {d.getDate()}
                </button>
                {conflicts.length > 0 && <AlertTriangle size={13} color="var(--alert)" aria-label="Terminkonflikt" />}
              </div>
              {evs.slice(0, 3).map((e) => (
                <button key={e.id} className="month-ev" style={{ ['--h' as string]: projectHue(data, e.projectId) }} onClick={() => select('calendar', e.id)}>
                  <i />
                  {!e.allDay && <span className="tm">{fTime.format(new Date(e.start))}</span>}
                  <span>{e.title}</span>
                </button>
              ))}
              {evs.length > 3 && (
                <button className="month-more link" onClick={() => onPickDay(d)}>
                  +{evs.length - 3} weitere
                </button>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ---------- Details & Meeting-Vorbereitung ----------

function EventDetail({ ev, onClose }: { ev: CalEvent; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const go = useStore((s) => s.go)
  const openDialog = useStore((s) => s.openDialog)
  const setAssistant = useStore((s) => s.setAssistant)
  const related = useMemo(() => relatedToEvent(data, ev), [data, ev])
  const conflicts: Conflict[] = useMemo(
    () => findConflicts(eventsOnDay(data.events, new Date(ev.start)), settings.transitionBufferMinutes).filter((c) => c.a.id === ev.id || c.b.id === ev.id),
    [data.events, ev, settings.transitionBufferMinutes]
  )
  const s = new Date(ev.start)
  const e = new Date(ev.end)
  const proj = projectName(data, ev.projectId)

  return (
    <aside className="detail-pane" aria-label="Termindetails">
      <div className="pane-head">
        <h3 className="selectable">{ev.title}</h3>
        <button className="btn ghost small icon-btn" onClick={onClose} aria-label="Details schließen">
          <X />
        </button>
      </div>
      <div className="kv selectable">
        <Clock />
        <div>
          {fDayMed.format(s)}
          <br />
          {ev.allDay ? 'ganztägig' : `${fTime.format(s)}–${fTime.format(e)} Uhr · ${durationLabel(minutesBetween(ev.start, ev.end))}`}
        </div>
        {ev.location && (
          <>
            <MapPin />
            <div>{ev.location}</div>
          </>
        )}
        {ev.attendees.length > 0 && (
          <>
            <Users />
            <div>{ev.attendees.map((a) => a.name).join(', ')}</div>
          </>
        )}
        {ev.notes && (
          <>
            <FileText />
            <div style={{ whiteSpace: 'pre-wrap' }}>{ev.notes}</div>
          </>
        )}
      </div>
      <div className="row" style={{ padding: '0 18px 12px', gap: 6, flexWrap: 'wrap' }}>
        <SourceTag source={ev.source} />
        {ev.readOnly && (
          <span className="tag">
            <Lock /> schreibgeschützt
          </span>
        )}
        {proj && (
          <button className="tag" style={{ border: 0 }} onClick={() => go('projects', ev.projectId)}>
            {proj}
          </button>
        )}
      </div>
      {conflicts.map((c, i) => {
        const other = c.a.id === ev.id ? c.b : c.a
        return (
          <div key={i} className={`callout ${c.kind === 'tight' ? 'attention' : ''}`} role="note">
            <AlertTriangle />
            <span>
              {c.kind === 'overlap'
                ? `Überschneidet sich mit „${other.title}“ (${fTime.format(new Date(other.start))}–${fTime.format(new Date(other.end))}).`
                : `Nur ${c.gapMinutes} Min. bis bzw. nach „${other.title}“ – mit Ortswechsel.`}
            </span>
          </div>
        )
      })}

      <div className="pane-section">
        <h4>Zur Vorbereitung</h4>
        {related.emails.length + related.notes.length + related.docs.length + related.tasks.length === 0 && <div className="hint">Keine verknüpften E-Mails, Notizen oder Dokumente gefunden.</div>}
        {related.emails.map((t) => (
          <button key={t.id} className="mini-row" onClick={() => go('inbox', t.id)}>
            <Mail />
            <span className="grow">{t.subject}</span>
            <span className="side">{t.latest.from.name.split(' ')[0]}</span>
          </button>
        ))}
        {related.notes.map((n) => (
          <button key={n.id} className="mini-row" onClick={() => go('notes', n.id)}>
            <NotebookPen />
            <span className="grow">{n.title || 'Ohne Titel'}</span>
          </button>
        ))}
        {related.tasks.slice(0, 4).map((t) => (
          <button key={t.id} className="mini-row" onClick={() => openDialog({ kind: 'task', id: t.id })}>
            <CheckSquare />
            <span className="grow">{t.title}</span>
          </button>
        ))}
        {related.docs.map((d) => (
          <div key={d.id} className="mini-row" title="Dokumentablage nicht verbunden – nur Titel aus der Demo-Datenquelle">
            <FileText />
            <span className="grow">{d.title}</span>
            <span className="side">{d.kind}</span>
          </div>
        ))}
      </div>

      <div className="pane-actions">
        <button className="btn small" onClick={() => meetingNoteFor(ev)}>
          <NotebookPen /> Meetingnotiz
        </button>
        <button
          className="btn small"
          onClick={() =>
            setAssistant(
              true,
              `Bereite mich auf den Termin „${ev.title}“ am ${fDayMed.format(s)} um ${fTime.format(s)} Uhr vor (ID ${ev.id}). Fasse zusammen, was ich aus E-Mails, Aufgaben und Notizen wissen sollte, und was offen ist.`,
              related.emails.map((t) => t.id)
            )
          }
        >
          <Sparkles /> Mit Claude vorbereiten
        </button>
        {!ev.readOnly && (
          <>
            <button className="btn small ghost" onClick={() => openDialog({ kind: 'event', id: ev.id })}>
              <Pencil /> Bearbeiten
            </button>
            <button className="btn small ghost" onClick={async () => (await deleteEvent(ev.id)) && onClose()} aria-label="Termin löschen">
              <Trash2 />
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
