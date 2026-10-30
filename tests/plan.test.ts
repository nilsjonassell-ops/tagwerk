import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planCandidates, planTasks } from '../src/shared/analysis.ts'
import type { CalEvent, Task } from '../src/shared/types.ts'

const task = (id: string, p: Task['priority'], due?: string, extra: Partial<Task> = {}): Task => ({
  id, title: id, priority: p, due, status: 'open', recurrence: 'none', createdAt: '2026-10-01T00:00:00Z', source: 'local', ...extra
})
const ev = (id: string, s: string, e: string): CalEvent => ({ id, title: id, start: new Date(s).toISOString(), end: new Date(e).toISOString(), attendees: [], source: 'local' })
const wh = { start: 8, end: 18 }

test('Reihenfolge: überfällig vor fällig vor ohne Datum, dann Priorität', () => {
  const ts = [task('c', 'high'), task('b', 'low', '2026-10-30'), task('a', 'medium', '2026-10-20'), task('d', 'high', '2026-10-30'), task('x', 'high', undefined, { status: 'done' })]
  assert.deepEqual(planCandidates(ts, [], new Date('2026-10-28T09:00:00')).map((t) => t.id), ['a', 'd', 'b', 'c'])
})

test('Bereits eingeplante Aufgaben werden übersprungen', () => {
  const ts = [task('a', 'high')]
  const block = { ...ev('blk', '2026-10-29T09:00:00', '2026-10-29T10:00:00'), taskId: 'a' }
  assert.equal(planCandidates(ts, [block], new Date('2026-10-28T09:00:00')).length, 0)
})

test('Plant ab jetzt in Lücken, mit Puffer und um Termine herum', () => {
  const now = new Date('2026-10-28T09:05:00') // Mittwoch
  const events = [ev('m', '2026-10-28T10:00:00', '2026-10-28T12:00:00')]
  const plan = planTasks([task('a', 'medium'), task('b', 'high'), task('c', 'low')], events, now, { workHours: wh })
  // a: 45 Min ab 09:15 → passt bis 10:00
  assert.equal(plan[0].start.getHours() * 60 + plan[0].start.getMinutes(), 9 * 60 + 15)
  // b: 60 Min – vor dem Termin ist kein Platz mehr, also nach Termin + 10 Min Puffer = 12:10
  assert.equal(plan[1].start.getHours() * 60 + plan[1].start.getMinutes(), 12 * 60 + 10)
  // c: nach b (bis 13:10) + 10 Min Puffer = 13:20
  assert.equal(plan[2].start.getHours() * 60 + plan[2].start.getMinutes(), 13 * 60 + 20)
})

test('Wochenende wird ausgelassen und Verspätung markiert', () => {
  const now = new Date('2026-10-30T17:30:00') // Freitag kurz vor Feierabend
  const plan = planTasks([task('a', 'high', '2026-10-30')], [], now, { workHours: wh })
  assert.equal(plan[0].start.getDay(), 1) // Montag
  assert.equal(plan[0].late, true)
})

import { focusStats } from '../src/shared/analysis.ts'

test('Fokus-Statistik: heute, Woche und Serie', () => {
  const at = (d: string, m: number) => ({ id: d + m, start: new Date(d).toISOString(), end: new Date(d).toISOString(), minutes: m })
  const log = [at('2026-10-26T10:00:00', 25), at('2026-10-27T10:00:00', 50), at('2026-10-28T09:00:00', 25), at('2026-10-28T11:00:00', 25), at('2026-10-10T09:00:00', 90)]
  const s = focusStats(log, new Date('2026-10-28T15:00:00'))
  assert.equal(s.todayMinutes, 50)
  assert.equal(s.todaySessions, 2)
  assert.equal(s.weekMinutes, 125)
  assert.equal(s.streak, 3)
  // heute noch nichts: Serie zählt ab gestern
  assert.equal(focusStats(log, new Date('2026-10-29T08:00:00')).streak, 3)
})

import { weekReview } from '../src/shared/analysis.ts'
test('Wochenrückblick zählt nur diese Woche', () => {
  const now = new Date(2026, 9, 30, 16, 0) // Fr
  const base = { recurrence: 'none' as const, createdAt: '2026-10-01T00:00:00Z', source: 'local' as const, priority: 'medium' as const }
  const data = {
    version: 1 as const,
    tasks: [
      { ...base, id: 'a', title: 'A', status: 'done' as const, completedAt: new Date(2026, 9, 27, 10).toISOString() },
      { ...base, id: 'b', title: 'B', status: 'done' as const, completedAt: new Date(2026, 9, 20, 10).toISOString() },
      { ...base, id: 'c', title: 'C', status: 'open' as const, due: '2026-10-28' },
      { ...base, id: 'd', title: 'D', status: 'open' as const, due: '2026-11-03' }
    ],
    events: [{ id: 'e', title: 'Next', start: new Date(2026, 10, 2, 9).toISOString(), end: new Date(2026, 10, 2, 10).toISOString(), attendees: [], source: 'local' as const }],
    emails: [], notes: [], projects: [], docs: [], chat: [],
    focusLog: [{ id: 'f', start: new Date(2026, 9, 29, 9).toISOString(), end: new Date(2026, 9, 29, 9, 50).toISOString(), minutes: 50 }],
    sources: { demo: false, icsImports: [] }
  }
  const r = weekReview(data, now)
  assert.deepEqual(r.done.map((t) => t.id), ['a'])
  assert.equal(r.focusMinutes, 50)
  assert.equal(r.days[3].focus, 50)
  assert.deepEqual(r.overdue.map((t) => t.id), ['c'])
  assert.deepEqual(r.nextTasks.map((t) => t.id), ['d'])
  assert.equal(r.nextEvents.length, 1)
})
