import { test } from 'node:test'
import assert from 'node:assert/strict'
import { providerRows, type ProviderInput } from '../src/shared/providers.ts'

const none: ProviderInput = {
  google: { connected: false, expired: false, caps: { calendarRead: false, calendarWrite: false, gmailRead: false, gmailWrite: false } },
  googleSync: { syncing: false, errors: {} },
  ms: { connected: false, expired: false, caps: { notes: false, mail: false, calendar: false, sync: false } },
  outlookSync: { syncing: false },
  icloud: { connected: false, calendars: [] },
  icloudSync: { syncing: false },
  cloud: { available: false, enabled: true, syncing: false }
}
const row = (rows: ReturnType<typeof providerRows>, id: string) => rows.find((r) => r.id === id)!

test('Gruppen: E-Mail, Kalender, Notizen & Sicherung – nur tatsächlich unterstützte Anbieter', () => {
  const rows = providerRows(none)
  assert.deepEqual([...new Set(rows.map((r) => r.group))], ['mail', 'calendar', 'notes'])
  assert.deepEqual(rows.filter((r) => r.group === 'mail').map((r) => r.id), ['gmail', 'outlook-mail', 'icloud-mail'])
  assert.deepEqual(rows.filter((r) => r.group === 'calendar').map((r) => r.id), ['google-calendar', 'outlook-calendar', 'apple-calendar', 'ics'])
  assert.deepEqual(rows.filter((r) => r.group === 'notes').map((r) => r.id), ['onenote', 'cloud'])
})

test('Nichts verbunden: „Nicht verbunden“ mit Aktion „Verbinden“; iCloud-Mail ist nicht unterstützt', () => {
  const rows = providerRows(none)
  assert.equal(row(rows, 'gmail').state, 'disconnected')
  assert.equal(row(rows, 'gmail').action, 'connect')
  assert.equal(row(rows, 'icloud-mail').state, 'unsupported')
  assert.equal(row(rows, 'icloud-mail').action, null)
  assert.equal(row(rows, 'ics').state, 'available')
  assert.equal(row(rows, 'ics').action, 'import')
})

test('Verbunden mit Adresse; Kalender nicht freigegeben ist kein „verbunden“', () => {
  const rows = providerRows({ ...none, google: { connected: true, expired: false, email: 'nils@example.org', caps: { calendarRead: false, calendarWrite: false, gmailRead: true, gmailWrite: true } } })
  assert.equal(row(rows, 'gmail').state, 'connected')
  assert.match(row(rows, 'gmail').detail, /nils@example\.org/)
  assert.equal(row(rows, 'gmail').action, 'manage')
  assert.equal(row(rows, 'google-calendar').state, 'disconnected')
  assert.match(row(rows, 'google-calendar').detail, /nicht freigegeben/)
})

test('Abgelaufen → „Neu anmelden“, Fehler beim Abgleich → Fehler, Abgleich läuft → lädt', () => {
  assert.equal(row(providerRows({ ...none, ms: { ...none.ms, expired: true } }), 'outlook-mail').state, 'expired')
  assert.equal(row(providerRows({ ...none, ms: { ...none.ms, expired: true } }), 'outlook-mail').action, 'reconnect')
  const g = { connected: true, expired: false, email: 'a@b.c', caps: { calendarRead: true, calendarWrite: true, gmailRead: true, gmailWrite: true } }
  assert.equal(row(providerRows({ ...none, google: g, googleSync: { syncing: false, errors: { gmail: 'Zeitüberschreitung' } } }), 'gmail').state, 'error')
  assert.equal(row(providerRows({ ...none, google: g, googleSync: { syncing: true, errors: {} } }), 'google-calendar').state, 'syncing')
  const ic = { connected: true, appleId: 'x@icloud.com', calendars: [{ id: 'c', name: 'Privat', enabled: true }] }
  assert.equal(row(providerRows({ ...none, icloud: ic, icloudSync: { syncing: false, error: 'Passwort falsch' } }), 'apple-calendar').state, 'error')
})

test('Cloud-Speicher: nur mit Microsoft möglich, sonst Hinweis', () => {
  assert.equal(row(providerRows(none), 'cloud').state, 'disconnected')
  assert.match(row(providerRows(none), 'cloud').detail, /Microsoft/)
  const on = providerRows({ ...none, ms: { connected: true, expired: false, email: 'n@outlook.de', caps: { notes: true, mail: true, calendar: true, sync: true } }, cloud: { available: true, enabled: true, syncing: false } })
  assert.equal(row(on, 'cloud').state, 'connected')
  assert.equal(row(on, 'onenote').state, 'connected')
})

test('Zustände sind nie nur Farbe: jeder hat einen Text', () => {
  for (const r of providerRows(none)) assert.ok(r.stateLabel.length > 0, r.id)
})
