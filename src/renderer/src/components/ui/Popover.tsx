// Grundlage für alles Schwebende (Menüs, Auswahllisten, kleine Panels).
// Liegt in einer eigenen obersten Ebene (#layer-root) außerhalb jeder Animation,
// klappt an Fensterkanten um und folgt dem Auslöser beim Scrollen und Animieren.
import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react'
import { popoverOpen } from '@/lib/dockHold'
import { FloatingFocusManager, FloatingPortal, autoUpdate, flip, offset, shift, size, useDismiss, useFloating, useInteractions, useRole, type Placement } from '@floating-ui/react'

let layer: HTMLElement | null = null
/** Oberste Ebene für schwebende Elemente (wird bei Bedarf angelegt). */
export function layerRoot(): HTMLElement {
  if (layer?.isConnected) return layer
  layer = document.getElementById('layer-root') ?? Object.assign(document.createElement('div'), { id: 'layer-root' })
  if (!layer.isConnected) document.body.appendChild(layer)
  return layer
}

export interface PopoverProps {
  open: boolean
  onClose: () => void
  anchor: Element | null
  children: ReactNode
  placement?: Placement
  /** Rolle für Bildschirmleser */
  role?: 'menu' | 'listbox' | 'dialog'
  label?: string
  id?: string
  className?: string
  style?: CSSProperties
  /** Mindestens so breit wie der Auslöser */
  matchWidth?: boolean
  /** Erster Fokus: ein Element im Popover; Standard ist der Popover selbst */
  initialFocus?: React.MutableRefObject<HTMLElement | null>
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

export function Popover(p: PopoverProps) {
  const { refs, floatingStyles, context, placement, isPositioned } = useFloating({
    open: p.open,
    onOpenChange: (o) => !o && p.onClose(),
    elements: { reference: p.anchor },
    placement: p.placement ?? 'bottom-start',
    strategy: 'fixed',
    // Position über left/top statt transform – transform gehört der Einblend-Animation
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 8, fallbackAxisSideDirection: 'end' }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, rects, elements }) {
          elements.floating.style.maxHeight = `${Math.max(140, Math.min(availableHeight, 420))}px`
          if (p.matchWidth) elements.floating.style.minWidth = `${rects.reference.width}px`
        }
      })
    ]
  })
  const self = useRef<HTMLElement | null>(null)
  // Angedocktes Fenster nicht einfahren, solange ein Menü offen ist
  useEffect(() => {
    if (!p.open) return
    popoverOpen(1)
    return () => popoverOpen(-1)
  }, [p.open])
  const dismiss = useDismiss(context, { outsidePressEvent: 'mousedown', escapeKey: false })
  const role = useRole(context, { role: p.role === 'listbox' ? 'listbox' : p.role === 'menu' ? 'menu' : 'dialog' })
  const { getFloatingProps } = useInteractions([dismiss, role])
  if (!p.open || !p.anchor) return null
  const side = placement.split('-')[0]
  return (
    <FloatingPortal root={layerRoot()}>
      <FloatingFocusManager context={context} modal={false} initialFocus={p.initialFocus ?? self} returnFocus>
        <div
          ref={(el) => {
            self.current = el
            refs.setFloating(el)
          }}
          id={p.id}
          className={`popover ${p.className ?? ''}`}
          data-side={side}
          aria-label={p.label}
          // Erst zeigen, wenn die Position berechnet ist – sonst blitzt das Menü kurz oben links auf
          style={{ ...floatingStyles, ...p.style, visibility: isPositioned ? undefined : 'hidden' }}
          {...getFloatingProps({
            tabIndex: -1,
            // Tasten gehören dem Popover: nicht an Fenster-Kürzel (Posteingang ↓, Dialog-Esc …) weiterreichen
            onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
              e.stopPropagation()
              if (e.key === 'Escape') {
                e.preventDefault()
                p.onClose()
                return
              }
              p.onKeyDown?.(e)
            }
          })}
          role={p.role}
        >
          {p.children}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  )
}
