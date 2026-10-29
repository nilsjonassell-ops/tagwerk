// Fokus-Sitzung: Timer, Pomodoro-Runden, geparkte Gedanken und Protokoll.
// Die Zeit wird über einen festen Endzeitpunkt gerechnet – kein Driften,
// auch wenn das Fenster versteckt ist.

import { create } from 'zustand'
import type { FocusEntry } from '@shared/types'
import { useStore, uid } from './store'
import { chime, playAmbient, stopAmbient } from './sound'

export type FocusStatus = 'idle' | 'running' | 'paused' | 'between' | 'summary'

export interface Parked {
  id: string
  text: string
}

interface FocusState {
  status: FocusStatus
  phase: 'focus' | 'break'
  round: number
  totalMs: number
  endsAt: number | null
  remainingMs: number
  /** Beginn des laufenden Abschnitts */
  phaseStart: number
  /** Erster Start der aktuellen Phase */
  phaseFirst: number
  /** Bereits fokussierte Zeit der aktuellen Phase aus früheren Abschnitten */
  phaseAccum: number
  /** Fokuszeit dieser Sitzung in ms */
  sessionMs: number
  rounds: number
  taskId?: string
  label: string
  pomodoro: boolean
  parked: Parked[]
  open: boolean
  /** Vorauswahl für den Start-Bildschirm */
  presetTaskId?: string

  start(o: { taskId?: string; minutes: number; pomodoro: boolean }): void
  pause(): void
  resume(): void
  addMinutes(m: number): void
  stop(): void
  skipBreak(): void
  startBreak(): void
  nextRound(): void
  finish(): void
  tick(): void
  park(text: string): void
  unpark(id: string): void
  show(open: boolean, presetTaskId?: string): void
}

const KEY = 'tagwerk.focus.v1'
const settings = () => useStore.getState().settings.focus

function persist(s: FocusState) {
  try {
    const { status, phase, round, totalMs, endsAt, remainingMs, phaseStart, phaseFirst, phaseAccum, sessionMs, rounds, taskId, label, pomodoro, parked } = s
    localStorage.setItem(KEY, JSON.stringify({ status, phase, round, totalMs, endsAt, remainingMs, phaseStart, phaseFirst, phaseAccum, sessionMs, rounds, taskId, label, pomodoro, parked }))
  } catch {
    /* kein Speicher – Sitzung gilt dann nur bis zum Neuladen */
  }
}

function restore(): Partial<FocusState> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function signal(s: FocusState) {
  const active = s.status === 'running' || s.status === 'paused'
  window.tagwerk.focus.signal({
    active,
    phase: s.phase,
    endsAt: s.status === 'running' ? s.endsAt : null,
    remainingMs: s.remainingMs,
    totalMs: s.totalMs,
    label: s.label,
    allowMeetingAlerts: settings().allowMeetingAlerts
  })
  if (s.status === 'running' && s.phase === 'focus') playAmbient(settings().sound, settings().volume)
  else stopAmbient()
}

function logFocus(start: number, focusedMs: number, end: number, taskId?: string) {
  const minutes = Math.round(focusedMs / 60_000)
  if (minutes < 1) return
  const entry: FocusEntry = { id: uid('focus'), start: new Date(start).toISOString(), end: new Date(end).toISOString(), minutes, taskId }
  useStore.getState().mutate((d) => ({ ...d, focusLog: [...(d.focusLog ?? []), entry].slice(-500) }))
}

export const remaining = (s: Pick<FocusState, 'status' | 'endsAt' | 'remainingMs'>) =>
  s.status === 'running' && s.endsAt ? Math.max(0, s.endsAt - Date.now()) : s.remainingMs

