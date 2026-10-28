import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseIcs } from '../src/main/ics.ts'

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//DE
BEGIN:VEVENT
UID:a1
DTSTART:20261029T090000Z
DTEND:20261029T100000Z
SUMMARY:Steuerberater
LOCATION:Kanzlei Weber
ATTENDEE;CN=Anna Weber:mailto:anna@kanzlei.de
END:VEVENT
BEGIN:VEVENT
UID:a2
DTSTART;VALUE=DATE:20261105
DTEND;VALUE=DATE:20261106
SUMMARY:Brückentag
END:VEVENT
BEGIN:VEVENT
UID:a3
DTSTART:20261026T073000Z
DTEND:20261026T074500Z
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:Wochenstart
END:VEVENT
END:VCALENDAR`

test('ICS: Einzeltermin, ganztägig und Wiederholung', () => {
  const evs = parseIcs(ICS, 'imp-1', new Date('2026-10-28T08:00:00Z'))
  const st = evs.find((e) => e.title === 'Steuerberater')!
  assert.equal(st.start, '2026-10-29T09:00:00.000Z')
  assert.equal(st.location, 'Kanzlei Weber')
  assert.deepEqual(st.attendees, [{ name: 'Anna Weber', email: 'anna@kanzlei.de' }])
  assert.ok(st.readOnly && st.source === 'ics' && st.importId === 'imp-1')
  assert.ok(evs.find((e) => e.title === 'Brückentag')!.allDay)
  assert.equal(evs.filter((e) => e.title === 'Wochenstart').length, 4)
})

test('ICS: ungültige Datei wirft einen Fehler', () => {
  assert.throws(() => parseIcs('kein kalender', 'x'))
})
