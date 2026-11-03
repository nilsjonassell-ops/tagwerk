import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyCloudPatch, buildDoc, extractRecords, mergeRemote, trackChanges, type SyncBook } from '../src/shared/cloud.ts'
import { DEFAULT_SETTINGS, type AppData, type Settings, type Task } from '../src/shared/types.ts'

const empty = (): AppData => ({ version: 1, tasks: [], events: [], emails: [], notes: [], projects: [], docs: [], chat: [], sources: { demo: false, icsImports: [] } })
const task = (id: string, title: string): Task => ({ id, title, priority: 'medium', status: 'open', recurrence: 'none', createdAt: '2026-11-01T10:00:00Z', source: 'local' }) as Task

/** Ein simulierter PC: eigene Daten, eigenes Abgleichsbuch */
function device(id: string, data = empty(), settings: Settings = DEFAULT_SETTINGS) {
  return { id, data, settings, book: { snap: {}, meta: {} } as SyncBook }
}
type Dev = ReturnType<typeof device>

/** Ein Abgleich wie in main/cloud.ts: lokale Änderungen erfassen, fremde Stände einarbeiten, eigenen Stand liefern */
function sync(dev: Dev, others: Dev[], now: number) {
  trackChanges(dev.book, extractRecords(dev.data, dev.settings), now, DEFAULT_SETTINGS)
  const docs = others.map((o) => buildDoc(o.book, extractRecords(o.data, o.settings), o.id, o.id, now))
  const r = mergeRemote(dev.book, docs)
  dev.data = applyCloudPatch(dev.data, r.patch)
  if (r.settings) dev.settings = { ...dev.settings, ...r.settings }
  return r
}

test('Neuer PC bekommt alle Daten, Demo-Daten und Kontodaten bleiben lokal', () => {
  const a = device('A')
  a.data.tasks = [task('t-1', 'Zahnarzt anrufen'), task('demo-t-1', 'Demo')]
  a.data.emails = [{ id: 'm-1', threadId: 'th', from: { name: 'X', email: 'x@y.de' }, to: [], subject: 'S', date: 'x', body: 'b', read: true, important: false, needsReply: false, replied: false, folder: 'inbox', source: 'google' }]
  a.data.notes = [{ id: 'n-1', title: 'Klausur', body: 'Kapitel 1–4', kind: 'note', createdAt: 'x', updatedAt: 'x' }]
  a.data.events = [
    { id: 'e-1', title: 'Lernen', start: '2026-11-04T09:00:00Z', end: '2026-11-04T10:00:00Z', attendees: [], source: 'local' },
    { id: 'o-1', title: 'Outlook', start: '2026-11-04T09:00:00Z', end: '2026-11-04T10:00:00Z', attendees: [], source: 'outlook' }
  ]
  a.settings = { ...DEFAULT_SETTINGS, theme: 'dark', launchAtLogin: false }
  trackChanges(a.book, extractRecords(a.data, a.settings), 1000, DEFAULT_SETTINGS)

  const b = device('B', empty(), { ...DEFAULT_SETTINGS, launchAtLogin: true })
  sync(b, [a], 2000)
  assert.deepEqual(b.data.tasks.map((t) => t.id), ['t-1'])
  assert.equal(b.data.emails.length, 0, 'Mails kommen aus dem Konto, nicht aus der Cloud')
  assert.equal(b.data.notes[0].body, 'Kapitel 1–4')
  assert.deepEqual(b.data.events.map((e) => e.id), ['e-1'])
  assert.equal(b.settings.theme, 'dark')
  assert.equal(b.settings.launchAtLogin, true, 'Autostart ist gerätespezifisch')
})

test('Änderung und Löschung wandern hin und her, ohne zurückzuspringen', () => {
  const a = device('A')
  a.data.tasks = [task('t-1', 'Alt'), task('t-2', 'Bleibt')]
  const b = device('B')
  sync(a, [b], 1000)
  sync(b, [a], 1100)
  assert.equal(b.data.tasks.length, 2)

  // B ändert t-1 und löscht t-2
  b.data.tasks = [{ ...b.data.tasks.find((t) => t.id === 't-1')!, title: 'Neu' }]
  sync(b, [a], 2000)
  const r = sync(a, [b], 2100)
  assert.ok(r.changed)
  assert.deepEqual(a.data.tasks.map((t) => [t.id, t.title]), [['t-1', 'Neu']])

  // Weitere Runden ändern nichts mehr (kein Hin- und Herspringen)
  assert.equal(sync(a, [b], 3000).changed, false)
  assert.equal(sync(b, [a], 3100).changed, false)
  assert.deepEqual(b.data.tasks.map((t) => t.title), ['Neu'])
})

