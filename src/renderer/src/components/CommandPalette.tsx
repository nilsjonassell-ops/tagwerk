import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, CheckSquare, FolderKanban, Mail, NotebookPen, Plus, Search, Settings, Sparkles, Moon, Keyboard, CalendarPlus, Target } from 'lucide-react'
import { search, type SearchHit } from '@shared/analysis'
import { useFocus } from '@/lib/focus'
import type { ViewId } from '@shared/types'
import { useStore } from '@/lib/store'
import { createNote } from '@/lib/actions'
import { VIEW_META } from './Sidebar'

interface Item {
  id: string
  group: string
  label: string
  side?: string
  icon: typeof Search
  run: () => void
}

const KIND_ICON: Record<SearchHit['kind'], typeof Search> = { task: CheckSquare, event: CalendarDays, email: Mail, note: NotebookPen, project: FolderKanban }
const KIND_VIEW: Record<SearchHit['kind'], ViewId> = { task: 'tasks', event: 'calendar', email: 'inbox', note: 'notes', project: 'projects' }

export function CommandPalette() {
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const st = useStore.getState
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const close = () => st().set({ paletteOpen: false })

  const commands: Item[] = useMemo(
    () => [
      { id: 'c-task', group: 'Aktionen', label: 'Neue Aufgabe', side: 'N', icon: Plus, run: () => st().openDialog({ kind: 'task' }) },
      { id: 'c-event', group: 'Aktionen', label: 'Neuer Termin', icon: CalendarPlus, run: () => st().openDialog({ kind: 'event' }) },
      { id: 'c-note', group: 'Aktionen', label: 'Neue Notiz', icon: NotebookPen, run: () => (close(), createNote()) },
      { id: 'c-focus', group: 'Aktionen', label: 'Fokus starten', icon: Target, run: () => (close(), useFocus.getState().show(true)) },
      { id: 'c-plan', group: 'Aktionen', label: 'Aufgaben in freie Zeit einplanen', icon: CalendarDays, run: () => st().openDialog({ kind: 'plan' }) },
      ...(st().settings.claude.enabled
        ? [
            { id: 'c-ai', group: 'Aktionen', label: 'Claude fragen', icon: Sparkles, run: () => (close(), st().setAssistant(true)) },
            { id: 'c-brief', group: 'Aktionen', label: 'Tagesübersicht mit Claude erstellen', icon: Sparkles, run: () => (close(), st().setAssistant(true, 'Erstelle meine Tagesübersicht für heute.')) }
          ]
        : []),
      ...(Object.keys(VIEW_META) as ViewId[]).map((v) => ({ id: `v-${v}`, group: 'Gehe zu', label: VIEW_META[v].label, icon: VIEW_META[v].icon, run: () => st().go(v) })),
      {
        id: 'c-theme',
        group: 'Einstellungen',
        label: 'Hell/Dunkel umschalten',
        icon: Moon,
        run: () => (close(), st().updateSettings({ theme: st().resolvedTheme === 'dark' ? 'light' : 'dark' }))
      },
      { id: 'c-settings', group: 'Einstellungen', label: 'Einstellungen öffnen', icon: Settings, run: () => st().openDialog({ kind: 'settings' }) },
      { id: 'c-keys', group: 'Einstellungen', label: 'Tastenkürzel anzeigen', icon: Keyboard, run: () => st().openDialog({ kind: 'shortcuts' }) }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.theme]
  )

  const items: Item[] = useMemo(() => {
    const term = q.trim().toLowerCase()
    const cmds = term ? commands.filter((c) => c.label.toLowerCase().includes(term)) : commands
    const hits: Item[] = search(data, q, 30).map((h) => ({
      id: `${h.kind}-${h.id}`,
      group: 'Treffer',
      label: h.title,
      side: h.detail,
      icon: KIND_ICON[h.kind],
      run: () => {
        if (h.kind === 'task') st().openDialog({ kind: 'task', id: h.id })
        else st().go(KIND_VIEW[h.kind], h.id)
      }
    }))
    return [...hits, ...cmds]
  }, [q, data, commands, st])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[active]?.run()
      if (useStore.getState().paletteOpen) close()
    } else if (e.key === 'Escape') {
      close()
    }
  }

  let lastGroup = ''
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Suchen und Befehle">
        <div className="palette-input">
          <Search aria-hidden="true" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Suche in Aufgaben, Terminen, E-Mails, Notizen – oder Befehl eingeben"
            aria-label="Suche"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pi-${items[active].id}` : undefined}
          />
        </div>
        <div className="palette-list" ref={listRef} id="palette-list" role="listbox">
          {items.length === 0 && <div className="empty compact">Keine Treffer für „{q}“.</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <div className="palette-group">{it.group}</div> : null
            lastGroup = it.group
            return (
              <div key={it.id}>
                {header}
                <button
                  id={`pi-${it.id}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === active}
                  className={`palette-item ${i === active ? 'active' : ''}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => {
                    it.run()
                    if (useStore.getState().paletteOpen) close()
                  }}
                >
                  <it.icon aria-hidden="true" />
                  <span className="grow">{it.label}</span>
                  {it.side && <span className="side">{it.side}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> auswählen
          </span>
          <span>
            <kbd>Enter</kbd> öffnen
          </span>
          <span>
            <kbd>Esc</kbd> schließen
          </span>
        </div>
      </div>
    </div>
  )
}
