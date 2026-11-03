import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCapture, existingFromThread } from '../src/shared/capture.ts'
import type { AppData, Email } from '../src/shared/types.ts'

const now = new Date('2026-11-03T10:00:00')
const mail = (body: string, subject = 'Projekttreffen', over: Partial<Email> = {}): Email =>
  ({
    id: 'm1',
    threadId: 't1',
    subject,
    from: { name: 'Lina Vogt', email: 'lina@example.org' },
    to: [],
    date: '2026-11-03T08:00:00',
    body,
    snippet: body.slice(0, 80),
    folder: 'inbox',
    unread: true,
    important: false,
    starred: false,
    source: 'demo',
    ...over
  }) as Email

test('Termin mit klarer Angabe: Datum und Uhrzeit aus der Mail', () => {
  const c = buildCapture([mail('Wir treffen uns am 5.11. um 14:30 Uhr im Raum Taunus.')], 'event', { now })
  assert.equal(c.capture.origin.when, 'mail')
  assert.equal(c.capture.origin.title, 'mail')
  assert.ok(c.preset.start?.startsWith('2026-11-05T'))
  assert.equal(c.capture.threadId, 't1')
  assert.equal(c.capture.from, 'Lina Vogt')
})

test('Termin ohne Angabe: Zeit fehlt und ist so gekennzeichnet', () => {
  const c = buildCapture([mail('Danke für die Unterlagen, ich melde mich.')], 'event', { now })
  assert.equal(c.capture.origin.when, 'missing')
  assert.equal(c.preset.start, undefined)
})

test('Termin mit unsicherer Angabe: „prüfen“ mit Begründung', () => {
  const c = buildCapture([mail('Wir treffen uns am Donnerstag, 5. November im Raum Taunus.')], 'event', { now })
  assert.equal(c.capture.origin.when, 'check')
  assert.ok(c.capture.reason && c.capture.reason.length > 0)
})

test('Aufgabe mit Frist: Fälligkeit aus der Mail, Bezug zur Mail gespeichert', () => {
  const c = buildCapture([mail('Bitte schick mir die Folien bis zum 6.11.', 'Folien')], 'task', { now })
  assert.equal(c.preset.due, '2026-11-06')
  assert.equal(c.capture.origin.due, 'mail')
  assert.deepEqual(c.preset.origin, { kind: 'email', refId: 't1', label: 'E-Mail von Lina Vogt' })
})

test('Aufgabe ohne Frist: Fälligkeit fehlt, Titel aus dem Betreff', () => {
  const c = buildCapture([mail('Hallo, magst du mal drüberschauen?', 'AW: Entwurf Startseite')], 'task', { now })
  assert.equal(c.capture.origin.due, 'missing')
  assert.equal(c.preset.title, 'Entwurf Startseite')
})

test('Notiz: Inhalt aus der Mail mit Herkunftsangabe', () => {
  const c = buildCapture([mail('Die WLAN-Zugangsdaten lauten: Netz „Gäste“, Passwort steht am Empfang.', 'Infos zum Büro')], 'note', { now })
  assert.equal(c.capture.origin.body, 'mail')
  assert.match(c.preset.body ?? '', /WLAN/)
  assert.match(c.preset.body ?? '', /E-Mail von Lina Vogt/)
})

test('Gesendete Antworten werden übersprungen: maßgeblich ist die letzte eingegangene Mail', () => {
  const c = buildCapture([mail('Treffen am 5.11. um 9 Uhr.'), mail('Passt mir!', 'Re: Projekttreffen', { id: 'm2', folder: 'sent', from: { name: 'Ich', email: 'me@x' } })], 'event', { now })
  assert.equal(c.capture.from, 'Lina Vogt')
  assert.equal(c.capture.origin.when, 'mail')
})

test('Doppelte vermeiden: bereits aus dieser Mail angelegte Elemente werden gefunden', () => {
  const data = {
    tasks: [{ id: 'a1', title: 'Folien schicken', origin: { kind: 'email', refId: 't1', label: '' } }],
    events: [{ id: 'e1', title: 'Projekttreffen', mailRef: 't1' }],
    notes: [{ id: 'n1', title: 'Andere', mailRef: 't9' }]
  } as unknown as AppData
  assert.deepEqual(existingFromThread(data, 't1', 'task'), { id: 'a1', title: 'Folien schicken' })
  assert.deepEqual(existingFromThread(data, 't1', 'event'), { id: 'e1', title: 'Projekttreffen' })
  assert.equal(existingFromThread(data, 't1', 'note'), undefined)
})
