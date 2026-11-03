import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAppearance, ACCENTS } from '../src/shared/appearance.ts'
import { SYNCED_SETTINGS } from '../src/shared/cloud.ts'

test('unbekannte Akzent- und Bewegungswerte fallen auf die Standards zurück', () => {
  const r = normalizeAppearance({ accent: 'purple' as never, motion: 'x' as never, theme: 'neon' as never })
  assert.deepEqual(r, { theme: 'system', accent: 'indigo', motion: 'system' })
})

test('gültige Werte bleiben erhalten', () => {
  assert.deepEqual(normalizeAppearance({ theme: 'dark', accent: 'rose', motion: 'reduced' }), { theme: 'dark', accent: 'rose', motion: 'reduced' })
})

test('sieben Akzente, Indigo zuerst', () => {
  assert.deepEqual(
    ACCENTS.map((a) => a.id),
    ['indigo', 'petrol', 'blue', 'green', 'amber', 'rose', 'graphite']
  )
})

test('Akzent und Bewegung werden zwischen PCs übertragen', () => {
  assert.ok(SYNCED_SETTINGS.includes('accent'))
  assert.ok(SYNCED_SETTINGS.includes('motion'))
})
