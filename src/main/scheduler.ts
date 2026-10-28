// Systembenachrichtigungen: Erinnerung vor Terminen und optional ein
// Morgen-Hinweis mit den wichtigsten Punkten des Tages.

import { Notification } from 'electron'
import { buildBrief, ymd } from '@shared/analysis'
import { store } from './store'

const notified = new Set<string>()
let lastBriefDay = ''
let timer: NodeJS.Timeout | null = null

export function startScheduler(onClick: (view: string) => void) {
  if (timer) clearInterval(timer)
  const tick = () => {
    try {
      run(onClick)
    } catch {
      /* Planer darf die App nie stören */
    }
  }
  timer = setInterval(tick, 30_000)
  setTimeout(tick, 5_000)
}

function run(onClick: (view: string) => void) {
  if (!Notification.isSupported()) return
  const data = store.loadData()
  const s = store.getSettings()
  if (!data) return
  const now = new Date()

  if (s.notifications.events) {
    const lead = s.notifications.leadMinutes * 60_000
    for (const ev of data.events) {
      if (ev.allDay) continue
      const start = new Date(ev.start).getTime()
      const delta = start - now.getTime()
      const key = `${ev.id}@${ev.start}`
      if (delta > 0 && delta <= lead && !notified.has(key)) {
        notified.add(key)
        const mins = Math.max(1, Math.round(delta / 60_000))
        show(ev.title, `Beginnt in ${mins} Min.${ev.location ? ` · ${ev.location}` : ''}`, () => onClick('calendar'))
      }
    }
  }

  if (s.notifications.dailyBrief) {
    const [h, m] = s.notifications.briefTime.split(':').map(Number)
    const today = ymd(now)
    const due = new Date(now)
    due.setHours(h || 8, m || 0, 0, 0)
    // Nur innerhalb von zwei Stunden nach der eingestellten Zeit nachholen.
    if (lastBriefDay !== today && now >= due && now.getTime() - due.getTime() < 2 * 3600_000) {
      lastBriefDay = today
      const items = buildBrief(data, now, {
        workHours: s.workHours,
        bufferMinutes: s.transitionBufferMinutes,
        focusMinMinutes: s.focusMinMinutes
      })
      const important = items.filter((i) => i.tone !== 'info')
      const body = important.length
        ? important.slice(0, 2).map((i) => i.text).join(' ') + (important.length > 2 ? ` (+${important.length - 2} weitere)` : '')
        : 'Keine Konflikte und nichts Überfälliges. Guter Start.'
      show('Dein Tag', body, () => onClick('today'))
    }
  }
}

function show(title: string, body: string, onClick: () => void) {
  const n = new Notification({ title, body, silent: false })
  n.on('click', onClick)
  n.show()
}
