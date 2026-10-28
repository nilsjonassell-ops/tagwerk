// Import von Kalenderdateien (.ics), z. B. Export aus Outlook, Google oder Apple Kalender.
// Wiederkehrende Termine werden für ein Fenster von 60 Tagen zurück bis 180 Tage voraus aufgelöst.

import ICAL from 'ical.js'
import { randomUUID } from 'node:crypto'
import type { CalEvent, Person } from '@shared/types'

export function parseIcs(text: string, importId: string, now = new Date()): CalEvent[] {
  const comp = new ICAL.Component(ICAL.parse(text))
  const vevents = comp.getAllSubcomponents('vevent')
  const from = new Date(now.getTime() - 60 * 86400_000)
  const to = new Date(now.getTime() + 180 * 86400_000)
  const out: CalEvent[] = []

  for (const ve of vevents) {
    const event = new ICAL.Event(ve)
    if (event.isRecurrenceException()) continue
    const base = {
      title: event.summary || 'Ohne Titel',
      location: event.location || undefined,
      notes: event.description ? String(event.description).slice(0, 4000) : undefined,
      attendees: attendees(ve)
    }
    const allDay = event.startDate?.isDate ?? false
    const durationMs = event.endDate && event.startDate ? event.endDate.toJSDate().getTime() - event.startDate.toJSDate().getTime() : 3600_000

    if (event.isRecurring()) {
      const it = event.iterator()
      let next: ICAL.Time | null
      let guard = 0
      while ((next = it.next()) && guard++ < 2000) {
        const s = next.toJSDate()
        if (s > to) break
        if (s < from) continue
        out.push(make(s, new Date(s.getTime() + durationMs)))
      }
    } else if (event.startDate) {
      const s = event.startDate.toJSDate()
      if (s >= from && s <= to) out.push(make(s, new Date(s.getTime() + durationMs)))
    }

    function make(s: Date, e: Date): CalEvent {
      return { id: `ics-${randomUUID()}`, ...base, start: s.toISOString(), end: e.toISOString(), allDay, source: 'ics', readOnly: true, importId }
    }
  }
  return out
}

function attendees(ve: ICAL.Component): Person[] {
  return ve.getAllProperties('attendee').slice(0, 30).map((p) => {
    const mail = String(p.getFirstValue() ?? '').replace(/^mailto:/i, '')
    const cn = p.getParameter('cn')
    return { name: (typeof cn === 'string' && cn) || mail.split('@')[0], email: mail }
  })
}