export const useFocus = create<FocusState>((set, get) => {
  const apply = (patch: Partial<FocusState>) => {
    set(patch)
    const s = get()
    persist(s)
    signal(s)
  }

  return {
    status: 'idle',
    phase: 'focus',
    round: 1,
    totalMs: 0,
    endsAt: null,
    remainingMs: 0,
    phaseStart: 0,
    phaseFirst: 0,
    phaseAccum: 0,
    sessionMs: 0,
    rounds: 4,
    label: '',
    pomodoro: true,
    parked: [],
    open: false,
    ...restore(),

    start({ taskId, minutes, pomodoro }) {
      const ms = Math.round(minutes * 60_000)
      const task = taskId ? useStore.getState().data.tasks.find((t) => t.id === taskId) : undefined
      if (settings().chime) chime('start')
      apply({
        status: 'running',
        phase: 'focus',
        round: 1,
        totalMs: ms,
        endsAt: Date.now() + ms,
        remainingMs: ms,
        phaseStart: Date.now(),
        phaseFirst: Date.now(),
        phaseAccum: 0,
        sessionMs: 0,
        rounds: settings().rounds,
        taskId: task?.id,
        label: task?.title ?? '',
        pomodoro,
        parked: get().status === 'summary' ? [] : get().parked
      })
      // Merken, was gewählt wurde
      if (minutes !== settings().minutes || pomodoro !== settings().pomodoro) {
        void useStore.getState().updateSettings({ focus: { ...settings(), minutes, pomodoro } })
      }
    },
    pause() {
      const s = get()
      if (s.status !== 'running') return
      apply({ status: 'paused', remainingMs: remaining(s), endsAt: null, phaseAccum: s.phase === 'focus' ? s.phaseAccum + (Date.now() - s.phaseStart) : s.phaseAccum })
    },
    resume() {
      const s = get()
      if (s.status !== 'paused') return
      apply({ status: 'running', endsAt: Date.now() + s.remainingMs, phaseStart: Date.now() })
    },
    addMinutes(m) {
      const s = get()
      const add = m * 60_000
      if (s.status === 'running' && s.endsAt) apply({ endsAt: s.endsAt + add, totalMs: s.totalMs + add })
      else if (s.status === 'paused') apply({ remainingMs: s.remainingMs + add, totalMs: s.totalMs + add })
    },
    stop() {
      const s = get()
      let sessionMs = s.sessionMs
      if (s.phase === 'focus' && (s.status === 'running' || s.status === 'paused')) {
        const focused = s.phaseAccum + (s.status === 'running' ? Date.now() - s.phaseStart : 0)
        logFocus(s.phaseFirst, focused, Date.now(), s.taskId)
        sessionMs += focused
      }
      apply({ status: 'summary', endsAt: null, remainingMs: 0, sessionMs, open: true })
    },
    skipBreak() {
      get().nextRound()
    },
    startBreak() {
      const s = get()
      const long = s.round % s.rounds === 0
      const ms = (long ? settings().longBreakMinutes : settings().breakMinutes) * 60_000
      apply({ status: 'running', phase: 'break', totalMs: ms, endsAt: Date.now() + ms, remainingMs: ms })
    },
    nextRound() {
      const s = get()
      const ms = settings().minutes * 60_000
      if (settings().chime) chime('start')
      apply({ status: 'running', phase: 'focus', round: s.round + 1, totalMs: ms, endsAt: Date.now() + ms, remainingMs: ms, phaseStart: Date.now(), phaseFirst: Date.now(), phaseAccum: 0 })
    },
    finish() {
      apply({ status: 'idle', endsAt: null, remainingMs: 0, sessionMs: 0, parked: [], taskId: undefined, label: '', open: false })
    },
    tick() {
      const s = get()
      if (s.status !== 'running' || !s.endsAt || Date.now() < s.endsAt) return
      if (s.phase === 'focus') {
        const focused = s.phaseAccum + (s.endsAt - s.phaseStart)
        logFocus(s.phaseFirst, focused, s.endsAt, s.taskId)
        const sessionMs = s.sessionMs + focused
        if (settings().chime) chime('focus-end')
        if (s.pomodoro && settings().autoStartBreak) {
          set({ sessionMs })
          get().startBreak()
        } else {
          apply({ status: s.pomodoro ? 'between' : 'summary', endsAt: null, remainingMs: 0, sessionMs, open: true })
        }
      } else {
        if (settings().chime) chime('break-end')
        apply({ status: 'between', endsAt: null, remainingMs: 0, open: true })
      }
    },
    park(text) {
      const t = text.trim()
      if (!t) return
      apply({ parked: [...get().parked, { id: uid('park'), text: t }] })
    },
    unpark(id) {
      apply({ parked: get().parked.filter((p) => p.id !== id) })
    },
    show(open, presetTaskId) {
      set({ open, presetTaskId: presetTaskId ?? get().presetTaskId })
    }
  }
})

/** Nach dem Laden: Hauptprozess über eine laufende Sitzung informieren. */
export function initFocus() {
  const s = useFocus.getState()
  if (s.status === 'running' || s.status === 'paused') signal(s)
  s.tick()
}
