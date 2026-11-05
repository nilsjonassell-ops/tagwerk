import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBrief,
  eventsOnDay,
  extractTaskCandidates,
  findConflicts,
  freeBlocks,
  groupThreads,
  nextDue,
  search,
  applyRetention,
  ymd
} from '../src/shared/analysis.ts'
import { createDemoData, removeDemo } from '../src/shared/demo.ts'

const now = new Date(2026, 9, 28, 8, 30) // Mi, 28.10.2026 08:30
const data = createDemoData(now)
const opts = { workHours: { start: 8, end: 18 }, bufferMinutes: 10, focusMinMinutes: 60 }

test('Demo-Tag enthält eine Überschneidung und einen knappen Übergang', () => {
  const today = eventsOnDay(data.events, now)
  const c = findConflicts(today, 10)
  assert.ok(c.some((x) => x.kind === 'overlap' && x.a.title === 'Q4-Budgetrunde' && x.b.title === '1:1 mit Lea'))
  assert.ok(c.some((x) => x.kind === 'tight' && x.b.title === 'Kundentermin Brandt & Partner' && x.gapMinutes === 0))
})

test('Online-Termine hintereinander sind kein knapper Übergang', () => {
  const ev = (id: string, s: number, e: number, loc: string) => ({
    id, title: id, attendees: [], source: 'local' as const, location: loc,
    start: new Date(2026, 0, 5, s).toISOString(), end: new Date(2026, 0, 5, e).toISOString()
  })
  assert.equal(findConflicts([ev('a', 9, 10, 'Teams'), ev('b', 10, 11, 'Online (Zoom)')], 10).length, 0)
})

test('Freie Blöcke berücksichtigen Termine und Mindestdauer', () => {
  const today = eventsOnDay(data.events, now)
  const blocks = freeBlocks(today, now, opts.workHours, 60)
  const last = blocks[blocks.length - 1]
  assert.equal(last.start.getHours(), 15)
  assert.equal(last.start.getMinutes(), 45)
  assert.equal(last.end.getHours(), 18)
  assert.ok(blocks.every((b) => b.minutes >= 60))
})

test('Wiederholungen: werktags überspringt Wochenende, monatlich klemmt Monatsende', () => {
  assert.equal(nextDue('2026-10-30', 'weekdays'), '2026-11-02')
  assert.equal(nextDue('2026-01-31', 'monthly'), '2026-02-28')
  assert.equal(nextDue('2026-10-28', 'weekly'), '2026-11-04')
  assert.equal(nextDue('2026-10-28', 'none'), undefined)
})

test('Threads: Antwortbedarf und Betreff ohne Präfix', () => {
  const th = groupThreads(data.emails).find((t) => t.subject === 'Relaunch: Freigabe der Startseite')!
  assert.equal(th.messages.length, 5)
  assert.ok(th.needsReply && th.important && th.unread)
})

test('Briefing nennt Überschneidung, überfällige Aufgaben und wartende Mail', () => {
  const brief = buildBrief(data, now, opts)
  const text = brief.map((b) => b.text).join('\n')
  assert.match(text, /überschneidet sich/)
  assert.match(text, /überfällig/)
  assert.match(text, /warten auf eine Antwort|wartet auf deine Antwort/)
  assert.equal(brief[0].tone, 'alert')
})

test('Aufgaben-Kandidaten aus Meetingnotiz', () => {
  const c = extractTaskCandidates({
    body: 'Intro\n\nNächste Schritte:\n- Mobile-Menü vereinfachen\n- [ ] Suchfeld testen\n\nSonstiges:\n- kein Task\nTODO: Angebot einholen',
    nextSteps: '- Rechnung prüfen'
  })
  assert.deepEqual(c, ['Mobile-Menü vereinfachen', 'Suchfeld testen', 'Angebot einholen', 'Rechnung prüfen'])
})

test('Suche findet Personen, Projekte und Mails', () => {
  const hits = search(data, 'brandt')
  assert.ok(hits.some((h) => h.kind === 'event'))
  assert.ok(hits.some((h) => h.kind === 'email'))
})

test('Demo entfernen behält eigene Einträge', () => {
  const own = { ...data, tasks: [...data.tasks, { id: 'x', title: 'Eigen', priority: 'low' as const, status: 'open' as const, recurrence: 'none' as const, createdAt: now.toISOString(), source: 'local' as const, projectId: 'demo-p-q4' }] }
  const r = removeDemo(own)
  assert.equal(r.tasks.length, 1)
  assert.equal(r.tasks[0].projectId, undefined)
  assert.equal(r.events.length, 0)
  assert.equal(r.sources.demo, false)
})

test('Aufbewahrung löscht alte archivierte Aufgaben', () => {
  const r = applyRetention(data, new Date(2027, 9, 1), 180, 30)
  assert.ok(!r.tasks.some((t) => t.archived))
  assert.equal(ymd(now), '2026-10-28')
})

test('Das Wichtigste: viele Überschneidungen werden zu einem Hinweis, lange Titel gekürzt', () => {
  const base = { version: 1 as const, tasks: [], emails: [], notes: [], projects: [], docs: [], chat: [], sources: { demo: false, icsImports: [] } }
  const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m).toISOString()
  const long = 'Sehr langer Termintitel mit vielen Wörtern für die Abstimmung zum Quartalsabschluss'
  const events = [0, 1, 2, 3].map((i) => ({ id: `e${i}`, title: `${long} ${i}`, start: at(13, i * 10), end: at(14, 30), attendees: [], source: 'local' as const }))
  const many = buildBrief({ ...base, events }, now, opts)
  const overlaps = many.filter((b) => /überschneid/i.test(b.text))
  assert.equal(overlaps.length, 1, 'ein Sammelhinweis statt einer Zeile je Paar')
  assert.match(overlaps[0].text, /4 Termine überschneiden sich/)
  assert.match(overlaps[0].text, /13:00/)
  // Ein einzelnes Paar bleibt konkret, Titel gekürzt
  const two = buildBrief({ ...base, events: events.slice(0, 2) }, now, opts)
  const one = two.find((b) => /überschneidet/.test(b.text))!
  assert.ok(one.text.length < 140, `kurz genug (${one.text.length})`)
  assert.match(one.text, /…/)
})

test('Termine direkt hintereinander: verständlicher Text statt „Nur 0 Min.“', () => {
  const base = { version: 1 as const, tasks: [], emails: [], notes: [], projects: [], docs: [], chat: [], sources: { demo: false, icsImports: [] } }
  const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m).toISOString()
  const events = [
    { id: 'a', title: 'Review', start: at(10), end: at(11), location: 'Büro', attendees: [], source: 'local' as const },
    { id: 'b', title: 'Kunde', start: at(11), end: at(12), location: 'Kunde vor Ort', attendees: [], source: 'local' as const }
  ]
  const t = buildBrief({ ...base, events }, now, opts).find((b) => /Kunde/.test(b.text))!
  assert.doesNotMatch(t.text, /0 Min/)
  assert.match(t.text, /direkt hintereinander/i)
})
