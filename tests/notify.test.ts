import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inQuietHours, mailsToNotify } from '../src/shared/analysis.ts'
import type { Email } from '../src/shared/types.ts'

test('Ruhezeiten über Mitternacht und am Tag', () => {
  const q = { enabled: true, from: '22:00', to: '07:00' }
  assert.equal(inQuietHours(new Date('2026-10-30T23:30:00'), q), true)
  assert.equal(inQuietHours(new Date('2026-10-30T06:59:00'), q), true)
  assert.equal(inQuietHours(new Date('2026-10-30T07:00:00'), q), false)
  assert.equal(inQuietHours(new Date('2026-10-30T12:00:00'), q), false)
  assert.equal(inQuietHours(new Date('2026-10-30T13:00:00'), { enabled: true, from: '12:30', to: '13:30' }), true)
  assert.equal(inQuietHours(new Date('2026-10-30T23:30:00'), { ...q, enabled: false }), false)
})

const mail = (id: string, p: Partial<Email> = {}): Email => ({
  id, remoteId: id, threadId: 't' + id, from: { name: 'A', email: 'a@x.de' }, to: [], subject: 'S', date: '2026-10-30T10:00:00Z',
  body: '', read: false, important: false, needsReply: false, replied: false, folder: 'inbox', source: 'google', ...p
})

test('Neue Mails: nur neue, ungelesene, eingehende; wichtig/VIP/alle', () => {
  const before = [mail('1')]
  const after = [
    mail('1'),
    mail('2', { important: true }),
    mail('3'),
    mail('4', { from: { name: 'Chef', email: 'boss@firma.de' } }),
    mail('5', { read: true, important: true }),
    mail('6', { from: { name: 'Ich', email: 'me@gmail.com' }, important: true }),
    mail('7', { needsReply: true, threadId: 't2', date: '2026-10-30T11:00:00Z' })
  ]
  const imp = mailsToNotify(before, after, 'me@gmail.com', 'important', ['@firma.de'])
  assert.deepEqual(imp.map((m) => m.id).sort(), ['4', '7']) // 2 und 7 teilen sich Thread t2 → nur die neueste (7)
  assert.equal(mailsToNotify(before, after, 'me@gmail.com', 'all', []).length, 3) // t2, t3, t4
  assert.equal(mailsToNotify(before, after, 'me@gmail.com', 'off', []).length, 0)
  assert.equal(mailsToNotify([], after, 'me@gmail.com', 'all', []).length, 0) // erster Abgleich
})
