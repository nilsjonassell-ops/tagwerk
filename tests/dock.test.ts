import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOCK_STRIP, dockStep, dockedX, edgeFor, stripRect, type DockClock } from '../src/shared/dock.ts'

// Ein Bildschirm 1920×1080, Taskleiste unten (40 px)
const work = { x: 0, y: 0, width: 1920, height: 1040 }
const screen = { x: 0, y: 0, width: 1920, height: 1080 }
const win = (x: number, width = 1200) => ({ x, y: 80, width, height: 800 })

test('Kante erkennen: nah am linken/rechten Rand des Arbeitsbereichs', () => {
  assert.equal(edgeFor(win(6), work, [screen]), 'left')
  assert.equal(edgeFor(win(1920 - 1200 - 4), work, [screen]), 'right')
  assert.equal(edgeFor(win(300), work, [screen]), null)
})

test('Taskleiste links: Arbeitsbereich beginnt später – dort ist die Kante', () => {
  const w2 = { x: 48, y: 0, width: 1872, height: 1080 }
  assert.equal(edgeFor(win(52), w2, [screen]), 'left')
  assert.equal(dockedX('left', win(52), w2, false), 48)
})

test('Mehrere Monitore: keine Andock-Kante, wo ein anderer Bildschirm anschließt', () => {
  const second = { x: -1920, y: 0, width: 1920, height: 1080 }
  assert.equal(edgeFor(win(4), work, [screen, second]), null, 'links liegt ein zweiter Bildschirm')
  assert.equal(edgeFor(win(1920 - 1200), work, [screen, second]), 'right', 'rechts ist frei')
  // Zweiter Bildschirm darüber (nicht seitlich) stört nicht
  const above = { x: 0, y: -1080, width: 1920, height: 1080 }
  assert.equal(edgeFor(win(4), work, [screen, above]), 'left')
})

test('Taskleiste links und links daneben ein zweiter Bildschirm: nicht andocken', () => {
  const w2 = { x: 48, y: 0, width: 1872, height: 1080 }
  const second = { x: -1920, y: 0, width: 1920, height: 1080 }
  assert.equal(edgeFor(win(52), w2, [screen, second]), null)
})

test('Eingefahren bleibt genau der Streifen sichtbar, ausgefahren liegt das Fenster bündig', () => {
  assert.equal(dockedX('left', win(0), work, false), 0)
  assert.equal(dockedX('left', win(0), work, true), DOCK_STRIP - 1200)
  assert.equal(dockedX('right', win(720), work, false), 1920 - 1200)
  assert.equal(dockedX('right', win(720), work, true), 1920 - DOCK_STRIP)
})

test('Trefferstreifen reicht bis an den Bildschirmrand (leicht zu treffen)', () => {
  const l = stripRect('left', win(0), work)
  assert.deepEqual([l.x, l.width], [0, DOCK_STRIP])
  const r = stripRect('right', win(720), work)
  assert.equal(r.x + r.width, 1920)
  assert.equal(r.width, DOCK_STRIP)
})

const go = (s: DockClock, inside: boolean, t: number, extra: { hold?: boolean; buttons?: boolean } = {}) => dockStep(s, { inside, hold: !!extra.hold, buttons: !!extra.buttons }, t)

test('Ausfahren: schnell (nach kurzer Absicht), nicht bei bloßem Vorbeistreifen', () => {
  let s: DockClock = { collapsed: true }
  let r = go(s, true, 0)
  assert.equal(r.change, undefined)
  r = go(r.state, false, 30) // nur vorbeigestreift
  r = go(r.state, true, 40)
  r = go(r.state, true, 90)
  assert.equal(r.change, undefined, 'erst 50 ms drin')
  r = go(r.state, true, 110)
  assert.equal(r.change, 'expand', 'nach 70 ms ununterbrochen drin')
  s = r.state
  assert.equal(s.collapsed, false)
})

test('Einfahren: erst nach längerem Verlassen, kurzes Hinausrutschen schadet nicht', () => {
  let r = go({ collapsed: false }, false, 0)
  r = go(r.state, false, 400)
  assert.equal(r.change, undefined)
  r = go(r.state, true, 450) // zurück ins Fenster
  r = go(r.state, false, 500)
  r = go(r.state, false, 1100)
  assert.equal(r.change, undefined, 'Zähler beginnt neu')
  r = go(r.state, false, 1200)
  assert.equal(r.change, 'collapse')
})

test('Nie einfahren, solange ein Dialog/Menü offen ist oder eine Maustaste gedrückt wird', () => {
  let r = go({ collapsed: false }, false, 0, { hold: true })
  r = go(r.state, false, 5000, { hold: true })
  assert.equal(r.change, undefined)
  r = go(r.state, false, 6000, { buttons: true })
  assert.equal(r.change, undefined)
  r = go(r.state, false, 6100)
  r = go(r.state, false, 6800)
  assert.equal(r.change, 'collapse')
})
