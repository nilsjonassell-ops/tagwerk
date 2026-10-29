// Fokus-Modus: Start, laufende Runde, Übergänge und Abschluss als ruhige
// Vollbild-Ansicht – plus kleine Anzeige, wenn die Ansicht minimiert ist.

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Coffee, Minimize2, Pause, Play, Plus, SkipForward, Square, Target, Volume2, VolumeX, X, Flame, ListPlus, CloudRain, Waves, Wind, Users } from 'lucide-react'
import { eventsOnDay, focusStats, isActive, sortTasks } from '@shared/analysis'
import type { FocusSound } from '@shared/types'
import { useStore } from '@/lib/store'
import { useFocus, remaining, initFocus } from '@/lib/focus'
import { playAmbient, setAmbientVolume, stopAmbient } from '@/lib/sound'
import { addTask, newTask, toggleTask } from '@/lib/actions'
import { durationLabel, fTime } from '@/lib/format'
import { Switch } from '@/components/ui'

const PRESETS = [15, 25, 45, 60, 90]
const SOUNDS: { id: FocusSound; label: string; icon: typeof Waves }[] = [
  { id: 'none', label: 'Stille', icon: VolumeX },
  { id: 'rain', label: 'Regen', icon: CloudRain },
  { id: 'brown', label: 'Tiefes Rauschen', icon: Waves },
  { id: 'white', label: 'Helles Rauschen', icon: Wind },
  { id: 'cafe', label: 'Café', icon: Users }
]

let previewTimer: ReturnType<typeof setTimeout> | undefined

const mmss = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Immer eingebunden: Taktgeber, Tastenkürzel, Befehle aus Tray und Hauptprozess. */
export function FocusHost() {
  const f = useFocus()
  const [, force] = useState(0)
  useEffect(() => {
    initFocus()
    const t = setInterval(() => {
      useFocus.getState().tick()
      force((n) => n + 1)
    }, 250)
    const off = window.tagwerk.focus.onAction((a) => {
      const st = useFocus.getState()
      if (a === 'pause') st.pause()
      else if (a === 'resume') st.resume()
      else if (a === 'stop') st.stop()
      else if (a === 'skip') st.skipBreak()
      else if (a === 'open') st.show(true)
    })
    return () => {
      clearInterval(t)
      off()
    }
  }, [])
  // Fenstertitel zeigt die Restzeit
  useEffect(() => {
    const active = f.status === 'running' || f.status === 'paused'
    document.title = active ? `${mmss(remaining(f))} · ${f.phase === 'focus' ? 'Fokus' : 'Pause'} – Tagwerk` : 'Tagwerk'
  })
  return (
    <>
      {f.open && <FocusView />}
    </>
  )
}

function Ring({ fraction, size = 300, stroke = 10, phase }: { fraction: number; size?: number; stroke?: number; phase: 'focus' | 'break' }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg className={`focus-ring ${phase}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <linearGradient id={`fg-${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={phase === 'focus' ? '#5a7dff' : '#34c59a'} />
          <stop offset="55%" stopColor={phase === 'focus' ? '#9a6bff' : '#5ac8fa'} />
          <stop offset="100%" stopColor={phase === 'focus' ? '#ff67ad' : '#8b7dff'} />
        </linearGradient>
      </defs>
      <circle className="track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
      <circle
        className="bar"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        fill="none"
        stroke={`url(#fg-${size})`}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, fraction)))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

/** In der Seitenleiste: Startknopf oder laufende Sitzung mit Restzeit. */
export function FocusLaunch() {
  const f = useFocus()
  const active = f.status === 'running' || f.status === 'paused' || f.status === 'between'
  if (!active) {
    return (
      <button className="focus-launch" onClick={() => f.show(true)} title="Fokus-Modus (Strg+Umschalt+F)">
        <Target aria-hidden="true" />
        <span>Fokus starten</span>
      </button>
    )
  }
  return <FocusPill />
}

