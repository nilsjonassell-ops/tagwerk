import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupThreads } from '../src/shared/analysis.ts'
import type { Email } from '../src/shared/types.ts'

const mail = (id: string, p: Partial<Email> = {}): Email => ({
  id, threadId: 't', from: { name: 'A', email: 'a@x.de' }, to: [], subject: 'S', date: `2026-10-30T1${id}:00:00Z`,
  body: '', read: true, important: false, needsReply: false, replied: false, folder: 'inbox', source: 'google', ...p
})

test('Antwort offen: automatisch, von Hand an, von Hand aus', () => {
  const auto = [mail('1', { needsReply: true })]
  assert.equal(groupThreads(auto)[0].needsReply, true)
  // entfernt → gilt bis zur nächsten eingehenden Nachricht
  assert.equal(groupThreads(auto, { t: { on: false, msgId: '1' } })[0].needsReply, false)
  const next = [...auto, mail('2', { needsReply: true })]
  assert.equal(groupThreads(next, { t: { on: false, msgId: '1' } })[0].needsReply, true)
  // von Hand markiert, obwohl nicht erkannt
  const plain = [mail('1')]
  const t = groupThreads(plain, { t: { on: true, msgId: '1' } })[0]
  assert.equal(t.needsReply, true)
  assert.equal(t.replyManual, true)
  // meine Antwort beendet es
  const answered = [mail('1'), mail('2', { folder: 'sent', from: { name: 'Ich', email: 'me@x.de' } })]
  assert.equal(groupThreads(answered, { t: { on: true, msgId: '1' } })[0].needsReply, false)
})

test('Gemerkt wird je Unterhaltung erkannt', () => {
  assert.equal(groupThreads([mail('1'), mail('2', { starred: true })])[0].starred, true)
  assert.equal(groupThreads([mail('1')])[0].starred, false)
})
