import { useEffect, useRef, type ReactNode } from 'react'
import { FlaskConical, X } from 'lucide-react'
import type { Priority, Source } from '@shared/types'
import { PRIORITY_LABEL } from '@/lib/format'

export function Dialog(props: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  labelledBy?: string
  bodyClass?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('.dialog-body input, .dialog-body textarea, .dialog-body select')
    ;(first ?? el)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        props.onClose()
      }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'))
        if (!f.length) return
        const i = f.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey && i <= 0) {
          e.preventDefault()
          f[f.length - 1].focus()
        } else if (!e.shiftKey && i === f.length - 1) {
          e.preventDefault()
          f[0].focus()
        }
      }
    }
    el?.addEventListener('keydown', onKey)
    return () => {
      el?.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`dialog ${props.wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={props.title} ref={ref} tabIndex={-1} style={{ outline: 'none' }}>
        <div className="dialog-head">
          <h2>{props.title}</h2>
          <button className="btn ghost icon-btn small dialog-close" onClick={props.onClose} aria-label="Schließen">
            <X />
          </button>
        </div>
        <div className={props.bodyClass ?? 'dialog-body'}>{props.children}</div>
        {props.footer && <div className="dialog-foot">{props.footer}</div>}
      </div>
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
}

export function PriorityMark({ p }: { p: Priority }) {
  return (
    <span className={`prio ${p}`} title={`Priorität: ${PRIORITY_LABEL[p]}`} aria-label={`Priorität ${PRIORITY_LABEL[p]}`}>
      <i />
      <i />
      <i />
    </span>
  )
}

export function SourceTag({ source }: { source: Source }) {
  if (source === 'demo')
    return (
      <span className="tag demo" title="Beispieldaten aus der Demo-Datenquelle">
        <FlaskConical /> Demo
      </span>
    )
  if (source === 'ics') return <span className="tag" title="Aus einer Kalenderdatei importiert, schreibgeschützt">Importiert</span>
  return null
}

export function Empty({ icon, title, children, compact }: { icon?: ReactNode; title: string; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={`empty ${compact ? 'compact' : ''}`}>
      {icon}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}

export function ViewHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="view-header drag">
      <div className="view-title">{title}</div>
      <div className="spacer" />
      <div className="actions no-drag">{children}</div>
    </header>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
