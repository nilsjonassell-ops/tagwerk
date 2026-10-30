import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Loader2, NotebookTabs } from 'lucide-react'
import { confirm, useStore } from '@/lib/store'
import { useOneNote } from '@/lib/onenote'

const PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'

/** Einrichtung und Status der OneNote-Verbindung (Microsoft-Konto). */
export function OneNoteSettings() {
  const status = useOneNote((s) => s.status)
  const refresh = useOneNote((s) => s.refreshStatus)
  const toast = useStore((s) => s.toast)
  const online = useStore((s) => s.online)
  const [guideOpen, setGuideOpen] = useState(false)
  const [id, setId] = useState('')
  const [err, setErr] = useState('')
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    void refresh().then((s) => setGuideOpen(!s.clientConfigured))
  }, [refresh])

  const saveId = async () => {
    setErr('')
    const r = await window.tagwerk.microsoft.setClient(id)
    if (!r.ok) return setErr(r.error ?? 'Ungültig')
    setId('')
    await refresh()
  }
  const removeId = async () => {
    const ok = await confirm({ title: 'Anwendungs-ID entfernen?', body: 'Die Verbindung zu OneNote wird auf diesem Gerät getrennt. In OneNote bleibt alles unverändert.', confirmLabel: 'Entfernen', danger: true })
    if (!ok) return
    await window.tagwerk.microsoft.disconnect()
    await window.tagwerk.microsoft.clearClient()
    useOneNote.getState().reset()
    await refresh()
  }
  const connect = async () => {
    setConnecting(true)
    setErr('')
    const r = await window.tagwerk.microsoft.connect()
    setConnecting(false)
    useOneNote.setState({ status: r.status })
    if (!r.ok) return setErr(r.error ?? 'Verbindung fehlgeschlagen')
    useOneNote.getState().reset()
    toast(`OneNote verbunden${r.status.email ? ` (${r.status.email})` : ''}`)
  }
  const disconnect = async () => {
    const ok = await confirm({
      title: 'OneNote trennen?',
      body: 'Tagwerk entfernt die Anmeldung von diesem Gerät. Deine Notizbücher in OneNote bleiben unverändert. Den Zugriff kannst du zusätzlich unter account.live.com/consent/Manage widerrufen.',
      confirmLabel: 'Trennen',
      danger: true
    })
    if (!ok) return
    const s = await window.tagwerk.microsoft.disconnect()
    useOneNote.setState({ status: s })
    useOneNote.getState().reset()
    toast('OneNote getrennt')
  }

  return (
    <div className="google-box">
      <div className="source-row" style={{ borderBottom: 0 }}>
        <div className="icon">
          <NotebookTabs />
        </div>
        <div className="label">
          <b>
            OneNote{' '}
            {status.connected ? <span className="tag ok">verbunden</span> : status.expired ? <span className="tag alert">abgelaufen</span> : <span className="tag">nicht verbunden</span>}
          </b>
          <span>
            {status.connected
              ? `${status.email ?? 'Microsoft-Konto'} – Notizbücher unter „Notizen → OneNote“, Tagwerk-Notizen mit „Nach OneNote“ speichern.`
              : status.expired
                ? 'Die Anmeldung ist abgelaufen oder wurde widerrufen. Einfach neu verbinden.'
                : 'Deine OneNote-Notizbücher in Tagwerk lesen und durchsuchen – und Tagwerk-Notizen nach OneNote speichern.'}
          </span>
        </div>
        {status.connected && (
          <button className="btn small ghost" onClick={disconnect}>
            Trennen
          </button>
        )}
      </div>

      {!status.connected && (
        <div className="google-setup">
          <button className="guide-toggle" onClick={() => setGuideOpen(!guideOpen)} aria-expanded={guideOpen}>
            {guideOpen ? <ChevronDown /> : <ChevronRight />} Einmalige Einrichtung bei Microsoft (ca. 5 Minuten, kostenlos)
          </button>
          {guideOpen && (
            <ol className="guide">
              <li>
                Öffne <a href={PORTAL} target="_blank" rel="noreferrer">Microsoft Entra → App-Registrierungen</a> und melde dich mit deinem Microsoft-Konto an.
              </li>
              <li>
                <b>Neue Registrierung</b>: Name „Tagwerk“, Kontotypen <b>„Konten in einem beliebigen Organisationsverzeichnis und persönliche Microsoft-Konten“</b>.
              </li>
              <li>
                Umleitungs-URI: Plattform <b>„Öffentlicher Client/nativ (mobil &amp; Desktop)“</b>, Adresse <code>http://localhost</code> → <b>Registrieren</b>.
              </li>
              <li>
                Unter <b>Authentifizierung</b> „Öffentliche Clientflows zulassen“ auf <b>Ja</b> stellen und speichern.
              </li>
              <li>Auf der Übersichtsseite die <b>Anwendungs-ID (Client)</b> kopieren und hier einfügen. Ein Clientschlüssel wird nicht gebraucht.</li>
            </ol>
          )}

          <div className="setup-step">
            <div className="step-head">
              <span className={`step-dot ${status.clientConfigured ? 'done' : ''}`}>{status.clientConfigured ? <Check /> : '1'}</span>
              <b>Anwendungs-ID</b>
              {status.clientConfigured && <span className="hint">{status.clientIdHint}</span>}
            </div>
            {status.clientConfigured ? (
              <div className="row" style={{ gap: 6, paddingLeft: 30 }}>
                <button className="btn small ghost" onClick={removeId}>
                  Entfernen
                </button>
              </div>
            ) : (
              <div className="row" style={{ gap: 6, paddingLeft: 30 }}>
                <input
                  className="input"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && id && saveId()}
                  spellCheck={false}
                  aria-label="Anwendungs-ID"
                  style={{ flex: 1 }}
                />
                <button className="btn small" onClick={saveId} disabled={!id.trim()}>
                  Übernehmen
                </button>
              </div>
            )}
          </div>

          <div className={`setup-step ${status.clientConfigured ? '' : 'disabled'}`}>
            <div className="step-head">
              <span className="step-dot">2</span>
              <b>Mit Microsoft verbinden</b>
            </div>
            <div className="row" style={{ gap: 8, paddingLeft: 30 }}>
              {connecting ? (
                <>
                  <span className="row hint">
                    <Loader2 className="spin" size={14} /> Warte auf deine Bestätigung im Browser …
                  </span>
                  <button className="btn small ghost" onClick={() => window.tagwerk.microsoft.cancelConnect()}>
                    Abbrechen
                  </button>
                </>
              ) : (
                <button className="btn primary" onClick={connect} disabled={!status.clientConfigured || !online}>
                  {status.expired ? 'Neu verbinden' : 'Mit OneNote verbinden'}
                </button>
              )}
            </div>
            <p className="hint" style={{ paddingLeft: 30, marginTop: 8 }}>
              Tagwerk fragt nur „Notizbücher lesen und schreiben“ und deine E-Mail-Adresse an. Die Anmeldung wird verschlüsselt auf diesem PC gespeichert.
            </p>
          </div>
          {err && <div className="error-text" style={{ marginTop: 6 }}>{err}</div>}
        </div>
      )}
    </div>
  )
}
