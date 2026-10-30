// Systembenachrichtigungen: Erinnerung vor (und optional zu Beginn von) Terminen,
// Morgen-Überblick und Hinweis auf eine ablaufende Google-Anmeldung.
// Ruhezeiten, Fokus-Modus und Ton regelt notify.ts zentral.

import { buildBrief, findConflicts, eventsOnDay, ymd } from '@shared/analysis'
import { store } from './store'
import { googleExpiry } from './google'
import { notify } from './notify'

const notified = new Set<string>()
let lastBriefDay = ''
let timer: NodeJS.Timeout | null = null
let googleReminderDay = ''

const hm = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

export function startScheduler() {
  if (timer) clearInterval(timer)
  const tick = () => {
    try {
      run()
      remindGoogle()
    } catch {
      /* Planer darf die App nie stören */
    }
  }
  timer = setInterval(tick, 20_000)
  setTimeout(tick, 5_000)
}

function run() {
  const data = store.loadData()
  const s = store.getSettings()
  if (!data) return
  const now = new Date()

  if (s.notifications.events) {
    const lead = s.notifications.leadMinutes * 60_000
    const today = eventsOnDay(data.events, now).filter((e) => !e.allDay)
    const conflicts = findConflicts(today, s.transitionBufferMinutes)
    for (const ev of data.events) {
      if (ev.allDay) continue
      const start = new Date(ev.start).getTime()
      const delta = start - now.getTime()
      const when = `${hm(ev.start)}–${hm(ev.end)} Uhr`
      const where = ev.location ? ` · ${ev.location}` : ''

      // Vorab-Erinnerung
      const keyLead = `${ev.id}@${ev.start}#lead`
      if (delta > 60_000 && delta <= lead && !notified.has(keyLead)) {
        notified.add(keyLead)
        const mins = Math.max(1, Math.round(delta / 60_000))
        const c = conflicts.find((x) => x.a.id === ev.id || x.b.id === ev.id)
        const clash = c ? (c.kind === 'overlap' ? ' · ⚠ überschneidet sich mit einem anderen Termin' : ` · ⚠ nur ${c.gapMinutes} Min. Puffer`) : ''
        notify({ kind: 'event', title: `In ${mins} Min.: ${ev.title}`, body: `${when}${where}${clash}`, target: { view: 'calendar', id: ev.id } })
      }

      // Zum Beginn (optional)
      const keyStart = `${ev.id}@${ev.start}#start`
      if (s.notifications.eventsAtStart && delta <= 0 && delta > -120_000 && !notified.has(keyStart)) {
        notified.add(keyStart)
        notify({ kind: 'event', title: `Jetzt: ${ev.title}`, body: `${when}${where}`, target: { view: 'calendar', id: ev.id } })
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
      const items = buildBrief(data, now, {
        workHours: s.workHours,
        bufferMinutes: s.transitionBufferMinutes,
        focusMinMinutes: s.focusMinMinutes
      })
      const important = items.filter((i) => i.tone !== 'info')
      const body = important.length
        ? important.slice(0, 2).map((i) => i.text).join(' ') + (important.length > 2 ? ` (+${important.length - 2} weitere)` : '')
        : 'Keine Konflikte und nichts Überfälliges. Guter Start.'
      const r = notify({ kind: 'brief', title: 'Dein Tag', body, target: { view: 'today' } })
      // Bei Ruhezeit oder Fokus später erneut versuchen, sonst für heute erledigt
      if (r.shown || r.reason === 'unsupported') lastBriefDay = today
    }
  }
}

/** Erinnert ab einem Tag vor Ablauf einmal täglich daran, Google neu zu verbinden. */
function remindGoogle() {
  const { expiresAt } = googleExpiry()
  if (!expiresAt) return
  const now = Date.now()
  const left = expiresAt - now
  const today = ymd(new Date())
  if (left > 24 * 3600_000 || googleReminderDay === today) return
  const when =
    left <= 0 ? 'ist abgelaufen' : left < 3 * 3600_000 ? 'läuft in wenigen Stunden ab' : `läuft ${new Date(expiresAt).toDateString() === new Date().toDateString() ? 'heute' : 'morgen'} um ${new Date(expiresAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr ab`
  const r = notify({
    kind: 'system',
    title: 'Google bitte neu verbinden',
    body: `Die Anmeldung für Kalender und Gmail ${when}. Ein Klick öffnet die Einstellungen – „Neu verbinden“ dauert nur ein paar Sekunden.`,
    target: { view: 'command', id: 'open-google-settings' }
  })
  if (r.shown) googleReminderDay = today
}
