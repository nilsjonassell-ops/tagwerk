// Andocken des Hauptfensters am Bildschirmrand – reine Geometrie und Zeitsteuerung (testbar).
// Der Hauptprozess (main/dock.ts) liest Mauszeiger und Bildschirme und bewegt das Fenster.

export type DockEdge = 'left' | 'right'
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Sichtbarer Streifen im eingefahrenen Zustand: Symbolleiste (58 px) + Rand (10 px) */
export const DOCK_STRIP = 68
/** So nah am Rand gilt das Fenster als angedockt */
export const SNAP = 18
/** Ausfahren nach kurzer Absicht (gegen Vorbeistreifen), Einfahren erst nach längerem Verlassen */
export const OPEN_DELAY = 60
export const CLOSE_DELAY = 650

const overlapsY = (a: Rect, b: Rect) => a.y < b.y + b.height && b.y < a.y + a.height

/** Liegt das Fenster an einer Außenkante? Kanten, an die ein anderer Bildschirm grenzt, zählen nicht –
 *  sonst würde das eingefahrene Fenster auf dem Nachbarbildschirm auftauchen. */
export function edgeFor(win: Rect, work: Rect, displays: Rect[]): DockEdge | null {
  // Bildschirm, zu dem der Arbeitsbereich gehört (Arbeitsbereich = Bildschirm ohne Taskleiste)
  const cur = displays.find((d) => d.x <= work.x && d.x + d.width >= work.x + work.width && d.y <= work.y && d.y + d.height >= work.y + work.height) ?? work
  const neighbour = (edge: DockEdge) =>
    displays.some((d) => d !== cur && overlapsY(d, win) && (edge === 'left' ? Math.abs(d.x + d.width - cur.x) <= 2 : Math.abs(d.x - (cur.x + cur.width)) <= 2))
  if (Math.abs(win.x - work.x) <= SNAP && !neighbour('left')) return 'left'
  if (Math.abs(win.x + win.width - (work.x + work.width)) <= SNAP && !neighbour('right')) return 'right'
  return null
}

/** x-Position: ausgefahren bündig an der Kante, eingefahren bleibt nur der Streifen sichtbar */
export function dockedX(edge: DockEdge, win: Rect, work: Rect, collapsed: boolean): number {
  if (edge === 'left') return collapsed ? work.x + DOCK_STRIP - win.width : work.x
  return collapsed ? work.x + work.width - DOCK_STRIP : work.x + work.width - win.width
}

/** Bereich, in dem die Maus das eingefahrene Fenster ausfährt – reicht bis an den Bildschirmrand */
export function stripRect(edge: DockEdge, win: Rect, work: Rect): Rect {
  const x = edge === 'left' ? work.x : work.x + work.width - DOCK_STRIP
  return { x, y: win.y, width: DOCK_STRIP, height: win.height }
}

export const inside = (p: { x: number; y: number }, r: Rect, pad = 0) => p.x >= r.x - pad && p.x < r.x + r.width + pad && p.y >= r.y - pad && p.y < r.y + r.height + pad

export interface DockClock {
  collapsed: boolean
  insideSince?: number
  outsideSince?: number
}

/** Ein Takt der Steuerung: Maus drin/draußen, Halten (Dialog/Menü offen), Maustaste gedrückt */
export function dockStep(s: DockClock, i: { inside: boolean; hold: boolean; buttons: boolean }, now: number): { state: DockClock; change?: 'expand' | 'collapse' } {
  if (s.collapsed) {
    if (!i.inside) return { state: { collapsed: true } }
    const since = s.insideSince ?? now
    if (now - since >= OPEN_DELAY) return { state: { collapsed: false }, change: 'expand' }
    return { state: { collapsed: true, insideSince: since } }
  }
  if (i.inside || i.hold || i.buttons) return { state: { collapsed: false } }
  const since = s.outsideSince ?? now
  if (now - since >= CLOSE_DELAY) return { state: { collapsed: true }, change: 'collapse' }
  return { state: { collapsed: false, outsideSince: since } }
}

/** Sanftes Gleiten: Zwischenpositionen für eine Bewegung (ease-out, ~220 ms bei 60 Bildern/s) */
export function slideFrames(from: number, to: number, ms = 220, fps = 60): number[] {
  const n = Math.max(1, Math.round((ms / 1000) * fps))
  const out: number[] = []
  for (let k = 1; k <= n; k++) {
    const t = k / n
    const e = 1 - Math.pow(1 - t, 3)
    out.push(Math.round(from + (to - from) * e))
  }
  return out
}
