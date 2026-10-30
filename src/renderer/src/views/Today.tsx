import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Inbox, Sparkles, Sun, CheckCircle2, Plus, Settings2, BarChart3 } from 'lucide-react'
import { buildBrief, eventsOnDay, findConflicts, freeBlocks, groupThreads, isDueToday, isOverdue, sortTasks, eventHasConflict, type BriefItem } from '@shared/analysis'
import type { CalEvent, DashboardCardId, ViewId, WeatherResult } from '@shared/types'
import { useStore } from '@/lib/store'
import { dueLabel, fDayLong, fTime, greeting, mailDate, projectHue, projectName } from '@/lib/format'
import { toggleTask } from '@/lib/actions'
import { Empty, PriorityMark, ViewHeader } from '@/components/ui'

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
  const tasks = useMemo(() => sortTasks(data.tasks.filter((t) => isOverdue(t, now) || isDueToday(t, now))), [data.tasks, now])
  const threads = useMemo(
    () =>
      groupThreads(data.emails.filter((e) => e.folder === 'inbox'), data.replyMarks).filter(
        (t) => t.replyManual || (t.needsReply && (t.important || t.unread)) || (t.important && t.unread && !data.replyMarks?.[t.id])
      ),
    [data.emails, data.replyMarks]
  )
  const visible = (id: DashboardCardId) => settings.dashboardCards.find((c) => c.id === id)?.visible
  const order = settings.dashboardCards.filter((c) => c.visible && c.id !== 'weather' && c.id !== 'focus').map((c) => c.id)

  const openTarget = (t?: BriefItem['target']) => t && go(t.view as ViewId, t.id)

  const sections: Record<string, ReactElement> = {
    brief: (
      <section className="dash-section" key="brief" aria-labelledby="h-brief">
        <h2 id="h-brief">Das Wichtigste heute</h2>
        <div className="brief">
          {brief.length === 0 && <Empty compact title="Nichts Dringendes.">Keine Konflikte, nichts Überfälliges.</Empty>}
          {brief.map((b, i) => (
            <button key={i} className={`brief-item ${b.tone}`} onClick={() => openTarget(b.target)}>
              <span className="marker" aria-hidden="true" />
              <span>{b.text}</span>
            </button>
          ))}
          <div className="brief-foot">
            <span>Automatisch aus Kalender, Aufgaben und Posteingang</span>
            {settings.claude.enabled && (
              <button className="btn small" onClick={() => setAssistant(true, 'Erstelle meine Tagesübersicht für heute: Was ist wichtig, wo gibt es Konflikte und wie sollte ich die freie Zeit nutzen?')}>
                <Sparkles /> Mit Claude planen
              </button>
            )}
          </div>
        </div>
      </section>
    ),
    schedule: (
      <section className="dash-section" key="schedule" aria-labelledby="h-sched">
        <h2 id="h-sched">
          Nächste Termine <span className="sub">{remaining.length ? `${remaining.length} heute` : ''}</span>
          <button className="link" onClick={() => go('calendar')}>
            Kalender
          </button>
        </h2>
        <div className="list">
          {remaining.length === 0 && (
            <Empty compact title="Heute keine weiteren Termine.">
              Der Rest des Tages gehört dir.
            </Empty>
          )}
          {remaining.slice(0, 5).map((e) => {
            const c = eventHasConflict(e, conflicts)
            const live = new Date(e.start) <= now
            return (
              <button key={e.id} className="list-row" onClick={() => go('calendar', e.id)}>
                <span className="time">{fTime.format(new Date(e.start))}</span>
                <span className="project-dot" style={{ background: `hsl(${projectHue(data, e.projectId)} 40% 50%)` }} />
                <span className="main-col">
                  <span className="title">{e.title}</span>
                  <span className="meta">
                    {live && <span className="today-text">läuft gerade</span>}
                    {e.location && <span>{e.location}</span>}
                  </span>
                </span>
                {c && <span className={`tag ${c.kind === 'overlap' ? 'alert' : 'attention'}`}>{c.kind === 'overlap' ? 'Konflikt' : 'knapp'}</span>}
              </button>
            )
          })}
        </div>
      </section>
    ),
    tasks: (
      <section className="dash-section" key="tasks" aria-labelledby="h-tasks">
        <h2 id="h-tasks">
          Aufgaben für heute <span className="sub">{tasks.length || ''}</span>
          <button className="link" onClick={() => useStore.getState().openDialog({ kind: 'plan' })} style={{ marginLeft: 'auto' }}>
            Einplanen
          </button>
          <button className="link" onClick={() => go('tasks')} style={{ marginLeft: 0 }}>
            Alle Aufgaben
          </button>
        </h2>
        <div className="list">
          {tasks.length === 0 && (
            <Empty compact icon={<CheckCircle2 />} title="Alles erledigt für heute.">
              <button className="link" onClick={() => openDialog({ kind: 'task' })}>
                Aufgabe hinzufügen
              </button>
            </Empty>
          )}
          {tasks.slice(0, 7).map((t) => {
            const dl = t.due ? dueLabel(t.due, now) : null
            return (
              <div key={t.id} className="list-row" style={{ cursor: 'default' }}>
                <button className={`check ${t.priority === 'high' ? 'prio-high' : ''}`} onClick={() => toggleTask(t.id)} aria-label={`„${t.title}“ erledigen`}>
                  <CheckCircle2 />
                </button>
                <button className="main-col" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left' }} onClick={() => openDialog({ kind: 'task', id: t.id })}>
                  <span className="title">{t.title}</span>
                  <span className="meta">
                    {dl && <span className={dl.tone === 'overdue' ? 'overdue-text' : dl.tone === 'today' ? 'today-text' : ''}>{dl.tone === 'overdue' ? `überfällig ${dl.text}` : dl.text}{t.dueTime ? ` · ${t.dueTime}` : ''}</span>}
                    {projectName(data, t.projectId) && <span>{projectName(data, t.projectId)}</span>}
                  </span>
                </button>
                <PriorityMark p={t.priority} />
              </div>
            )
          })}
          {tasks.length > 7 && (
            <button className="link" style={{ margin: '6px 10px' }} onClick={() => go('tasks')}>
              {tasks.length - 7} weitere
            </button>
          )}
        </div>
      </section>
    ),
    mail: (
      <section className="dash-section" key="mail" aria-labelledby="h-mail">
        <h2 id="h-mail">
          Wartet auf dich <span className="sub">{threads.length || ''}</span>
          <button className="link" onClick={() => go('inbox')}>
            Posteingang
          </button>
        </h2>
        <div className="list">
          {threads.length === 0 && <Empty compact icon={<Inbox />} title="Keine offenen wichtigen E-Mails." />}
          {threads.slice(0, 5).map((th) => (
            <button key={th.id} className="list-row" onClick={() => go('inbox', th.id)}>
              {th.unread ? <span className="unread-dot" aria-label="ungelesen" /> : <span style={{ width: 8 }} />}
              <span className="main-col">
                <span className="title" style={{ fontWeight: th.unread ? 600 : 400 }}>
                  {th.subject}
                </span>
                <span className="meta">
                  <span>{th.latest.from.name}</span>
                  <span>{mailDate(th.latest.date, now)}</span>
                </span>
              </span>
              {th.needsReply && <span className="tag attention">Antwort offen</span>}
            </button>
          ))}
        </div>
      </section>
    )
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
        <button className="btn small" onClick={() => openDialog({ kind: 'task' })}>
          <Plus /> Aufgabe
        </button>
      </ViewHeader>
      <div className="view-body">
        <div className="today">
          <div className="greeting">
            <div>
              <h1>{greeting(now, settings.userName)}</h1>
              <div className="date">
                {fDayLong.format(now)}
                {remaining.length ? ` – noch ${remaining.length} ${remaining.length === 1 ? 'Termin' : 'Termine'}` : ''}
              </div>
            </div>
            {visible('weather') && <WeatherInline city={settings.weather.city} enabled={settings.weather.enabled} />}
          </div>

          {visible('focus') && <DayRibbon events={todays} now={now} conflicts={conflicts} free={free} />}

          <div className="dash-grid">{order.map((id) => sections[id])}</div>
        </div>
      </div>
    </>
  )
}

