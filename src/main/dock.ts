// Andocken des Hauptfensters am linken oder rechten Bildschirmrand (Einstellung „Fenster andocken“).
// Angedockt fährt das Fenster ein, wenn die Maus es eine Weile verlassen hat – sichtbar bleibt nur der
// Symbolstreifen. Erreicht die Maus den Streifen, fährt es zügig wieder aus. Das Fenster gleitet dabei
// zur Seite, ohne seine Größe zu ändern (kein Umbruch, kein Springen).
// Geometrie und Verzögerungen: shared/dock.ts.
import { screen, type BrowserWindow } from 'electron'
import { dockStep, dockedX, edgeFor, inside, slideFrames, stripRect, type DockClock, type DockEdge, type Rect } from '@shared/dock'

interface Ctx {
  win: () => BrowserWindow | null
  enabled: () => boolean
}

let ctx: Ctx | undefined
let edge: DockEdge | null = null
let clock: DockClock = { collapsed: false }
let hold = false
let timer: ReturnType<typeof setInterval> | undefined
let sliding = false
let moveTimer: ReturnType<typeof setTimeout> | undefined
/** Zuletzt selbst gesetzte x-Position – eigene Bewegungen sind kein „vom Rand weggezogen“ */
let ownX: number | null = null

function place(w: BrowserWindow, x: number, y: number) {
  ownX = x
  w.setPosition(x, y)
}
/** Nur für automatische Tests: Mauszeiger vorgeben */
let fakeCursor: { x: number; y: number } | null = null

const cursor = () => fakeCursor ?? screen.getCursorScreenPoint()
const usable = (w: BrowserWindow) => !w.isDestroyed() && w.isVisible() && !w.isMinimized() && !w.isMaximized() && !w.isFullScreen()
const workOf = (b: Rect) => screen.getDisplayMatching(b).workArea
const displays = () => screen.getAllDisplays().map((d) => d.bounds)

function send() {
  const w = ctx?.win()
  if (w && !w.isDestroyed()) w.webContents.send('dock:state', { edge, collapsed: clock.collapsed })
}

/** Fenster sanft an eine neue x-Position gleiten lassen */
function slideTo(w: BrowserWindow, x: number, done?: () => void) {
  const [x0, y] = w.getPosition()
  if (x0 === x) return done?.()
  sliding = true
  const frames = slideFrames(x0, x)
  let i = 0
  const tick = () => {
    if (w.isDestroyed()) return void (sliding = false)
    place(w, frames[i], y)
    i++
    if (i < frames.length) setTimeout(tick, 16)
    else {
      sliding = false
      done?.()
    }
  }
  tick()
}

function setCollapsed(c: boolean) {
  const w = ctx?.win()
  if (!w || !edge) return
  const b = w.getBounds()
  clock = { collapsed: c }
  // Erst die Oberfläche umstellen (Symbolstreifen), dann gleiten
  send()
  slideTo(w, dockedX(edge, b, workOf(b), c))
}

function loop() {
  const w = ctx?.win()
  if (!w || !edge || sliding) return
  if (!usable(w)) return
  const b = w.getBounds()
  const p = cursor()
  const isIn = clock.collapsed ? inside(p, stripRect(edge, b, workOf(b)), 2) : inside(p, b, 6)
  const r = dockStep(clock, { inside: isIn, hold, buttons: false }, Date.now())
  clock = r.state
  if (r.change) setCollapsed(r.change === 'collapse')
}

function start() {
  if (!timer) timer = setInterval(loop, 33)
}
function stop() {
  clearInterval(timer)
  timer = undefined
}

/** Nach dem Verschieben prüfen: liegt das Fenster an einer Außenkante? */
function checkEdge() {
  const w = ctx?.win()
  if (!w || sliding) return
  if (!ctx?.enabled() || !usable(w)) return undock()
  const b = w.getBounds()
  const work = workOf(b)
  const next = edgeFor(b, work, displays())
  if (!next) return undock()
  edge = next
  clock = { collapsed: false }
  // bündig an die Kante legen
  const x = dockedX(edge, b, work, false)
  if (x !== b.x) place(w, x, b.y)
  send()
  start()
}

function undock() {
  const w = ctx?.win()
  const was = edge
  stop()
  // Nur zurückholen, wenn es noch eingefahren am Rand steht (z. B. Einstellung ausgeschaltet) –
  // vom Rand weggezogen bleibt es, wo es losgelassen wurde
  if (was && clock.collapsed && w && !w.isDestroyed()) {
    const b = w.getBounds()
    if (b.x === dockedX(was, b, workOf(b), true)) place(w, dockedX(was, b, workOf(b), false), b.y)
  }
  edge = null
  clock = { collapsed: false }
  if (was) send()
}

export function initDock(c: Ctx) {
  ctx = c
  const w = c.win()
  if (!w) return
  const onMove = () => {
    if (sliding) return
    // Eigene Bewegung (Gleiten, bündig legen) – nicht als Ziehen werten
    if (ownX !== null && w.getPosition()[0] === ownX) return
    clearTimeout(moveTimer)
    // Ende des Ziehens abwarten (Windows meldet zusätzlich „moved“)
    moveTimer = setTimeout(checkEdge, 220)
  }
  w.on('move', onMove)
  w.on('moved', onMove)
  w.on('resize', onMove)
  w.on('maximize', undock)
  w.on('enter-full-screen', undock)
  w.on('hide', () => clock.collapsed && setCollapsed(false))
  screen.on('display-metrics-changed', () => edge && checkEdge())
  screen.on('display-removed', () => edge && checkEdge())
  w.webContents.on('did-finish-load', () => {
    setTimeout(checkEdge, 300)
  })
  if (process.env.TAGWERK_DOCK_TEST === '1') {
    ;(globalThis as Record<string, unknown>).__tagwerkDock = {
      setCursor: (p: { x: number; y: number } | null) => (fakeCursor = p),
      state: () => ({ edge, collapsed: clock.collapsed, hold, bounds: c.win()?.getBounds() }),
      check: checkEdge
    }
  }
}

/** Oberfläche: Dialog/Menü offen oder Maustaste gedrückt – nicht einfahren */
export function setDockHold(v: boolean) {
  hold = v
}

/** Einstellung geändert */
export function dockSettingChanged() {
  if (ctx?.enabled()) checkEdge()
  else undock()
}

/** Vor dem Speichern der Fensterposition: eingefahrene Position nicht merken */
export function dockRestBounds(b: Rect): Rect {
  if (!edge || !clock.collapsed) return b
  return { ...b, x: dockedX(edge, b, workOf(b), false) }
}
