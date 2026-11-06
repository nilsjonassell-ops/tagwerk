import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { AlertTriangle, BarChart3, CalendarClock, CalendarPlus, Check, CheckSquare, ChevronDown, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Inbox, Mail, Plus, Settings2, ShoppingCart, Sparkles, Sun } from 'lucide-react'
import { buildBrief, eventsOnDay, findConflicts, freeBlocks, groupThreads, isDueToday, isOverdue, sortTasks, eventHasConflict, ymd, type BriefItem } from '@shared/analysis'
import { layoutDay } from '@shared/agenda'
import { dayKey, mealsOn, SLOT_LABEL } from '@shared/meals'
import { parseQuickTask } from '@shared/parse-de'
import type { CalEvent, DashboardCardId, Task, ViewId, WeatherResult } from '@shared/types'
import { OPEN_METEO } from '@shared/services'
import { useStore } from '@/lib/store'
import { dueLabel, fDayLong, fTime, greeting, mailDate, projectHue, projectName } from '@/lib/format'
import { addTask, newTask, toggleTask } from '@/lib/actions'
import { useMealsUi } from '@/views/Meals'
import { PriorityMark, ViewHeader } from '@/components/ui'

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function TodayView() {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const go = useStore((s) => s.go)
  const setAssistant = useStore((s) => s.setAssistant)
  const openDialog = useStore((s) => s.openDialog)
  const now = useNow()

  const todays = useMemo(() => eventsOnDay(data.events, now), [data.events, now])
  const conflicts = useMemo(() => findConflicts(todays, settings.transitionBufferMinutes), [todays, settings.transitionBufferMinutes])
  const free = useMemo(() => freeBlocks(todays, now, settings.workHours, settings.focusMinMinutes, now), [todays, now, settings])
  const brief = useMemo(
    () => buildBrief(data, now, { workHours: settings.workHours, bufferMinutes: settings.transitionBufferMinutes, focusMinMinutes: settings.focusMinMinutes }),
    [data, now, settings]
  )
  const remaining = todays.filter((e) => !e.allDay && new Date(e.end) > now)
  const open = useMemo(() => sortTasks(data.tasks.filter((t) => isOverdue(t, now) || isDueToday(t, now))), [data.tasks, now])
  const overdue = open.filter((t) => isOverdue(t, now))
  const dueToday = open.filter((t) => !isOverdue(t, now))
  const doneToday = useMemo(() => data.tasks.filter((t) => t.status === 'done' && !t.archived && t.completedAt && sameDay(new Date(t.completedAt), now)), [data.tasks, now])
  const threads = useMemo(
    () =>
      groupThreads(data.emails.filter((e) => e.folder === 'inbox'), data.replyMarks).filter(
        (t) => t.replyManual || (t.needsReply && (t.important || t.unread)) || (t.important && t.unread && !data.replyMarks?.[t.id])
      ),
    [data.emails, data.replyMarks]
  )
  const visible = (id: DashboardCardId) => settings.dashboardCards.find((c) => c.id === id)?.visible
  // Links der Tagesplan, rechts alles andere in der eigenen Reihenfolge
  const side = settings.dashboardCards.filter((c) => c.visible && !['schedule', 'focus', 'weather'].includes(c.id)).map((c) => c.id)
  const openTarget = (t?: BriefItem['target']) => t && go(t.view as ViewId, t.id)
  const next = remaining[0]
  const live = next && new Date(next.start) <= now

  const cards: Record<string, ReactElement> = {
    tasks: <TasksCard key="tasks" overdue={overdue} dueToday={dueToday} doneToday={doneToday} now={now} />,
    brief: (
      <section className="dash-card" key="brief" aria-labelledby="h-brief">
        <header>
          <h2 id="h-brief">Das Wichtigste</h2>
        </header>
        {brief.length === 0 ? (
          <p className="dash-empty">Nichts Dringendes – keine Konflikte, nichts Überfälliges.</p>
        ) : (
          <ul className="brief">
            {brief.slice(0, 5).map((b, i) => (
              <li key={i}>
                <button className={`brief-item ${b.tone}`} onClick={() => openTarget(b.target)}>
                  <span className="marker" aria-hidden="true" />
                  <span>{b.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <footer>
          <span>Automatisch aus Kalender, Aufgaben und Posteingang</span>
          {settings.claude.enabled && (
            <button className="btn small ghost" onClick={() => setAssistant(true, 'Erstelle meine Tagesübersicht für heute: Was ist wichtig, wo gibt es Konflikte und wie sollte ich die freie Zeit nutzen?')}>
              <Sparkles /> Mit Claude planen
            </button>
          )}
        </footer>
      </section>
    ),
    mail: (
      <section className="dash-card" key="mail" aria-labelledby="h-mail">
        <header>
          <h2 id="h-mail">
            Wartet auf dich <span className="n">{threads.length || ''}</span>
          </h2>
          <button className="link" onClick={() => go('inbox')}>
            Posteingang
          </button>
        </header>
        {threads.length === 0 ? (
          <p className="dash-empty">
            <Inbox aria-hidden="true" /> Keine offenen wichtigen E-Mails.
          </p>
        ) : (
          <ul className="dash-list">
            {threads.slice(0, 4).map((th) => (
              <li key={th.id}>
                <button className="dash-row" onClick={() => go('inbox', th.id)}>
                  {th.unread ? <span className="unread-dot" aria-label="ungelesen" /> : <span className="dot-space" />}
                  <span className="main-col">
                    <span className={`title ${th.unread ? 'strong' : ''}`} title={th.subject}>
                      {th.subject}
                    </span>
                    <span className="meta">
                      {th.latest.from.name} · {mailDate(th.latest.date, now)}
                    </span>
                  </span>
                  {th.needsReply && <span className="tag attention">Antwort offen</span>}
                </button>
              </li>
            ))}
            {threads.length > 4 && (
              <li>
                <button className="link more" onClick={() => go('inbox')}>
                  {threads.length - 4} weitere
                </button>
              </li>
            )}
          </ul>
        )}
      </section>
    ),
    meals: <MealsCard key="meals" now={now} />
  }

  return (
    <>
      <ViewHeader title="Heute">
        <button className="btn ghost small" onClick={() => openDialog({ kind: 'review' })} title="Was diese Woche geschafft wurde">
          <BarChart3 /> Wochenrückblick
        </button>
        <button className="btn ghost small" onClick={() => openDialog({ kind: 'settings', section: 'dashboard' })} title="Übersicht anpassen">
          <Settings2 /> Anpassen
        </button>
        <button className="btn small" onClick={() => openDialog({ kind: 'event' })}>
          <CalendarPlus /> Termin
        </button>
        <button className="btn small primary" onClick={() => openDialog({ kind: 'task' })}>
          <Plus /> Aufgabe
        </button>
      </ViewHeader>
      <div className="view-body scrolls">
        <div className="today">
          <div className="greeting">
            <div>
              <h1>{greeting(now, settings.userName)}</h1>
              <div className="date">{fDayLong.format(now)}</div>
            </div>
            {visible('weather') && <WeatherInline city={settings.weather.city} enabled={settings.weather.enabled} />}
          </div>

          <div className="today-chips" role="list" aria-label="Kurz zusammengefasst">
            <button role="listitem" className={`chip-stat ${live ? 'live' : ''}`} onClick={() => go('calendar', next?.id)} disabled={!next && !todays.length}>
              <CalendarClock aria-hidden="true" />
              {next ? (
                live ? (
                  <span>
                    <b>Jetzt:</b> {next.title} · bis {fTime.format(new Date(next.end))}
                  </span>
                ) : (
                  <span>
                    <b>{fTime.format(new Date(next.start))}</b> {next.title} · {untilText(new Date(next.start), now)}
                  </span>
                )
              ) : (
                <span>Heute keine weiteren Termine</span>
              )}
            </button>
            {overdue.length > 0 && (
              <button role="listitem" className="chip-stat alert" onClick={() => go('tasks')}>
                <AlertTriangle aria-hidden="true" />
                <span>
                  <b>{overdue.length}</b> überfällig
                </span>
              </button>
            )}
            <button role="listitem" className="chip-stat" onClick={() => go('tasks')}>
              <CheckSquare aria-hidden="true" />
              <span>
                <b>{dueToday.length}</b> heute fällig{doneToday.length ? ` · ${doneToday.length} erledigt` : ''}
              </span>
            </button>
            {threads.length > 0 && (
              <button role="listitem" className="chip-stat" onClick={() => go('inbox')}>
                <Mail aria-hidden="true" />
                <span>
                  <b>{threads.length}</b> {threads.length === 1 ? 'Mail wartet' : 'Mails warten'}
                </span>
              </button>
            )}
          </div>

          <div className={`dash-layout ${visible('schedule') ? '' : 'no-plan'}`}>
            {visible('schedule') && <DayPlan events={todays} now={now} conflicts={conflicts} free={visible('focus') ? free : []} />}
            <div className="dash-side">{side.map((id) => cards[id])}</div>
          </div>
        </div>
      </div>
    </>
  )
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
function untilText(t: Date, now: Date) {
  const m = Math.round((t.getTime() - now.getTime()) / 60000)
  if (m < 1) return 'gleich'
  if (m < 60) return `in ${m} Min.`
  const h = Math.floor(m / 60)
  return m % 60 >= 10 ? `in ${h} Std. ${m % 60} Min.` : `in ${h} Std.`
}

/** Großer Tagesplan: Termine senkrecht, Überschneidungen nebeneinander, freie Zeit anklickbar */
function DayPlan({ events, now, conflicts, free }: { events: CalEvent[]; now: Date; conflicts: ReturnType<typeof findConflicts>; free: ReturnType<typeof freeBlocks> }) {
  const settings = useStore((s) => s.settings)
  const data = useStore((s) => s.data)
  const go = useStore((s) => s.go)
  const openDialog = useStore((s) => s.openDialog)
  const L = useMemo(() => layoutDay(events, now, settings.workHours), [events, now.toDateString(), settings.workHours]) // eslint-disable-line react-hooks/exhaustive-deps
  const PX = 0.8 // Pixel je Minute (48 px je Stunde)
  const scroller = useRef<HTMLDivElement>(null)
  const nowMin = (now.getHours() - L.startH) * 60 + now.getMinutes()
  const showNow = nowMin >= 0 && nowMin <= (L.endH - L.startH) * 60
  // Beim Öffnen zur aktuellen Uhrzeit (eine Stunde Vorlauf) scrollen
  useEffect(() => {
    if (scroller.current && showNow) scroller.current.scrollTop = Math.max(0, (nowMin - 60) * PX)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const hours: number[] = []
  for (let h = L.startH; h < L.endH; h++) hours.push(h)
  const minuteOf = (d: Date) => (d.getHours() - L.startH) * 60 + d.getMinutes()
  const fmtDur = (m: number) => `${Math.floor(m / 60) ? `${Math.floor(m / 60)} Std.` : ''}${m % 60 ? ` ${m % 60} Min.` : ''}`.trim()

  return (
    <section className="dash-card day-plan" aria-labelledby="h-plan">
      <header>
        <h2 id="h-plan">
          Tagesplan <span className="n">{events.filter((e) => !e.allDay).length ? `${events.filter((e) => !e.allDay).length} Termine` : ''}</span>
        </h2>
        <button className="link" onClick={() => go('calendar')}>
          Kalender
        </button>
      </header>
      {L.allDay.length > 0 && (
        <ul className="plan-allday" aria-label="Ganztägig">
          {L.allDay.map((e) => (
            <li key={e.id}>
              <button className="allday-chip" onClick={() => go('calendar', e.id)} style={{ ['--h' as string]: projectHue(data, e.projectId) }}>
                {e.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="plan-scroll" ref={scroller}>
        <div className="plan-grid-day" style={{ height: (L.endH - L.startH) * 60 * PX }}>
          {hours.map((h) => (
            <div key={h} className={`plan-hour ${h < settings.workHours.start || h >= settings.workHours.end ? 'off' : ''}`} style={{ top: (h - L.startH) * 60 * PX, height: 60 * PX }}>
              <span>{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
          <div className="plan-lane">
            {free.map((f, i) => {
              const top = minuteOf(f.start)
              const height = minuteOf(f.end) - top
              return (
                <button
                  key={`f${i}`}
                  className="plan-free"
                  style={{ top: top * PX, height: height * PX }}
                  onClick={() => openDialog({ kind: 'event', preset: { start: f.start.toISOString(), end: new Date(Math.min(f.end.getTime(), f.start.getTime() + 3600_000)).toISOString() } })}
                  title={`Frei ${fTime.format(f.start)}–${fTime.format(f.end)} – Termin anlegen`}
                >
                  <span>
                    frei · {fmtDur(f.minutes)}
                    <Plus aria-hidden="true" />
                  </span>
                </button>
              )
            })}
            {L.items.map(({ event: e, top, height, col, cols }) => {
              const s = new Date(e.start)
              const en = new Date(e.end)
              const c = eventHasConflict(e, conflicts)
              const past = en < now
              const tall = height * PX >= 44
              return (
                <button
                  key={e.id}
                  className={`plan-event ${past ? 'past' : ''} ${c?.kind === 'overlap' ? 'conflict' : ''} ${tall ? '' : 'short'}`}
                  style={{ top: top * PX + 1, height: height * PX - 2, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`, ['--h' as string]: projectHue(data, e.projectId) }}
                  onClick={() => go('calendar', e.id)}
                  title={`${e.title} · ${fTime.format(s)}–${fTime.format(en)}${e.location ? ` · ${e.location}` : ''}`}
                >
                  <span className="t">{e.title}</span>
                  <span className="s">
                    {fTime.format(s)}–{fTime.format(en)}
                    {tall && e.location ? ` · ${e.location}` : ''}
                  </span>
                  {c &&
                    (cols > 2 ? (
                      // Schmale Spalte: nur Symbol, Text für Screenreader und Tooltip – der Titel bleibt lesbar
                      <span className={`flag icon ${c.kind === 'overlap' ? 'alert' : 'attention'}`} role="img" aria-label={c.kind === 'overlap' ? 'Konflikt' : 'knapp'}>
                        <AlertTriangle aria-hidden="true" />
                      </span>
                    ) : (
                      <span className={`flag ${c.kind === 'overlap' ? 'alert' : 'attention'}`}>{c.kind === 'overlap' ? 'Konflikt' : 'knapp'}</span>
                    ))}
                </button>
              )
            })}
            {L.items.length === 0 && (
              <div className="plan-empty">
                <span>Heute keine Termine</span>
                <button className="btn small" onClick={() => openDialog({ kind: 'event' })}>
                  <CalendarPlus /> Termin anlegen
                </button>
              </div>
            )}
          </div>
          {showNow && (
            <div className="plan-now" style={{ top: nowMin * PX }} aria-label={`Jetzt ${fTime.format(now)}`}>
              <span>{fTime.format(now)}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function TasksCard({ overdue, dueToday, doneToday, now }: { overdue: Task[]; dueToday: Task[]; doneToday: Task[]; now: Date }) {
  const data = useStore((s) => s.data)
  const go = useStore((s) => s.go)
  const openDialog = useStore((s) => s.openDialog)
  const [input, setInput] = useState('')
  const [showDone, setShowDone] = useState(false)
  const parsed = input.trim() ? parseQuickTask(input, data.projects, now) : null
  const add = () => {
    if (!parsed?.title) return
    addTask(newTask({ title: parsed.title, due: parsed.due ?? ymd(now), dueTime: parsed.time, priority: parsed.priority ?? 'medium', projectId: parsed.projectId, recurrence: parsed.recurrence ?? 'none' }))
    setInput('')
  }
  const row = (t: Task) => {
    const done = t.status === 'done'
    const dl = t.due ? dueLabel(t.due, now) : null
    const proj = projectName(data, t.projectId)
    return (
      <li key={t.id} className={`dash-task ${done ? 'is-done' : ''}`}>
        <button className={`check ${done ? 'done' : ''} ${t.priority === 'high' && !done ? 'prio-high' : ''}`} onClick={() => toggleTask(t.id)} aria-label={done ? `„${t.title}“ wieder öffnen` : `„${t.title}“ erledigen`} aria-pressed={done}>
          <Check />
        </button>
        <button className="main-col" onClick={() => openDialog({ kind: 'task', id: t.id })}>
          <span className="title" title={t.title}>
            {t.title}
          </span>
          {(dl || proj || t.dueTime) && !done && (
            <span className="meta">
              {dl?.tone === 'overdue' && <span className="overdue-text">überfällig {dl.text}</span>}
              {t.dueTime && <span>{t.dueTime} Uhr</span>}
              {proj && <span>{proj}</span>}
            </span>
          )}
        </button>
        {!done && <PriorityMark p={t.priority} />}
      </li>
    )
  }
  const total = overdue.length + dueToday.length
  return (
    <section className="dash-card" aria-labelledby="h-tasks">
      <header>
        <h2 id="h-tasks">
          Aufgaben <span className="n">{total || ''}</span>
        </h2>
        <button className="link" onClick={() => openDialog({ kind: 'plan' })}>
          Einplanen
        </button>
        <button className="link" onClick={() => go('tasks')}>
          Alle
        </button>
      </header>
      <div className="dash-quick">
        <Plus aria-hidden="true" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
            if (e.key === 'Escape') setInput('')
          }}
          placeholder="Aufgabe für heute – Enter legt an"
          aria-label="Aufgabe für heute anlegen"
        />
      </div>
      {total === 0 && doneToday.length === 0 && <p className="dash-empty">Für heute ist nichts fällig.</p>}
      {total === 0 && doneToday.length > 0 && <p className="dash-empty ok">Alles für heute erledigt.</p>}
      {overdue.length > 0 && (
        <>
          <h3 className="dash-sub alert">Überfällig · {overdue.length}</h3>
          <ul className="dash-list">{overdue.slice(0, 4).map(row)}</ul>
        </>
      )}
      {dueToday.length > 0 && (
        <>
          <h3 className="dash-sub">Heute · {dueToday.length}</h3>
          <ul className="dash-list">{dueToday.slice(0, 6).map(row)}</ul>
        </>
      )}
      {overdue.length > 4 || dueToday.length > 6 ? (
        <button className="link more" onClick={() => go('tasks')}>
          {Math.max(0, overdue.length - 4) + Math.max(0, dueToday.length - 6)} weitere in „Aufgaben“
        </button>
      ) : null}
      {doneToday.length > 0 && (
        <>
          <button className="dash-sub disclosure" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            <ChevronDown aria-hidden="true" /> Heute erledigt · {doneToday.length}
          </button>
          {showDone && <ul className="dash-list">{doneToday.slice(0, 8).map(row)}</ul>}
        </>
      )}
    </section>
  )
}

function MealsCard({ now }: { now: Date }) {
  const data = useStore((s) => s.data)
  const go = useStore((s) => s.go)
  const today = dayKey(now)
  const meals = mealsOn(data.meals ?? [], today)
  const openItems = (data.shoppingItems ?? []).filter((i) => !i.deleted && !i.done).length
  const plan = () => {
    useMealsUi.getState().set({ tab: 'plan', meal: { date: today } })
    go('meals')
  }
  return (
    <section className="dash-card" aria-labelledby="h-meals">
      <header>
        <h2 id="h-meals">Essen heute</h2>
        <button className="link" onClick={() => (useMealsUi.getState().set({ tab: 'plan' }), go('meals'))}>
          Essensplan
        </button>
      </header>
      {meals.length === 0 ? (
        <p className="dash-empty">
          Nichts geplant.{' '}
          <button className="link" onClick={plan}>
            Gericht planen
          </button>
        </p>
      ) : (
        <ul className="dash-list">
          {meals.map((m) => (
            <li key={m.id}>
              <button className="dash-row" onClick={() => (useMealsUi.getState().set({ tab: 'plan', meal: { id: m.id } }), go('meals'))}>
                <span className="slot">{SLOT_LABEL[m.slot]}</span>
                <span className="main-col">
                  <span className="title" title={m.title}>
                    {m.title}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {openItems > 0 && (
        <footer>
          <button className="link" onClick={() => (useMealsUi.getState().set({ tab: 'shopping' }), go('meals'))}>
            <ShoppingCart aria-hidden="true" /> Einkaufsliste: {openItems} offen
          </button>
        </footer>
      )}
    </section>
  )
}

function weatherIcon(code?: number) {
  if (code === undefined) return Cloud
  if (code === 0) return Sun
  if (code <= 3) return CloudSun
  if (code <= 48) return CloudFog
  if (code <= 57) return CloudDrizzle
  if (code <= 67 || (code >= 80 && code <= 82)) return CloudRain
  if (code <= 77 || code === 85 || code === 86) return CloudSnow
  return CloudLightning
}

function WeatherInline({ city, enabled }: { city: string; enabled: boolean }) {
  const [w, setW] = useState<WeatherResult | null>(null)
  const openDialog = useStore((s) => s.openDialog)
  const online = useStore((s) => s.online)
  useEffect(() => {
    if (!enabled || !city || !online) return
    let alive = true
    window.tagwerk.weather.get(city).then((r) => alive && setW(r))
    return () => {
      alive = false
    }
  }, [city, enabled, online])
  if (!enabled || !city)
    return (
      <button className="link" onClick={() => openDialog({ kind: 'settings', section: 'sources' })}>
        Wetter einrichten
      </button>
    )
  if (!online) return <div className="weather">Wetter offline nicht verfügbar</div>
  if (!w) return <div className="weather"><span className="skeleton" style={{ width: 120, height: 32, display: 'block' }} /></div>
  if (!w.ok) return <div className="weather">{w.error}</div>
  const Icon = weatherIcon(w.code)
  return (
    <div className="weather">
      <Icon aria-hidden="true" />
      <div>
        <div className="temp">{Math.round(w.temperature ?? 0)}°</div>
        <div style={{ fontSize: 'var(--fs-sm)' }}>
          {w.city} · {Math.round(w.min ?? 0)}°/{Math.round(w.max ?? 0)}°{w.precipitation ? ` · ${w.precipitation}% Regen` : ''}
        </div>
        {/* Pflichthinweis der Lizenz (CC BY 4.0) */}
        <a className="weather-credit" href={OPEN_METEO.url} target="_blank" rel="noreferrer" title={`Wetterdaten von Open-Meteo.com, Lizenz ${OPEN_METEO.license.text}`}>
          Wetterdaten: Open-Meteo
        </a>
      </div>
    </div>
  )
}
