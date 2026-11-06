// Farbpalette von Tagwerk – einzige Quelle für alle Farbwerte.
// styles/tokens.css wird daraus erzeugt (npm run tokens); tests/contrast.test.ts prüft WCAG AA.
import type { AccentId } from './types'

export interface Neutral {
  bg: string
  canvas: string
  raised: string
  sunken: string
  ink: string
  ink2: string
  ink3: string
  line: string
  lineSoft: string
  /** Seitenleiste (Milchglas wie in macOS) */
  side: string
}

export interface AccentTone {
  /** Füllung für Primärknöpfe, aktive Schalter, Fokusring */
  base: string
  /** Schrift auf `base` */
  ink: string
  /** Akzent als Text (Links, ausgewählte Einträge) */
  text: string
  /** weiche Akzentfläche (Auswahl, Hervorhebung) */
  soft: string
  /** Akzentlinie (Rahmen ausgewählter Elemente) */
  line: string
  /** zwei Farbtöne für den ruhigen Verlaufshintergrund */
  wash: [string, string]
}

export interface Status {
  alert: string
  alertSoft: string
  attention: string
  attentionSoft: string
  ok: string
  okSoft: string
}

/** Deckkraft der Glasflächen (0–1) und Stärke des Verlaufs im Hintergrund */
export interface Glass {
  /** Seitenleiste (Vibrancy) */
  side: number
  /** Hauptfläche */
  main: number
  /** Karten auf der Hauptfläche */
  card: number
  /** Dialoge */
  dialog: number
  /** Menüs, Popover, Toasts */
  pop: number
  /** Deckkraft der Farbflecken im Hintergrund */
  wash: number
}

type Pair<T> = { light: T; dark: T }

export const PALETTE: {
  neutral: Pair<Neutral>
  status: Pair<Status>
  glass: Pair<Glass>
  accents: Record<AccentId, Pair<AccentTone>>
} = {
  // Neutral wie macOS: reines Grau ohne Farbstich, Weiß als Arbeitsfläche, Text in Apple-Tinte
  neutral: {
    light: {
      bg: '#dfdfe3',
      canvas: '#f5f5f7',
      raised: '#ffffff',
      sunken: '#ededf0',
      ink: '#1d1d1f',
      ink2: '#424245',
      ink3: '#646469',
      line: '#d9d9de',
      lineSoft: '#ebebef',
      side: '#ebebee'
    },
    dark: {
      bg: '#0f0f10',
      canvas: '#1c1c1e',
      raised: '#2c2c2e',
      sunken: '#18181a',
      ink: '#f5f5f7',
      ink2: '#c7c7cc',
      ink3: '#a1a1a6',
      line: '#3a3a3c',
      lineSoft: '#2e2e31',
      side: '#232325'
    }
  },
  // kein Farbverlauf mehr im Hintergrund – Glas nur als Milchglas der Seitenleiste und schwebender Ebenen
  glass: {
    light: { side: 0.8, main: 0.97, card: 1, dialog: 0.88, pop: 0.9, wash: 0 },
    dark: { side: 0.82, main: 0.97, card: 0.96, dialog: 0.9, pop: 0.92, wash: 0 }
  },
  status: {
    light: { alert: '#d70015', alertSoft: '#fdecee', attention: '#a64b00', attentionSoft: '#fdf1e3', ok: '#1d7a36', okSoft: '#e6f4ea' },
    dark: { alert: '#ff6961', alertSoft: '#3b1d1c', attention: '#ffb340', attentionSoft: '#3a2a12', ok: '#32d74b', okSoft: '#16301c' }
  },
  accents: {
    indigo: {
      light: { base: '#3a5af0', ink: '#ffffff', text: '#3150e0', soft: '#e8ecfe', line: '#b7c3fb', wash: ['#9fb2ff', '#f2b8dc'] },
      dark: { base: '#8fa3ff', ink: '#0c1233', text: '#a5b5ff', soft: '#1e2550', line: '#3a4794', wash: ['#2a3a9a', '#6a2a6e'] }
    },
    petrol: {
      light: { base: '#1c6570', ink: '#ffffff', text: '#1a5f69', soft: '#e0eff0', line: '#a6ced2', wash: ['#9fd3d6', '#b9d7f2'] },
      dark: { base: '#74bcc3', ink: '#0d1e20', text: '#8acbd1', soft: '#173235', line: '#2f5f64', wash: ['#174f55', '#1e3760'] }
    },
    // Systemblau wie bei Apple (Standard)
    blue: {
      light: { base: '#0071e3', ink: '#ffffff', text: '#0066cc', soft: '#e8f1fc', line: '#a9cbf3', wash: ['#a3cdfa', '#bfe4f5'] },
      dark: { base: '#0a74e6', ink: '#ffffff', text: '#5eaeff', soft: '#16314f', line: '#2d5687', wash: ['#16457e', '#174f66'] }
    },
    green: {
      light: { base: '#1d7346', ink: '#ffffff', text: '#1b6b41', soft: '#e2f2e8', line: '#a7d4b8', wash: ['#a9dcbc', '#d4e9b4'] },
      dark: { base: '#6fd09c', ink: '#0a2416', text: '#85dbac', soft: '#15301f', line: '#2d6243', wash: ['#195536', '#3c5218'] }
    },
    amber: {
      light: { base: '#9a5300', ink: '#ffffff', text: '#8f4d00', soft: '#fbeedb', line: '#ecc58e', wash: ['#f5cf96', '#f6b9a4'] },
      dark: { base: '#f2b35a', ink: '#2b1800', text: '#f5c27a', soft: '#36260f', line: '#6e4d1c', wash: ['#6a4310', '#6a2a1c'] }
    },
    rose: {
      light: { base: '#c22d5c', ink: '#ffffff', text: '#b52855', soft: '#fce6ed', line: '#f1b0c4', wash: ['#f6b0c8', '#d8b8f5'] },
      dark: { base: '#ff8fb1', ink: '#330a19', text: '#ffa3bf', soft: '#3d1a27', line: '#7a3550', wash: ['#6e1f40', '#4b2373'] }
    },
    graphite: {
      light: { base: '#48484d', ink: '#ffffff', text: '#3a3a3e', soft: '#ececef', line: '#c7c7cc', wash: ['#d1d1d6', '#dcdce0'] },
      dark: { base: '#c7c7cc', ink: '#1c1c1e', text: '#d1d1d6', soft: '#38383b', line: '#545458', wash: ['#2c2c2e', '#3a3a3c'] }
    }
  }
}
