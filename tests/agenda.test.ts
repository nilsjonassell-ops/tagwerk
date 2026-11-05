import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutDay } from '../src/shared/agenda.ts'
import type { CalEvent } from '../src/shared/types.ts'

const D = (h: number, m = 0) => new Date(2026, 10, 5, h, m).toISOString()
const ev = (id: string, s: [number, number?], e: [number, number?], over: Partial<CalEvent> = {}): CalEvent => ({ id, title: id, start: D(...s), end: D(...e), attendees: [], source: 'local', ...over })
const day = new Date(2026, 10, 5)

test('Zeitraum: Arbeitszeit mit einer Stunde Luft, erweitert um frühe/späte Termine', () => {
  const a = layoutDay([ev('a', [10], [11])], day, { start: 8, end: 18 })
  assert.deepEqual([a.startH, a.endH], [7, 19])
  const b = layoutDay([ev('früh', [6, 30], [7]), ev('spät', [21], [22, 30])], day, { start: 8, end: 18 })
  assert.deepEqual([b.startH, b.endH], [6, 23])
})

test('Position in Minuten ab Beginn, Mindesthöhe für kurze Termine', () => {
  const r = layoutDay([ev('a', [9, 30], [10, 15]), ev('kurz', [12], [12, 5])], day, { start: 8, end: 18 })
  const a = r.items.find((i) => i.event.id === 'a')!
  assert.equal(a.top, 150) // 7:00 → 9:30
  assert.equal(a.height, 45)
  const k = r.items.find((i) => i.event.id === 'kurz')!
  assert.equal(k.height, 20, 'mindestens 20 Minuten hoch, damit lesbar')
})

test('Überschneidungen stehen nebeneinander, unabhängige Termine nutzen die volle Breite', () => {
  const r = layoutDay([ev('a', [10], [11]), ev('b', [10, 30], [11, 30]), ev('c', [11], [12]), ev('d', [14], [15])], day, { start: 8, end: 18 })
  const by = Object.fromEntries(r.items.map((i) => [i.event.id, i]))
  assert.deepEqual([by.a.col, by.a.cols], [0, 2])
  assert.deepEqual([by.b.col, by.b.cols], [1, 2])
  assert.deepEqual([by.c.col, by.c.cols], [0, 2], 'c beginnt, wenn a endet → Spalte 0 wieder frei')
  assert.deepEqual([by.d.col, by.d.cols], [0, 1])
})

test('Ganztägige Termine getrennt, Termine anderer Tage ignoriert', () => {
  const r = layoutDay([ev('ganz', [0], [23, 59], { allDay: true }), ev('morgen', [10], [11], { start: new Date(2026, 10, 6, 10).toISOString(), end: new Date(2026, 10, 6, 11).toISOString() }), ev('a', [10], [11])], day, { start: 8, end: 18 })
  assert.deepEqual(r.allDay.map((e) => e.id), ['ganz'])
  assert.deepEqual(r.items.map((i) => i.event.id), ['a'])
})

test('Termin über Mitternacht wird am Tagesrand abgeschnitten', () => {
  const r = layoutDay([ev('nacht', [22], [23], { end: new Date(2026, 10, 6, 2).toISOString() })], day, { start: 8, end: 18 })
  const n = r.items[0]
  assert.equal(r.endH, 24)
  assert.equal(n.top + n.height, (24 - r.startH) * 60)
})

test('Sehr kurzer Termin (optisch 20 Min.) überdeckt den direkt folgenden nicht', () => {
  const r = layoutDay([ev('kurz', [12], [12, 5]), ev('danach', [12, 10], [12, 40])], day, { start: 8, end: 18 })
  const by = Object.fromEntries(r.items.map((i) => [i.event.id, i]))
  assert.deepEqual([by.kurz.cols, by.danach.col], [2, 1])
})
