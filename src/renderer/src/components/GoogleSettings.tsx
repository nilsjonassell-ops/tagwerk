import { useState } from 'react'
import { CalendarDays, Check, ChevronDown, ChevronRight, FileJson, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { removeDemo } from '@shared/demo'
import { GMAIL_CATEGORIES, type GmailCategory } from '@shared/types'
import { confirm, useStore } from '@/lib/store'
import { Switch } from './ui'

const CONSOLE = 'https://console.cloud.google.com/'

/** Einrichtung und Status der Google-Verbindung (Kalender + Gmail). */
export function GoogleSettings() {
  const google = useStore((s) => s.google)
  const sync = useStore((s) => s.googleSync)
  const refresh = useStore((s) => s.refreshGoogle)
  const syncGoogle = useStore((s) => s.syncGoogle)
  const toast = useStore((s) => s.toast)
  const online = useStore((s) => s.online)
  const [guideOpen, setGuideOpen] = useState(!google.clientConfigured)
  const [manual, setManual] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [clientErr, setClientErr] = useState('')
  const [opts, setOpts] = useState({ calendar: true, gmail: true, write: true })
  const [connecting, setConnecting] = useState(false)
  const [connectErr, setConnectErr] = useState('')

  const importFile = async () => {
    setClientErr('')
    const r = await window.tagwerk.google.importClientFile()
    if (r.canceled) return
    if (!r.ok) return setClientErr(r.error ?? 'Import fehlgeschlagen')
    await refresh()
    toast('OAuth-Client übernommen')
  }
  const saveManual = async () => {
    setClientErr('')
    const r = await window.tagwerk.google.setClient({ clientId, clientSecret })
    if (!r.ok) return setClientErr(r.error ?? 'Ungültig')
    setClientId('')
    setClientSecret('')
    setManual(false)
    await refresh()
  }
  const removeClient = async () => {
    const ok = await confirm({ title: 'OAuth-Client entfernen?', body: 'Client-ID und Clientschlüssel werden von diesem Gerät gelöscht. Eine bestehende Verbindung wird getrennt.', confirmLabel: 'Entfernen', danger: true })
    if (!ok) return
    await window.tagwerk.google.disconnect()
    await window.tagwerk.google.clearClient()
    await refresh()
  }

  const connect = async (override?: typeof opts) => {
    const renewing = google.connected
    setConnecting(true)
    setConnectErr('')
    const r = await window.tagwerk.google.connect(override ?? opts)
    setConnecting(false)
    useStore.getState().set({ google: r.status })
    if (!r.ok) return setConnectErr(r.error ?? 'Verbindung fehlgeschlagen')
    if (r.error) setConnectErr(r.error)
    toast(renewing ? 'Google-Anmeldung erneuert' : `Mit ${r.status.email} verbunden`)
    await syncGoogle()
    const st = useStore.getState()
    if (st.data.sources.demo && !renewing) {
      const rm = await confirm({
        title: 'Demo-Daten jetzt entfernen?',
        body: 'Deine echten Termine und E-Mails sind jetzt da. Die Beispieldaten kannst du entfernen, damit sie sich nicht vermischen. Eigene Einträge bleiben erhalten.',
        confirmLabel: 'Demo-Daten entfernen'
      })
      if (rm) st.mutate(removeDemo, { toast: 'Demo-Daten entfernt', undoable: true })
    }
  }
  const cancel = () => window.tagwerk.google.cancelConnect()

  const hiddenCats = useStore((s) => s.settings.gmailHiddenCategories)
  const toggleCategory = async (id: GmailCategory, hide: boolean) => {
    const next = hide ? [...new Set([...hiddenCats, id])] : hiddenCats.filter((c) => c !== id)
    await useStore.getState().updateSettings({ gmailHiddenCategories: next })
    syncGoogle({ quiet: true })
  }

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Google trennen?',
      body: 'Tagwerk widerruft den Zugriff bei Google und entfernt die synchronisierten Termine und E-Mails von diesem Gerät. In deinem Google-Konto bleibt alles unverändert.',
      confirmLabel: 'Trennen',
      danger: true
    })
    if (!ok) return
    const status = await window.tagwerk.google.disconnect()
    const st = useStore.getState()
    st.set({ google: status, googleSync: { syncing: false, errors: {} } })
    st.mutate((d) => ({
      ...d,
      events: d.events.filter((e) => e.source !== 'google'),
      emails: d.emails.filter((e) => e.source !== 'google'),
      sources: { ...d.sources, google: undefined }
    }), { toast: 'Google getrennt' })
  }

  const capLabel = (r: boolean, w: boolean, rw: string) => (w ? rw : r ? 'nur lesen' : 'nicht freigegeben')
  const syncError = sync.errors.general ?? sync.errors.calendar ?? sync.errors.gmail

  return (
    <div className="google-box">
      <div className="source-row" style={{ borderBottom: 0 }}>
        <div className="icon">
          <CalendarDays />
        </div>
        <div className="label">
          <b>
            Google Kalender & Gmail{' '}
            {google.connected ? <span className="tag ok">verbunden</span> : google.expired ? <span className="tag alert">abgelaufen</span> : <span className="tag">nicht verbunden</span>}
          </b>
          <span>
            {google.connected
              ? google.email
              : google.expired
                ? 'Die Anmeldung ist abgelaufen oder wurde widerrufen. Verbinde neu – deine Einstellungen bleiben erhalten.'
                : 'Termine aus deinem Hauptkalender und die letzten 40 Unterhaltungen im Posteingang.'}
          </span>
        </div>
        {google.connected && (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small" onClick={() => syncGoogle()} disabled={sync.syncing || !online}>
              {sync.syncing ? <Loader2 className="spin" /> : <RefreshCw />} Jetzt synchronisieren
            </button>
            <button className="btn small ghost" onClick={disconnect}>
              Trennen
            </button>
          </div>
        )}
      </div>

      {google.connected && (
        <div className="google-detail">
          <div className="kv-line">
            <span>Kalender</span>
            <b>{capLabel(google.caps.calendarRead, google.caps.calendarWrite, 'lesen und bearbeiten')}</b>
          </div>
          <div className="kv-line">
            <span>Gmail</span>
            <b>{capLabel(google.caps.gmailRead, google.caps.gmailWrite, 'lesen, archivieren, löschen, Antworten senden')}</b>
          </div>
          {google.expiresAt && (
            <div className="kv-line">
              <span>Anmeldung gültig bis</span>
              <b className={google.expiresAt - Date.now() < 86400_000 ? 'overdue-text' : ''}>
                {new Date(google.expiresAt).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </b>
            </div>
          )}
          <div className="kv-line">
            <span>Zuletzt synchronisiert</span>
            <b>{sync.lastSync ? new Date(sync.lastSync).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'noch nicht'}</b>
          </div>
          {syncError && (
            <div className="callout" style={{ margin: '8px 0 0' }}>
              <AlertTriangle /> <span>{syncError}</span>
            </div>
          )}
          {google.caps.gmailRead && (
            <div style={{ marginTop: 14 }}>
              <div className="field-label" style={{ marginBottom: 2 }}>Im Posteingang von Tagwerk ausblenden</div>
              <div className="hint" style={{ marginBottom: 4 }}>Nutzt die Kategorien von Gmail. In Gmail selbst bleibt alles, wie es ist.</div>
              {GMAIL_CATEGORIES.map((c) => (
                <div key={c.id} className="perm-row">
                  <span>
                    {c.label}
                    <small>{c.hint}</small>
                  </span>
                  <Switch label={`${c.label} ausblenden`} checked={hiddenCats.includes(c.id)} onChange={(v) => toggleCategory(c.id, v)} />
                </div>
              ))}
            </div>
          )}
          {google.expiresAt && (
            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {connecting ? (
                <>
                  <span className="row hint">
                    <Loader2 className="spin" size={14} /> Warte auf deine Bestätigung im Browser …
                  </span>
                  <button className="btn small ghost" onClick={cancel}>
                    Abbrechen
                  </button>
                </>
              ) : (
                <button
                  className={`btn small ${google.expiresAt - Date.now() < 86400_000 ? 'primary' : ''}`}
                  onClick={() => connect({ calendar: google.caps.calendarRead, gmail: google.caps.gmailRead, write: google.caps.calendarWrite || google.caps.gmailWrite })}
                  disabled={!online}
                >
                  <RefreshCw /> Anmeldung jetzt erneuern
                </button>
              )}
              <span className="hint">Im Testmodus gilt eine Anmeldung 7 Tage. Tagwerk erinnert dich einen Tag vorher.</span>
            </div>
          )}
          {connectErr && <div className="error-text" style={{ marginTop: 6 }}>{connectErr}</div>}
          <p className="hint" style={{ margin: '8px 0 0' }}>
            Tagwerk synchronisiert alle 5 Minuten, solange die App läuft. Endgültiges Löschen von E-Mails ist nicht möglich – diese Berechtigung fragt Tagwerk gar nicht erst an.
          </p>
        </div>
      )}

      {!google.connected && (
        <div className="google-setup">
          <button className="guide-toggle" onClick={() => setGuideOpen(!guideOpen)} aria-expanded={guideOpen}>
            {guideOpen ? <ChevronDown /> : <ChevronRight />} Einmalige Einrichtung in der Google Cloud Console (ca. 10 Minuten)
          </button>
          {guideOpen && (
            <ol className="guide">
              <li>
                Öffne die <a href={CONSOLE} target="_blank" rel="noreferrer">Google Cloud Console</a> und lege ein neues Projekt an, z. B. „Tagwerk“.
              </li>
              <li>
                Unter <b>APIs & Dienste → Bibliothek</b> die <b>Google Calendar API</b> und die <b>Gmail API</b> aktivieren.
              </li>
              <li>
                Unter <b>Google Auth Platform</b> (früher „OAuth-Zustimmungsbildschirm“) die App einrichten: Typ <b>Extern</b>, App-Name „Tagwerk“, deine E-Mail als Kontakt. Unter <b>Zielgruppe → Testnutzer</b> deine eigene Gmail-Adresse hinzufügen.
              </li>
              <li>
                Unter <b>Clients</b> einen neuen OAuth-Client vom Typ <b>Desktop-App</b> erstellen und die JSON-Datei herunterladen.
              </li>
              <li>Hier die heruntergeladene Datei auswählen und auf „Mit Google verbinden“ klicken. Im Browser bestätigst du den Zugriff.</li>
            </ol>
          )}

          <div className="setup-step">
            <div className="step-head">
              <span className={`step-dot ${google.clientConfigured ? 'done' : ''}`}>{google.clientConfigured ? <Check /> : '1'}</span>
              <b>OAuth-Client</b>
              {google.clientConfigured && <span className="hint">{google.clientIdHint}</span>}
            </div>
            {google.clientConfigured ? (
              <div className="row" style={{ gap: 6, paddingLeft: 30 }}>
                <button className="btn small ghost" onClick={importFile}>
                  Andere Datei wählen
                </button>
                <button className="btn small ghost" onClick={removeClient}>
                  Entfernen
                </button>
              </div>
            ) : (
              <div style={{ paddingLeft: 30, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn small primary" onClick={importFile} disabled={!google.encrypted}>
                    <FileJson /> client_secret-Datei auswählen
                  </button>
                  <button className="link" onClick={() => setManual(!manual)}>
                    oder von Hand eingeben
                  </button>
                </div>
                {manual && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input className="input" placeholder="Client-ID (…apps.googleusercontent.com)" value={clientId} onChange={(e) => setClientId(e.target.value)} spellCheck={false} aria-label="Client-ID" />
                    <input className="input" type="password" placeholder="Clientschlüssel" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} spellCheck={false} autoComplete="off" aria-label="Clientschlüssel" />
                    <div>
                      <button className="btn small" onClick={saveManual} disabled={!clientId || !clientSecret}>
                        Übernehmen
                      </button>
                    </div>
                  </div>
                )}
                {clientErr && <div className="error-text">{clientErr}</div>}
                {!google.encrypted && <div className="error-text">Die sichere Schlüsselablage des Betriebssystems ist nicht verfügbar.</div>}
              </div>
            )}
          </div>

          <div className={`setup-step ${google.clientConfigured ? '' : 'disabled'}`}>
            <div className="step-head">
              <span className="step-dot">2</span>
              <b>Zugriff festlegen und verbinden</b>
            </div>
            <div style={{ paddingLeft: 30 }}>
              <div className="perm-row">
                <span>Google Kalender (Termine im Hauptkalender)</span>
                <Switch label="Kalender" checked={opts.calendar} onChange={(v) => setOpts({ ...opts, calendar: v })} />
              </div>
              <div className="perm-row">
                <span>Gmail (Posteingang)</span>
                <Switch label="Gmail" checked={opts.gmail} onChange={(v) => setOpts({ ...opts, gmail: v })} />
              </div>
              <div className="perm-row">
                <span>
                  Auch bearbeiten
                  <small>Termine anlegen und ändern, E-Mails archivieren und Antworten senden – immer nur nach deiner Bestätigung. Aus = nur lesen.</small>
                </span>
                <Switch label="Bearbeiten erlauben" checked={opts.write} onChange={(v) => setOpts({ ...opts, write: v })} />
              </div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                {connecting ? (
                  <>
                    <span className="row hint">
                      <Loader2 className="spin" size={14} /> Warte auf deine Bestätigung im Browser …
                    </span>
                    <button className="btn small ghost" onClick={cancel}>
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <button className="btn primary" onClick={() => connect()} disabled={!google.clientConfigured || (!opts.calendar && !opts.gmail) || !online}>
                    {google.expired ? 'Neu verbinden' : 'Mit Google verbinden'}
                  </button>
                )}
              </div>
              {connectErr && <div className="error-text" style={{ marginTop: 6 }}>{connectErr}</div>}
              <p className="hint" style={{ marginTop: 10 }}>
                Google zeigt beim ersten Mal „Google hat diese App nicht überprüft“ – das ist bei selbst erstellten Apps normal (Weiter über „Erweitert“). Solange die App im Testmodus ist, läuft die Anmeldung nach 7 Tagen ab; danach hier einfach neu verbinden.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
