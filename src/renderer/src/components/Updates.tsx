// Hinweis auf ein bereitstehendes Update und Versionszeile für die Einstellungen.

import { useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import type { UpdateStatus } from '@shared/types'

export function useUpdateStatus() {
  const [s, setS] = useState<UpdateStatus | null>(null)
  useEffect(() => {
    void window.tagwerk.updates.status().then(setS)
    return window.tagwerk.updates.onStatus(setS)
  }, [])
  return s
}

export function UpdateBanner() {
  const s = useUpdateStatus()
  const [later, setLater] = useState<string | null>(null)
  if (!s || s.state !== 'ready' || later === s.version) return null
  return (
    <div className="update-card" role="status">
      <div className="update-icon">
        <Sparkles />
      </div>
      <div className="update-text">
        <b>Tagwerk {s.version} ist bereit</b>
        <span>Ein Neustart dauert nur ein paar Sekunden. Deine Daten bleiben erhalten.</span>
      </div>
      <button className="btn small primary" onClick={() => window.tagwerk.updates.install()}>
        <RefreshCw /> Jetzt neu starten
      </button>
      <button className="btn small ghost icon-btn" onClick={() => setLater(s.version ?? '')} aria-label="Später" title="Später – wird beim Beenden installiert">
        <X />
      </button>
    </div>
  )
}

export function VersionRow() {
  const s = useUpdateStatus()
  const [busy, setBusy] = useState(false)
  if (!s) return null
  const text =
    s.state === 'dev'
      ? 'Entwicklungsversion – Updates gibt es in der installierten App.'
      : s.state === 'checking'
        ? 'Suche nach Updates …'
        : s.state === 'downloading'
          ? `Lade Version ${s.version ?? ''} … ${s.percent ?? 0} %`
          : s.state === 'ready'
            ? `Version ${s.version} ist bereit.`
            : s.state === 'current'
              ? 'Du hast die neueste Version.'
              : s.state === 'error'
                ? s.error ?? 'Updates konnten nicht geprüft werden.'
                : 'Tagwerk sucht automatisch alle paar Stunden nach Updates.'
  return (
    <div className="setting">
      <div className="label">
        <b>Version {s.current}</b>
        <span>{text}</span>
      </div>
      {s.state === 'ready' ? (
        <button className="btn small primary" onClick={() => window.tagwerk.updates.install()}>
          <RefreshCw /> Neu starten
        </button>
      ) : (
        <button
          className="btn small"
          disabled={s.state === 'dev' || s.state === 'checking' || s.state === 'downloading' || busy}
          onClick={async () => {
            setBusy(true)
            await window.tagwerk.updates.check()
            setBusy(false)
          }}
        >
          {s.state === 'checking' || s.state === 'downloading' || busy ? <Loader2 className="spin" /> : <Download />} Nach Updates suchen
        </button>
      )}
    </div>
  )
}