test('Gleichzeitige Änderungen: jüngere gewinnt je Eintrag, beide Neuanlagen bleiben', () => {
  const a = device('A')
  a.data.tasks = [task('t-1', 'Start')]
  const b = device('B')
  sync(a, [b], 1000)
  sync(b, [a], 1100)

  a.data.tasks = [{ ...a.data.tasks[0], title: 'A-Version' }, task('t-a', 'nur A')]
  b.data.tasks = [{ ...b.data.tasks[0], title: 'B-Version' }, task('t-b', 'nur B')]
  trackChanges(a.book, extractRecords(a.data, a.settings), 2000)
  trackChanges(b.book, extractRecords(b.data, b.settings), 2500) // B später
  sync(a, [b], 3000)
  sync(b, [a], 3100)
  const titles = (d: Dev) => Object.fromEntries(d.data.tasks.map((t) => [t.id, t.title]))
  assert.deepEqual(titles(a), { 't-1': 'B-Version', 't-a': 'nur A', 't-b': 'nur B' })
  assert.deepEqual(titles(b), titles(a))
})

test('„Antwort offen“-Markierungen werden abgeglichen', () => {
  const a = device('A')
  a.data.replyMarks = { 'thr-1': { on: true, msgId: 'm1' } }
  const b = device('B')
  sync(a, [b], 900)
  sync(b, [a], 1000)
  assert.deepEqual(b.data.replyMarks, { 'thr-1': { on: true, msgId: 'm1' } })
  delete a.data.replyMarks!['thr-1']
  sync(a, [b], 2000)
  sync(b, [a], 2100)
  assert.deepEqual(b.data.replyMarks, {})
})

test('Patch lässt unbeteiligte Einträge und Reihenfolge in Ruhe', () => {
  const d = empty()
  d.tasks = [task('t-1', 'a'), task('t-2', 'b'), task('t-3', 'c')]
  const next = applyCloudPatch(d, { upsert: { tasks: [{ ...task('t-2', 'B!') }, task('t-4', 'neu')] }, remove: { tasks: ['t-3'] } })
  assert.deepEqual(next.tasks.map((t) => t.id + ':' + t.title), ['t-4:neu', 't-1:a', 't-2:B!'])
  assert.equal(next.notes, d.notes)
})

test('Beschädigte oder fremde Einträge aus der Cloud werden verworfen', () => {
  const b = device('B')
  const bad = {
    v: 1 as const,
    id: 'X',
    name: 'X',
    at: '',
    recs: {
      tasks: { 't-ok': { t: 5, v: task('t-ok', 'gut') }, 't-bad': { t: 5, v: { id: 't-bad' } }, 't-wrongid': { t: 5, v: task('t-other', 'x') }, 't-future': { t: Date.now() + 365 * 86400_000, v: task('t-future', 'zukunft') } },
      events: { 'e-bad': { t: 5, v: { id: 'e-bad', title: 'x', start: 'kein Datum', end: 'x' } } },
      settings: { theme: { t: 5, v: 42 }, userName: { t: 5, v: 'Nils' } }
    }
  }
  const r = mergeRemote(b.book, [bad], DEFAULT_SETTINGS)
  assert.deepEqual((r.patch.upsert.tasks ?? []).map((t) => t.id), ['t-ok'])
  assert.equal(r.patch.upsert.events, undefined)
  assert.deepEqual(r.settings, { userName: 'Nils' }, 'theme: 42 hat den falschen Typ')
})

test('Wieder verbundener PC überschreibt keine neueren Änderungen der anderen PCs', () => {
  const a = device('A')
  a.data.tasks = [task('t-1', 'Alt')]
  const b = device('B')
  sync(a, [b], 1000)
  sync(b, [a], 1100)
  // B ändert später den Titel
  b.data.tasks = [{ ...b.data.tasks[0], title: 'Neu von B' }]
  sync(b, [a], 5000)
  // A war getrennt (Abgleichsbuch zurückgesetzt) und verbindet sich mit altem Stand neu
  a.book = { snap: {}, meta: {} }
  trackChanges(a.book, extractRecords(a.data, a.settings), 9000, DEFAULT_SETTINGS, true)
  const docs = [buildDoc(b.book, extractRecords(b.data, b.settings), 'B', 'B', 9000)]
  a.data = applyCloudPatch(a.data, mergeRemote(a.book, docs).patch)
  assert.equal(a.data.tasks[0].title, 'Neu von B')
})
