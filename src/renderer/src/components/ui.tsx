import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FlaskConical, Loader2, RefreshCw, X, AlertTriangle } from 'lucide-react'
import { useStore } from '@/lib/store'
import { useAccounts } from '@/lib/accounts'
import type { Priority, Source } from '@shared/types'
import { PRIORITY_LABEL } from '@/lib/format'

// Offene Dialoge von unten nach oben – Esc schließt immer nur den obersten,
// egal wo der Fokus gerade ist.
const dialogStack: symbol[] = []

export function Dialog(props: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** sm 420 px · md 520 px (Standard) · lg 820 px */
  size?: 'sm' | 'md' | 'lg'
  /** veraltet: entspricht size="lg" */
  wide?: boolean
  labelledBy?: string
  bodyClass?: string
  /** Ungespeicherte Eingaben: vor dem Schließen per Esc, × oder Klick daneben nachfragen */
  dirty?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [confirm, setConfirm] = useState(false)
  const requestClose = () => (props.dirty ? setConfirm(true) : props.onClose())
  const closeRef = useRef(requestClose)
  closeRef.current = requestClose
  useEffect(() => {
    const me = Symbol('dialog')
    dialogStack.push(me)
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || dialogStack[dialogStack.length - 1] !== me) return
      // Ein offenes Menü/Auswahlfeld schließt zuerst sich selbst
      if ((e.target as HTMLElement | null)?.closest?.('#layer-root')) return
      e.preventDefault()
      e.stopPropagation()
      closeRef.current()
    }
    window.addEventListener('keydown', onEsc, true)
    return () => {
      window.removeEventListener('keydown', onEsc, true)
      const i = dialogStack.indexOf(me)
      if (i >= 0) dialogStack.splice(i, 1)
    }
  }, [])
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('.dialog-body input, .dialog-body textarea, .dialog-body select')
    ;(first ?? el)?.focus()
    const onKey = (e: KeyboardEvent) => {
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
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div className={`dialog size-${props.wide ? 'lg' : props.size ?? 'md'} ${props.wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={props.title} ref={ref} tabIndex={-1} style={{ outline: 'none' }}>
        <div className="dialog-head">
          <h2>{props.title}</h2>
          <button className="btn ghost icon-btn small dialog-close" onClick={requestClose} aria-label="Schließen">
            <X />
          </button>
        </div>
        <div className={props.bodyClass ?? 'dialog-body'}>{props.children}</div>
        {confirm && (
          <div className="dialog-confirm" role="alertdialog" aria-label="Änderungen verwerfen?">
            <span>Änderungen verwerfen?</span>
            <button type="button" className="btn small" autoFocus onClick={() => setConfirm(false)}>
              Weiter bearbeiten
            </button>
            <button type="button" className="btn small danger" onClick={props.onClose}>
              Verwerfen
            </button>
          </div>
        )}
        {props.footer && !confirm && <div className="dialog-foot">{props.footer}</div>}
      </div>
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />
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
  if (source === 'google') return <span className="tag accent" title="Mit deinem Google-Konto synchronisiert">Google</span>
  if (source === 'outlook') return <span className="tag accent" title="Mit deinem Outlook-Kalender synchronisiert">Outlook</span>
  if (source === 'icloud') return <span className="tag accent" title="Mit Apple Kalender (iCloud) synchronisiert">Apple Kalender</span>
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

/** Kontostatus in der Kopfzeile: verbundene Konten, letzte Synchronisation, Sync-Knopf. */
export function AccountStatus({ kind }: { kind: 'gmail' | 'calendar' }) {
  const google = useStore((s) => s.google)
  const sync = useStore((s) => s.googleSync)
  const syncGoogle = useStore((s) => s.syncGoogle)
  const online = useStore((s) => s.online)
  const ms = useAccounts((s) => s.ms)
  const icloud = useAccounts((s) => s.icloud)
  const oSync = useAccounts((s) => s.outlookSync)
  const iSync = useAccounts((s) => s.icloudSync)
  const syncOutlook = useAccounts((s) => s.syncOutlook)
  const syncICloud = useAccounts((s) => s.syncICloud)
  const hasGoogle = google.connected && (kind === 'gmail' ? google.caps.gmailRead : google.caps.calendarRead)
  const hasOutlook = ms.connected && (kind === 'gmail' ? ms.caps.mail : ms.caps.calendar)
  const hasICloud = kind === 'calendar' && icloud.connected
  const names: string[] = []
  if (hasGoogle) names.push(kind === 'gmail' ? 'Gmail' : 'Google')
  if (hasOutlook) names.push('Outlook')
  if (hasICloud) names.push('Apple')
  if (google.expired && hasGoogle) return <span className="tag alert"><AlertTriangle /> Google-Anmeldung abgelaufen</span>
  if (!names.length) return <span className="hint">{kind === 'gmail' ? 'Kein E-Mail-Konto verbunden' : 'Kein Kalenderkonto verbunden'}</span>
  const err = (hasGoogle && (kind === 'gmail' ? sync.errors.gmail : sync.errors.calendar)) || (hasOutlook && oSync.error) || (hasICloud && iSync.error) || ''
  const syncing = (hasGoogle && sync.syncing) || (hasOutlook && oSync.syncing) || (hasICloud && iSync.syncing)
  const last = Math.max(hasGoogle && sync.lastSync ? new Date(sync.lastSync).getTime() : 0, hasOutlook && oSync.lastSync ? new Date(oSync.lastSync).getTime() : 0, hasICloud && iSync.lastSync ? new Date(iSync.lastSync).getTime() : 0)
  const time = last ? new Date(last).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null
  const label = names.length === 1 && hasGoogle && google.email ? google.email : names.join(' · ')
  const runSync = () => {
    if (hasGoogle) void syncGoogle()
    if (hasOutlook) void syncOutlook({ only: kind === 'gmail' ? 'mail' : 'calendar' })
    if (hasICloud) void syncICloud()
  }
  return (
    <span className="row" style={{ gap: 6 }}>
      {err ? (
        <span className="tag alert" title={err}><AlertTriangle /> Synchronisation fehlgeschlagen</span>
      ) : (
        <span className="hint" title={label}>{label}{time ? ` · ${time}` : ''}</span>
      )}
      <button className="btn ghost small icon-btn" onClick={runSync} disabled={syncing || !online} aria-label="Jetzt synchronisieren" title={online ? 'Jetzt synchronisieren' : 'Offline'}>
        {syncing ? <Loader2 className="spin" /> : <RefreshCw />}
      </button>
    </span>
  )
}

export { Segmented } from './ui/Segmented'
export { Select, type SelectOption } from './ui/Select'
export { Menu, type MenuItem } from './ui/Menu'
export { Popover } from './ui/Popover'
export { Tooltip } from './ui/Tooltip'
export { CustomDate } from './ui/CustomDate'