function DayRibbon({ events, now, conflicts, free }: { events: CalEvent[]; now: Date; conflicts: ReturnType<typeof findConflicts>; free: ReturnType<typeof freeBlocks> }) {
  const settings = useStore((s) => s.settings)
  const data = useStore((s) => s.data)
  const go = useStore((s) => s.go)
  const timed = events.filter((e) => !e.allDay)
  const startH = Math.min(settings.workHours.start - 1, ...timed.map((e) => new Date(e.start).getHours()))
  const endH = Math.max(settings.workHours.end + 1, ...timed.map((e) => new Date(e.end).getHours() + (new Date(e.end).getMinutes() ? 1 : 0)))
  const day0 = new Date(now)
  day0.setHours(0, 0, 0, 0)
  const span = (endH - startH) * 60
  const pos = (d: Date) => Math.max(0, Math.min(100, (((d.getTime() - day0.getTime()) / 60000 - startH * 60) / span) * 100))

  // Bahnen für überlappende Termine
  const lanes: number[] = []
  const laneEnd: number[] = []
  timed.forEach((e, i) => {
    const s = new Date(e.start).getTime()
    let lane = laneEnd.findIndex((end) => end <= s)
    if (lane === -1) lane = laneEnd.length
    laneEnd[lane] = new Date(e.end).getTime()
    lanes[i] = Math.min(lane, 1)
  })
  const stacked = lanes.some((l) => l === 1)
  const hours = []
  for (let h = startH; h <= endH; h += 2) hours.push(h)
  const nowPct = pos(now)
  const showNow = now.getHours() >= startH && now.getHours() < endH

  return (
    <div className="ribbon" role="group" aria-label="Tagesverlauf">
      <div className="ribbon-hours" aria-hidden="true">
        {hours.map((h) => (
          <span key={h} style={{ left: `${((h - startH) / (endH - startH)) * 100}%` }}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
      <div className="ribbon-track">
        <div className="ribbon-offhours" style={{ left: 0, width: `${((settings.workHours.start - startH) / (endH - startH)) * 100}%` }} />
        <div className="ribbon-offhours" style={{ left: `${((settings.workHours.end - startH) / (endH - startH)) * 100}%`, right: 0 }} />
        {free.map((f, i) => (
          <div key={i} className="ribbon-free" style={{ left: `${pos(f.start)}%`, width: `${pos(f.end) - pos(f.start)}%` }} title={`Frei ${fTime.format(f.start)}–${fTime.format(f.end)}`}>
            frei · {Math.floor(f.minutes / 60) ? `${Math.floor(f.minutes / 60)} Std.` : ''} {f.minutes % 60 ? `${f.minutes % 60} Min.` : ''}
          </div>
        ))}
        {timed.map((e, i) => {
          const s = new Date(e.start)
          const en = new Date(e.end)
          const c = eventHasConflict(e, conflicts)
          return (
            <button
              key={e.id}
              className={`ribbon-event lane-${lanes[i]} ${stacked ? 'stacked' : ''} ${en < now ? 'past' : ''} ${c?.kind === 'overlap' ? 'conflict' : ''}`}
              style={{ left: `${pos(s)}%`, width: `calc(${pos(en) - pos(s)}% - 2px)`, ['--h' as string]: projectHue(data, e.projectId) }}
              onClick={() => go('calendar', e.id)}
              title={`${e.title} · ${fTime.format(s)}–${fTime.format(en)}${e.location ? ` · ${e.location}` : ''}`}
            >
              <span className="t">{e.title}</span>
              {!stacked && <span className="s">{fTime.format(s)}–{fTime.format(en)}</span>}
            </button>
          )
        })}
      </div>
      {showNow && <div className="ribbon-now" style={{ left: `${nowPct}%` }} aria-label={`Jetzt ${fTime.format(now)}`} />}
      <div className="ribbon-legend">
        <span>
          <i style={{ background: 'repeating-linear-gradient(135deg, var(--hatch) 0 3px, transparent 3px 6px)', boxShadow: 'inset 0 0 0 1px var(--accent-line)' }} /> Freie Zeit ab {settings.focusMinMinutes} Min.
        </span>
        {conflicts.some((c) => c.kind === 'overlap') && (
          <span>
            <i style={{ boxShadow: 'inset 0 0 0 1.5px var(--alert)' }} /> Überschneidung
          </span>
        )}
        <span>
          <i style={{ background: 'var(--sunken)' }} /> außerhalb der Arbeitszeit
        </span>
      </div>
    </div>
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
    <div className="weather" title="Quelle: Open-Meteo">
      <Icon aria-hidden="true" />
      <div>
        <div className="temp">{Math.round(w.temperature ?? 0)}°</div>
        <div style={{ fontSize: 'var(--fs-sm)' }}>
          {w.city} · {Math.round(w.min ?? 0)}°/{Math.round(w.max ?? 0)}°{w.precipitation ? ` · ${w.precipitation}% Regen` : ''}
        </div>
      </div>
    </div>
  )
}
