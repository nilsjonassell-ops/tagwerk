// Einstellungen → Darstellung: Modus als Vorschaukarten, Akzentfarbe als Farbfelder.
import { useRef } from 'react'
import { Check } from 'lucide-react'
import { ACCENTS } from '@shared/appearance'
import { PALETTE } from '@shared/palette'
import type { AccentId, ThemeMode } from '@shared/types'
import { useStore } from '@/lib/store'
import { moveIndex } from './ui/listnav'
import { Tooltip } from './ui'

/** Pfeiltasten wechseln die Auswahl in einer Gruppe von Radio-Knöpfen (wie bei nativen Radios). */
function useRadioKeys<T extends string>(ids: T[], value: T, onChange: (v: T) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const key = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 'ArrowUp' : e.key === 'Home' || e.key === 'End' ? e.key : 'ArrowDown'
    const i = moveIndex(ids.map((id) => ({ label: id })), ids.indexOf(value), key)
    onChange(ids[i])
    ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus()
  }
  return { ref, onKeyDown }
}

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'Wie Windows' },
  { id: 'light', label: 'Hell' },
  { id: 'dark', label: 'Dunkel' }
]

/** Mini-Ansicht von Tagwerk im jeweiligen Modus */
function ModePreview({ mode, accent }: { mode: 'light' | 'dark'; accent: AccentId }) {
  const n = PALETTE.neutral[mode]
  const a = PALETTE.accents[accent][mode]
  return (
    <span className="mode-preview" style={{ background: n.bg }} aria-hidden="true">
      <span className="mp-side" style={{ background: n.canvas, boxShadow: `0 0 0 1px ${n.lineSoft}` }}>
        <i style={{ background: a.base }} />
        <i style={{ background: n.line }} />
        <i style={{ background: n.line }} />
      </span>
      <span className="mp-main" style={{ background: n.canvas, boxShadow: `0 0 0 1px ${n.lineSoft}` }}>
        <b style={{ background: n.ink }} />
        <span className="mp-card" style={{ background: n.raised, boxShadow: `0 0 0 1px ${n.lineSoft}` }}>
          <i style={{ background: n.ink3 }} />
          <i style={{ background: n.line }} />
        </span>
        <span className="mp-btn" style={{ background: a.base }} />
      </span>
    </span>
  )
}

export function ModeCards({ value, onChange }: { value: ThemeMode; onChange: (v: ThemeMode) => void }) {
  const accent = useStore((s) => s.settings.accent)
  const keys = useRadioKeys(MODES.map((m) => m.id), value, onChange)
  return (
    <div className="mode-cards" role="radiogroup" aria-label="Modus" ref={keys.ref} onKeyDown={keys.onKeyDown}>
      {MODES.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={value === m.id} tabIndex={value === m.id ? 0 : -1} className="mode-card" onClick={() => onChange(m.id)}>
          {m.id === 'system' ? (
            <span className="mode-split">
              <ModePreview mode="light" accent={accent} />
              <ModePreview mode="dark" accent={accent} />
            </span>
          ) : (
            <ModePreview mode={m.id} accent={accent} />
          )}
          <span className="mode-label">
            {value === m.id && <Check aria-hidden="true" />}
            {m.label}
          </span>
        </button>
      ))}
    </div>
  )
}

export function AccentPicker({ value, onChange }: { value: AccentId; onChange: (v: AccentId) => void }) {
  const mode = useStore((s) => s.resolvedTheme) === 'dark' ? 'dark' : 'light'
  const keys = useRadioKeys(ACCENTS.map((a) => a.id), value, onChange)
  const current = ACCENTS.find((a) => a.id === value)
  return (
    <div className="accent-picker">
      <div className="accent-swatches" role="radiogroup" aria-label="Akzentfarbe" ref={keys.ref} onKeyDown={keys.onKeyDown}>
        {ACCENTS.map((a) => {
          const tone = PALETTE.accents[a.id][mode]
          return (
            <Tooltip key={a.id} label={a.label}>
              <button type="button" role="radio" aria-checked={value === a.id} aria-label={a.label} tabIndex={value === a.id ? 0 : -1} className="accent-swatch" style={{ '--sw': tone.base, '--sw-ink': tone.ink } as React.CSSProperties} onClick={() => onChange(a.id)}>
                {value === a.id && <Check aria-hidden="true" />}
              </button>
            </Tooltip>
          )
        })}
      </div>
      <span className="accent-name" aria-hidden="true">
        {current?.label}
      </span>
    </div>
  )
}
