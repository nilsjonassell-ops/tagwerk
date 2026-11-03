import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findOption, moveIndex, typeahead } from '../src/renderer/src/components/ui/listnav.ts'

const opts = [
  { value: 'a', label: 'Apfel' },
  { value: 'b', label: 'Birne' },
  { value: 'c', label: 'Banane', disabled: true },
  { value: 'd', label: 'Dattel' }
]

test('findOption: unbekannter Wert ergibt undefined (Platzhalter statt Absturz)', () => {
  assert.equal(findOption(opts, 'gelöscht'), undefined)
  assert.equal(findOption(opts, 'b')?.label, 'Birne')
})

test('moveIndex: Pfeiltasten springen über deaktivierte Einträge und laufen rundherum', () => {
  assert.equal(moveIndex(opts, 1, 'ArrowDown'), 3)
  assert.equal(moveIndex(opts, 3, 'ArrowDown'), 0)
  assert.equal(moveIndex(opts, 0, 'ArrowUp'), 3)
  assert.equal(moveIndex(opts, -1, 'ArrowDown'), 0)
})

test('moveIndex: Pos1/Ende', () => {
  assert.equal(moveIndex(opts, 2, 'Home'), 0)
  assert.equal(moveIndex(opts, 0, 'End'), 3)
})

test('typeahead: Anfangsbuchstaben, ab dem nächsten Eintrag, ohne deaktivierte', () => {
  assert.equal(typeahead(opts, 0, 'b'), 1)
  assert.equal(typeahead(opts, 1, 'b'), 1, 'Banane ist deaktiviert → bleibt bei Birne')
  assert.equal(typeahead(opts, 3, 'a'), 0)
  assert.equal(typeahead(opts, 0, 'da'), 3)
  assert.equal(typeahead(opts, 0, 'x'), -1)
})
