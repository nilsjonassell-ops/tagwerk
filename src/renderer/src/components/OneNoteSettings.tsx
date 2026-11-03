import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { confirm, useStore } from '@/lib/store'
import { useOneNote } from '@/lib/onenote'
import { removeSource, useAccounts } from '@/lib/accounts'
import { Switch } from './ui'

const L = {
  newApp: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade/quickStartType~/null/isMSAApp~/false',
  apps: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
  consent: 'https://account.live.com/consent/Manage',
  tenant: 'https://learn.microsoft.com/de-de/entra/fundamentals/create-new-tenant'
}

/** Ein Microsoft-Konto für Outlook Mail, Outlook Kalender und OneNote. */
export function MicrosoftSettings() {
  const status = useAccounts((s) => s.ms)
  const sync = useAccounts((s) => s.outlookSync)
  const refresh = useAccounts((s) => s.refresh)
  const syncOutlook = useAccounts((s) => s.syncOutlook)
  const toast = useStore((s) => s.toast)
  const online = useStore((s) => s.online)
  const [guideOpen, setGuideOpen] = useState(false)
  const [id, setId] = useState('')
  const [err, setErr] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [opts, setOpts] = useState({ mail: true, calendar: true, notes: true })

  useEffect(() => {
    void refresh().then(() => {
      const s = useAccounts.getState().ms
      setGuideOpen(!s.clientConfigured)
      if (s.connected) setOpts({ mail: s.caps.mail, calendar: s.caps.calendar, notes: s.caps.notes })
    })
  }, [refresh])

  const saveId = async () => {
    setErr('')
    const r = await window.tagwerk.microsoft.setClient(id)
    if (!r.ok) return setErr(r.error ?? 'Ungültig')
    setId('')
    await refresh()
  }
  const removeId = async () => {
    const ok = await confirm({ title: 'Anwendungs-ID entfernen?', body: 'Die Verbindung zu Outlook und OneNote wird auf diesem Gerät getrennt. In deinem Microsoft-Konto bleibt alles unverändert.', confirmLabel: 'Entfernen', danger: true })
    if (!ok) return
    await window.tagwerk.microsoft.disconnect()
    await window.tagwerk.microsoft.clearClient()
    removeSource('outlook')
    useOneNote.getState().reset()
    await refresh()
  }
  const connect = async () => {
    setConnecting(true)
    setErr('')
    const r = await window.tagwerk.microsoft.connect(opts)
    setConnecting(false)
    await refresh()
    if (!r.ok) return setErr(r.error ?? 'Verbindung fehlgeschlagen')
    useOneNote.getState().reset()
    toast(`Mit ${r.status.email ?? 'Microsoft'} verbunden`)
    if (!opts.mail) removeSource('outlook', { emails: true })
    if (!opts.calendar) removeSource('outlook', { events: true })
    await syncOutlook()
  }
  const disconnect = async () => {
    const ok = await confirm({
      title: 'Microsoft trennen?',
      body: 'Tagwerk entfernt die Anmeldung und die Outlook-Mails und -Termine von diesem Gerät. In Outlook und OneNote bleibt alles unverändert.',
      confirmLabel: 'Trennen',
      danger: true
    })
    if (!ok) return
    await window.tagwerk.microsoft.disconnect()
    removeSource('outlook')
    useOneNote.getState().reset()
    await refresh()
    toast('Microsoft getrennt')
  }

  const capsChanged = status.connected && (opts.mail !== status.caps.mail || opts.calendar !== status.caps.calendar || opts.notes !== status.caps.notes)
  const parts = [status.caps.mail && 'Mail', status.caps.calendar && 'Kalender', status.caps.notes && 'OneNote'].filter(Boolean).join(', ')

  return (
    <div className="google-box">
      <div className="source-row" style={{ borderBottom: 0 }}>
        <div className="icon acc-icon ms">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2" y="2" width="9.5" height="9.5" fill="#f25022" />
            <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7fba00" />
            <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00a4ef" />
            <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#ffb900" />
          </svg>
        </div>
        <div className="label">
          <b>
            Outlook & OneNote{' '}
            {status.connected ? <span className="tag ok">verbunden</span> : status.expired ? <span className="tag alert">abgelaufen</span> : <span className="tag">nicht verbunden</span>}
          </b>
          <span>
            {status.connected
              ? `${status.email ?? 'Microsoft-Konto'} · ${parts || 'nichts freigegeben'}`
              : status.expired
                ? 'Die Anmeldung ist abgelaufen oder wurde widerrufen. Einfach neu verbinden.'
                : 'Outlook-Postfach, Outlook-Kalender und OneNote mit einem Microsoft-Konto (outlook.de, hotmail, live oder Arbeitskonto).'}
          </span>
        </div>
        {status.connected && (
          <div className="row" style={{ gap: 6 }}>
            {(status.caps.mail || status.caps.calendar) && (
              <button className="btn small" onClick={() => syncOutlook()} disabled={sync.syncing || !online}>
                {sync.syncing ? <Loader2 className="spin" /> : <RefreshCw />} Abgleichen
              </button>
            )}
            <button className="btn small ghost" onClick={disconnect}>
              Trennen
            </button>
          </div>
        )}
      </div>

      {status.connected && sync.error && <div className="callout" style={{ margin: '0 0 10px' }}>{sync.error}</div>}

      {status.connected && (
        <div className="google-detail">
          <AccessToggles opts={opts} setOpts={setOpts} />
          {capsChanged && (
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn small primary" onClick={connect} disabled={connecting || !online}>
                {connecting ? <Loader2 className="spin" /> : null} Zugriff ändern
              </button>
              <span className="hint">Microsoft fragt dann einmal neu nach deiner Zustimmung.</span>
            </div>
          )}
          <p className="hint" style={{ margin: '8px 0 0' }}>
            Posteingang und Kalender gleichen sich alle paar Sekunden ab. Den Zugriff kannst du jederzeit unter{' '}
            <a href={L.consent} target="_blank" rel="noreferrer">
              account.live.com/consent/Manage
            </a>{' '}
            widerrufen.
          </p>
        </div>
      )}

      {!status.connected && (
        <div className="google-setup">
          <button className="guide-toggle" onClick={() => setGuideOpen(!guideOpen)} aria-expanded={guideOpen}>
            {guideOpen ? <ChevronDown /> : <ChevronRight />} Einmalige Einrichtung bei Microsoft · ca. 5 Minuten · kostenlos
          </button>
          {guideOpen && (
            <ol className="guide steps-linked">
              <li>
                <a className="btn small" href={L.newApp} target="_blank" rel="noreferrer">
                  <ExternalLink /> Neue App-Registrierung öffnen
                </a>
                <span>Mit deinem Microsoft-Konto anmelden. Es öffnet sich direkt „Anwendung registrieren“.</span>
              </li>
              <li>
                <b>Name:</b> <code>Tagwerk</code>
                <br />
                <b>Unterstützte Kontotypen:</b> die Option „<b>Konten in einem beliebigen Organisationsverzeichnis … und persönliche Microsoft-Konten</b>“.
              </li>
              <li>
                <b>Umleitungs-URI:</b> links „<b>Öffentlicher Client/nativ (mobil &amp; Desktop)</b>“ wählen, rechts <code>http://localhost</code> eintragen → unten <b>Registrieren</b>.
              </li>
              <li>
                Links im Menü <b>Authentifizierung</b> → ganz unten „<b>Öffentliche Clientflows zulassen</b>“ auf <b>Ja</b> → oben <b>Speichern</b>.
              </li>
              <li>
                Links <b>Übersicht</b> → „<b>Anwendungs-ID (Client)</b>“ kopieren (Symbol rechts daneben) und unten einfügen. Einen Clientschlüssel brauchst du nicht.
              </li>
              <li className="hint">
                Meldet Microsoft, dass dein Konto zu keinem Verzeichnis gehört, legst du zuerst ein kostenloses an:{' '}
                <a href={L.tenant} target="_blank" rel="noreferrer">
                  Anleitung von Microsoft
                </a>
                . Schon registriert? Deine Apps findest du{' '}
                <a href={L.apps} target="_blank" rel="noreferrer">
                  hier
                </a>
                .
              </li>
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
                <input className="input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && id && saveId()} spellCheck={false} aria-label="Anwendungs-ID" style={{ flex: 1 }} />
                <button className="btn small" onClick={saveId} disabled={!id.trim()}>
                  Übernehmen
                </button>
              </div>
            )}
          </div>

          <div className={`setup-step ${status.clientConfigured ? '' : 'disabled'}`}>
            <div className="step-head">
              <span className="step-dot">2</span>
              <b>Auswählen und verbinden</b>
            </div>
            <div style={{ paddingLeft: 30 }}>
              <AccessToggles opts={opts} setOpts={setOpts} />
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
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
                  <button className="btn primary" onClick={connect} disabled={!status.clientConfigured || !online || (!opts.mail && !opts.calendar && !opts.notes)}>
                    {status.expired ? 'Neu verbinden' : 'Mit Microsoft verbinden'}
                  </button>
                )}
              </div>
              <p className="hint" style={{ marginTop: 8 }}>Im Browser meldest du dich an und bestätigst den Zugriff. Die Anmeldung wird verschlüsselt auf diesem PC gespeichert und läuft nicht nach 7 Tagen ab.</p>
            </div>
          </div>
          {err && <div className="error-text" style={{ marginTop: 6 }}>{err}</div>}
        </div>
      )}
    </div>
  )
}

