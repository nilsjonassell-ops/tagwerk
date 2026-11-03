// Umschalter (Tag/Woche, Dauer …): eine Auswahlgruppe, Pfeiltasten wechseln.
import { useRef } from 'react'
import { moveIndex } from './listnav'

export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: { id: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    e.stopPropagation() // nicht zusätzlich an Fenster-Kürzel (z. B. Kalender blättern)
    const key = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 'ArrowUp' : e.key === 'Home' || e.key === 'End' ? e.key : 'ArrowDown'
    const i = moveIndex(options, options.findIndex((o) => o.id === value), key)
    if (i < 0) return
    onChange(options[i].id)
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus()
  }
  const selected = options.some((o) => o.id === value)
  return (
    <div ref={ref} className={`segmented ${className ?? ''}`} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          tabIndex={value === o.id || (!selected && i === 0) ? 0 : -1}
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
