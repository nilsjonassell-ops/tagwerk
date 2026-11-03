import type { AccentId, MotionMode, Settings, ThemeMode } from './types'

export const ACCENTS: { id: AccentId; label: string }[] = [
  { id: 'indigo', label: 'Indigo' },
  { id: 'petrol', label: 'Petrol' },
  { id: 'blue', label: 'Blau' },
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
}

/** Unbekannte Werte (alte Datei, andere Version über die Cloud) fallen auf die Standards zurück. */
export function normalizeAppearance(s: Partial<Pick<Settings, 'theme' | 'accent' | 'motion'>>): Appearance {
  return {
    theme: THEMES.includes(s.theme as ThemeMode) ? (s.theme as ThemeMode) : 'system',
    accent: ACCENTS.some((a) => a.id === s.accent) ? (s.accent as AccentId) : 'indigo',
    motion: MOTIONS.includes(s.motion as MotionMode) ? (s.motion as MotionMode) : 'system'
  }
}
