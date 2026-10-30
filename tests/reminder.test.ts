import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapGoogleEvent, reminderFromGoogle, toGoogleEvent } from '../src/main/google-map.ts'

test('Erinnerungen aus Google lesen', () => {
  assert.equal(reminderFromGoogle(undefined), undefined)
  assert.equal(reminderFromGoogle({ useDefault: true }), undefined)
  assert.equal(reminderFromGoogle({ useDefault: false, overrides: [] }), null)
  assert.equal(reminderFromGoogle({ useDefault: false, overrides: [{ method: 'popup', minutes: 30 }, { method: 'popup', minutes: 10 }] }), 10)
  assert.equal(reminderFromGoogle({ useDefault: false, overrides: [{ method: 'email', minutes: 60 }] }), null)
  const ev = mapGoogleEvent({ id: 'x', start: { dateTime: '2026-10-30T10:00:00Z' }, end: { dateTime: '2026-10-30T11:00:00Z' }, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] } }, true)
  assert.equal(ev?.reminderMinutes, 15)
})

test('Erinnerungen an Google schreiben', () => {
  const base = { id: 'e', title: 'T', start: '2026-10-30T10:00:00Z', end: '2026-10-30T11:00:00Z', attendees: [], source: 'google' as const }
  assert.deepEqual(toGoogleEvent(base, { includeAttendees: false }).reminders, { useDefault: true })
  assert.deepEqual(toGoogleEvent({ ...base, reminderMinutes: null }, { includeAttendees: false }).reminders, { useDefault: false, overrides: [] })
  assert.deepEqual(toGoogleEvent({ ...base, reminderMinutes: 0 }, { includeAttendees: false }).reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] })
})