function FocusPill() {
  const f = useFocus()
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const left = remaining(f)
  const frac = f.totalMs ? 1 - left / f.totalMs : 1
  return (
    <div className={`focus-pill ${f.phase}`} role="status">
      <button className="focus-pill-main" onClick={() => f.show(true)} title="Fokusansicht öffnen">
        <Ring fraction={frac} size={28} stroke={3.5} phase={f.phase} />
        <span className="time">{f.status === 'between' ? 'Bereit' : mmss(left)}</span>
        <span className="lbl">{f.phase === 'focus' ? f.label || 'Fokus' : 'Pause'}</span>
      </button>
      {f.status === 'running' && (
        <button className="btn ghost icon-btn small" onClick={f.pause} aria-label="Pausieren">
          <Pause />
        </button>
      )}
      {f.status === 'paused' && (
        <button className="btn ghost icon-btn small" onClick={f.resume} aria-label="Fortsetzen">
          <Play />
        </button>
      )}
    </div>
  )
}

function FocusView() {
  const f = useFocus()
  // Tastatur: Leertaste = Pause/Weiter, Esc = minimieren
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      if (useStore.getState().dialog) return
      const st = useFocus.getState()
      if (e.key === 'Escape') {
        e.preventDefault()
        if (st.status !== 'summary') st.show(false)
      } else if (e.key === ' ') {
        e.preventDefault()
        if (st.status === 'running') st.pause()
        else if (st.status === 'paused') st.resume()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`focus-view phase-${f.phase} status-${f.status}`} role="dialog" aria-modal="true" aria-label="Fokus-Modus">
      <div className="focus-aura" aria-hidden="true" />
      <div className="focus-top drag">
        <span className="focus-brand">
          <Target /> Fokus
        </span>
        <div className="no-drag" style={{ display: 'flex', gap: 6 }}>
          {f.status === 'summary' ? null : f.status === 'idle' ? (
            <button className="btn ghost small" onClick={() => f.show(false)}>
              <X /> Schließen
            </button>
          ) : (
            <button className="btn ghost small" onClick={() => f.show(false)} title="Minimieren (Esc) – der Timer läuft weiter">
              <Minimize2 /> Minimieren
            </button>
          )}
        </div>
      </div>
      <div className="focus-stage">
        {f.status === 'idle' && <Setup />}
        {(f.status === 'running' || f.status === 'paused') && <Running />}
        {f.status === 'between' && <Between />}
        {f.status === 'summary' && <Summary />}
      </div>
    </div>
  )
}

