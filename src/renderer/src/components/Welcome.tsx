// Begrüßung im Vollbild: erscheint beim ersten Start, die App darunter wird erst danach gezeigt.
// Drei Wege: mit Microsoft anmelden (Daten wiederherstellen), leer starten oder die Demo ansehen.
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CloudDownload, FlaskConical, Loader2, Sparkles } from 'lucide-react'
import { addDemo, removeDemo } from '@shared/demo'
import { useStore } from '@/lib/store'
import { useAccounts } from '@/lib/accounts'

type Step = 'choose' | 'name' | 'restore'
type Start = 'empty' | 'demo'
type Phase = 'idle' | 'signin' | 'loading' | 'done' | 'empty' | 'error'

export function Welcome() {
  const settings = useStore((s) => s.settings)
  const online = useStore((s) => s.online)
  const web = window.tagwerk.platform.version === 'web'
  const [step, setStep] = useState<Step>('choose')
  const [start, setStart] = useState<Start>('demo')
  const [name, setName] = useState(settings.userName)
  const [phase, setPhase] = useState<Phase>('idle')
  const [err, setErr] = useState('')
  const [summary, setSummary] = useState('')
  const [leaving, setLeaving] = useState(false)
  const stepRef = useRef<HTMLDivElement>(null)

  // Fokus beim Schrittwechsel auf die neue Überschrift (Tastatur und Bildschirmleser)
  useEffect(() => {
    stepRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [step])

  const enter = async (patch: { userName?: string }) => {
    const st = useStore.getState()
    await st.updateSettings({ ...patch, onboarded: true })
    setLeaving(true)
    // kurze Ausblendung, dann erscheint die App auf „Heute“
    setTimeout(() => {
      useStore.getState().go('today')
      useStore.getState().openDialog(null)
    }, 260)
  }

  const finishNew = () => {
    const st = useStore.getState()
    st.replaceData(start === 'demo' ? addDemo(st.data) : removeDemo(st.data))
    void enter({ userName: name.trim() })
  }

  const restore = async () => {
    setErr('')
    setPhase('signin')
    const r = await window.tagwerk.microsoft.connect({ mail: true, calendar: true, notes: true, sync: true })
    if (!r.ok) {
      setPhase('error')
      return setErr(r.error ?? 'Die Anmeldung hat nicht geklappt.')
    }
    if (!r.status.caps.sync) {
      setPhase('error')
      return setErr('Der Zugriff auf den Cloud-Speicher wurde nicht freigegeben. Bitte noch einmal anmelden und „OneDrive“ zustimmen.')
    }
    // Beispieldaten weg – gleich kommen die echten Daten
    const st = useStore.getState()
    if (st.data.sources.demo) st.replaceData(removeDemo(st.data))
    void useAccounts.getState().refresh()
    setPhase('loading')
    const t0 = Date.now()
    let cs = await window.tagwerk.cloud.syncNow()
    while (Date.now() - t0 < 30_000 && (cs.syncing || !cs.lastSync)) {
      await new Promise((res) => setTimeout(res, 600))
      cs = await window.tagwerk.cloud.status()
    }
    await new Promise((res) => setTimeout(res, 800)) // Oberfläche übernimmt den Stand
    if (cs.error) {
      setPhase('error')
      return setErr(cs.error)
    }
    if (!cs.lastSync) {
      setPhase('error')
      return setErr('OneDrive hat nicht rechtzeitig geantwortet. Deine Daten sind sicher – versuch es gleich noch einmal oder starte erst einmal ohne.')
    }
    const d = useStore.getState().data
    const others = cs.devices.filter((x) => !x.self)
    if (!others.length) return setPhase('empty')
    const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
    setSummary(
      ([
        [d.tasks.length, 'Aufgabe', 'Aufgaben'],
        [d.notes.length, 'Notiz', 'Notizen'],
        [d.projects.length, 'Projekt', 'Projekte'],
        [d.events.filter((e) => e.source === 'local').length, 'eigener Termin', 'eigene Termine']
      ] as [number, string, string][])
        .filter(([k]) => k > 0)
        .map(([k, a, b]) => n(k, a, b))
        .join(' · ') + ` – zuletzt gesichert auf „${others[0].name}“`
    )
    setPhase('done')
  }
  const busy = phase === 'signin' || phase === 'loading'

  return (
    <div className={`welcome ${leaving ? 'leaving' : ''}`} role="main" aria-label="Willkommen bei Tagwerk">
      <div className="welcome-wash" aria-hidden="true" />
      <div className="welcome-card">
        <aside className="welcome-brand">
          <svg className="welcome-mark" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 15a7 7 0 0 1 14 0z" />
            <rect x="2" y="16.5" width="20" height="2.2" rx="1.1" />
          </svg>
          <h1>Tagwerk</h1>
          <p className="welcome-tag">Dein Tag. Klar geordnet.</p>
          <ul className="welcome-points">
            <li>Kalender, E-Mails, Aufgaben und Notizen an einem Ort</li>
            <li>Essensplan mit Rezepten und gemeinsamer Einkaufsliste</li>
            <li>Deine Daten bleiben auf deinem PC – ohne Tagwerk-Server</li>
          </ul>
        </aside>

        <section className="welcome-main" ref={stepRef} key={step} data-step={step}>
          {step === 'choose' && (
            <>
              <h2 tabIndex={-1} data-autofocus>
                Wie möchtest du starten?
              </h2>
              <div className="welcome-options">
                <button className="welcome-option" onClick={() => (setStart('demo'), setStep('name'))}>
                  <span className="wo-icon demo">
                    <FlaskConical />
                  </span>
                  <span className="wo-text">
                    <b>Demo ansehen</b>
                    <span>Tagwerk mit Beispielterminen, ‑mails und ‑aufgaben ausprobieren. Alles ist als „Demo“ markiert.</span>
                  </span>
                  <ArrowRight className="wo-go" aria-hidden="true" />
                </button>
                <button className="welcome-option" onClick={() => (setStart('empty'), setStep('name'))}>
                  <span className="wo-icon">
                    <Sparkles />
                  </span>
                  <span className="wo-text">
                    <b>Leer starten</b>
                    <span>Ohne Konto und ohne Beispieldaten. Konten verbindest du später, wenn du magst.</span>
                  </span>
                  <ArrowRight className="wo-go" aria-hidden="true" />
                </button>
                <button className="welcome-option" onClick={() => setStep('restore')} disabled={web} aria-describedby={web ? 'wo-web' : undefined}>
                  <span className="wo-icon">
                    <CloudDownload />
                  </span>
                  <span className="wo-text">
                    <b>Mit Microsoft anmelden</b>
                    <span>{web ? 'Nur in der installierten App – die Web-Vorschau hat keinen Cloud-Speicher.' : 'Du nutzt Tagwerk schon auf einem anderen PC? Deine Daten aus dem Cloud-Speicher kommen zurück.'}</span>
                  </span>
                  <ArrowRight className="wo-go" aria-hidden="true" />
                </button>
              </div>
              {web && (
                <p className="welcome-note" id="wo-web">
                  Du bist in der Web-Vorschau: Daten bleiben nur in diesem Browser, Outlook und Apple sind simulierte Testkonten.
                </p>
              )}
            </>
          )}

          {step === 'name' && (
            <form
              className="welcome-form"
              onSubmit={(e) => {
                e.preventDefault()
                finishNew()
              }}
            >
              <h2>{start === 'demo' ? 'Demo ansehen' : 'Leer starten'}</h2>
              <div className={`welcome-explain ${start}`}>
                {start === 'demo' ? (
                  <>
                    <p>
                      <b>Die Beispieldaten sind erfunden</b> – Termine, E-Mails, Aufgaben und Projekte einer fiktiven Person. Sie sind überall mit „Demo“ gekennzeichnet; aus der Demo wird nichts verschickt.
                    </p>
                    <p>Was du änderst oder neu anlegst, bleibt auf diesem PC gespeichert. Die Beispieldaten entfernst du jederzeit unter Einstellungen → Konten → Demo-Datenquelle – eigene Einträge bleiben dabei erhalten.</p>
                  </>
                ) : (
                  <>
                    <p>
                      <b>Tagwerk startet ohne Inhalte.</b> Alles, was du anlegst, bleibt auf diesem PC gespeichert.
                    </p>
                    <p>Outlook, Gmail, Apple Kalender und den Cloud-Speicher verbindest du später unter Einstellungen → Konten.</p>
                  </>
                )}
              </div>
              <label className="welcome-field">
                <span>Wie dürfen wir dich ansprechen? (optional)</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vorname" maxLength={40} data-autofocus autoComplete="given-name" />
              </label>
              <div className="welcome-actions">
                <button type="button" className="btn ghost" onClick={() => setStep('choose')}>
                  <ArrowLeft /> Zurück
                </button>
                <button type="submit" className="btn primary large">
                  {start === 'demo' ? 'Demo öffnen' : 'Loslegen'} <ArrowRight />
                </button>
              </div>
            </form>
          )}

          {step === 'restore' && (
            <div className="welcome-form" aria-live="polite">
              <h2 tabIndex={-1} data-autofocus>
                Mit Microsoft anmelden
              </h2>
              {(phase === 'idle' || phase === 'error') && (
                <div className="welcome-explain">
                  <p>Im Browser meldest du dich mit dem Microsoft-Konto an, mit dem du den Cloud-Speicher auf dem anderen PC eingeschaltet hast, und bestätigst den Zugriff (Outlook-Mail, Kalender, OneNote und der Tagwerk-Ordner in deinem OneDrive – später in den Einstellungen änderbar).</p>
                  {!online && <p className="error-text">Keine Internetverbindung – die Anmeldung geht erst, wenn du wieder online bist.</p>}
                </div>
              )}
              {phase === 'signin' && (
                <p className="welcome-status">
                  <Loader2 className="spin" aria-hidden="true" /> Warte auf deine Anmeldung im Browser …
                </p>
              )}
              {phase === 'loading' && (
                <p className="welcome-status">
                  <Loader2 className="spin" aria-hidden="true" /> Deine Daten werden aus OneDrive geladen …
                </p>
              )}
              {(phase === 'done' || phase === 'empty') && (
                <div className="welcome-done" role="status">
                  <span className="ok-mark">
                    <Check />
                  </span>
                  {phase === 'done' ? (
                    <div>
                      <b>Willkommen zurück{useStore.getState().settings.userName ? `, ${useStore.getState().settings.userName}` : ''}!</b>
                      <span>{summary}</span>
                      <span className="muted">Konten wie Gmail und Apple Kalender verbindest du auf diesem PC einmal neu – Passwörter werden aus Sicherheitsgründen nie in die Cloud kopiert.</span>
                    </div>
                  ) : (
                    <div>
                      <b>Angemeldet – der Cloud-Speicher ist noch leer.</b>
                      <span>In diesem Microsoft-Konto liegen noch keine Tagwerk-Daten. Ab jetzt wird alles, was du hier anlegst, automatisch gesichert.</span>
                    </div>
                  )}
                </div>
              )}
              {phase === 'error' && (
                <p className="error-text" role="alert">
                  {err}
                </p>
              )}
              <div className="welcome-actions">
                {phase === 'done' || phase === 'empty' ? (
                  <>
                    <span />
                    <button className="btn primary large" onClick={() => void enter({})} data-autofocus>
                      Weiter zu Tagwerk <ArrowRight />
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn ghost" onClick={() => (busy ? void window.tagwerk.microsoft.cancelConnect() : (setPhase('idle'), setStep('choose')))}>
                      <ArrowLeft /> {busy ? 'Abbrechen' : 'Zurück'}
                    </button>
                    <button className="btn primary large" onClick={() => void restore()} disabled={busy || !online}>
                      {busy && <Loader2 className="spin" aria-hidden="true" />} {phase === 'error' ? 'Erneut versuchen' : 'Mit Microsoft anmelden'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
