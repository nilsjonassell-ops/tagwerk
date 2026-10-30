import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findAppointments, findTimes, parseQuickTask } from '../src/shared/parse-de.ts'

// Freitag, 30.10.2026, 13:00
const NOW = new Date(2026, 9, 30, 13, 0)
const P = [{ id: 'p1', name: 'Wohnung' }, { id: 'p2', name: 'Q4-Planung' }]

test('Schnelleingabe: Datum, Uhrzeit, Priorität, Projekt', () => {
  const a = parseQuickTask('Zahnarzt anrufen morgen 10 Uhr !hoch', P, NOW)
  assert.deepEqual(a, { title: 'Zahnarzt anrufen', due: '2026-10-31', time: '10:00', priority: 'high' })
  const b = parseQuickTask('Miete überweisen am Dienstag !! #wohn', P, NOW)
  assert.equal(b.title, 'Miete überweisen')
  assert.equal(b.due, '2026-11-03')
  assert.equal(b.priority, 'high')
  assert.equal(b.projectId, 'p1')
  const c = parseQuickTask('Bericht abgeben 12.11. um 14:30 !niedrig', P, NOW)
  assert.deepEqual([c.title, c.due, c.time, c.priority], ['Bericht abgeben', '2026-11-12', '14:30', 'low'])
  const d = parseQuickTask('Paket abholen 9 Uhr', P, NOW)
  assert.deepEqual([d.title, d.due, d.time], ['Paket abholen', '2026-10-31', '09:00'])
  const e = parseQuickTask('Steuer in 3 Tagen', P, NOW)
  assert.deepEqual([e.title, e.due], ['Steuer', '2026-11-02'])
  const f = parseQuickTask('Mama anrufen nächsten Freitag 18 Uhr', P, NOW)
  assert.deepEqual([f.title, f.due, f.time], ['Mama anrufen', '2026-11-06', '18:00'])
  const g = parseQuickTask('Geschenk kaufen 3. Dezember', P, NOW)
  assert.deepEqual([g.title, g.due], ['Geschenk kaufen', '2026-12-03'])
  assert.equal(parseQuickTask('Joggen täglich', P, NOW).recurrence, 'daily')
  assert.equal(parseQuickTask('3 Angebote vergleichen', P, NOW).title, '3 Angebote vergleichen')
})

test('Uhrzeiten und Spannen', () => {
  assert.deepEqual(findTimes('von 9 bis 11 Uhr')[0].value, { h: 9, m: 0, end: { h: 11, m: 0 } })
  assert.deepEqual(findTimes('14–15:30 Uhr')[0].value, { h: 14, m: 0, end: { h: 15, m: 30 } })
  assert.deepEqual(findTimes('um 3 Uhr nachmittags')[0].value, { h: 15, m: 0, end: undefined })
  assert.deepEqual(findTimes('um 14.30 Uhr')[0].value, { h: 14, m: 30, end: undefined })
  assert.equal(findTimes('am 30.10. sind es 3 Tage').length, 0)
})

test('Terminvorschläge aus Mails', () => {
  const sent = new Date(2026, 9, 30, 9, 0)
  const r = findAppointments('Hallo Nils,\n\npasst dir Dienstag um 14 Uhr für das Gespräch? Alternativ ginge Mittwoch 10:30.\n\nViele Grüße', sent, NOW)
  assert.equal(r.length, 2)
  assert.equal(new Date(r[0].start).getDate(), 3)
  assert.equal(new Date(r[0].start).getHours(), 14)
  assert.equal(new Date(r[0].end).getHours(), 15)
  assert.equal(new Date(r[1].start).getDate(), 4)
  assert.match(r[0].context, /Dienstag um 14 Uhr/)
  // Spanne + ausgeschriebenes Datum
  const s = findAppointments('Das Werkstudenten-Gespräch ist am 5. November von 14 bis 15:30 Uhr in Raum 2.', sent, NOW)
  assert.equal(new Date(s[0].end).getMinutes(), 30)
  // Zitate und vergangene Termine werden ignoriert
  assert.equal(findAppointments('Danke!\n\nAm Di., 27. Okt. 2026 um 12:00 schrieb Lina:\n> Treffen Montag 9 Uhr?', sent, NOW).length, 0)
  assert.equal(findAppointments('Das war gestern, heute um 8 Uhr.', sent, NOW).length, 0)
  // ohne Uhrzeit kein Vorschlag (meist eine Frist)
  assert.equal(findAppointments('Bitte bis Mittwoch zurückmelden.', sent, NOW).length, 0)
})
