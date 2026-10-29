// Fokus-Modus im Hauptprozess: Fortschritt in der Taskleiste, Benachrichtigung
// zum Ende der Phase (auch wenn das Fenster versteckt ist) und Stummschalten
// der übrigen Erinnerungen.

import { BrowserWindow, Notification } from 'electron'
import type { FocusSignal } from '@shared/types'

let current: FocusSignal | null = null
let endTimer: NodeJS.Timeout | null = null
let ticker: NodeJS.Timeout | null = null
let getWindow: () => BrowserWindow | null = () => null
let onChange: () => void = () => {}
let onOpen: () => void = () => {}

export function initFocus(opts: { window: () => BrowserWindow | null; changed: () => void; open: () => void }) {
  getWindow = opts.window
  onChange = opts.changed
  onOpen = opts.open
}

export function focusState(): FocusSignal | null {
  return current?.active ? current : null
}

/** Erinnerungen unterdrücken? Termine optional weiter melden. */
export function focusMute(): { muted: boolean; allowMeetings: boolean } {
  const s = focusState()
  return { muted: !!s && s.phase === 'focus', allowMeetings: !!s?.allowMeetingAlerts }
}

export function setFocus(s: FocusSignal) {
  current = s
  if (endTimer) clearTimeout(endTimer)
  endTimer = null
  if (s.active && s.endsAt) {
    const delay = Math.max(0, s.endsAt - Date.now())
    endTimer = setTimeout(() => notifyEnd(s), delay)
  }
  if (ticker) clearInterval(ticker)
  ticker = s.active ? setInterval(updateProgress, 5_000) : null
  updateProgress()
  onChange()
}

function notifyEnd(s: FocusSignal) {
  if (!Notification.isSupported()) return
  const n =
    s.phase === 'focus'
      ? new Notification({ title: 'Fokuszeit geschafft', body: s.label ? `„${s.label}“ – Zeit für eine kurze Pause.` : 'Zeit für eine kurze Pause.', silent: false })
      : new Notification({ title: 'Pause vorbei', body: 'Bereit für die nächste Fokusrunde?', silent: false })
  n.on('click', onOpen)
  n.show()
}

function updateProgress() {
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  const s = focusState()
  if (!s) {
    win.setProgressBar(-1)
    return
  }
  const left = s.endsAt ? Math.max(0, s.endsAt - Date.now()) : s.remainingMs
  const fraction = 1 - left / Math.max(1, s.totalMs)
  win.setProgressBar(Math.min(1, Math.max(0, fraction)), { mode: s.endsAt ? (s.phase === 'break' ? 'paused' : 'normal') : 'paused' })
}

export function focusSummary(): string | null {
  const s = focusState()
  if (!s) return null
  if (!s.endsAt) return s.phase === 'focus' ? 'Fokus pausiert' : 'Pause pausiert'
  const min = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 60_000))
  return s.phase === 'focus' ? `Fokus · noch ${min} Min.` : `Pause · noch ${min} Min.`
}
