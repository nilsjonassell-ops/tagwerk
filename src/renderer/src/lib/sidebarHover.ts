// Seitenleiste im Modus „automatisch“: schmaler Streifen am Rand, fährt beim Überfahren aus.
// Öffnen sofort (kurze Absicht von 40 ms gegen versehentliches Vorbeistreifen), Schließen erst,
// wenn die Maus den Bereich wirklich verlassen hat (Verzögerung) – so flackert nichts.
import { useStore } from './store'

const OPEN_MS = 40
const CLOSE_MS = 320
let timer: ReturnType<typeof setTimeout> | undefined
let inside = 0

const setOpen = (v: boolean) => useStore.getState().sidebarOpen !== v && useStore.setState({ sidebarOpen: v })
// Eingefahren am Bildschirmrand fährt das Fenster selbst aus – die Leiste bleibt dann ruhig
const auto = () => useStore.getState().settings.sidebarMode !== 'pinned' && !useStore.getState().dock.collapsed

/** Maus/Fokus kommt in den Bereich (Leiste oder Randstreifen) */
export function sidebarEnter() {
  inside++
  clearTimeout(timer)
  if (!auto() || useStore.getState().sidebarOpen) return
  timer = setTimeout(() => setOpen(true), OPEN_MS)
}

/** Maus/Fokus verlässt einen Teil des Bereichs */
export function sidebarLeave() {
  inside = Math.max(0, inside - 1)
  clearTimeout(timer)
  if (!auto()) return
  timer = setTimeout(() => {
    // noch irgendwo drin (z. B. vom Randstreifen in die Leiste gewechselt) oder Tastaturfokus in der Leiste → offen lassen
    if (inside > 0 || keyboardFocusInside()) return
    setOpen(false)
  }, CLOSE_MS)
}

/** Nur Tastaturfokus hält die Leiste offen – nach einem Mausklick soll sie trotzdem einfahren */
function keyboardFocusInside(): boolean {
  return !!document.querySelector('.sidebar :focus-visible')
}

/** Tastatur: Tab in die Leiste öffnet sie, Tab hinaus schließt sie */
export function sidebarFocus(e: React.FocusEvent<HTMLElement>) {
  if (!auto() || !(e.target as HTMLElement).matches(':focus-visible')) return
  clearTimeout(timer)
  setOpen(true)
}
export function sidebarBlur(e: React.FocusEvent<HTMLElement>) {
  if (!auto() || e.currentTarget.contains(e.relatedTarget as Node)) return
  clearTimeout(timer)
  timer = setTimeout(() => inside === 0 && !keyboardFocusInside() && setOpen(false), CLOSE_MS)
}

/** Beim Wechsel des Modus sauber zurücksetzen */
export function sidebarReset() {
  clearTimeout(timer)
  inside = 0
  setOpen(false)
}
