// Meldet dem Hauptprogramm, wann das angedockte Fenster nicht einfahren darf:
// Dialog oder Befehlspalette offen, Menü/Auswahl offen oder Maustaste gedrückt.
const parts = new Set<string>()
let last = false

export function dockHold(part: string, on: boolean) {
  if (on) parts.add(part)
  else parts.delete(part)
  const now = parts.size > 0
  if (now !== last) {
    last = now
    window.tagwerk.dock?.setHold(now)
  }
}

let popovers = 0
/** Popover geöffnet/geschlossen (Zählung, da mehrere gleichzeitig möglich sind) */
export function popoverOpen(delta: 1 | -1) {
  popovers = Math.max(0, popovers + delta)
  dockHold('popover', popovers > 0)
}
