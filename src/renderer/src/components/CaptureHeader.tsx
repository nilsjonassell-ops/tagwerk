// Kopf des Dialogs „Aus E-Mail übernehmen“: Schritte, Quelle, Art (Aufgabe · Notiz · Termin),
// was übernommen wurde und was zu prüfen ist – plus Hinweis, falls es schon etwas aus dieser Mail gibt.
import { useRef } from 'react'
import { CalendarPlus, Check, CheckSquare, CircleAlert, CircleHelp, StickyNote } from 'lucide-react'
import { existingFromThread, type Capture, type CaptureKind, type CaptureOrigin } from '@shared/capture'
import { useStore } from '@/lib/store'
import { initials, mailDate } from '@/lib/format'
import { KIND_LABEL, openCreated } from '@/lib/capture'
import { moveIndex } from './ui/listnav'

const KINDS: { id: CaptureKind; icon: typeof CheckSquare; hint: string }[] = [
  { id: 'task', icon: CheckSquare, hint: 'Etwas erledigen' },
  { id: 'note', icon: StickyNote, hint: 'Infos aufheben' },
  { id: 'event', icon: CalendarPlus, hint: 'Zeit eintragen' }
]

const FIELD_LABEL: Record<string, string> = { title: 'Titel', when: 'Datum und Uhrzeit', due: 'Fälligkeit', body: 'Inhalt', project: 'Projekt' }

/** Kleines Kennzeichen an einem Feld: woher die Angabe kommt */
export function OriginTag({ o }: { o?: CaptureOrigin }) {
  if (!o) return null
  if (o === 'mail')
    return (
      <span className="origin-tag mail" title="Aus der E-Mail übernommen">
        <Check aria-hidden="true" /> aus Mail
      </span>
    )
  if (o === 'check')
    return (
      <span className="origin-tag check" title="Erkannt, aber nicht eindeutig – bitte prüfen">
        <CircleHelp aria-hidden="true" /> prüfen
      </span>
    )
  return (
    <span className="origin-tag missing" title="In der E-Mail nicht gefunden – bitte ergänzen">
      <CircleAlert aria-hidden="true" /> nicht gefunden
    </span>
  )
}

export function CaptureHeader({ capture, onSwitch }: { capture: Capture; onSwitch: (to: CaptureKind) => void }) {
  const data = useStore((s) => s.data)
  const existing = existingFromThread(data, capture.threadId, capture.kind)
  const groupRef = useRef<HTMLDivElement>(null)
  const entries = Object.entries(capture.origin).filter(([, v]) => v) as [string, CaptureOrigin][]
  const taken = entries.filter(([, v]) => v === 'mail').map(([k]) => FIELD_LABEL[k])
  const check = entries.filter(([, v]) => v === 'check').map(([k]) => FIELD_LABEL[k])
  const missing = entries.filter(([, v]) => v === 'missing').map(([k]) => FIELD_LABEL[k])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    e.preventDefault()
    e.stopPropagation()
    const i = moveIndex(KINDS.map((k) => ({ label: k.id })), KINDS.findIndex((k) => k.id === capture.kind), e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 'ArrowUp' : 'ArrowDown')
    onSwitch(KINDS[i].id)
  }

  return (
    <div className="capture-head">
      <ol className="capture-steps" aria-label="Ablauf">
        <li className="done">
          <span className="dot">
            <Check aria-hidden="true" />
          </span>
          Art wählen
        </li>
        <li className="current" aria-current="step">
          <span className="dot">2</span>
          Prüfen &amp; ergänzen
        </li>
        <li>
          <span className="dot">3</span>
          Speichern
        </li>
      </ol>

      <div className="capture-source" aria-label="Aus dieser E-Mail">
        <span className="avatar" aria-hidden="true">
          {initials(capture.from)}
        </span>
        <div className="cs-text">
          <div className="cs-meta">
            <b>{capture.from}</b>
            <span>{mailDate(capture.date)}</span>
          </div>
          <div className="cs-subject">{capture.subject}</div>
          <div className="cs-snippet">{capture.snippet}</div>
        </div>
      </div>

      <div className="capture-kinds" role="radiogroup" aria-label="Übernehmen als" ref={groupRef} onKeyDown={onKeyDown}>
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={capture.kind === k.id}
            tabIndex={capture.kind === k.id ? 0 : -1}
            className={`capture-kind k-${k.id}`}
            onClick={() => capture.kind !== k.id && onSwitch(k.id)}
          >
            <span className="ck-icon" aria-hidden="true">
              <k.icon />
            </span>
            <span className="ck-text">
              <b>{KIND_LABEL[k.id]}</b>
              <small>{k.hint}</small>
            </span>
          </button>
        ))}
      </div>

      {existing && (
        <div className="capture-dup" role="status">
          <CircleAlert aria-hidden="true" />
          <span>
            Aus dieser E-Mail gibt es schon {capture.kind === 'note' ? 'eine Notiz' : capture.kind === 'task' ? 'eine Aufgabe' : 'einen Termin'}: <b>„{existing.title}“</b>
          </span>
          <button type="button" className="btn small" onClick={() => openCreated(capture.kind, existing.id)}>
            Öffnen
          </button>
        </div>
      )}

      {(check.length > 0 || missing.length > 0 || taken.length > 0) && (
        <p className="capture-summary">
          {taken.length > 0 && (
            <span>
              <Check aria-hidden="true" className="ok" /> Übernommen: {taken.join(', ')}
            </span>
          )}
          {check.length > 0 && (
            <span>
              <CircleHelp aria-hidden="true" className="check" /> Bitte prüfen: {check.join(', ')}
              {capture.reason ? ` – ${capture.reason}` : ''}
            </span>
          )}
          {missing.length > 0 && (
            <span>
              <CircleAlert aria-hidden="true" className="missing" /> Nicht gefunden: {missing.join(', ')}
            </span>
          )}
        </p>
      )}
    </div>
  )
}
