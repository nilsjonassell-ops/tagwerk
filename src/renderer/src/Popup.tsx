// Pop-ups unten rechts auf dem Bildschirm (eigenes, durchsichtiges Fenster).
// E-Mails verschwinden nach ein paar Sekunden von selbst – solange die Maus
// darüber ist, bleiben sie stehen. Termine und Updates bleiben, bis man sie schließt.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bell, CalendarClock, Mail, Sparkles, Sun, Target, X } from 'lucide-react'
import type { PopupAction, PopupItem } from '@shared/types'
import { chime } from '@/lib/sound'

const LIFETIME_MS = 9000

const ICONS: Record<string, typeof Mail> = {
  mail: Mail,
  event: CalendarClock,
  update: Sparkles,
  brief: Sun,
  focus: Target
}

export function Popup() {
  const [items, setItems] = useState<PopupItem[]>([])
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  const seen = useRef(new Set<string>())
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.classList.add('popup-root')
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const theme = () =>
      window.tagwerk.settings.get().then((s) => {
        document.documentElement.dataset.theme = s.theme === 'system' ? (mq.matches ? 'dark' : 'light') : s.theme
      })
    void theme()
    const off = window.tagwerk.popup.onItems((next) => {
      void theme()
      setItems(next)
      setLeaving(new Set())
      const fresh = next.filter((i) => !seen.current.has(`${i.id}@${i.at}`))
      fresh.forEach((i) => seen.current.add(`${i.id}@${i.at}`))
      if (fresh.some((i) => i.sound)) chime('notify')
    })
    window.tagwerk.popup.ready()
    return off
  }, [])

  // Fenstergröße folgt dem Inhalt
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const report = () => window.tagwerk.popup.size(items.length ? el.offsetHeight : 0)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [items.length])

  const act = (item: PopupItem, action: PopupAction['id'] | 'dismiss') => {
    if (leaving.has(item.id)) return
    setLeaving((s) => new Set(s).add(item.id))
    // erst ausblenden, dann melden
    setTimeout(() => window.tagwerk.popup.action(item.id, action), 240)
  }

  return (
    <div className="pop-wrap" ref={wrap}>
      {items.map((it) => {
        const Icon = ICONS[it.kind] ?? Bell
        const open = it.actions.find((a) => a.id === 'open')
        return (
          <div
            key={`${it.id}@${it.at}`}
            className={`pop-card kind-${it.kind} ${leaving.has(it.id) ? 'leaving' : ''} ${open ? 'clickable' : ''}`}
            role="alert"
            onClick={() => open && act(it, 'open')}
          >
            <div className="pop-icon">
              <Icon />
            </div>
            <div className="pop-main">
              <div className="pop-meta">
                <span>{it.meta ?? 'Tagwerk'}</span>
                <span className="pop-dot">·</span>
                <span>jetzt</span>
              </div>
              <div className="pop-title">{it.title}</div>
              {it.lines && it.lines.length > 0 ? (
                <>
                  <ul className="pop-lines">
                    {it.lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                  {it.body && <div className="pop-more">{it.body}</div>}
                </>
              ) : (
                it.body && <div className="pop-body">{it.body}</div>
              )}
              {it.actions.length > 0 && (
                <div className="pop-actions">
                  {it.actions.map((a) => (
                    <button
                      key={a.id}
                      className={`pop-btn ${a.primary ? 'primary' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        act(it, a.id)
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="pop-close"
              aria-label="Schließen"
              onClick={(e) => {
                e.stopPropagation()
                act(it, 'dismiss')
              }}
            >
              <X />
            </button>
            {!it.sticky && <span className="pop-life" style={{ animationDuration: `${LIFETIME_MS}ms` }} onAnimationEnd={() => act(it, 'dismiss')} />}
          </div>
        )
      })}
    </div>
  )
}
