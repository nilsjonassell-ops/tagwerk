import type { AccentId, MotionMode, Settings, SidebarMode, ThemeMode } from './types'

export const ACCENTS: { id: AccentId; label: string }[] = [
  { id: 'blue', label: 'Blau' },
  { id: 'indigo', label: 'Indigo' },
  { id: 'petrol', label: 'Petrol' },
  { id: 'green', label: 'Grün' },
  { id: 'amber', label: 'Bernstein' },
  { id: 'rose', label: 'Rose' },
  { id: 'graphite', label: 'Graphit' }
]

const THEMES: ThemeMode[] = ['system', 'light', 'dark']
const MOTIONS: MotionMode[] = ['system', 'reduced']

export interface Appearance {
  theme: ThemeMode
  accent: AccentId
  motion: MotionMode
  designRev: number
}

/** Stand des Erscheinungsbilds: 2 = neutrales macOS-Design mit Systemblau als Standard */
export const DESIGN_REV = 2

/** Unbekannte Werte (alte Datei, andere Version über die Cloud) fallen auf die Standards zurück. */
export function normalizeAppearance(s: Partial<Pick<Settings, 'theme' | 'accent' | 'motion' | 'designRev'>>): Appearance {
  // Indigo war bis Stand 1 nur der Standard (nie bewusst gewählt) → auf das neue Systemblau umstellen
  const legacy = (s.designRev ?? 0) < DESIGN_REV && s.accent === 'indigo'
  return {
    theme: THEMES.includes(s.theme as ThemeMode) ? (s.theme as ThemeMode) : 'system',
    accent: !legacy && ACCENTS.some((a) => a.id === s.accent) ? (s.accent as AccentId) : 'blue',
    designRev: DESIGN_REV,
    motion: MOTIONS.includes(s.motion as MotionMode) ? (s.motion as MotionMode) : 'system'
  }
}

/** Seitenleiste: Standard „automatisch“ (Streifen am Rand, fährt beim Überfahren aus) */
export function normalizeSidebarMode(v: unknown): SidebarMode {
  return v === 'pinned' ? 'pinned' : 'auto'
}
