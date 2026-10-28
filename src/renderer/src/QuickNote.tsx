import { useEffect, useRef, useState } from 'react'
import { NotebookPen } from 'lucide-react'
import { modKey } from '@/lib/format'

/** Kleines, rahmenloses Fenster für die systemweite Schnellnotiz. */
export function QuickNote() {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    window.tagwerk.settings.get().then((s) => {
      document.documentElement.dataset.theme = s.theme === 'system' ? (mq.matches ? 'dark' : 'light') : s.theme
    })
    ref.current?.focus()
  }, [])

  const save = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    await window.tagwerk.quickNote.save(text)
  }

  return (
    <div className="quicknote">
      <div className="quicknote-head drag">
        <NotebookPen aria-hidden="true" /> Schnellnotiz
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Gedanke, Idee oder To-do festhalten …"
        aria-label="Schnellnotiz"
        onKeyDown={(e) => {
          if (e.key === 'Escape') window.tagwerk.quickNote.close()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
        }}
      />
      <div className="quicknote-foot">
        <span>
          <kbd>{modKey()}</kbd> <kbd>Enter</kbd> speichern · <kbd>Esc</kbd> verwerfen
        </span>
        <button className="btn small primary" onClick={save} disabled={!text.trim() || saving}>
          Speichern
        </button>
      </div>
    </div>
  )
}
