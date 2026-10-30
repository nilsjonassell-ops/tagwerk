import { useMemo, useState } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import { eventsOnDay, findConflicts, ymd } from '@shared/analysis'
import type { CalEvent, Person, Priority, Project, ProjectStatus, Recurrence, Task, TaskStatus } from '@shared/types'
import { uid, useStore } from '@/lib/store'
import { addTask, deleteEvent, deleteTask, newTask, saveEvent, saveTask } from '@/lib/actions'
import { fromLocalInput, PRIORITY_LABEL, RECURRENCE_LABEL, toLocalInput, fTime } from '@/lib/format'
import { Dialog, SourceTag } from './ui'

// ---------- Aufgabe ----------

export function TaskDialog({ id, preset }: { id?: string; preset?: Partial<Task> }) {
  const data = useStore((s) => s.data)
  const close = () => useStore.getState().openDialog(null)
  const existing = id ? data.tasks.find((t) => t.id === id) : undefined
  const [t, setT] = useState<Task>(() => existing ?? newTask({ title: '', ...preset }))
  const [touched, setTouched] = useState(false)
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }))
  const invalid = !t.title.trim()

  const submit = () => {
    setTouched(true)
    if (invalid) return
    const clean = { ...t, title: t.title.trim(), recurrence: t.due ? t.recurrence : 'none' as Recurrence }
    if (existing) {
      saveTask(clean)
      useStore.getState().toast('Aufgabe gespeichert')
    } else addTask(clean)
    close()
  }

  return (
    <Dialog
      title={existing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
      onClose={close}
      footer={
        <>
          {existing && (
            <button className="btn ghost left" onClick={async () => (await deleteTask(existing.id)) && close()}>
              <Trash2 /> Löschen
            </button>
          )}
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={submit}>
            {existing ? 'Speichern' : 'Anlegen'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        style={{ display: 'contents' }}
      >
        <label className="field">
          <span>Titel</span>
          <input className={`input ${touched && invalid ? 'invalid' : ''}`} value={t.title} onChange={(e) => set('title', e.target.value)} data-autofocus placeholder="Was ist zu tun?" />
          {touched && invalid && <span className="error-text">Gib der Aufgabe einen Titel.</span>}
        </label>
        <div className="grid-3">
          <label className="field">
            <span>Fällig am</span>
            <input type="date" className="input" value={t.due ?? ''} onChange={(e) => set('due', e.target.value || undefined)} />
          </label>
          <label className="field">
            <span>Priorität</span>
            <select className="select" value={t.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select className="select" value={t.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
              <option value="open">Offen</option>
              <option value="doing">In Arbeit</option>
              <option value="done">Erledigt</option>
            </select>
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Projekt</span>
            <select className="select" value={t.projectId ?? ''} onChange={(e) => set('projectId', e.target.value || undefined)}>
              <option value="">Kein Projekt</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Wiederholen</span>
            <select className="select" value={t.recurrence} onChange={(e) => set('recurrence', e.target.value as Recurrence)} disabled={!t.due}>
              {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                <option key={r} value={r}>
                  {RECURRENCE_LABEL[r]}
                </option>
              ))}
            </select>
            {!t.due && <span className="hint">Wiederholung braucht ein Fälligkeitsdatum.</span>}
          </label>
        </div>
        <label className="field">
          <span>Notizen</span>
          <textarea className="textarea" value={t.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </label>
        {t.origin && <div className="hint">Herkunft: {t.origin.label}</div>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

// ---------- Termin ----------

export function EventDialog({ id, preset }: { id?: string; preset?: Partial<CalEvent> }) {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const close = () => useStore.getState().openDialog(null)
  const existing = id ? data.events.find((e) => e.id === id) : undefined
  const init = useMemo(() => {
    const start = existing?.start ?? preset?.start ?? new Date(Math.ceil(Date.now() / 3600_000) * 3600_000).toISOString()
    const end = existing?.end ?? preset?.end ?? new Date(new Date(start).getTime() + 3600_000).toISOString()
    return { start, end }
  }, [existing, preset])
  const [title, setTitle] = useState(existing?.title ?? preset?.title ?? '')
  const [date, setDate] = useState(toLocalInput(init.start).date)
  const [startT, setStartT] = useState(toLocalInput(init.start).time)
  const [endT, setEndT] = useState(toLocalInput(init.end).time)
  const [allDay, setAllDay] = useState(existing?.allDay ?? false)
  const [location, setLocation] = useState(existing?.location ?? '')
  const [attendees, setAttendees] = useState((existing?.attendees ?? []).map((a) => (a.email ? `${a.name} <${a.email}>` : a.name)).join(', '))
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [projectId, setProjectId] = useState(existing?.projectId ?? preset?.projectId ?? '')
  const [touched, setTouched] = useState(false)
  // 'std' = Standard aus den Einstellungen, 'none' = keine, sonst Minuten vorher
  const [reminder, setReminder] = useState<string>(
    existing?.reminderMinutes === undefined ? 'std' : existing.reminderMinutes === null ? 'none' : String(existing.reminderMinutes)
  )
  const google = useStore((s) => s.google)
  const isGoogle = existing?.source === 'google'
  const [target, setTarget] = useState<'google' | 'local'>(google.caps.calendarWrite ? 'google' : 'local')
  const [notify, setNotify] = useState(false)
  const toGoogle = !existing && target === 'google'

  const start = allDay ? fromLocalInput(date, '00:00') : fromLocalInput(date, startT)
  let end = allDay ? fromLocalInput(date, '23:59') : fromLocalInput(date, endT)
  if (!allDay && end <= start) end = new Date(new Date(end).getTime() + 86400_000).toISOString() // über Mitternacht
  const invalidTitle = !title.trim()

  const draft: CalEvent = {
    ...existing,
    id: existing?.id ?? uid('e'),
    title: title.trim(),
    start,
    end,
    allDay: allDay || undefined,
    location: location.trim() || undefined,
    // Teilnehmende bestehender Google-Termine werden in Google Kalender verwaltet.
    attendees: isGoogle ? existing!.attendees : parseAttendees(attendees),
    notes: notes.trim() || undefined,
    projectId: projectId || undefined,
    reminderMinutes: reminder === 'std' ? undefined : reminder === 'none' ? null : Number(reminder),
    source: existing?.source ?? 'local'
  }
  const clashes = useMemo(() => {
    if (allDay) return []
    const others = eventsOnDay(data.events, new Date(start)).filter((e) => e.id !== draft.id)
    return findConflicts([...others, draft], settings.transitionBufferMinutes).filter((c) => c.a.id === draft.id || c.b.id === draft.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.events, start, end, location, allDay])

  const submit = async () => {
    setTouched(true)
    if (invalidTitle) return
    if (await saveEvent(draft, !existing, { target: existing ? undefined : target, notify })) close()
  }

  if (existing?.readOnly) {
    const why = isGoogle
      ? existing.organizer
        ? `Organisiert von ${existing.organizer.name}. Nur die organisierende Person kann Zeit und Details ändern.`
        : 'Tagwerk hat nur Lesezugriff auf deinen Google Kalender. Schreibzugriff kannst du in den Einstellungen unter Datenquellen freigeben.'
      : 'Dieser Termin stammt aus einer importierten Kalenderdatei. Änderungen nimmst du in deinem Ursprungskalender vor und importierst die Datei erneut.'
    return (
      <Dialog
        title="Termin ist schreibgeschützt"
        onClose={close}
        footer={
          <>
            {existing.webLink && (
              <a className="btn left" href={existing.webLink} target="_blank" rel="noreferrer">
                In Google Kalender öffnen
              </a>
            )}
            <button className="btn" onClick={close}>Schließen</button>
          </>
        }
      >
        <p>{why}</p>
      </Dialog>
    )
  }

  return (
    <Dialog
      title={existing ? 'Termin bearbeiten' : 'Neuer Termin'}
      onClose={close}
      footer={
        <>
          {existing && (
            <button className="btn ghost left" onClick={async () => (await deleteEvent(existing.id)) && close()}>
              <Trash2 /> Löschen
            </button>
          )}
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={submit}>
            {existing ? 'Speichern' : 'Anlegen'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        style={{ display: 'contents' }}
      >
        {existing && <div className="row"><SourceTag source={existing.source} /></div>}
        {!existing && google.connected && (
          <label className="field">
            <span>Kalender</span>
            <select className="select" value={target} onChange={(e) => setTarget(e.target.value as 'google' | 'local')}>
              <option value="google" disabled={!google.caps.calendarWrite}>
                Google Kalender ({google.email}){google.caps.calendarWrite ? '' : ' – nur Lesezugriff'}
              </option>
              <option value="local">Nur in Tagwerk</option>
            </select>
          </label>
        )}
        <label className="field">
          <span>Titel</span>
          <input className={`input ${touched && invalidTitle ? 'invalid' : ''}`} value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus placeholder="z. B. Abstimmung Angebot" />
          {touched && invalidTitle && <span className="error-text">Gib dem Termin einen Titel.</span>}
        </label>
        <div className="grid-3">
          <label className="field">
            <span>Datum</span>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Beginn</span>
            <input type="time" className="input" value={startT} onChange={(e) => {
              const prevDur = minutesOf(endT) - minutesOf(startT)
              setStartT(e.target.value)
              if (prevDur > 0) setEndT(fromMinutes(minutesOf(e.target.value) + prevDur))
            }} disabled={allDay} />
          </label>
          <label className="field">
            <span>Ende</span>
            <input type="time" className="input" value={endT} onChange={(e) => setEndT(e.target.value)} disabled={allDay} />
          </label>
        </div>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" className="box-check" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Ganztägig
        </label>
        {clashes.map((c, i) => {
          const other = c.a.id === draft.id ? c.b : c.a
          return (
            <div key={i} className={`callout ${c.kind === 'tight' ? 'attention' : ''}`} style={{ margin: 0 }}>
              <AlertTriangle />
              <span>
                {c.kind === 'overlap' ? 'Überschneidet sich mit' : `Nur ${c.gapMinutes} Min. Abstand zu`} „{other.title}“ ({fTime.format(new Date(other.start))}–{fTime.format(new Date(other.end))}).
              </span>
            </div>
          )
        })}
        <label className="field">
          <span>Ort</span>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Adresse, Raum oder „Online“" />
        </label>
        <label className="field">
          <span>Teilnehmende</span>
          <input
            className="input"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="Name <mail@beispiel.de>, …"
            disabled={isGoogle}
          />
          {isGoogle ? (
            <span className="hint">Teilnehmende änderst du direkt in Google Kalender.</span>
          ) : toGoogle ? (
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" className="box-check" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={!parseAttendees(attendees).some((a) => a.email)} />
              <span className="hint">Einladungen per E-Mail an die Teilnehmenden senden</span>
            </label>
          ) : (
            <span className="hint">Es werden keine Einladungen verschickt{google.connected ? ' – der Termin bleibt nur in Tagwerk.' : ' – kein Kalenderkonto verbunden.'}</span>
          )}
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Erinnerung</span>
            <select className="select" value={reminder} onChange={(e) => setReminder(e.target.value)} disabled={allDay}>
              <option value="std">
                Standard{settings.notifications.events ? ` (${settings.notifications.leadMinutes} Min. vorher)` : ' (aus)'}
              </option>
              <option value="none">Keine Erinnerung</option>
              <option value="0">Zum Beginn</option>
              <option value="5">5 Minuten vorher</option>
              <option value="10">10 Minuten vorher</option>
              <option value="15">15 Minuten vorher</option>
              <option value="30">30 Minuten vorher</option>
              <option value="60">1 Stunde vorher</option>
              <option value="120">2 Stunden vorher</option>
              <option value="1440">1 Tag vorher</option>
            </select>
          </label>
          <label className="field">
            <span>Projekt</span>
            <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Kein Projekt</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Notizen</span>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

const minutesOf = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const fromMinutes = (m: number) => {
  const c = Math.min(m, 23 * 60 + 59)
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`
}

function parseAttendees(s: string): Person[] {
  return s
    .split(/[,;]\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^(.*?)\s*<([^>]+)>$/)
      if (m) return { name: m[1] || m[2], email: m[2] }
      if (x.includes('@')) return { name: x.split('@')[0], email: x }
      return { name: x, email: '' }
    })
}

// ---------- Projekt ----------

export function ProjectDialog({ id }: { id?: string }) {
  const data = useStore((s) => s.data)
  const mutate = useStore((s) => s.mutate)
  const close = () => useStore.getState().openDialog(null)
  const existing = id ? data.projects.find((p) => p.id === id) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [summary, setSummary] = useState(existing?.summary ?? '')
  const [status, setStatus] = useState<ProjectStatus>(existing?.status ?? 'on-track')
  const [touched, setTouched] = useState(false)
  const submit = () => {
    setTouched(true)
    if (!name.trim()) return
    if (existing) {
      mutate((d) => ({ ...d, projects: d.projects.map((p) => (p.id === existing.id ? { ...p, name: name.trim(), summary, status } : p)) }), { toast: 'Projekt gespeichert' })
    } else {
      const p: Project = { id: uid('p'), name: name.trim(), summary, status, nextSteps: [], hue: Math.floor(Math.random() * 360), source: 'local' }
      mutate((d) => ({ ...d, projects: [...d.projects, p] }), { toast: `Projekt „${p.name}“ angelegt` })
      useStore.getState().go('projects', p.id)
    }
    close()
  }
  return (
    <Dialog
      title={existing ? 'Projekt bearbeiten' : 'Neues Projekt'}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={submit}>
            {existing ? 'Speichern' : 'Anlegen'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Name</span>
        <input className={`input ${touched && !name.trim() ? 'invalid' : ''}`} value={name} onChange={(e) => setName(e.target.value)} data-autofocus onKeyDown={(e) => e.key === 'Enter' && submit()} />
        {touched && !name.trim() && <span className="error-text">Gib dem Projekt einen Namen.</span>}
      </label>
      <label className="field">
        <span>Status</span>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
          <option value="on-track">Im Plan</option>
          <option value="at-risk">Gefährdet</option>
          <option value="paused">Pausiert</option>
          <option value="done">Abgeschlossen</option>
        </select>
      </label>
      <label className="field">
        <span>Kurzbeschreibung</span>
        <textarea className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
      </label>
    </Dialog>
  )
}

export const todayYmd = () => ymd(new Date())
