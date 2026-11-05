// Tagesplan auf „Heute“: Termine eines Tages senkrecht anordnen (Minuten ab Beginn),
// überschneidende Termine nebeneinander in Spalten. Reine Rechnung – testbar.
import type { CalEvent } from './types.ts'

export interface AgendaItem {
  event: CalEvent
  /** Minuten ab startH */
  top: number
  height: number
  col: number
  cols: number
}

export interface DayLayout {
  startH: number
  endH: number
  allDay: CalEvent[]
  items: AgendaItem[]
}

const MIN_HEIGHT = 20

export function layoutDay(events: CalEvent[], day: Date, work: { start: number; end: number }): DayLayout {
  const d0 = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  const d1 = d0 + 24 * 3600_000
  const onDay = events.filter((e) => new Date(e.start).getTime() < d1 && new Date(e.end).getTime() > d0)
  const allDay = onDay.filter((e) => e.allDay)
  const timed = onDay
    .filter((e) => !e.allDay)
    .map((e) => ({ e, s: Math.max(d0, new Date(e.start).getTime()), en: Math.min(d1, new Date(e.end).getTime()) }))
    .sort((a, b) => a.s - b.s || b.en - a.en)

  const hourOf = (t: number) => (t - d0) / 3600_000
  let startH = Math.max(0, work.start - 1)
  let endH = Math.min(24, work.end + 1)
  for (const x of timed) {
    startH = Math.min(startH, Math.floor(hourOf(x.s)))
    endH = Math.max(endH, Math.ceil(hourOf(x.en)))
  }
  const minute = (t: number) => Math.round((t - d0) / 60_000 - startH * 60)

  // Gruppen zusammenhängender Überschneidungen; darin bekommt jeder Termin die erste freie Spalte
  const items: AgendaItem[] = []
  let group: { x: (typeof timed)[number]; col: number }[] = []
  let groupEnd = -Infinity
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1))
    for (const g of group) {
      const top = minute(g.x.s)
      const bottom = Math.max(minute(g.x.en), top + MIN_HEIGHT)
      items.push({ event: g.x.e, top, height: Math.min(bottom, (endH - startH) * 60) - top, col: g.col, cols })
    }
    group = []
  }
  const colEnds: number[] = []
  for (const x of timed) {
    if (x.s >= groupEnd) {
      flush()
      colEnds.length = 0
    }
    // sichtbares Ende zählt – kurze Termine werden auf Mindesthöhe gestreckt
    const shownEnd = Math.max(x.en, x.s + MIN_HEIGHT * 60_000)
    let col = colEnds.findIndex((end) => end <= x.s)
    if (col === -1) col = colEnds.length
    colEnds[col] = shownEnd
    group.push({ x, col })
    groupEnd = Math.max(groupEnd, shownEnd)
  }
  flush()
  return { startH, endH, allDay, items }
}
