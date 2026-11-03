// Aktionsmenü: ↑ ↓ Pos1 Ende, Anfangsbuchstaben, Enter/Leertaste, Esc. Gefährliche Einträge stehen zuletzt.
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import type { Placement } from '@floating-ui/react'
import { Popover } from './Popover'
import { moveIndex, typeahead } from './listnav'

export type MenuItem =
  | 'sep'
  | {
      id: string
      label: string
      icon?: ReactNode
      /** Tastaturhinweis rechts */
      hint?: string
      /** zweite Zeile */
      sub?: string
      checked?: boolean
      danger?: boolean
      disabled?: boolean
      onSelect: () => void
    }

export interface MenuTriggerProps {
  ref: (el: HTMLElement | null) => void
  onClick: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
}

export function Menu(p: {
  trigger: (props: MenuTriggerProps) => ReactNode
  items: MenuItem[]
  label: string
  placement?: Placement
  /** Text über den Einträgen */
  header?: ReactNode
  /** Zusatzinhalt unter den Einträgen (z. B. eigenes Datum); erhält `close` */
  footer?: (close: () => void) => ReactNode
  /** optional von außen gesteuert */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [own, setOwn] = useState(false)
  const open = p.open ?? own
  const setOpen = useCallback((v: boolean) => (p.onOpenChange ? p.onOpenChange(v) : setOwn(v)), [p])
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const typed = useRef({ q: '', t: 0 })
  const startAt = useRef<'first' | 'last' | null>(null)

  // Gefährliche Einträge immer zuletzt, mit Trennlinie davor
  const safe = p.items.filter((i) => i === 'sep' || !i.danger)
  const danger = p.items.filter((i) => i !== 'sep' && i.danger)
  const items = danger.length ? [...safe.filter((_, i, a) => !(i === a.length - 1 && a[i] === 'sep')), 'sep' as const, ...danger] : safe
  const entries = items.filter((i): i is Exclude<MenuItem, 'sep'> => i !== 'sep')

  const buttons = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])
  const focusAt = (i: number) => i >= 0 && buttons()[i]?.focus()
  const current = () => buttons().indexOf(document.activeElement as HTMLButtonElement)

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.menu-footer')) return
    const nav = entries.map((x) => ({ label: x.label, disabled: x.disabled }))
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault()
      focusAt(moveIndex(nav, current(), e.key))
    } else if (e.key === 'Tab') {
      setOpen(false)
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now()
      typed.current = { q: now - typed.current.t < 700 ? typed.current.q + e.key : e.key, t: now }
      focusAt(typeahead(nav, current(), typed.current.q))
    }
  }

  const triggerProps: MenuTriggerProps = {
    ref: setAnchor,
    onClick: () => setOpen(!open),
    onKeyDown: (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        startAt.current = e.key === 'ArrowDown' ? 'first' : 'last'
        setOpen(true)
      }
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open
  }

  const close = () => setOpen(false)
  return (
    <>
      {p.trigger(triggerProps)}
      <Popover open={open} onClose={close} anchor={anchor} role="menu" label={p.label} placement={p.placement} className="menu" onKeyDown={onKeyDown}>
        <div
          ref={(el) => {
            list.current = el
            if (el && startAt.current) {
              const nav = entries.map((x) => ({ label: x.label, disabled: x.disabled }))
              const i = moveIndex(nav, -1, startAt.current === 'first' ? 'Home' : 'End')
              startAt.current = null
              requestAnimationFrame(() => focusAt(i))
            }
          }}
          className="menu-list"
        >
          {p.header && <div className="menu-header">{p.header}</div>}
          {items.map((it, i) =>
            it === 'sep' ? (
              <div key={`sep${i}`} className="menu-sep" role="separator" />
            ) : (
              <button
                key={it.id}
                type="button"
                role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.checked}
                tabIndex={-1}
                disabled={it.disabled}
                className={`menu-item ${it.danger ? 'danger' : ''}`}
                onClick={() => {
                  close()
                  it.onSelect()
                }}
              >
                <span className="menu-icon" aria-hidden="true">
                  {it.checked ? <Check /> : it.icon}
                </span>
                <span className="menu-text">
                  <span className="menu-label">{it.label}</span>
                  {it.sub && <span className="menu-sub">{it.sub}</span>}
                </span>
                {it.hint && <kbd className="menu-hint">{it.hint}</kbd>}
              </button>
            )
          )}
        </div>
        {p.footer && <div className="menu-footer">{p.footer(close)}</div>}
      </Popover>
    </>
  )
}
