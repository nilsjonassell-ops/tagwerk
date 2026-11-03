import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectMailSuggestions, findDuplicate, suggestionBucket } from '../src/shared/mail-insights.ts'
import type { Email } from '../src/shared/types.ts'

// Dienstag, 3. November 2026, 10:00
const NOW = new Date(2026, 10, 3, 10, 0)
const mail = (subject: string, body: string, extra: Partial<Email> = {}): Email => ({
  id: 'm1',
  threadId: 'th1',
  from: { name: 'Frau Becker', email: 'becker@hv.de' },
  to: [],
  subject,
  date: new Date(2026, 10, 3, 8, 0).toISOString(),
  body,
  read: false,
  important: false,
  needsReply: false,
  replied: false,
  folder: 'inbox',
  source: 'google',
  ...extra
})
const run = (subject: string, body: string, extra?: Partial<Email>) => detectMailSuggestions(mail(subject, body, extra), { now: NOW })

test('Termin mit festem Datum ist sicher, relativer Wochentag wird markiert', () => {
  const a = run('Wohnungsübergabe', 'Guten Tag Herr Sell,\n\ndie Übergabe findet am 12.11. um 17 Uhr statt.\n\nViele Grüße')
  assert.equal(a.length, 1)
  assert.equal(a[0].kind, 'event')
  assert.equal(new Date(a[0].start!).getDate(), 12)
  assert.equal(new Date(a[0].start!).getHours(), 17)
  assert.equal(a[0].uncertain, false)
  assert.equal(a[0].title, 'Wohnungsübergabe')

  const b = run('Re: Übergabe', 'Passt Ihnen nächsten Donnerstag um 17 Uhr?')
  assert.equal(b[0].kind, 'event')
  assert.equal(b[0].uncertain, true)
  assert.match(b[0].reason!, /„nächsten Donnerstag“ → Do\., 5\.11\./)
  assert.equal(b[0].title, 'Übergabe', 'Re: wird entfernt')
})

test('Frist: „bis spätestens Mittwoch“ wird zur Aufgabe mit Fälligkeit', () => {
  const a = run('Budget Q4', 'Hallo,\n\nfür die Budgetrunde brauche ich euren Entwurf für Q4 bis spätestens Mittwoch. Bitte die Positionen getrennt aufführen.\n\nDanke!\nPetra')
  const d = a.find((x) => x.kind === 'deadline')!
  assert.ok(d, 'Frist erkannt')
  assert.equal(d.due, '2026-11-04')
  assert.equal(d.uncertain, true)
  assert.ok(!a.some((x) => x.kind === 'event'), 'kein Termin daraus')
})

test('Frist mit Datum im Betreff und „Monatsende“', () => {
  const a = run('Abgabe Hausarbeit bis 30.11.2026', 'Bitte denken Sie an die Abgabe.')
  assert.equal(a.find((x) => x.kind === 'deadline')?.due, '2026-11-30')
  assert.equal(a.find((x) => x.kind === 'deadline')?.uncertain, false)
  const b = run('Nebenkostenabrechnung', 'Eine eventuelle Nachzahlung ist bis zum Monatsende fällig.')
  assert.equal(b.find((x) => x.kind === 'deadline')?.due, '2026-11-30')
})

test('Bitte-Satz wird zur Aufgabe, Plaudern nicht', () => {
  const a = run('Willkommen im Team!', 'Hallo,\n\nich habe noch keinen Zugang zu Figma. Könntest du das freischalten lassen?\n\nViele Grüße\nMira')
  const t = a.find((x) => x.kind === 'task')!
  assert.ok(t)
  assert.match(t.title, /Willkommen im Team!: das freischalten lassen/)
  assert.equal(run('Samstag?', 'Hey! Hast du Samstag Lust auf eine Runde am Main? Sag Bescheid :)').filter((x) => x.kind === 'task').length, 0)
})

test('Ganztägiger Termin nur mit Stichwort, ohne Uhrzeit = unsicher', () => {
  const a = run('Prüfungsplan', 'Die Klausur in Mathe ist am 15.12.2026.')
  assert.equal(a[0].kind, 'event')
  assert.equal(a[0].allDay, true)
  assert.equal(a[0].uncertain, true)
  assert.match(a[0].reason!, /Keine Uhrzeit/)
})

