// Kurzer Hinweis beim Überfahren oder bei Tastaturfokus (nach 500 ms).
import { cloneElement, useId, useRef, useState, type ReactElement } from 'react'
import { FloatingPortal, autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react'
import { layerRoot } from './Popover'

export function Tooltip({ label, children }: { label: string; children: ReactElement<Record<string, unknown>> }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number>(0)
  const id = useId()
  const { refs, floatingStyles, isPositioned } = useFloating({ open, placement: 'top', strategy: 'fixed', transform: false, whileElementsMounted: autoUpdate, middleware: [offset(6), flip({ padding: 6 }), shift({ padding: 6 })] })
  const show = () => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), 500)
  }
  const hide = () => {
    clearTimeout(timer.current)
    setOpen(false)
  }
  return (
    <>
      {cloneElement(children, {
        ref: refs.setReference,
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
        onKeyDown: (e: KeyboardEvent) => e.key === 'Escape' && hide(),
        'aria-describedby': open ? id : undefined
      })}
      {open && (
        <FloatingPortal root={layerRoot()}>
          <div ref={refs.setFloating} id={id} role="tooltip" className="tooltip" style={{ ...floatingStyles, visibility: isPositioned ? undefined : 'hidden' }}>
            {label}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
