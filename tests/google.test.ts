import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asksForReply, buildReplyMime, decodeB64Url, encodeB64Url, htmlToText, mapGoogleEvent, mapGoogleThread, parseAddressList, stripQuoted, toGoogleEvent } from '../src/main/google-map.ts'

const b64 = (s: string) => encodeB64Url(Buffer.from(s, 'utf8'))

test('Adresslisten mit Anführungszeichen und Kommas', () => {
  assert.deepEqual(parseAddressList('"Weber, Anna" <anna@x.de>, Max <max@y.de>, z@z.de'), [
    { name: 'Weber, Anna', email: 'anna@x.de' },
    { name: 'Max', email: 'max@y.de' },
    { name: 'z', email: 'z@z.de' }
  ])
})

test('Google-Event: zeitgebunden, ganztägig, fremd organisiert, abgesagt', () => {
  const t = mapGoogleEvent({ id: 'a', summary: 'Call', start: { dateTime: '2026-10-29T10:00:00+01:00' }, end: { dateTime: '2026-10-29T11:00:00+01:00' }, attendees: [{ email: 'me@x.de', self: true }, { email: 'b@x.de', displayName: 'Bea' }, { email: 'c@x.de', responseStatus: 'declined' }] }, true)!
  assert.equal(t.start, '2026-10-29T09:00:00.000Z')
  assert.deepEqual(t.attendees, [{ name: 'Bea', email: 'b@x.de' }])
  assert.equal(t.readOnly, undefined)
  const f = mapGoogleEvent({ id: 'b', start: { dateTime: '2026-10-29T10:00:00Z' }, end: { dateTime: '2026-10-29T11:00:00Z' }, organizer: { email: 'boss@x.de', displayName: 'Chefin' } }, true)!
  assert.equal(f.readOnly, true)
  assert.equal(f.organizer?.name, 'Chefin')
  assert.equal(f.title, '(Ohne Titel)')
  const ad = mapGoogleEvent({ id: 'c', summary: 'Urlaub', start: { date: '2026-11-05' }, end: { date: '2026-11-06' } }, false)!
  assert.ok(ad.allDay && ad.readOnly)
  assert.equal(new Date(ad.start).getDate(), 5)
  assert.equal(mapGoogleEvent({ id: 'd', status: 'cancelled', start: { date: '2026-11-05' }, end: { date: '2026-11-06' } }, true), null)
})

test('Tagwerk → Google: ganztägig mit exklusivem Ende, Teilnehmende nur auf Wunsch', () => {
  const ev = { id: 'x', title: 'Frei', start: new Date(2026, 10, 5).toISOString(), end: new Date(2026, 10, 5, 23, 59).toISOString(), allDay: true, attendees: [{ name: 'A', email: 'a@x.de' }], source: 'google' as const }
  const g = toGoogleEvent(ev, { includeAttendees: false })
  assert.deepEqual(g.start, { date: '2026-11-05' })
  assert.deepEqual(g.end, { date: '2026-11-06' })
  assert.equal(g.attendees, undefined)
  assert.deepEqual(toGoogleEvent(ev, { includeAttendees: true }).attendees, [{ email: 'a@x.de', displayName: 'A' }])
})

test('HTML zu Text und Zitat-Entfernung', () => {
  assert.equal(htmlToText('<p>Hallo&nbsp;Nils,</p><p>Gr&uuml;&szlig;e<br>Anna</p><style>x{}</style>'), 'Hallo Nils,\nGrüße\nAnna')
  assert.equal(stripQuoted('Passt!\n\nAm Mi., 28. Okt. 2026 um 08:02 schrieb Tobias Brandt <t@b.de>:\n> alte Mail'), 'Passt!')
  assert.equal(stripQuoted('Ok\n\nOn Wed, Oct 28, 2026 at 8:02 AM Tobias\n<t@b.de> wrote:\n> old'), 'Ok')
})

test('Gmail-Thread: Ordner, Antwortbedarf, Newsletter, eigene Antwort', () => {
  const me = 'nils@gmail.com'
  const msg = (id: string, from: string, labels: string[], date: number, extra: { name: string; value: string }[] = [], body = 'Hallo') => ({
    id, threadId: 't1', labelIds: labels, internalDate: String(date),
    payload: { mimeType: 'multipart/alternative', headers: [{ name: 'From', value: from }, { name: 'To', value: `Nils <${me}>` }, { name: 'Subject', value: 'Angebot' }, { name: 'Message-ID', value: `<${id}@mail>` }, ...extra],
      parts: [{ mimeType: 'text/plain', body: { data: b64(body) } }, { mimeType: 'text/html', body: { data: b64('<b>x</b>') } }] }
  })
  const t = mapGoogleThread({ id: 't1', messages: [
    msg('m2', `Nils <${me}>`, ['SENT'], 2000),
    msg('m1', 'Anna <anna@firma.de>', ['INBOX', 'IMPORTANT'], 1000),
    msg('m3', 'Anna <anna@firma.de>', ['INBOX', 'UNREAD'], 3000, [], 'Und noch was?')
  ] }, me)
  assert.deepEqual(t.map((m) => m.remoteId), ['m1', 'm2', 'm3'])
  assert.equal(t[0].replied, true)
  assert.equal(t[1].folder, 'sent')
  assert.equal(t[1].from.name, 'Ich')
  assert.equal(t[2].needsReply, true)
  assert.equal(t[2].read, false)
  assert.equal(t[2].body, 'Und noch was?')
  assert.equal(t[0].important, true)
  assert.equal(t[2].rfcMessageId, '<m3@mail>')
  const news = mapGoogleThread({ id: 't2', messages: [msg('n', 'Shop <newsletter@shop.de>', ['INBOX', 'IMPORTANT'], 1, [{ name: 'List-Unsubscribe', value: '<x>' }])] }, me)
  assert.equal(news[0].needsReply, false)
  assert.equal(news[0].important, false)
})

test('Antwort-MIME: UTF-8, Verkettung, base64-Body', () => {
  const raw = buildReplyMime({ from: 'nils@gmail.com', to: [{ name: 'Jürgen Groß', email: 'j@x.de' }], subject: 'Angebot für Möbel', body: 'Hallo Jürgen,\npasst.', inReplyTo: '<m3@mail>', references: '<m1@mail>' })
  assert.match(raw, /^From: nils@gmail.com\r\n/)
  assert.match(raw, /To: =\?UTF-8\?B\?[^?]+\?= <j@x\.de>/)
  assert.match(raw, /Subject: =\?UTF-8\?B\?/)
  assert.match(raw, /In-Reply-To: <m3@mail>\r\nReferences: <m1@mail> <m3@mail>/)
  const subj = raw.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)![1]
  assert.equal(Buffer.from(subj, 'base64').toString('utf8'), 'Re: Angebot für Möbel')
  const body = raw.split('\r\n\r\n')[1].replace(/\r\n/g, '')
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), 'Hallo Jürgen,\r\npasst.')
  assert.equal(decodeB64Url(encodeB64Url('äöü?>~')), 'äöü?>~')
})

test('Antwortbedarf: nur bei Frage oder Bitte', () => {
  assert.equal(asksForReply('Hab dich ins GitHub-Repo eingeladen.'), false)
  assert.equal(asksForReply('Bitte bestätigen Sie den Termin kurz.'), true)
  assert.equal(asksForReply('Hast du morgen Zeit?'), true)
  assert.equal(asksForReply('Could you send the slides'), true)
})
