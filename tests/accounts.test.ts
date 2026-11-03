import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventToIcs, icsToEvents, isCalendarCollection, parseMultistatus, supportsEvents } from '../src/main/caldav-map.ts'
import { mapOutlookEvent, mapOutlookMessages, toOutlookEvent } from '../src/main/outlook-map.ts'

const PROPFIND = `<?xml version="1.0"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/" xmlns:A="http://apple.com/ns/ical/">
 <response><href>/1234/calendars/</href><propstat><prop><displayname>Home</displayname><resourcetype><collection/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat></response>
 <response><href>/1234/calendars/home/</href><propstat><prop><displayname>Privat &amp; Uni</displayname><resourcetype><collection/><C:calendar/></resourcetype>
   <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set><CS:getctag>ctag-1</CS:getctag><A:calendar-color>#FF2968FF</A:calendar-color></prop><status>HTTP/1.1 200 OK</status></propstat>
   <propstat><prop><C:calendar-description/></prop><status>HTTP/1.1 404 Not Found</status></propstat></response>
 <response><href>/1234/calendars/tasks/</href><propstat><prop><displayname>Erinnerungen</displayname><resourcetype><collection/><C:calendar/></resourcetype>
   <C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set></prop><status>HTTP/1.1 200 OK</status></propstat></response>
</multistatus>`

test('CalDAV-Antwort lesen', () => {
  const r = parseMultistatus(PROPFIND)
  assert.equal(r.length, 3)
  const cal = r[1]
  assert.equal(cal.href, '/1234/calendars/home/')
  assert.equal(cal.props.displayname, 'Privat & Uni')
  assert.equal(cal.props.getctag, 'ctag-1')
  assert.equal(cal.props['calendar-color'], '#FF2968FF')
  assert.ok(isCalendarCollection(cal) && supportsEvents(cal))
  assert.ok(!isCalendarCollection(r[0]))
  assert.ok(!supportsEvents(r[2]))
  const home = parseMultistatus('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/p/</d:href><d:propstat><d:prop><cal:calendar-home-set xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:href>https://p52-caldav.icloud.com:443/1234/calendars/</d:href></cal:calendar-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>')
  assert.equal(home[0].props['calendar-home-set'], 'https://p52-caldav.icloud.com:443/1234/calendars/')
})

test('iCalendar hin und zurück', () => {
  const ev = { id: 'x', title: 'Zahnarzt, Kontrolle', start: '2026-11-04T09:00:00.000Z', end: '2026-11-04T10:00:00.000Z', location: 'Praxis; 2. OG', notes: 'Karte\nmitbringen', attendees: [], source: 'icloud' as const, reminderMinutes: 30 }
  const ics = eventToIcs(ev, 'uid-1', new Date('2026-11-03T08:00:00Z'))
  assert.match(ics, /SUMMARY:Zahnarzt\\, Kontrolle/)
  assert.match(ics, /TRIGGER:-PT30M/)
  const back = icsToEvents(ics, { calendarId: 'c', calendarName: 'Privat', href: '/c/uid-1.ics', etag: '"e1"' }, new Date('2026-10-01'), new Date('2026-12-31'))
  assert.equal(back.length, 1)
  assert.equal(back[0].title, 'Zahnarzt, Kontrolle')
  assert.equal(back[0].start, ev.start)
  assert.equal(back[0].location, 'Praxis; 2. OG')
  assert.equal(back[0].notes, 'Karte\nmitbringen')
  assert.equal(back[0].reminderMinutes, 30)
  assert.equal(back[0].etag, '"e1"')
  assert.ok(!back[0].readOnly)
  // Serie: aufgelöst und schreibgeschützt
  const series = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:s1\r\nDTSTART:20261102T080000Z\r\nDTEND:20261102T083000Z\r\nRRULE:FREQ=DAILY;COUNT=5\r\nSUMMARY:Stand-up\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
  const occ = icsToEvents(series, { calendarId: 'c', calendarName: 'Arbeit', href: '/c/s1.ics' }, new Date('2026-11-01'), new Date('2026-11-30'))
  assert.equal(occ.length, 5)
  assert.ok(occ.every((o) => o.readOnly))
  assert.equal(new Set(occ.map((o) => o.id)).size, 5)
  // Ganztägig
  const ad = eventToIcs({ ...ev, allDay: true, start: new Date(2026, 10, 5).toISOString(), end: new Date(2026, 10, 5, 23, 59).toISOString() }, 'u2')
  assert.match(ad, /DTSTART;VALUE=DATE:20261105/)
  assert.match(ad, /DTEND;VALUE=DATE:20261106/)
})

test('Outlook-Mails zu Unterhaltungen', () => {
  const me = 'nils@outlook.de'
  const msgs = mapOutlookMessages(
    [
      { id: 'a', conversationId: 'c1', subject: 'Angebot', from: { emailAddress: { name: 'Petra', address: 'petra@firma.de' } }, toRecipients: [{ emailAddress: { address: me } }], receivedDateTime: '2026-11-02T09:00:00Z', isRead: false, body: { contentType: 'text', content: 'Kannst du mir bitte bis Freitag Bescheid geben?' }, _folder: 'inbox' },
      { id: 'b', conversationId: 'c2', subject: 'Newsletter', from: { emailAddress: { address: 'noreply@shop.de' } }, receivedDateTime: '2026-11-02T08:00:00Z', isRead: true, flag: { flagStatus: 'flagged' }, _folder: 'inbox' },
      { id: 'c', conversationId: 'c1', subject: 'Re: Angebot', from: { emailAddress: { address: me } }, sentDateTime: '2026-11-02T10:00:00Z', _folder: 'sent' }
    ],
    me
  )
  const a = msgs.find((m) => m.id === 'o-a')!
  assert.equal(a.threadId, 'o-c1')
  assert.equal(a.read, false)
  assert.equal(a.replied, true)
  assert.equal(a.source, 'outlook')
  assert.equal(msgs.find((m) => m.id === 'o-c')!.folder, 'sent')
  assert.equal(msgs.find((m) => m.id === 'o-b')!.starred, true)
})

test('Outlook-Termine', () => {
  const e = mapOutlookEvent({ id: 'e1', subject: 'Review', start: { dateTime: '2026-11-04T13:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-11-04T14:00:00.0000000', timeZone: 'UTC' }, isOrganizer: true, isReminderOn: true, reminderMinutesBeforeStart: 15, location: { displayName: 'Raum 2' } }, 'me@x.de')!
  assert.equal(e.start, '2026-11-04T13:00:00.000Z')
  assert.equal(e.reminderMinutes, 15)
  assert.equal(e.readOnly, undefined)
  const foreign = mapOutlookEvent({ id: 'e2', subject: 'Einladung', start: { dateTime: '2026-11-04T13:00:00' }, end: { dateTime: '2026-11-04T14:00:00' }, isOrganizer: false, organizer: { emailAddress: { name: 'Chef', address: 'chef@firma.de' } } }, 'me@x.de')!
  assert.equal(foreign.readOnly, true)
  assert.equal(foreign.organizer?.name, 'Chef')
  const body = toOutlookEvent({ ...e, reminderMinutes: null }, { includeAttendees: false, timeZone: 'Europe/Berlin' })
  assert.deepEqual(body.start, { dateTime: '2026-11-04T13:00:00.000', timeZone: 'UTC' })
  assert.equal(body.isReminderOn, false)
})
