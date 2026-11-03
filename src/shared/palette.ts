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
  neutral: {
    light: {
      bg: '#eceef5',
      canvas: '#f7f8fb',
      raised: '#ffffff',
      sunken: '#eef0f5',
      ink: '#141726',
      ink2: '#454a5d',
      ink3: '#5b6175',
      line: '#dcdfe8',
      lineSoft: '#e8eaf0'
    },
    dark: {
      bg: '#0b0d14',
      canvas: '#12141d',
      raised: '#191c27',
      sunken: '#0f1119',
      ink: '#eceef5',
      ink2: '#b6bbcb',
      ink3: '#9097aa',
      line: '#2a2e3c',
      lineSoft: '#212432'
    }
  },
  glass: {
    light: { side: 0.62, main: 0.72, card: 0.7, dialog: 0.8, pop: 0.82, wash: 0.85 },
    dark: { side: 0.55, main: 0.7, card: 0.62, dialog: 0.82, pop: 0.84, wash: 0.6 }
  },
  status: {
    light: { alert: '#c0243f', alertSoft: '#fbe7ea', attention: '#93520a', attentionSoft: '#f8ecd9', ok: '#16704f', okSoft: '#e1f2ea' },
    dark: { alert: '#ff8a9a', alertSoft: '#3a1c24', attention: '#f0b25a', attentionSoft: '#352914', ok: '#6fd3a5', okSoft: '#16302a' }
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
    blue: {
      light: { base: '#0b6bcb', ink: '#ffffff', text: '#0a63bd', soft: '#e3effc', line: '#a9cbf3', wash: ['#a3cdfa', '#bfe4f5'] },
      dark: { base: '#6cb2ff', ink: '#06182e', text: '#86c0ff', soft: '#132b47', line: '#2d5687', wash: ['#16457e', '#174f66'] }
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
      light: { base: '#3d4354', ink: '#ffffff', text: '#3a4050', soft: '#e9ebf0', line: '#c2c6d1', wash: ['#c9cfdc', '#dcd7e6'] },
      dark: { base: '#c4c9d6', ink: '#14161d', text: '#d0d4df', soft: '#252834', line: '#4a4f60', wash: ['#2c3142', '#352d42'] }
    }
  }
}
