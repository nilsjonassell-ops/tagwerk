import { useMemo, useRef, useState } from 'react'
import { Trash2, AlertTriangle, ChevronRight } from 'lucide-react'
import { eventsOnDay, findConflicts, planTasks, ymd } from '@shared/analysis'
import type { CalEvent, Person, Priority, Project, ProjectStatus, Recurrence, Task, TaskStatus } from '@shared/types'
import { uid, useStore } from '@/lib/store'
import { addTask, deleteEvent, deleteTask, newTask, saveEvent, saveTask } from '@/lib/actions'
import { useAccounts } from '@/lib/accounts'
import { markCreated } from '@/lib/suggestions'
import { seriesStarts } from '@shared/mail-insights'
import type { SuggestionRecurrence } from '@shared/types'
import { Mail } from 'lucide-react'
import { fromLocalInput, PRIORITY_LABEL, RECURRENCE_LABEL, toLocalInput, fTime } from '@/lib/format'
import { Dialog, Select, SourceTag } from './ui'
import { projectOptions } from '@/lib/options'
import type { Capture } from '@shared/capture'
import { finishCapture, openCreated, switchCapture, takeDraft } from '@/lib/capture'
import { CaptureHeader, OriginTag } from './CaptureHeader'

/** Beim Übernehmen aus einer Mail: Zusatzangaben eingeklappt, damit nur das Nötige sichtbar ist */
function MoreFields({ on, summary, children }: { on: boolean; summary?: string; children: React.ReactNode }) {
  if (!on) return <>{children}</>
  return (
    <details className="more-fields">
      <summary>
        <ChevronRight aria-hidden="true" /> Weitere Angaben
        {summary && <span className="more-summary">{summary}</span>}
      </summary>
      <div className="more-body">{children}</div>
    </details>
  )
}

// ---------- Aufgabe ----------

