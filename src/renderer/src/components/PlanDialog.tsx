// Aufgaben automatisch in freie Zeit einplanen – rein lokal, ohne KI.
// Tagwerk schlägt Zeitblöcke vor, du wählst aus und bestätigst.

import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarCheck, Clock } from 'lucide-react'
import { DEFAULT_TASK_MINUTES, planCandidates, planTasks } from '@shared/analysis'
import type { CalEvent } from '@shared/types'
import { useStore, uid } from '@/lib/store'
import { saveEvent } from '@/lib/actions'
import { durationLabel, fDayMed, fTime, projectName } from '@/lib/format'
import { Dialog, Empty, Segmented } from '@/components/ui'

const DURATIONS = [15, 30, 45, 60, 90, 120]

export function PlanDialog() {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const google = useStore((s) => s.google)
  const close = () => useStore.getState().openDialog(null)

  const [now] = useState(() => new Date())
  const candidates = useMemo(() => planCandidates(data.tasks, data.events, now), [data.tasks, data.events, now])
  const [durations, setDurations] = useState<Record<string, number>>({})
  // Vorausgewählt: überfällig, in den nächsten 5 Tagen fällig oder hohe Priorität
  const [off, setOff] = useState<Set<string>>(() => {
    const soon = new Date(now.getTime() + 5 * 86400_000)
    const soonYmd = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`
    return new Set(candidates.filter((t) => !(t.priority === 'high' || (t.due && t.due <= soonYmd))).map((t) => t.id))
  })
  const [target, setTarget] = useState<'google' | 'local'>(google.caps.calendarWrite ? 'google' : 'local')
  const [busy, setBusy] = useState(false)

  const plan = useMemo(
    () =>
      planTasks(
        candidates.filter((t) => !off.has(t.id)),
        data.events,
        now,
        { workHours: settings.workHours, durations, bufferMinutes: settings.transitionBufferMinutes, limit: 12 }
      ),
    [candidates, off, data.events, now, settings.workHours, durations, settings.transitionBufferMinutes]
  )
  const slotOf = new Map(plan.map((p) => [p.taskId, p]))
  const shown = candidates.slice(0, 12)

  const toggle = (id: string) =>
    setOff((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const apply = async () => {
    setBusy(true)
    let ok = 0
    for (const p of plan) {
      const t = data.tasks.find((x) => x.id === p.taskId)
      if (!t) continue
      const ev: CalEvent = {
        id: uid('ev'),
        title: t.title,
        start: p.start.toISOString(),
        end: p.end.toISOString(),
        attendees: [],
        notes: 'Zeitblock für eine Aufgabe aus Tagwerk.',
        projectId: t.projectId,
        taskId: t.id,
        source: 'local'
      }
      if (await saveEvent(ev, true, { target, quiet: true })) ok++
    }
    setBusy(false)
    if (ok) useStore.getState().toast(`${ok} ${ok === 1 ? 'Aufgabe' : 'Aufgaben'} eingeplant`)
    close()
  }

  return (
    <Dialog
      title="Aufgaben einplanen"
      onClose={close}
      wide
      footer={
        <>
          {google.caps.calendarWrite && (
            <div className="left" style={{ marginRight: 'auto' }}>
              <Segmented
                label="Kalender"
                value={target}
                onChange={setTarget}
                options={[
                  { id: 'google', label: 'Google Kalender' },
                  { id: 'local', label: 'Nur in Tagwerk' }
                ]}
              />
            </div>
          )}
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={apply} disabled={!plan.length || busy}>
            <CalendarCheck /> {plan.length ? `${plan.length} ${plan.length === 1 ? 'Block' : 'Blöcke'} eintragen` : 'Nichts einzuplanen'}
          </button>
        </>
      }
    >
      {shown.length === 0 ? (
        <Empty icon={<CalendarCheck />} title="Alles eingeplant">
          Es gibt keine offenen Aufgaben ohne Zeitblock.
        </Empty>
      ) : (
        <>
          <p className="hint" style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
            Tagwerk verteilt deine offenen Aufgaben – überfällige und bald fällige zuerst, dann nach Priorität – auf die nächsten freien Lücken in deiner Arbeitszeit ({settings.workHours.start}–{settings.workHours.end} Uhr, Mo–Fr). Nichts wird eingetragen, bevor du bestätigst.
          </p>
          <div className="plan-list">
            {shown.map((t) => {
              const p = slotOf.get(t.id)
              const on = !off.has(t.id)
              const minutes = durations[t.id] ?? DEFAULT_TASK_MINUTES[t.priority]
              const proj = projectName(data, t.projectId)
              return (
                <div key={t.id} className={`plan-row ${on ? '' : 'off'}`}>
                  <input type="checkbox" className="box-check" checked={on} onChange={() => toggle(t.id)} aria-label={`„${t.title}“ einplanen`} />
                  <div className="plan-main">
                    <div className="title">{t.title}</div>
                    <div className="meta">
                      {t.due && <span>fällig {fDayMed.format(new Date(t.due + 'T12:00:00'))}</span>}
                      {proj && <span>{proj}</span>}
                      {t.priority === 'high' && <span className="tag" style={{ color: 'var(--alert)', background: 'var(--alert-soft)' }}>Hoch</span>}
                    </div>
                  </div>
                  <select
                    className="select"
                    style={{ width: 110 }}
                    value={minutes}
                    onChange={(e) => setDurations((d) => ({ ...d, [t.id]: Number(e.target.value) }))}
                    aria-label="Dauer"
                    disabled={!on}
                  >
                    {DURATIONS.map((m) => (
                      <option key={m} value={m}>
                        {durationLabel(m)}
                      </option>
                    ))}
                  </select>
                  <div className="plan-slot">
                    {!on ? (
                      <span className="hint">ausgelassen</span>
                    ) : p ? (
                      <>
                        <span>
                          <Clock size={13} /> {fDayMed.format(p.start)}, {fTime.format(p.start)}–{fTime.format(p.end)}
                        </span>
                        {p.late && (
                          <span className="tag attention" title="Die nächste passende Lücke liegt nach dem Fälligkeitsdatum">
                            <AlertTriangle size={11} /> nach Fälligkeit
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="hint">keine Lücke in den nächsten 5 Tagen</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {candidates.length > shown.length && <p className="hint">Weitere {candidates.length - shown.length} Aufgaben werden beim nächsten Mal berücksichtigt.</p>}
        </>
      )}
    </Dialog>
  )
}