test('Vergangenes wird nicht vorgeschlagen, Signatur und Zitate ignoriert', () => {
  assert.equal(run('Rückblick', 'Das Treffen war am 1.11. um 10 Uhr.').length, 0)
  const a = run('Re: Termin', 'Danke, passt!\n\nViele Grüße\nAnna\n\nAm 2.11. schrieb Nils:\n> Wie wäre der 20.11. um 9 Uhr?')
  assert.equal(a.length, 0)
})

test('Infos für eine Notiz: Buchungsnummer, Raum, Meeting-Link, Betrag', () => {
  const a = run(
    'Ihre Buchung',
    'Vielen Dank für Ihre Reservierung.\nBuchungsnummer: AB-4711X\nRaum: B 2.14\nZum Meeting: https://teams.microsoft.com/l/meetup-join/abc).\nRechnungsbetrag: 49,90 €'
  )
  const n = a.find((x) => x.kind === 'note')!
  assert.ok(n)
  assert.match(n.noteBody!, /Buchungsnummer: AB-4711X/)
  assert.match(n.noteBody!, /Raum: B 2\.14/)
  assert.match(n.noteBody!, /Link: https:\/\/teams\.microsoft\.com\/l\/meetup-join\/abc$/m)
  assert.match(n.noteBody!, /Rechnungsbetrag: 49,90 €/)
})

test('Anhang wird durchgereicht, gesendete Mails ignoriert', () => {
  assert.equal(run('Vertrag', 'Bitte unterschreiben Sie den Vertrag und schicken ihn zurück.', { hasAttachments: true })[0].hasAttachments, true)
  assert.equal(run('X', 'Treffen am 12.11. um 9 Uhr', { folder: 'sent' }).length, 0)
})

test('Einsortieren und Dubletten', () => {
  const [ev] = run('Übergabe', 'Am 4.11. um 17 Uhr?')
  assert.equal(suggestionBucket(ev, NOW), 'today')
  const [later] = run('Konzert', 'Konzert am 20.12. um 20 Uhr')
  assert.equal(suggestionBucket(later, NOW), 'later')
  const dup = findDuplicate(ev, { events: [{ id: 'e1', title: 'Übergabe Wohnung', start: ev.start! }], tasks: [], notes: [] })
  assert.equal(dup?.id, 'e1')
  assert.equal(findDuplicate(ev, { events: [], tasks: [], notes: [] }), null)
})

test('IDs sind stabil (Bearbeitungsstand bleibt nach erneutem Abgleich erhalten)', () => {
  const a = run('Übergabe', 'Am 12.11. um 17 Uhr.')
  const b = run('Übergabe', 'Am 12.11. um 17 Uhr.')
  assert.equal(a[0].id, b[0].id)
})

test('„Vielen Dank für …“ am Anfang ist keine Grußformel', () => {
  const a = run('Willkommen', 'Hallo,\n\nvielen Dank für den Empfang gestern! Ich habe noch keinen Zugang. Könntest du das freischalten lassen?\n\nViele Grüße')
  assert.equal(a.filter((x) => x.kind === 'task').length, 1)
})

test('Bitte mit Datum wird Aufgabe mit Fälligkeit, kein ganztägiger Termin', () => {
  const a = run('Relaunch', 'Können Sie mir heute noch bestätigen, ob der Termin hält?')
  assert.equal(a.length, 1)
  assert.equal(a[0].kind, 'task')
  assert.equal(a[0].due, '2026-11-03')
  assert.equal(a[0].title, 'Bestätigen, ob der Termin hält')
})

test('Erinnerung in derselben Unterhaltung ergibt keinen zweiten Vorschlag', async () => {
  const { detectAll } = await import('../src/shared/mail-insights.ts')
  const a = mail('Freigabe', 'Wir brauchen die Freigabe bis spätestens 6.11.')
  const b = { ...mail('Re: Freigabe', 'Kurze Erinnerung an die Freigabe bis 6.11.'), id: 'm2', date: new Date(2026, 10, 3, 9, 0).toISOString() }
  const list = detectAll([b, a], { now: NOW })
  assert.equal(list.length, 1)
  assert.equal(list[0].mailId, 'm1', 'erste Mail bleibt (stabile ID)')
  assert.equal(list[0].followUps, 1)
})

