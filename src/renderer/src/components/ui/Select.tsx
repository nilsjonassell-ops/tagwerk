// Auswahlfeld als Ersatz für das native <select>: gleiche Bedienung per Tastatur,
// gestaltbar, mit Gruppen, Hinweisen und optionaler Suche.
import { useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Popover } from './Popover'
import { findOption, moveIndex, typeahead } from './listnav'

export interface SelectOption<V extends string = string> {
  value: V
  label: string
  group?: string
  hint?: string
  disabled?: boolean
}

export function Select<V extends string = string>(p: {
  value: V | undefined | null
  onChange: (v: V) => void
  options: SelectOption<V>[]
  'aria-label': string
  placeholder?: string
  /** Suchfeld; Standard: ab 8 Einträgen */
  searchable?: boolean
  disabled?: boolean
  className?: string
  style?: CSSProperties
  size?: 'small'
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const typed = useRef({ q: '', t: 0 })
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const uid = useId()
  const searchable = p.searchable ?? p.options.length >= 8
  const current = findOption(p.options, p.value)

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('de-DE')
    return q ? p.options.filter((o) => `${o.label} ${o.hint ?? ''} ${o.group ?? ''}`.toLocaleLowerCase('de-DE').includes(q)) : p.options
  }, [p.options, query])

  const show = (start?: 'first' | 'last') => {
    if (p.disabled) return
    setQuery('')
    const idx = p.options.findIndex((o) => o.value === p.value)
    setActive(start === 'first' ? moveIndex(p.options, -1, 'Home') : start === 'last' ? moveIndex(p.options, -1, 'End') : idx >= 0 ? idx : moveIndex(p.options, -1, 'Home'))
    setOpen(true)
  }
  const pick = (o: SelectOption<V> | undefined) => {
    if (!o || o.disabled) return
    setOpen(false)
    if (o.value !== p.value) p.onChange(o.value)
  }

  const typeTo = (key: string, list: SelectOption<V>[], from: number): number => {
    const now = Date.now()
    typed.current = { q: now - typed.current.t < 700 ? typed.current.q + key : key, t: now }
    return typeahead(list, from, typed.current.q)
  }

  // Geschlossen: wie beim nativen Feld Enter/Leertaste/Pfeile öffnen, Buchstaben wählen direkt
  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      show()
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = typeTo(e.key, p.options, p.options.findIndex((o) => o.value === p.value))
      if (i >= 0) pick(p.options[i])
    }
  }

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      if (searchable && (e.key === 'Home' || e.key === 'End')) return // im Suchfeld: Cursor bewegen
      e.preventDefault()
      setActive((a) => moveIndex(shown, a, e.key))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(shown[active])
    } else if (e.key === 'Tab') {
      setOpen(false)
    } else if (!searchable && e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = typeTo(e.key, shown, active)
      if (i >= 0) setActive(i)
    }
  }

  // aktiven Eintrag sichtbar halten
  const scrollActive = (el: HTMLElement | null) => el?.scrollIntoView({ block: 'nearest' })

  let lastGroup: string | undefined
  const listId = `${uid}-list`
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        id={p.id}
        role="combobox"
        aria-label={p['aria-label']}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={p.disabled}
        className={`select select-btn ${p.size === 'small' ? 'small' : ''} ${current ? '' : 'is-placeholder'} ${p.className ?? ''}`}
        style={p.style}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onTriggerKey}
      >
        <span className="select-value">{current?.label ?? p.placeholder ?? 'Bitte wählen'}</span>
        <ChevronDown className="select-chev" aria-hidden="true" />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        className="select-pop"
        matchWidth
        initialFocus={searchable ? searchRef : listRef}
        onKeyDown={onListKey}
      >
        {searchable && (
          <label className="select-search">
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              placeholder="Suchen …"
              aria-label={`${p['aria-label']} durchsuchen`}
              aria-controls={listId}
              aria-activedescendant={active >= 0 ? `${uid}-o${active}` : undefined}
            />
          </label>
        )}
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={p['aria-label']}
          tabIndex={-1}
          className="select-list"
          aria-activedescendant={!searchable && active >= 0 ? `${uid}-o${active}` : undefined}
        >
          {shown.length === 0 && <div className="select-empty">Nichts gefunden</div>}
          {shown.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? o.group : null
            lastGroup = o.group
            return (
              <div key={o.value} role="presentation">
                {head && (
                  <div className="select-group" role="presentation">
                    {head}
                  </div>
                )}
                <div
                  id={`${uid}-o${i}`}
                  ref={i === active ? scrollActive : undefined}
                  role="option"
                  aria-selected={o.value === p.value}
                  aria-disabled={o.disabled || undefined}
                  className={`select-option ${i === active ? 'active' : ''}`}
                  onMouseMove={() => !o.disabled && active !== i && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                >
                  <span className="select-check" aria-hidden="true">
                    {o.value === p.value && <Check />}
                  </span>
                  <span className="select-label">{o.label}</span>
                  {o.hint && <span className="select-hint">{o.hint}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </Popover>
    </>
  )
}