function AccessToggles({ opts, setOpts }: { opts: { mail: boolean; calendar: boolean; notes: boolean }; setOpts: (o: { mail: boolean; calendar: boolean; notes: boolean }) => void }) {
  return (
    <>
      <div className="perm-row">
        <span>
          Outlook Mail
          <small>Posteingang lesen, archivieren, löschen, markieren und antworten – immer nur, wenn du es auslöst.</small>
        </span>
        <Switch label="Outlook Mail" checked={opts.mail} onChange={(v) => setOpts({ ...opts, mail: v })} />
      </div>
      <div className="perm-row">
        <span>
          Outlook Kalender
          <small>Termine lesen, anlegen, verschieben und löschen.</small>
        </span>
        <Switch label="Outlook Kalender" checked={opts.calendar} onChange={(v) => setOpts({ ...opts, calendar: v })} />
      </div>
      <div className="perm-row">
        <span>
          OneNote
          <small>Notizbücher lesen und Tagwerk-Notizen nach OneNote speichern.</small>
        </span>
        <Switch label="OneNote" checked={opts.notes} onChange={(v) => setOpts({ ...opts, notes: v })} />
      </div>
    </>
  )
}

// Ältere Bezeichnung weiter anbieten
export const OneNoteSettings = MicrosoftSettings