test('„zwischen 10 und 14 Uhr“ wird als Zeitspanne erkannt', () => {
  const [a] = run('Dein Paket', 'Zustellung am 4.11. zwischen 10 und 14 Uhr.')
  assert.equal(new Date(a.start!).getHours(), 10)
  assert.equal(new Date(a.end!).getHours(), 14)
})

test('Serie: „jeden Dienstag um 18 Uhr bis 15.12.“ und „immer donnerstags“', async () => {
  const { seriesStarts } = await import('../src/shared/mail-insights.ts')
  const a = run('Lerngruppe', 'Wir treffen uns ab jetzt jeden Dienstag um 18 Uhr bis 15.12.2026.')
  assert.equal(a.length, 1, 'Enddatum ist kein eigener Termin und keine Frist')
  assert.equal(a[0].kind, 'event')
  assert.equal(a[0].recurrence?.freq, 'weekly')
  assert.equal(a[0].recurrence?.until, '2026-12-15')
  const starts = seriesStarts(new Date(a[0].start!), a[0].recurrence!)
  assert.equal(starts.length, 7, '10.11. bis 15.12. = 6 Wochen, mit erstem Termin 7') // 10.11.–15.12.
  assert.equal(starts.at(-1)!.getDate(), 15)
  const b = run('Training', 'Das Training ist immer donnerstags um 19:30 Uhr.')
  assert.equal(b[0].kind, 'event')
  assert.equal(new Date(b[0].start!).getDay(), 4)
  assert.equal(b[0].recurrence?.label, 'wöchentlich')
  assert.equal(run('Kurs', 'Der Kurs findet alle zwei Wochen am 10.11. um 9 Uhr statt.')[0].recurrence?.freq, 'biweekly')
})

test('Widerspruch: „Donnerstag, 13.11.“ (13.11. ist ein Freitag) → beide Möglichkeiten', () => {
  const [a] = run('Treffen', 'Wir treffen uns am Donnerstag, 13.11., um 15 Uhr.')
  assert.equal(a.kind, 'event')
  assert.equal(a.uncertain, true)
  assert.match(a.reason!, /Widersprüchlich/)
  assert.equal(a.conflict?.options.length, 2)
  assert.equal(new Date(a.conflict!.options[0].start!).getDate(), 13)
  assert.equal(new Date(a.conflict!.options[1].start!).getDate(), 12)
  assert.equal(new Date(a.conflict!.options[1].start!).getHours(), 15)
})

test('Unverbindlich: „vielleicht treffen wir uns Freitag um 18 Uhr“ → Aufgabe zur Klärung', () => {
  const a = run('Kino?', 'Hey, vielleicht treffen wir uns am 13.11. um 18 Uhr im Kino?')
  assert.equal(a.length, 1)
  assert.equal(a[0].kind, 'task')
  assert.match(a[0].title, /^Termin klären: Kino\?/)
  assert.equal(a[0].uncertain, true)
})

test('Jeder Vorschlag erklärt kurz, worauf er beruht', () => {
  assert.match(run('Übergabe', 'Die Übergabe ist am 12.11. um 17 Uhr.')[0].basis, /ausdrücklich in der Mail/)
  assert.match(run('Übergabe', 'Passt Ihnen der 12.11. um 17 Uhr?')[0].basis, /als Frage/)
  assert.match(run('Abgabe', 'Bitte gib die Arbeit bis spätestens 20.11. ab.').find((x) => x.kind === 'deadline')!.basis, /Frist aus dem Nachrichtentext/)
})

test('Ausgeschlossene Absender werden nicht geprüft', async () => {
  const { detectAll } = await import('../src/shared/mail-insights.ts')
  const m = mail('Newsletter', 'Webinar am 12.11. um 17 Uhr', { from: { name: 'News', email: 'news@liste.example.de' } })
  assert.equal(detectAll([m], { now: NOW }).length, 1)
  assert.equal(detectAll([m], { now: NOW, exclude: ['@liste.example.de'] }).length, 0)
})
