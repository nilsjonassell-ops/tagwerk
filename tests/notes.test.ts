import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isBlankNote } from '../src/shared/analysis.ts'
import type { Note } from '../src/shared/types.ts'

const n = (over: Partial<Note> = {}): Note => ({ id: 'n1', title: '', body: '', kind: 'note', createdAt: '2026-11-05T10:00:00Z', updatedAt: '2026-11-05T10:00:00Z', ...over })

test('Leere, unberührte Notiz gilt als leer – mit Inhalt, Termin oder Projekt nicht', () => {
  assert.equal(isBlankNote(n()), true)
  assert.equal(isBlankNote(n({ body: '  \n ' })), true, 'nur Leerzeichen')
  assert.equal(isBlankNote(n({ title: 'Idee' })), false)
  assert.equal(isBlankNote(n({ body: 'x' })), false)
  assert.equal(isBlankNote(n({ decisions: 'ja' })), false)
  assert.equal(isBlankNote(n({ eventId: 'e1' })), false, 'Meetingnotiz zu einem Termin bleibt')
  assert.equal(isBlankNote(n({ projectId: 'p1' })), false)
  assert.equal(isBlankNote(n({ oneNote: { pageId: 'x' } } as Partial<Note>)), false)
})
