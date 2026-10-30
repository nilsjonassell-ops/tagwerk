// Wochenrückblick: was diese Woche geschafft wurde, wie viel Fokuszeit es gab,
// was noch offen ist und was nächste Woche ansteht. Rein lokal berechnet.

import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock, Mail, Target, AlertTriangle, ArrowRight } from 'lucide-react'
import { weekReview } from '@shared/analysis'
import { useStore } from '@/lib/store'
import { durationLabel, fTime, projectName } from '@/lib/format'
import { Dialog } from '@/components/ui'

const fDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
const fRange = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export function WeeklyReview() {
  const data = useStore((s) => s.data)
  const go = useStore((s) => s.go)
  const openDialog = useStore((s) => s.openDialog)
  const close = () => openDialog(null)
  const [now] = useState(() => new Date())
  const r = useMemo(() => weekReview(data, now), [data, now])
  const from = new Date(r.from)
  const maxFocus = Math.max(30, ...r.days.map((d) => d.focus))
  const todayIdx = (now.getDay() + 6) % 7
  const best = [...r.days].sort((a, b) => b.done + b.focus / 60 - (a.done + a.focus / 60))[0]
  const bestIdx = best && best.done + best.focus > 0 ? r.days.indexOf(best) : -1
  const open = (view: 'inbox' | 'tasks' | 'calendar', id?: string) => {
    close()
    go(view, id)
  }

  return (
    <Dialog title="Dein Wochenrückblick" onClose={close} wide bodyClass="dialog-body review-body">
      <p className="review-sub">
        {fRange.format(from)} bis {fRange.format(now)}
        {bestIdx >= 0 && (
          <>
            {' '}
            · stärkster Tag: <b>{['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][bestIdx]}</b>
          </>
        )}
      </p>

      <div className="review-kpis">
        <div className="review-kpi">
          <CheckCircle2 />
          <b>{r.done.length}</b>
          <span>{r.done.length === 1 ? 'Aufgabe erledigt' : 'Aufgaben erledigt'}</span>
        </div>
        <div className="review-kpi">
          <Target />
          <b>{r.focusMinutes >= 60 ? `${Math.floor(r.focusMinutes / 60)}:${String(r.focusMinutes % 60).padStart(2, '0')}` : r.focusMinutes || '–'}</b>
          <span>
            {r.focusMinutes >= 60 ? 'Std. Fokuszeit' : r.focusMinutes ? 'Min. Fokuszeit' : 'Fokuszeit'}
            {r.focusSessions ? ` · ${r.focusSessions} ${r.focusSessions === 1 ? 'Sitzung' : 'Sitzungen'}` : ''}
          </span>
        </div>
        <div className="review-kpi">
          <CalendarDays />
          <b>{r.meetings}</b>
          <span>Termine{r.meetingMinutes ? ` · ${durationLabel(Math.round(r.meetingMinutes))}` : ''}</span>
        </div>
        <div className={`review-kpi ${r.waiting.length ? 'warn' : ''}`}>
          <Mail />
          <b>{r.waiting.length}</b>
          <span>{r.waiting.length === 1 ? 'Mail wartet auf Antwort' : 'Mails warten auf Antwort'}</span>
        </div>
      </div>

      <div className="review-week" aria-label="Fokuszeit und Erledigtes je Tag">
        {r.days.map((d, i) => (
          <div key={d.day} className={`rw-day ${i === todayIdx ? 'rw-today' : ''} ${i > todayIdx ? 'rw-future' : ''}`}>
            <div className="rw-bar-wrap">
              <div className="rw-bar" style={{ height: `${Math.max(d.focus ? 6 : 0, (d.focus / maxFocus) * 100)}%` }} title={`${d.focus} Min. Fokus`} />
            </div>
            <span className="rw-done">{d.done ? `✓ ${d.done}` : ''}</span>
            <span className="rw-label">{WD[i]}</span>
          </div>
        ))}
      </div>

      <div className="review-cols">
        <section>
          <h4>Geschafft</h4>
          {r.done.length === 0 ? (
            <p className="hint">Diese Woche wurde noch nichts abgehakt.</p>
          ) : (
            <ul className="review-list">
              {r.done.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <CheckCircle2 className="ok" />
                  <span className="rl-title">{t.title}</span>
                  {projectName(data, t.projectId) && <span className="rl-meta">{projectName(data, t.projectId)}</span>}
                </li>
              ))}
              {r.done.length > 6 && <li className="rl-more">+ {r.done.length - 6} weitere</li>}
            </ul>
          )}
        </section>

        <section>
          <h4>Noch offen</h4>
          {r.waiting.length === 0 && r.overdue.length === 0 ? (
            <p className="hint">Nichts Überfälliges und keine wartenden Mails – stark.</p>
          ) : (
            <ul className="review-list">
              {r.waiting.slice(0, 4).map((t) => (
                <li key={t.id} className="clickable" onClick={() => open('inbox', t.id)}>
                  <Mail className="warn" />
                  <span className="rl-title">{t.subject}</span>
                  <span className="rl-meta">{t.latest.from.name}</span>
                </li>
              ))}
              {r.overdue.slice(0, 4).map((t) => (
                <li key={t.id} className="clickable" onClick={() => (close(), openDialog({ kind: 'task', id: t.id }))}>
                  <AlertTriangle className="alert" />
                  <span className="rl-title">{t.title}</span>
                  <span className="rl-meta">überfällig</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="span-2">
          <h4>Nächste Woche</h4>
          {r.nextEvents.length === 0 && r.nextTasks.length === 0 ? (
            <p className="hint">Noch nichts geplant – freie Woche.</p>
          ) : (
            <ul className="review-list two">
              {r.nextEvents.slice(0, 6).map((e) => (
                <li key={e.id} className="clickable" onClick={() => open('calendar', e.id)}>
                  <Clock />
                  <span className="rl-title">{e.title}</span>
                  <span className="rl-meta">
                    {fDay.format(new Date(e.start))}
                    {e.allDay ? '' : ` · ${fTime.format(new Date(e.start))}`}
                  </span>
                </li>
              ))}
              {r.nextTasks.slice(0, 4).map((t) => (
                <li key={t.id} className="clickable" onClick={() => (close(), openDialog({ kind: 'task', id: t.id }))}>
                  <CheckCircle2 />
                  <span className="rl-title">{t.title}</span>
                  <span className="rl-meta">fällig {fDay.format(new Date(t.due + 'T12:00'))}</span>
                </li>
              ))}
            </ul>
          )}
          {(r.nextEvents.length > 6 || r.nextTasks.length > 4) && (
            <button className="link" onClick={() => open('calendar')}>
              Ganze Woche im Kalender <ArrowRight />
            </button>
          )}
        </section>
      </div>
    </Dialog>
  )
}
