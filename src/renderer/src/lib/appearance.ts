// Setzt Modus, Akzentfarbe und Bewegung auf <html> – für Hauptfenster, Pop-up und Schnellnotiz gleich.
import { normalizeAppearance } from '@shared/appearance'
import type { Settings } from '@shared/types'

type Input = Partial<Pick<Settings, 'theme' | 'accent' | 'motion'>>

/** Wendet das Erscheinungsbild an und folgt danach den Windows-Einstellungen. Rückgabe: Abmelden. */
export function applyAppearance(input: Input, onResolved?: (theme: 'light' | 'dark') => void): () => void {
  const a = normalizeAppearance(input)
  const dark = window.matchMedia('(prefers-color-scheme: dark)')
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
  const root = document.documentElement
  const apply = () => {
    const theme = a.theme === 'system' ? (dark.matches ? 'dark' : 'light') : a.theme
    root.dataset.theme = theme
    root.dataset.accent = a.accent
    root.dataset.motion = a.motion === 'reduced' || reduce.matches ? 'reduced' : 'full'
    onResolved?.(theme)
  }
  apply()
  dark.addEventListener('change', apply)
  reduce.addEventListener('change', apply)
  return () => {
    dark.removeEventListener('change', apply)
    reduce.removeEventListener('change', apply)
  }
}