export function TaskDialog({ id, preset, suggestionId, mergeIds, capture }: { id?: string; preset?: Partial<Task>; suggestionId?: string; mergeIds?: string[]; capture?: Capture }) {
  const data = useStore((s) => s.data)
  const close = () => useStore.getState().openDialog(null)
  const existing = id ? data.tasks.find((t) => t.id === id) : undefined
  const [t, setT] = useState<Task>(() => takeDraft<Task>(capture) ?? existing ?? newTask({ title: '', ...preset }))
  const saving = useRef(false)
  const [initial] = useState(() => JSON.stringify(t))
  const [touched, setTouched] = useState(false)
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }))
  const invalid = !t.title.trim()
  // Vorlauf: aus einer Mail-Frist, die noch mindestens drei Tage entfernt ist
  const fromMail = !existing && (!!suggestionId || !!mergeIds?.length || !!capture)
  const daysLeft = t.due ? Math.round((new Date(`${t.due}T12:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400_000) : 0
  const prepPossible = fromMail && daysLeft >= 3
  const [prep, setPrep] = useState(() => fromMail && preset?.priority === 'high')
  const [prepDays, setPrepDays] = useState(2)
  // Freier Kalenderblock bis zur Fälligkeit – nur ein Vorschlag, reserviert wird erst mit Häkchen
  const slot = useMemo(() => {
    if (!fromMail || !t.due) return null
    const days = Math.max(1, Math.min(10, daysLeft + 1))
    return planTasks([t], data.events, new Date(), { workHours: useStore.getState().settings.workHours, bufferMinutes: useStore.getState().settings.transitionBufferMinutes, days, limit: 1 })[0] ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMail, t.due, t.priority, data.events])
  const [reserve, setReserve] = useState(false)

  const submit = () => {
    setTouched(true)
    if (invalid || saving.current) return
    saving.current = true
    const clean = { ...t, title: t.title.trim(), recurrence: t.due ? t.recurrence : 'none' as Recurrence }
    if (existing) {
      saveTask(clean)
      useStore.getState().toast('Aufgabe gespeichert')
    } else {
      const createdTasks: string[] = [clean.id]
      const createdEvents: string[] = []
      addTask(clean, !fromMail)
      if (suggestionId) markCreated(suggestionId, 'task', clean.id)
      for (const m of mergeIds ?? []) markCreated(m, 'task', clean.id)
      let extra = ''
      if (prepPossible && prep && clean.due) {
        const d = new Date(`${clean.due}T12:00:00`)
        d.setDate(d.getDate() - Math.min(prepDays, daysLeft - 1))
        const prepTask = newTask({ title: `Vorbereiten: ${clean.title}`, due: ymd(d), priority: 'medium', projectId: clean.projectId, origin: clean.origin, notes: `Vorlauf für die Frist am ${new Date(`${clean.due}T12:00:00`).toLocaleDateString('de-DE')}.` })
        addTask(prepTask, false)
        createdTasks.push(prepTask.id)
        extra = ' + Vorbereitung'
      }
      if (reserve && slot && !slot.late) {
        const st = useStore.getState()
        const block: CalEvent = { id: uid('e'), title: clean.title, start: slot.start.toISOString(), end: slot.end.toISOString(), attendees: [], taskId: clean.id, projectId: clean.projectId, mailRef: clean.origin?.kind === 'email' ? clean.origin.refId : undefined, source: 'local' }
        st.mutate((d) => ({ ...d, events: [...d.events, block] }))
        createdEvents.push(block.id)
        extra += ' + Zeitblock'
      }
      if (fromMail) {
        const st = useStore.getState()
        const sIds = [suggestionId, ...(mergeIds ?? [])].filter(Boolean) as string[]
        finishCapture(capture)
        st.toast(`Aufgabe „${clean.title.slice(0, 40)}“${extra} angelegt`, {
          action: capture ? { label: 'Öffnen', run: () => openCreated('task', clean.id) } : clean.due && !createdEvents.length ? { label: 'Einplanen', run: () => st.openDialog({ kind: 'plan' }) } : undefined,
          // Rückgängig: genau das Angelegte entfernen und den Vorschlag wieder öffnen
          undo: () =>
            st.mutate((d) => {
              const sg = { ...(d.suggestions ?? {}) }
              for (const id of sIds) delete sg[id]
              return { ...d, tasks: d.tasks.filter((x) => !createdTasks.includes(x.id)), events: d.events.filter((e) => !createdEvents.includes(e.id)), suggestions: sg }
            })
        })
      }
    }
    close()
  }

  return (
    <Dialog
      title={existing ? 'Aufgabe bearbeiten' : capture ? 'Aus E-Mail übernehmen' : 'Neue Aufgabe'}
      onClose={close}
      dirty={JSON.stringify(t) !== initial}
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
            {existing ? 'Speichern' : capture ? 'Aufgabe anlegen' : 'Anlegen'}
          </button>
        </>
      }
    >
      {capture && <CaptureHeader capture={capture} onSwitch={(to) => switchCapture(capture, to, t)} />}
      <form
        key={capture?.kind}
        className={capture ? 'capture-form' : undefined}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        style={{ display: 'contents' }}
      >
        <label className="field">
          <span>
            Titel <OriginTag o={capture?.origin.title} />
          </span>
          <input className={`input ${touched && invalid ? 'invalid' : ''}`} value={t.title} onChange={(e) => set('title', e.target.value)} data-autofocus placeholder="Was ist zu tun?" />
          {touched && invalid && <span className="error-text">Gib der Aufgabe einen Titel.</span>}
        </label>
        <div className="grid-3">
          <label className="field">
            <span>
              Fällig am <OriginTag o={capture?.origin.due} />
            </span>
            <input type="date" className="input" value={t.due ?? ''} onChange={(e) => set('due', e.target.value || undefined)} />
          </label>
          <label className="field">
            <span>Uhrzeit</span>
            <input type="time" className="input" value={t.dueTime ?? ''} disabled={!t.due} onChange={(e) => set('dueTime', e.target.value || undefined)} title="Zu dieser Zeit erinnert dich Tagwerk mit einem Pop-up" />
          </label>
          <label className="field">
            <span>Priorität</span>
            <Select aria-label="Priorität" value={t.priority} onChange={(v) => set('priority', v)} options={(['high', 'medium', 'low'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
          </label>
        </div>
        <MoreFields on={!!capture} summary={[data.projects.find((p) => p.id === t.projectId)?.name, t.notes ? 'Notiz' : ''].filter(Boolean).join(' · ')}>
        <div className="grid-3">
          <label className="field">
            <span>Projekt</span>
            <Select aria-label="Projekt" value={t.projectId ?? ''} onChange={(v) => set('projectId', v || undefined)} options={projectOptions(data.projects)} />
          </label>
          <label className="field">
            <span>Wiederholen</span>
            <Select aria-label="Wiederholen" value={t.recurrence} onChange={(v) => set('recurrence', v)} disabled={!t.due} options={(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => ({ value: r, label: RECURRENCE_LABEL[r] }))} />
            {!t.due && <span className="hint">Wiederholung braucht ein Fälligkeitsdatum.</span>}
          </label>
          <label className="field">
            <span>Status</span>
            <Select<TaskStatus> aria-label="Status" value={t.status} onChange={(v) => set('status', v)} options={[{ value: 'open', label: 'Offen' }, { value: 'doing', label: 'In Arbeit' }, { value: 'done', label: 'Erledigt' }]} />
          </label>
        </div>
        <label className="field">
          <span>Notizen</span>
          <textarea className="textarea" value={t.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </label>
        </MoreFields>
        {prepPossible && (
          <div className="prep-row">
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" className="box-check" checked={prep} onChange={(e) => setPrep(e.target.checked)} />
              Vorbereitungsaufgabe
            </label>
            <Select aria-label="Tage vorher" value={String(prepDays)} onChange={(v) => setPrepDays(Number(v))} disabled={!prep} style={{ width: 'auto' }} options={[1, 2, 3, 5, 7].filter((n) => n < daysLeft).map((n) => ({ value: String(n), label: `${n} ${n === 1 ? 'Tag' : 'Tage'} vorher` }))} />
            <span className="hint">Danach kannst du beides in freie Zeit einplanen.</span>
          </div>
        )}
        {slot && !slot.late && (
          <label className="prep-row">
            <input type="checkbox" className="box-check" checked={reserve} onChange={(e) => setReserve(e.target.checked)} />
            <span>
              Freier Block: <b>{slot.start.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}, {fTime.format(slot.start)}–{fTime.format(slot.end)} Uhr</b> im Kalender reservieren
            </span>
          </label>
        )}
        {mergeIds && mergeIds.length > 1 && <div className="hint">Fasst {mergeIds.length} Vorschläge zu einer Aufgabe zusammen – Details stehen in den Notizen.</div>}
        {t.origin?.kind === 'email' ? <MailLink threadId={t.origin.refId} /> : t.origin && <div className="hint">Herkunft: {t.origin.label}</div>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

// ---------- Termin ----------

type EventDraft = { title: string; date: string; startT: string; endT: string; allDay: boolean; location: string; attendees: string; notes: string; projectId: string }

export function EventDialog({ id, preset, suggestionId, series, capture }: { id?: string; preset?: Partial<CalEvent>; suggestionId?: string; series?: SuggestionRecurrence; capture?: Capture }) {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const close = () => useStore.getState().openDialog(null)
  const existing = id ? data.events.find((e) => e.id === id) : undefined
  // Nach einem Wechsel Aufgabe ↔ Termin: zuletzt bearbeiteter Stand
  const [d0] = useState(() => takeDraft<EventDraft>(capture))
  const saving = useRef(false)
  const init = useMemo(() => {
    const start = existing?.start ?? preset?.start ?? new Date(Math.ceil(Date.now() / 3600_000) * 3600_000).toISOString()
    const end = existing?.end ?? preset?.end ?? new Date(new Date(start).getTime() + 3600_000).toISOString()
    return { start, end }
  }, [existing, preset])
  const [title, setTitle] = useState(d0?.title ?? existing?.title ?? preset?.title ?? '')
  const [date, setDate] = useState(d0?.date ?? toLocalInput(init.start).date)
  const [startT, setStartT] = useState(d0?.startT ?? toLocalInput(init.start).time)
  const [endT, setEndT] = useState(d0?.endT ?? toLocalInput(init.end).time)
  const [allDay, setAllDay] = useState(d0?.allDay ?? existing?.allDay ?? preset?.allDay ?? false)
  const [location, setLocation] = useState(d0?.location ?? existing?.location ?? preset?.location ?? '')
  const [attendees, setAttendees] = useState(d0?.attendees ?? (existing?.attendees ?? preset?.attendees ?? []).map((a) => (a.email ? `${a.name} <${a.email}>` : a.name)).join(', '))
  const [notes, setNotes] = useState(d0?.notes ?? existing?.notes ?? preset?.notes ?? '')
  const [projectId, setProjectId] = useState(d0?.projectId ?? existing?.projectId ?? preset?.projectId ?? '')
  const [touched, setTouched] = useState(false)
  const snapshot = JSON.stringify([title, date, startT, endT, allDay, location, attendees, notes, projectId])
  const [initialSnapshot] = useState(snapshot)
  // 'std' = Standard aus den Einstellungen, 'none' = keine, sonst Minuten vorher
  const [reminder, setReminder] = useState<string>(
    existing?.reminderMinutes === undefined ? 'std' : existing.reminderMinutes === null ? 'none' : String(existing.reminderMinutes)
  )
  const google = useStore((s) => s.google)
  const isGoogle = existing?.source === 'google'
  // Teilnehmende bestehender Termine verwaltet der jeweilige Kalender
  const isRemote = existing?.source === 'google' || existing?.source === 'outlook' || existing?.source === 'icloud'
  const remoteName = existing?.source === 'outlook' ? 'Outlook' : existing?.source === 'icloud' ? 'Apple Kalender' : 'Google Kalender'
  // Zielkalender für neue Termine: zuletzt gewählter, sonst der erste verbundene
  const ms = useAccounts((s) => s.ms)
  const ic = useAccounts((s) => s.icloud)
  const targets = [
    ...(ms.connected && ms.caps.calendar ? [{ id: 'outlook', label: `Outlook-Kalender (${ms.email ?? 'Microsoft'})` }] : []),
    ...(ic.connected ? ic.calendars.filter((c) => c.enabled && !c.readOnly).map((c) => ({ id: `icloud:${c.id}`, label: `Apple Kalender · ${c.name}` })) : []),
    ...(google.connected && google.caps.calendarRead ? [{ id: 'google', label: `Google Kalender (${google.email})${google.caps.calendarWrite ? '' : ' – nur Lesezugriff'}`, disabled: !google.caps.calendarWrite }] : []),
    { id: 'local', label: 'Nur in Tagwerk' }
  ] as { id: string; label: string; disabled?: boolean }[]
  const remembered = settings.lastEventTarget
  const icDefault = ic.defaultCalendarId ? `icloud:${ic.defaultCalendarId}` : undefined
  const [target, setTarget] = useState<string>(
    () => [remembered, icDefault].find((t) => t && targets.some((x) => x.id === t && !x.disabled)) ?? targets.find((x) => !x.disabled)?.id ?? 'local'
  )
  const [notify, setNotify] = useState(false)
  const toGoogle = !existing && (target === 'google' || target === 'outlook')

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
    attendees: isRemote ? existing!.attendees : parseAttendees(attendees),
    notes: notes.trim() || undefined,
    projectId: projectId || undefined,
    reminderMinutes: reminder === 'std' ? undefined : reminder === 'none' ? null : Number(reminder),
    mailRef: existing?.mailRef ?? preset?.mailRef,
    source: existing?.source ?? 'local'
  }
  const clashes = useMemo(() => {
    if (allDay) return []
    const others = eventsOnDay(data.events, new Date(start)).filter((e) => e.id !== draft.id)
    return findConflicts([...others, draft], settings.transitionBufferMinutes).filter((c) => c.a.id === draft.id || c.b.id === draft.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.events, start, end, location, allDay])

  const [wholeSeries, setWholeSeries] = useState(false)
  // Optional: Notiz mit den wichtigen Maildetails zum Termin
  const [withNote, setWithNote] = useState(false)
  const seriesList = useMemo(() => (series && !existing ? seriesStarts(new Date(start), series) : []), [series, existing, start])
  const submit = async () => {
    setTouched(true)
    if (invalidTitle || saving.current) return
    saving.current = true
    if (!existing && target !== settings.lastEventTarget) void useStore.getState().updateSettings({ lastEventTarget: target })
    const many = wholeSeries && seriesList.length > 1
    let createdId = ''
    const ok = await saveEvent(draft, !existing, {
      target: existing ? undefined : target,
      notify,
      quiet: many || !!capture,
      onCreated: (newId) => {
        createdId = newId
        if (suggestionId) markCreated(suggestionId, 'event', newId)
      }
    })
    if (!ok) {
      saving.current = false
      return
    }
    if (capture && createdId && !many) {
      finishCapture(capture)
      useStore.getState().toast(`Termin „${draft.title.slice(0, 40)}“ angelegt`, { action: { label: 'Öffnen', run: () => openCreated('event', createdId) } })
    }
    if (withNote && createdId) {
      const now = new Date().toISOString()
      const st = useStore.getState()
      st.mutate((d) => ({ ...d, notes: [{ id: uid('n'), title: `Zum Termin: ${draft.title}`, body: draft.notes ?? '', kind: 'note', eventId: createdId, projectId: draft.projectId, mailRef: draft.mailRef, createdAt: now, updatedAt: now }, ...d.notes] }))
    }
    if (many) {
      const dur = new Date(draft.end).getTime() - new Date(draft.start).getTime()
      let n = 1
      for (const d of seriesList.slice(1)) {
        const ev = { ...draft, id: uid('e'), start: d.toISOString(), end: new Date(d.getTime() + dur).toISOString() }
        if (await saveEvent(ev, true, { target, quiet: true })) n++
      }
      useStore.getState().toast(`${n} Termine „${draft.title.slice(0, 40)}“ angelegt (${series!.label})`)
    }
    close()
  }

  if (existing?.readOnly) {
    const why = existing.organizer
      ? `Organisiert von ${existing.organizer.name}. Nur die organisierende Person kann Zeit und Details ändern.`
      : isGoogle
        ? 'Tagwerk hat nur Lesezugriff auf deinen Google Kalender. Schreibzugriff kannst du in den Einstellungen unter Konten freigeben.'
        : existing.source === 'outlook'
          ? 'Das ist ein einzelner Termin aus einer Serie. Serien bearbeitest du direkt in Outlook.'
          : existing.source === 'icloud'
            ? 'Wiederkehrende Termine und geteilte Kalender bearbeitest du direkt in Apple Kalender.'
            : 'Dieser Termin stammt aus einer importierten Kalenderdatei. Änderungen nimmst du in deinem Ursprungskalender vor und importierst die Datei erneut.'
    return (
      <Dialog
        title="Termin ist schreibgeschützt"
        onClose={close}
        footer={
          <>
            {existing.webLink && (
              <a className="btn left" href={existing.webLink} target="_blank" rel="noreferrer">
                In {remoteName} öffnen
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
      title={existing ? 'Termin bearbeiten' : capture ? 'Aus E-Mail übernehmen' : 'Neuer Termin'}
      onClose={close}
      dirty={snapshot !== initialSnapshot}
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
            {existing ? 'Speichern' : capture ? 'Termin anlegen' : 'Anlegen'}
          </button>
        </>
      }
    >
      {capture && <CaptureHeader capture={capture} onSwitch={(to) => switchCapture(capture, to, { title, date, startT, endT, allDay, location, attendees, notes, projectId } satisfies EventDraft)} />}
      <form
        className={capture ? 'capture-form' : undefined}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        style={{ display: 'contents' }}
      >
        {existing && <div className="row"><SourceTag source={existing.source} /></div>}
        {!existing && targets.length > 1 && (
          <label className="field">
            <span>Kalender</span>
            <Select aria-label="Kalender" value={target} onChange={setTarget} options={targets.map((t) => ({ value: t.id, label: t.label, disabled: t.disabled }))} />
          </label>
        )}
        <label className="field">
          <span>
            Titel <OriginTag o={capture?.origin.title} />
          </span>
          <input className={`input ${touched && invalidTitle ? 'invalid' : ''}`} value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus placeholder="z. B. Abstimmung Angebot" />
          {touched && invalidTitle && <span className="error-text">Gib dem Termin einen Titel.</span>}
        </label>
        <div className="grid-3">
          <label className="field">
            <span>
              Datum <OriginTag o={capture?.origin.when} />
            </span>
            <input type="date" className={`input ${capture?.origin.when === 'missing' ? 'needs-check' : capture?.origin.when === 'check' ? 'maybe' : ''}`} value={date} onChange={(e) => setDate(e.target.value)} />
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
        <MoreFields on={!!capture} summary={[location, data.projects.find((p) => p.id === projectId)?.name, notes ? 'Notiz' : ''].filter(Boolean).join(' · ')}>
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
            disabled={isRemote}
          />
          {isRemote ? (
            <span className="hint">Teilnehmende änderst du direkt in {remoteName}.</span>
          ) : toGoogle ? (
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" className="box-check" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={!parseAttendees(attendees).some((a) => a.email)} />
              <span className="hint">Einladungen per E-Mail an die Teilnehmenden senden</span>
            </label>
          ) : (
            <span className="hint">
              {target.startsWith('icloud:') ? 'Einladungen verschickst du in der Kalender-App von Apple – Tagwerk trägt den Termin nur in deinen Kalender ein.' : 'Es werden keine Einladungen verschickt – der Termin bleibt nur in Tagwerk.'}
            </span>
          )}
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Erinnerung</span>
            <Select
              aria-label="Erinnerung"
              value={reminder}
              onChange={setReminder}
              disabled={allDay}
              options={[
                { value: 'std', label: `Standard${settings.notifications.events ? ` (${settings.notifications.leadMinutes} Min. vorher)` : ' (aus)'}` },
                { value: 'none', label: 'Keine Erinnerung' },
                { value: '0', label: 'Zum Beginn' },
                { value: '5', label: '5 Minuten vorher' },
                { value: '10', label: '10 Minuten vorher' },
                { value: '15', label: '15 Minuten vorher' },
                { value: '30', label: '30 Minuten vorher' },
                { value: '60', label: '1 Stunde vorher' },
                { value: '120', label: '2 Stunden vorher' },
                { value: '1440', label: '1 Tag vorher' }
              ]}
            />
          </label>
          <label className="field">
            <span>Projekt</span>
            <Select aria-label="Projekt" value={projectId} onChange={setProjectId} options={projectOptions(data.projects)} />
          </label>
        </div>
        <label className="field">
          <span>Notizen</span>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
        </MoreFields>
        {seriesList.length > 1 && (
          <div className="field">
            <span>Wiederholung erkannt: {series!.label}</span>
            <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
              <label className="row" style={{ gap: 6 }}>
                <input type="radio" name="series" checked={!wholeSeries} onChange={() => setWholeSeries(false)} /> Nur diesen Termin
              </label>
              <label className="row" style={{ gap: 6 }}>
                <input type="radio" name="series" checked={wholeSeries} onChange={() => setWholeSeries(true)} /> Ganze Serie ({seriesList.length} Termine bis {seriesList.at(-1)!.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })})
              </label>
            </div>
          </div>
        )}
        {!existing && draft.mailRef && (
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" className="box-check" checked={withNote} onChange={(e) => setWithNote(e.target.checked)} /> Notiz mit den Maildetails zum Termin anlegen
          </label>
        )}
        {draft.mailRef && !capture && <MailLink threadId={draft.mailRef} />}
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
        <Select<ProjectStatus> aria-label="Status" value={status} onChange={setStatus} options={[{ value: 'on-track', label: 'Im Plan' }, { value: 'at-risk', label: 'Gefährdet' }, { value: 'paused', label: 'Pausiert' }, { value: 'done', label: 'Abgeschlossen' }]} />
      </label>
      <label className="field">
        <span>Kurzbeschreibung</span>
        <textarea className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
      </label>
    </Dialog>
  )
}

export const todayYmd = () => ymd(new Date())

/** Verweis auf die Quellmail eines Eintrags */
export function MailLink({ threadId }: { threadId: string }) {
  const mail = useStore((s) => s.data.emails.find((m) => m.threadId === threadId))
  if (!mail) return <div className="hint">Aus einer E-Mail übernommen (nicht mehr im Posteingang)</div>
  return (
    <button
      type="button"
      className="mail-link"
      onClick={() => {
        useStore.getState().openDialog(null)
        useStore.getState().go('inbox', threadId)
      }}
      title="Quellmail öffnen"
    >
      <Mail /> Aus E-Mail: <b>{mail.subject.replace(/^((re|aw|fwd?|wg)\s*:\s*)+/gi, '')}</b> · {mail.from.name || mail.from.email}
    </button>
  )
}

/** Notiz aus einer Mail: Inhalt prüfen, Projekt und Speicherort wählen */
type NoteDraft = { title: string; body: string; projectId: string }

export function MailNoteDialog(props: { suggestionId?: string; title: string; body: string; threadId: string; projectId?: string; capture?: Capture }) {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const ms = useAccounts((s) => s.ms)
  const close = () => useStore.getState().openDialog(null)
  const capture = props.capture
  const [d0] = useState(() => takeDraft<NoteDraft>(capture))
  const [title, setTitle] = useState(d0?.title ?? props.title)
  const [body, setBody] = useState(d0?.body ?? props.body)
  const [projectId, setProjectId] = useState(d0?.projectId ?? props.projectId ?? '')
  const [initial] = useState(() => JSON.stringify([title, body, projectId]))
  const oneNoteOk = ms.connected && ms.caps.notes && !!settings.oneNoteSectionId
  const [toOneNote, setToOneNote] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    const now = new Date().toISOString()
    const note = { id: uid('n'), title: title.trim(), body, kind: 'note' as const, projectId: projectId || undefined, mailRef: props.threadId, createdAt: now, updatedAt: now }
    const st = useStore.getState()
    st.mutate((d) => ({ ...d, notes: [note, ...d.notes] }), capture ? undefined : { toast: `Notiz „${note.title.slice(0, 40)}“ angelegt`, undoable: true })
    if (capture) {
      finishCapture(capture)
      st.toast(`Notiz „${note.title.slice(0, 40)}“ angelegt`, {
        action: { label: 'Öffnen', run: () => openCreated('note', note.id) },
        undo: () => st.mutate((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== note.id) }))
      })
    }
    if (props.suggestionId) markCreated(props.suggestionId, 'note', note.id)
    if (toOneNote && settings.oneNoteSectionId) {
      const { saveNoteToOneNote } = await import('@/lib/onenote')
      await saveNoteToOneNote(note, settings.oneNoteSectionId)
    }
    setBusy(false)
    close()
  }
  return (
    <Dialog
      title={capture ? 'Aus E-Mail übernehmen' : 'Als Notiz merken'}
      onClose={close}
      dirty={JSON.stringify([title, body, projectId]) !== initial}
      footer={
        <>
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={submit} disabled={!title.trim() || busy}>
            Notiz anlegen
          </button>
        </>
      }
    >
      {capture && <CaptureHeader capture={capture} onSwitch={(to) => switchCapture(capture, to, { title, body, projectId } satisfies NoteDraft)} />}
      <label className="field">
        <span>
          Titel <OriginTag o={capture?.origin.title} />
        </span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>
          Inhalt <OriginTag o={capture?.origin.body} />
        </span>
        <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} rows={7} />
      </label>
      <label className="field">
        <span>Projekt</span>
        <Select aria-label="Projekt" value={projectId} onChange={setProjectId} options={projectOptions(data.projects)} />
      </label>
      <div className="field">
        <span>Speichern in</span>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" className="box-check" checked disabled /> Tagwerk-Notizen
        </label>
        {oneNoteOk && (
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" className="box-check" checked={toOneNote} onChange={(e) => setToOneNote(e.target.checked)} /> Zusätzlich in OneNote (zuletzt verwendeter Abschnitt)
          </label>
        )}
      </div>
      <MailLink threadId={props.threadId} />
    </Dialog>
  )
}
