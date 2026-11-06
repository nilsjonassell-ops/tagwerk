import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAppearance, normalizeSidebarMode, ACCENTS } from '../src/shared/appearance.ts'
import { SYNCED_SETTINGS } from '../src/shared/cloud.ts'

test('unbekannte Akzent- und Bewegungswerte fallen auf die Standards zurück', () => {
  const r = normalizeAppearance({ accent: 'purple' as never, motion: 'x' as never, theme: 'neon' as never })
  assert.deepEqual(r, { theme: 'system', accent: 'blue', motion: 'system', designRev: 2 })
})

test('gültige Werte bleiben erhalten', () => {
  assert.deepEqual(normalizeAppearance({ theme: 'dark', accent: 'rose', motion: 'reduced' }), { theme: 'dark', accent: 'rose', motion: 'reduced', designRev: 2 })
})

test('sieben Akzente, Systemblau zuerst', () => {
  assert.deepEqual(
    ACCENTS.map((a) => a.id),
    ['blue', 'indigo', 'petrol', 'green', 'amber', 'rose', 'graphite']
  )
})

test('neues Design: altes Standard-Indigo wird einmalig zu Blau, bewusst gewähltes Indigo bleibt danach', () => {
  assert.equal(normalizeAppearance({ accent: 'indigo' }).accent, 'blue')
  assert.equal(normalizeAppearance({ accent: 'indigo', designRev: 1 }).accent, 'blue')
  assert.equal(normalizeAppearance({ accent: 'indigo', designRev: 2 }).accent, 'indigo')
  assert.equal(normalizeAppearance({ accent: 'petrol' }).accent, 'petrol')
})

test('Akzent und Bewegung werden zwischen PCs übertragen', () => {
  assert.ok(SYNCED_SETTINGS.includes('accent'))
  assert.ok(SYNCED_SETTINGS.includes('motion'))
})

test('Seitenleiste: Standard ist automatisch, unbekannte Werte ebenfalls', () => {
  assert.equal(normalizeSidebarMode(undefined), 'auto')
  assert.equal(normalizeSidebarMode('x'), 'auto')
  assert.equal(normalizeSidebarMode('pinned'), 'pinned')
  assert.ok(SYNCED_SETTINGS.includes('sidebarMode'))
})
