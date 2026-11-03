// Erzeugt styles/tokens.css aus src/shared/palette.ts (npm run tokens).
import { PALETTE, type AccentTone, type Glass, type Neutral, type Status } from '../src/shared/palette.ts'

const HEAD = `/* ==========================================================================
   Tagwerk – Gestaltungswerte (Design-Tokens)
   ERZEUGT aus src/shared/palette.ts mit \`npm run tokens\` – nicht von Hand ändern.
   Umschalten über <html data-theme="light|dark" data-accent="…" data-motion="full|reduced">.
   ========================================================================== */
`

const STATIC = `:root {
  color-scheme: light;
  --font-ui: 'Inter Variable', 'Segoe UI Variable Text', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-display: 'Instrument Serif', Georgia, 'Times New Roman', serif;

  --fs-xs: 11.5px;
  --fs-sm: 12.5px;
  --fs-md: 13.5px;
  --fs-lg: 15px;
  --fs-xl: 19px;
  --fs-2xl: 26px;
  --fs-3xl: 38px;
  --lh-tight: 1.2;
  --lh: 1.45;
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;

  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-7: 32px;
  --sp-8: 48px;

  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 14px;
  --r-xl: 18px;
  --r-pill: 999px;

  --dur-fast: 120ms;
  --dur: 200ms;
  --dur-slow: 320ms;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);

  --titlebar: 44px;
  --sidebar-w: 224px;
  --panel-w: 380px;

  --shadow-1: 0 1px 2px rgba(20, 24, 45, 0.05), 0 1px 1px rgba(20, 24, 45, 0.03);
  --shadow-2: 0 2px 6px rgba(20, 24, 45, 0.06), 0 12px 32px -6px rgba(20, 24, 45, 0.16);
  --shadow-3: 0 4px 12px rgba(20, 24, 45, 0.08), 0 32px 72px -16px rgba(20, 24, 45, 0.3);
  --blur: saturate(170%) blur(24px);
  --blur-strong: saturate(180%) blur(40px);
}
:root[data-theme='dark'] {
  color-scheme: dark;
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-2: 0 2px 6px rgba(0, 0, 0, 0.35), 0 14px 36px -6px rgba(0, 0, 0, 0.55);
  --shadow-3: 0 4px 12px rgba(0, 0, 0, 0.4), 0 36px 80px -16px rgba(0, 0, 0, 0.7);
}
:root[data-motion='reduced'] {
  --dur-fast: 0ms;
  --dur: 0ms;
  --dur-slow: 0ms;
}
`

const rgb = (h: string, a: number) => {
  const n = h.replace('#', '')
  return `rgb(${[0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)).join(' ')} / ${a})`
}

function neutral(n: Neutral, s: Status, g: Glass, mode: 'light' | 'dark'): string {
  const dark = mode === 'dark'
  return [
    `  --glass-side: ${rgb(n.canvas, g.side)};`,
    `  --glass-main: ${rgb(n.canvas, g.main)};`,
    `  --glass-card: ${rgb(n.raised, g.card)};`,
    `  --glass-dialog: ${rgb(n.raised, g.dialog)};`,
    `  --glass-pop: ${rgb(n.raised, g.pop)};`,
    `  --wash-strength: ${Math.round(g.wash * 100)}%;`,
    // feine Kontur: innen eine helle Lichtkante, außen eine zarte Linie
    dark ? `  --glass-rim: inset 0 0 0 0.5px rgb(255 255 255 / 0.09), inset 0 1px 0 rgb(255 255 255 / 0.06);` : `  --glass-rim: inset 0 0 0 0.5px rgb(255 255 255 / 0.75), inset 0 1px 0 rgb(255 255 255 / 0.9);`,
    dark ? `  --glass-edge: 0 0 0 0.5px rgb(0 0 0 / 0.55);` : `  --glass-edge: 0 0 0 0.5px rgb(20 24 45 / 0.12);`,
    `  --bg: ${n.bg};`,
    `  --canvas: ${n.canvas};`,
    `  --raised: ${n.raised};`,
    `  --sunken: ${n.sunken};`,
    `  --ink: ${n.ink};`,
    `  --ink-2: ${n.ink2};`,
    `  --ink-3: ${n.ink3};`,
    `  --line: ${n.line};`,
    `  --line-soft: ${n.lineSoft};`,
    `  --surface-0: ${n.bg};`,
    `  --surface-1: ${n.canvas};`,
    dark ? `  --surface-2: rgba(30, 33, 46, 0.82);` : `  --surface-2: rgba(255, 255, 255, 0.86);`,
    `  --surface-2-solid: ${n.raised};`,
    dark ? `  --surface-3: rgba(5, 6, 12, 0.55);` : `  --surface-3: rgba(20, 24, 45, 0.28);`,
    dark ? `  --hover: rgba(255, 255, 255, 0.06);` : `  --hover: rgba(20, 24, 45, 0.045);`,
    dark ? `  --pressed: rgba(255, 255, 255, 0.1);` : `  --pressed: rgba(20, 24, 45, 0.08);`,
    `  --disabled-ink: ${dark ? '#5d6376' : '#9ca1b2'};`,
    `  --alert: ${s.alert};`,
    `  --alert-soft: ${s.alertSoft};`,
    `  --attention: ${s.attention};`,
    `  --attention-soft: ${s.attentionSoft};`,
    `  --ok: ${s.ok};`,
    `  --ok-soft: ${s.okSoft};`
  ].join('\n')
}

function accent(a: AccentTone): string {
  return [
    `  --accent: ${a.base};`,
    `  --accent-ink: ${a.ink};`,
    `  --accent-text: ${a.text};`,
    `  --accent-soft: ${a.soft};`,
    `  --accent-line: ${a.line};`,
    `  --selected: ${a.soft};`,
    `  --focus-ring: ${a.base};`,
    `  --ring: 0 0 0 2px var(--canvas), 0 0 0 4px ${a.base};`,
    `  --hatch: color-mix(in srgb, ${a.base} 8%, transparent);`,
    `  --wash-1: ${a.wash[0]};`,
    `  --wash-2: ${a.wash[1]};`
  ].join('\n')
}

export function renderTokens(): string {
  const out = [HEAD, STATIC]
  out.push(`:root,\n:root[data-theme='light'] {\n${neutral(PALETTE.neutral.light, PALETTE.status.light, PALETTE.glass.light, 'light')}\n}`)
  out.push(`:root[data-theme='dark'] {\n${neutral(PALETTE.neutral.dark, PALETTE.status.dark, PALETTE.glass.dark, 'dark')}\n}`)
  for (const [id, pair] of Object.entries(PALETTE.accents)) {
    const sel = id === 'indigo' ? `:root,\n:root[data-accent='indigo']` : `:root[data-accent='${id}']`
    out.push(`${sel} {\n${accent(pair.light)}\n}`)
    out.push(`:root[data-theme='dark'][data-accent='${id}']${id === 'indigo' ? `,\n:root[data-theme='dark']:not([data-accent])` : ''} {\n${accent(pair.dark)}\n}`)
  }
  return out.join('\n') + '\n'
}