function Setup() {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const update = useStore((s) => s.updateSettings)
  const f = useFocus()
  const tasks = useMemo(() => sortTasks(data.tasks.filter(isActive)).slice(0, 40), [data.tasks])
  const [taskId, setTaskId] = useState<string>(f.presetTaskId ?? '')
  const [minutes, setMinutes] = useState(settings.focus.minutes)
  const [custom, setCustom] = useState(!PRESETS.includes(settings.focus.minutes))
  const [pomodoro, setPomodoro] = useState(settings.focus.pomodoro)
  const stats = focusStats(data.focusLog, new Date())
  const fs = settings.focus

  // Nächster Termin: rechtzeitig vorher aufhören
  const now = new Date()
  const next = eventsOnDay(data.events, now).find((e) => !e.allDay && new Date(e.start) > now)
  const untilNext = next ? Math.floor((new Date(next.start).getTime() - now.getTime()) / 60_000) : null
  const tooLong = untilNext !== null && untilNext < minutes

  const setF = (patch: Partial<typeof fs>) => update({ focus: { ...fs, ...patch } })
  const goalFrac = Math.min(1, stats.todayMinutes / Math.max(1, fs.dailyGoalMinutes))
  const maxDay = Math.max(30, ...stats.last7.map((d) => d.minutes))

  return (
    <div className="focus-setup">
      <div className="focus-setup-main">
        <h1>Worauf willst du dich konzentrieren?</h1>
        <select className="select focus-task" value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label="Aufgabe">
          <option value="">Ohne bestimmte Aufgabe</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>

        <div className="focus-label">Dauer</div>
        <div className="focus-chips">
          {PRESETS.map((m) => (
            <button key={m} className={`chip ${!custom && minutes === m ? 'on' : ''}`} onClick={() => (setCustom(false), setMinutes(m))}>
              {m} Min.
            </button>
          ))}
          <button className={`chip ${custom ? 'on' : ''}`} onClick={() => setCustom(true)}>
            Eigene
          </button>
          {custom && (
            <input className="input" type="number" min={5} max={240} value={minutes} onChange={(e) => setMinutes(Math.max(5, Math.min(240, Number(e.target.value) || 5)))} style={{ width: 90 }} aria-label="Minuten" />
          )}
        </div>
        {tooLong && next && (
          <div className="focus-warn">
            In {untilNext} Min. beginnt „{next.title}“ ({fTime.format(new Date(next.start))} Uhr).{' '}
            {untilNext! >= 5 && (
              <button className="link" onClick={() => (setCustom(true), setMinutes(Math.max(5, untilNext! - 5)))}>
                Auf {Math.max(5, untilNext! - 5)} Min. kürzen
              </button>
            )}
          </div>
        )}

        <div className="focus-options">
          <label className="focus-opt">
            <Switch label="Pomodoro" checked={pomodoro} onChange={setPomodoro} />
            <span>
              <b>Pomodoro-Runden</b>
              <small>
                Nach jeder Runde {fs.breakMinutes} Min. Pause, nach {fs.rounds} Runden {fs.longBreakMinutes} Min.
              </small>
            </span>
          </label>
          <label className="focus-opt">
            <Switch label="Termine melden" checked={fs.allowMeetingAlerts} onChange={(v) => setF({ allowMeetingAlerts: v })} />
            <span>
              <b>Termin-Erinnerungen trotzdem zeigen</b>
              <small>Alle anderen Benachrichtigungen von Tagwerk sind während des Fokus stumm.</small>
            </span>
          </label>
          <label className="focus-opt">
            <Switch label="Signalton" checked={fs.chime} onChange={(v) => setF({ chime: v })} />
            <span>
              <b>Signalton</b>
              <small>Sanfter Gong zu Beginn und am Ende jeder Phase.</small>
            </span>
          </label>
        </div>

        <SoundPicker />

        <button className="btn primary focus-start" onClick={() => f.start({ taskId: taskId || undefined, minutes, pomodoro })}>
          <Play /> Fokus starten · {durationLabel(minutes)}
        </button>
        <div className="hint" style={{ textAlign: 'center' }}>
          Leertaste pausiert · Esc minimiert · Strg+Umschalt+F öffnet den Fokus jederzeit
        </div>
      </div>

      <aside className="focus-stats">
        <div className="focus-goal">
          <Ring fraction={goalFrac} size={120} stroke={9} phase="focus" />
          <div className="focus-goal-text">
            <b>{durationLabel(stats.todayMinutes) || '0 Min.'}</b>
            <span>von {durationLabel(fs.dailyGoalMinutes)}</span>
          </div>
        </div>
        <div className="focus-stat-row">
          <span>
            <Flame /> {stats.streak} {stats.streak === 1 ? 'Tag' : 'Tage'} in Folge
          </span>
          <span>{stats.todaySessions} Sitzungen heute</span>
        </div>
        <div className="focus-week" aria-label="Fokuszeit der letzten 7 Tage">
          {stats.last7.map((d) => (
            <div key={d.day} className="bar-wrap" title={`${d.day}: ${d.minutes} Min.`}>
              <div className="bar" style={{ height: `${Math.max(4, (d.minutes / maxDay) * 100)}%` }} />
              <span>{new Date(d.day + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
        <div className="focus-label" style={{ marginTop: 6 }}>
          Tagesziel
        </div>
        <select className="select" value={fs.dailyGoalMinutes} onChange={(e) => setF({ dailyGoalMinutes: Number(e.target.value) })} aria-label="Tagesziel">
          {[60, 90, 120, 180, 240, 300].map((m) => (
            <option key={m} value={m}>
              {durationLabel(m)}
            </option>
          ))}
        </select>
      </aside>
    </div>
  )
}

function SoundPicker() {
  const fs = useStore((s) => s.settings.focus)
  const update = useStore((s) => s.updateSettings)
  const f = useFocus()
  const live = f.status === 'running' && f.phase === 'focus'
  const pick = (sound: FocusSound) => {
    void update({ focus: { ...fs, sound } })
    if (live) playAmbient(sound, fs.volume)
    else if (sound !== 'none') {
      // kurze Hörprobe
      playAmbient(sound, fs.volume)
      clearTimeout(previewTimer)
      previewTimer = setTimeout(() => useFocus.getState().status !== 'running' && stopAmbient(), 3500)
    } else stopAmbient()
  }
  return (
    <div className="focus-sound">
      <div className="focus-label">Klang</div>
      <div className="focus-chips">
        {SOUNDS.map((s) => (
          <button
            key={s.id}
            className={`chip ${fs.sound === s.id ? 'on' : ''}`}
            onClick={() => pick(s.id)}
          >
            <s.icon size={14} /> {s.label}
          </button>
        ))}
      </div>
      {fs.sound !== 'none' && (
        <div className="focus-volume">
          <Volume2 size={14} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={fs.volume}
            onChange={(e) => {
              const v = Number(e.target.value)
              setAmbientVolume(v)
              void update({ focus: { ...fs, volume: v } })
            }}
            aria-label="Lautstärke"
          />
        </div>
      )}
    </div>
  )
}

function Running() {
  const f = useFocus()
  const data = useStore((s) => s.data)
  const left = remaining(f)
  const frac = f.totalMs ? 1 - left / f.totalMs : 0
  const task = f.taskId ? data.tasks.find((t) => t.id === f.taskId) : undefined
  const [thought, setThought] = useState('')
  const endsAt = f.status === 'running' && f.endsAt ? new Date(f.endsAt) : null

  return (
    <div className="focus-running">
      <div className="focus-phase">
        {f.phase === 'focus' ? (
          <>
            Fokus{f.pomodoro ? ` · Runde ${((f.round - 1) % f.rounds) + 1} von ${f.rounds}` : ''}
          </>
        ) : (
          <>
            <Coffee size={15} /> {f.round % f.rounds === 0 ? 'Lange Pause' : 'Pause'} – steh kurz auf, trink etwas
          </>
        )}
      </div>
      <div className={`focus-timer ${f.status === 'paused' ? 'paused' : ''}`}>
        <Ring fraction={frac} phase={f.phase} />
        <div className="focus-time">
          <span className="t">{mmss(left)}</span>
          <span className="sub">{f.status === 'paused' ? 'pausiert' : endsAt ? `bis ${fTime.format(endsAt)} Uhr` : ''}</span>
        </div>
      </div>
      {f.pomodoro && (
        <div className="focus-dots" aria-label={`Runde ${f.round}`}>
          {Array.from({ length: f.rounds }, (_, i) => (
            <span key={i} className={i < ((f.round - 1) % f.rounds) + (f.phase === 'break' ? 1 : 0) ? 'done' : i === (f.round - 1) % f.rounds ? 'now' : ''} />
          ))}
        </div>
      )}
      {f.phase === 'focus' && <div className="focus-task-title">{f.label || 'Konzentriert arbeiten'}</div>}

      <div className="focus-controls">
        {f.status === 'running' ? (
          <button className="btn focus-big" onClick={f.pause} aria-label="Pausieren">
            <Pause /> Pause
          </button>
        ) : (
          <button className="btn primary focus-big" onClick={f.resume} aria-label="Fortsetzen">
            <Play /> Weiter
          </button>
        )}
        <button className="btn" onClick={() => f.addMinutes(5)}>
          <Plus /> 5 Min.
        </button>
        {f.phase === 'break' ? (
          <button className="btn" onClick={f.skipBreak}>
            <SkipForward /> Pause überspringen
          </button>
        ) : (
          <button className="btn" onClick={f.stop}>
            <Square /> Beenden
          </button>
        )}
        {task && f.phase === 'focus' && task.status !== 'done' && (
          <button
            className="btn"
            onClick={() => {
              toggleTask(task.id)
              f.stop()
            }}
          >
            <CheckCircle2 /> Erledigt
          </button>
        )}
      </div>

      {f.phase === 'focus' && (
        <div className="focus-park">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              f.park(thought)
              setThought('')
            }}
          >
            <ListPlus size={16} />
            <input className="input" value={thought} onChange={(e) => setThought(e.target.value)} placeholder="Gedanke dazwischen? Hier parken und weitermachen …" aria-label="Gedanken parken" />
          </form>
          {f.parked.length > 0 && (
            <ul>
              {f.parked.map((p) => (
                <li key={p.id}>
                  <span>{p.text}</span>
                  <button className="btn ghost icon-btn small" onClick={() => f.unpark(p.id)} aria-label="Entfernen">
                    <X />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <SoundPicker />
    </div>
  )
}

function Between() {
  const f = useFocus()
  const fs = useStore((s) => s.settings.focus)
  const afterFocus = f.phase === 'focus'
  const long = f.round % f.rounds === 0
  return (
    <div className="focus-between">
      <div className="focus-badge">{afterFocus ? <CheckCircle2 /> : <Coffee />}</div>
      <h1>{afterFocus ? 'Runde geschafft!' : 'Pause vorbei'}</h1>
      <p>{afterFocus ? `${Math.round(f.sessionMs / 60_000)} Min. fokussiert in dieser Sitzung.` : 'Bereit für die nächste Runde?'}</p>
      <div className="focus-controls">
        {afterFocus ? (
          <>
            <button className="btn primary focus-big" onClick={f.startBreak}>
              <Coffee /> {long ? `Lange Pause · ${fs.longBreakMinutes} Min.` : `Pause · ${fs.breakMinutes} Min.`}
            </button>
            <button className="btn" onClick={f.nextRound}>
              <SkipForward /> Ohne Pause weiter
            </button>
          </>
        ) : (
          <button className="btn primary focus-big" onClick={f.nextRound}>
            <Play /> Nächste Runde · {fs.minutes} Min.
          </button>
        )}
        <button className="btn" onClick={f.stop}>
          <Square /> Sitzung beenden
        </button>
      </div>
    </div>
  )
}

function Summary() {
  const f = useFocus()
  const data = useStore((s) => s.data)
  const task = f.taskId ? data.tasks.find((t) => t.id === f.taskId) : undefined
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(f.parked.map((p) => p.id)))
  const minutes = Math.round(f.sessionMs / 60_000)
  const stats = focusStats(data.focusLog, new Date())

  const finish = () => {
    const picked = f.parked.filter((p) => chosen.has(p.id))
    picked.forEach((p) => addTask(newTask({ title: p.text, origin: { kind: 'note', refId: 'focus', label: 'Fokus-Sitzung' } }), false))
    if (picked.length) useStore.getState().toast(`${picked.length} ${picked.length === 1 ? 'Aufgabe' : 'Aufgaben'} aus geparkten Gedanken angelegt`)
    f.finish()
  }

  return (
    <div className="focus-between focus-summary">
      <div className="focus-badge">
        <CheckCircle2 />
      </div>
      <h1>{minutes >= 1 ? `${durationLabel(minutes)} konzentriert gearbeitet` : 'Sitzung beendet'}</h1>
      <p>
        Heute insgesamt {durationLabel(stats.todayMinutes) || '0 Min.'}
        {stats.streak > 1 ? ` · ${stats.streak} Tage in Folge` : ''}
      </p>
      {task && task.status !== 'done' && (
        <button className="btn" onClick={() => toggleTask(task.id)}>
          <CheckCircle2 /> „{task.title}“ als erledigt markieren
        </button>
      )}
      {f.parked.length > 0 && (
        <div className="focus-parked-review">
          <div className="focus-label">Geparkte Gedanken als Aufgaben übernehmen</div>
          {f.parked.map((p) => (
            <label key={p.id} className="row" style={{ gap: 10, padding: '6px 0' }}>
              <input
                type="checkbox"
                className="box-check"
                checked={chosen.has(p.id)}
                onChange={() =>
                  setChosen((s) => {
                    const n = new Set(s)
                    if (n.has(p.id)) n.delete(p.id)
                    else n.add(p.id)
                    return n
                  })
                }
              />
              <span>{p.text}</span>
            </label>
          ))}
        </div>
      )}
      <div className="focus-controls">
        <button className="btn primary focus-big" onClick={finish}>
          Fertig
        </button>
        <button
          className="btn"
          onClick={() => {
            finish()
            useFocus.getState().show(true)
          }}
        >
          <Target /> Neue Sitzung
        </button>
      </div>
    </div>
  )
}
