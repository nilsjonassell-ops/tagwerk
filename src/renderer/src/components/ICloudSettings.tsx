import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { confirm, useStore } from '@/lib/store'
import { removeSource, useAccounts } from '@/lib/accounts'
import { Switch } from './ui'
import { ProviderLogo } from './ProviderLogo'

const APPLE_SECURITY = 'https://account.apple.com/account/manage/section/security'

/** Apple Kalender über iCloud – mit App-spezifischem Passwort. */
export function ICloudSettings() {
  const status = useAccounts((s) => s.icloud)
  const sync = useAccounts((s) => s.icloudSync)
  const refresh = useAccounts((s) => s.refresh)
  const syncICloud = useAccounts((s) => s.syncICloud)
  const toast = useStore((s) => s.toast)
  const online = useStore((s) => s.online)
  const [guideOpen, setGuideOpen] = useState(true)
  const [appleId, setAppleId] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    void refresh()
  }, [refresh])

  const connect = async () => {
    setBusy(true)
    setErr('')
    const r = await window.tagwerk.icloud.connect(appleId, pw)
    setBusy(false)
    if (!r.ok) return setErr(r.error ?? 'Verbindung fehlgeschlagen')
    setPw('')
    await refresh()
    toast(`Apple Kalender verbunden (${r.status.calendars.length} ${r.status.calendars.length === 1 ? 'Kalender' : 'Kalender'})`)
    await syncICloud()
  }
  const disconnect = async () => {
    const ok = await confirm({
      title: 'Apple Kalender trennen?',
      body: 'Tagwerk entfernt die Anmeldung und die iCloud-Termine von diesem Gerät. In Apple Kalender bleibt alles unverändert. Das App-spezifische Passwort kannst du zusätzlich bei Apple widerrufen.',
      confirmLabel: 'Trennen',
      danger: true
    })
    if (!ok) return
    await window.tagwerk.icloud.disconnect()
    removeSource('icloud')
    await refresh()
    toast('Apple Kalender getrennt')
  }
  const setEnabled = async (id: string, on: boolean) => {
    const ids = status.calendars.filter((c) => (c.id === id ? on : c.enabled)).map((c) => c.id)
    const next = await window.tagwerk.icloud.setCalendars(ids)
    useAccounts.setState({ icloud: next })
    await syncICloud({ quiet: true })
  }
  const setDefault = async (id: string) => {
    const next = await window.tagwerk.icloud.setCalendars(
      status.calendars.filter((c) => c.enabled).map((c) => c.id),
      id
    )
    useAccounts.setState({ icloud: next })
  }

  return (
    <div className="google-box">
      <div className="source-row" style={{ borderBottom: 0 }}>
        <ProviderLogo kind="apple" />
        <div className="label">
          <b>
            Apple Kalender (iCloud) {status.connected ? <span className="tag ok">verbunden</span> : <span className="tag">nicht verbunden</span>}
          </b>
          <span>
            {status.connected
              ? `${status.appleId} · ${status.calendars.filter((c) => c.enabled).length} von ${status.calendars.length} Kalendern`
              : 'Deine Kalender aus der Kalender-App von iPhone, iPad und Mac – lesen, anlegen, verschieben und löschen.'}
          </span>
        </div>
        {status.connected && (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small" onClick={() => syncICloud()} disabled={sync.syncing || !online}>
              {sync.syncing ? <Loader2 className="spin" /> : <RefreshCw />} Abgleichen
            </button>
            <button className="btn small ghost" onClick={disconnect}>
              Trennen
            </button>
          </div>
        )}
      </div>

      {status.connected && sync.error && <div className="callout" style={{ margin: '0 0 10px' }}>{sync.error}</div>}

      {status.connected && (
        <div className="google-detail">
          <div className="field-label" style={{ marginBottom: 4 }}>
            Kalender in Tagwerk anzeigen
          </div>
          {status.calendars.map((c) => (
            <div key={c.id} className="perm-row">
              <span className="row" style={{ gap: 8 }}>
                <span className="cal-swatch" style={{ background: c.color ?? '#8b6dff' }} />
                {c.name}
                {c.readOnly && <small style={{ display: 'inline' }}> · nur lesen</small>}
                {status.defaultCalendarId === c.id && <span className="tag accent">Standard</span>}
              </span>
              <span className="row" style={{ gap: 8 }}>
                {status.defaultCalendarId !== c.id && !c.readOnly && c.enabled && (
                  <button className="link" onClick={() => setDefault(c.id)}>
                    Als Standard
                  </button>
                )}
                <Switch label={`${c.name} anzeigen`} checked={c.enabled} onChange={(v) => setEnabled(c.id, v)} />
              </span>
            </div>
          ))}
          <p className="hint" style={{ margin: '8px 0 0' }}>
            Neue Termine landen im Standard-Kalender – im Termin-Dialog kannst du jedes Mal einen anderen wählen. Wiederkehrende Termine bearbeitest du in Apple Kalender; in Tagwerk werden sie angezeigt.
          </p>
        </div>
      )}

      {!status.connected && (
        <div className="google-setup">
          <button className="guide-toggle" onClick={() => setGuideOpen(!guideOpen)} aria-expanded={guideOpen}>
            {guideOpen ? <ChevronDown /> : <ChevronRight />} Einrichtung · ca. 2 Minuten
          </button>
          {guideOpen && (
            <ol className="guide steps-linked">
              <li>
                <a className="btn small" href={APPLE_SECURITY} target="_blank" rel="noreferrer">
                  <ExternalLink /> Apple-Account: Anmeldung und Sicherheit öffnen
                </a>
                <span>Mit deiner Apple-ID anmelden.</span>
              </li>
              <li>
                Auf „<b>App-spezifische Passwörter</b>“ klicken → <b>+</b> → Name <code>Tagwerk</code> → <b>Erstellen</b>. (Dafür muss die Zwei-Faktor-Authentifizierung aktiv sein – bei den meisten Apple-IDs ist sie das.)
              </li>
              <li>
                Das angezeigte Passwort (Form <code>abcd-efgh-ijkl-mnop</code>) kopieren und unten zusammen mit deiner Apple-ID einfügen. Dein normales Apple-Passwort brauchst du nicht – und Tagwerk sieht es nie.
              </li>
            </ol>
          )}
          <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
            <input className="input" type="email" placeholder="Apple-ID (E-Mail-Adresse)" value={appleId} onChange={(e) => setAppleId(e.target.value)} spellCheck={false} autoComplete="username" aria-label="Apple-ID" />
            <input
              className="input"
              type="password"
              placeholder="App-spezifisches Passwort (abcd-efgh-ijkl-mnop)"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && appleId && pw && connect()}
              spellCheck={false}
              autoComplete="off"
              aria-label="App-spezifisches Passwort"
            />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary" onClick={connect} disabled={!appleId.trim() || !pw.trim() || busy || !online}>
                {busy ? <Loader2 className="spin" /> : null} Mit iCloud verbinden
              </button>
              <span className="hint">Wird verschlüsselt auf diesem PC gespeichert.</span>
            </div>
            {err && <div className="error-text">{err}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
