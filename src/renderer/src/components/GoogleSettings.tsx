import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, ExternalLink, FileJson, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { removeDemo } from '@shared/demo'
import { GMAIL_CATEGORIES, type GmailCategory } from '@shared/types'
import { confirm, useStore } from '@/lib/store'
import { Switch } from './ui'

// Direkte Links in die Google Cloud Console – jeweils genau der richtige Schritt
const G = {
  project: 'https://console.cloud.google.com/projectcreate',
  gmailApi: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
  calendarApi: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
  branding: 'https://console.cloud.google.com/auth/branding',
  audience: 'https://console.cloud.google.com/auth/audience',
  client: 'https://console.cloud.google.com/auth/clients/create'
}

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
  // Standard: nur Gmail – den Google Kalender schaltest du bei Bedarf dazu
  const [opts, setOpts] = useState({ calendar: false, gmail: true, write: true })
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
        <div className="icon acc-icon google">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.6a4.8 4.8 0 0 1-2.1 3.2v2.6h3.4c2-1.8 3.1-4.5 3.1-7.6z" />
            <path fill="#34A853" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.7A10 10 0 0 0 12 22z" />
            <path fill="#FBBC05" d="M6.2 13.6a6 6 0 0 1 0-3.9V7H2.7a10 10 0 0 0 0 9l3.5-2.4z" />
            <path fill="#EA4335" d="M12 5.9c1.5 0 2.9.5 4 1.5l3-3A10 10 0 0 0 2.7 7l3.5 2.7C7 7.7 9.3 5.9 12 5.9z" />
          </svg>
        </div>
        <div className="label">
          <b>
            Gmail{google.caps.calendarRead ? ' & Google Kalender' : ''}{' '}
            {google.connected ? <span className="tag ok">verbunden</span> : google.expired ? <span className="tag alert">abgelaufen</span> : <span className="tag">nicht verbunden</span>}
          </b>
          <span>
            {google.connected
              ? google.email
              : google.expired
                ? 'Die Anmeldung ist abgelaufen oder wurde widerrufen. Verbinde neu – deine Einstellungen bleiben erhalten.'
                : 'Die letzten 40 Unterhaltungen aus deinem Gmail-Posteingang – optional auch der Google Kalender.'}
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
            {guideOpen ? <ChevronDown /> : <ChevronRight />} Einmalige Einrichtung bei Google · 6 Schritte · ca. 5 Minuten
          </button>
          {guideOpen && (
            <ol className="guide steps-linked">
              <li>
                <a className="btn small" href={G.project} target="_blank" rel="noreferrer">
                  <ExternalLink /> Neues Projekt anlegen
                </a>
                <span>
                  Mit deinem Google-Konto anmelden, Projektname <code>Tagwerk</code> → <b>Erstellen</b>. Oben links muss danach „Tagwerk“ ausgewählt sein.
                </span>
              </li>
              <li>
                <a className="btn small" href={G.gmailApi} target="_blank" rel="noreferrer">
                  <ExternalLink /> Gmail API aktivieren
                </a>
                <span>
                  Auf <b>Aktivieren</b> klicken. Brauchst du auch den Google Kalender:{' '}
                  <a href={G.calendarApi} target="_blank" rel="noreferrer">
                    Calendar API aktivieren
                  </a>
                  .
                </span>
              </li>
              <li>
                <a className="btn small" href={G.branding} target="_blank" rel="noreferrer">
                  <ExternalLink /> App einrichten
                </a>
                <span>
                  <b>Jetzt starten</b> → App-Name <code>Tagwerk</code>, deine Gmail-Adresse als Support-E-Mail → <b>Weiter</b> → Zielgruppe <b>Extern</b> → <b>Weiter</b> → deine Gmail-Adresse als Kontakt → Zustimmen → <b>Erstellen</b>.
                </span>
              </li>
              <li>
                <a className="btn small" href={G.audience} target="_blank" rel="noreferrer">
                  <ExternalLink /> Dich als Testnutzer eintragen
                </a>
                <span>
                  Unter „Testnutzer“ auf <b>+ Nutzer hinzufügen</b> → deine Gmail-Adresse → <b>Speichern</b>.
                </span>
              </li>
              <li>
                <a className="btn small" href={G.client} target="_blank" rel="noreferrer">
                  <ExternalLink /> Zugangsdaten erstellen
                </a>
                <span>
                  Anwendungstyp <b>Desktopanwendung</b>, Name <code>Tagwerk</code> → <b>Erstellen</b>. Im Fenster danach auf <b>JSON herunterladen</b> klicken.
                </span>
              </li>
              <li>
                <span>Unten auf „client_secret-Datei auswählen“ klicken, die heruntergeladene Datei wählen und mit Google verbinden.</span>
              </li>
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
