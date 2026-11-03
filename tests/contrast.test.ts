import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PALETTE } from '../src/shared/palette.ts'
import { ACCENTS } from '../src/shared/appearance.ts'
import { renderTokens } from '../scripts/tokens-css.ts'

// WCAG 2.1: relative Leuchtdichte und Kontrastverhältnis
function lum(hex: string): number {
  const n = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

for (const mode of ['light', 'dark'] as const) {
  const n = PALETTE.neutral[mode]
  const surfaces = { raised: n.raised, canvas: n.canvas, sunken: n.sunken }
  test(`${mode}: Text auf allen Flächen ≥ 4,5:1`, () => {
    for (const [name, bg] of Object.entries(surfaces)) {
      for (const ink of ['ink', 'ink2', 'ink3'] as const) {
        const c = contrast(n[ink], bg)
        assert.ok(c >= 4.5, `${ink} auf ${name}: ${c.toFixed(2)}`)
      }
    }
  })
  for (const s of ['alert', 'attention', 'ok'] as const) {
    test(`${mode}: Statusfarbe ${s} als Text ≥ 4,5:1`, () => {
      for (const [name, bg] of Object.entries(surfaces)) {
        const c = contrast(PALETTE.status[mode][s], bg)
        assert.ok(c >= 4.5, `${s} auf ${name}: ${c.toFixed(2)}`)
      }
    })
  }
  for (const { id } of ACCENTS) {
    const a = PALETTE.accents[id][mode]
    test(`${mode}/${id}: Schrift auf Akzent ≥ 4,5:1`, () => {
      const c = contrast(a.ink, a.base)
      assert.ok(c >= 4.5, c.toFixed(2))
    })
    test(`${mode}/${id}: Akzent als Bedienelement auf Flächen ≥ 3:1`, () => {
      for (const [name, bg] of Object.entries(surfaces)) {
        const c = contrast(a.base, bg)
        assert.ok(c >= 3, `${name}: ${c.toFixed(2)}`)
      }
    })
    test(`${mode}/${id}: Akzent als Text (Links) auf weicher Akzentfläche ≥ 4,5:1`, () => {
      const c = contrast(a.text, a.soft)
      assert.ok(c >= 4.5, c.toFixed(2))
      assert.ok(contrast(a.text, n.raised) >= 4.5, 'auf raised')
    })
  }
}

test('tokens.css ist aus der Palette erzeugt und aktuell', () => {
  const css = readFileSync(new URL('../src/renderer/src/styles/tokens.css', import.meta.url), 'utf8')
  assert.equal(css, renderTokens(), 'npm run tokens ausführen')
  for (const { id } of ACCENTS) assert.ok(css.includes(`[data-accent='${id}']`), id)
})
