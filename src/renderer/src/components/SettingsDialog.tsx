import { useUpdateStatus, VersionRow } from '@/components/Updates'
import { useState, type ReactNode } from 'react'
import {
  ArrowDown, ArrowUp, Bell, CalendarDays, CalendarPlus, CloudSun, Database, Eye, EyeOff, FlaskConical, KeyRound, LayoutDashboard, Mail, Monitor, Shield, Sparkles, Trash2, Loader2, Check, Download
} from 'lucide-react'
import { createDemoData, removeDemo } from '@shared/demo'
import { CLAUDE_MODELS, type DashboardCardId, type Settings } from '@shared/types'
import { confirm, useStore } from '@/lib/store'
import { VIEW_META } from './Sidebar'
import { GoogleSettings } from './GoogleSettings'
import { OneNoteSettings } from './OneNoteSettings'
import { Dialog, Segmented, Switch } from './ui'
import { isMac, modKey } from '@/lib/format'

type Section = 'general' | 'dashboard' | 'calendar' | 'notifications' | 'sources' | 'claude' | 'privacy'

const SECTIONS: { id: Section; label: string; icon: typeof Monitor }[] = [
  { id: 'general', label: 'Allgemein', icon: Monitor },
  { id: 'dashboard', label: 'Übersicht', icon: LayoutDashboard },
  { id: 'calendar', label: 'Kalender', icon: CalendarDays },
  { id: 'notifications', label: 'Benachrichtigungen', icon: Bell },
  { id: 'sources', label: 'Datenquellen', icon: Database },
  { id: 'claude', label: 'Claude', icon: Sparkles },
  { id: 'privacy', label: 'Datenschutz', icon: Shield }
]

const CARD_LABEL: Record<DashboardCardId, string> = {
  brief: 'Das Wichtigste heute',
  focus: 'Tagesband mit freier Zeit',
  schedule: 'Nächste Termine',
  tasks: 'Aufgaben für heute',
  mail: 'Wichtige E-Mails',
  weather: 'Wetter'
}

export function SettingsDialog({ section }: { section?: string }) {
  const [active, setActive] = useState<Section>((section as Section) ?? 'general')
  const close = () => useStore.getState().openDialog(null)
  return (
    <Dialog title="Einstellungen" onClose={close} wide bodyClass="settings">
      <nav className="settings-nav" aria-label="Bereiche">
        {SECTIONS.map((s) => (
          <button key={s.id} className="nav-item" aria-current={active === s.id ? 'page' : undefined} onClick={() => setActive(s.id)}>
            <s.icon aria-hidden="true" />
            <span className="label">{s.label}</span>
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {active === 'general' && <General />}
        {active === 'dashboard' && <Dashboard />}
        {active === 'calendar' && <CalendarSettings />}
        {active === 'notifications' && <Notifications />}
        {active === 'sources' && <Sources />}
        {active === 'claude' && <ClaudeSettings />}
        {active === 'privacy' && <Privacy />}
      </div>
    </Dialog>
  )
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="label">
        <b>{label}</b>
        {hint && <span>{hint}</span>}
      </div>
      <div className="control">{children}</div>
    </div>
  )
}

function useSettings(): [Settings, (p: Partial<Settings>) => void] {
  const s = useStore((x) => x.settings)
  const update = useStore((x) => x.updateSettings)
  return [s, (p) => void update(p)]
}

function General() {
  const [s, set] = useSettings()
  const updates = useUpdateStatus()
  const [shortcut, setShortcut] = useState(s.quickNoteShortcut)
  const [scError, setScError] = useState('')
  const saveShortcut = async () => {
    await useStore.getState().updateSettings({ quickNoteShortcut: shortcut })
    const now = useStore.getState().settings.quickNoteShortcut
    if (now !== shortcut) {
      setScError('Diese Tastenkombination ist belegt oder ungültig. Die bisherige bleibt aktiv.')
      setShortcut(now)
    } else setScError('')
  }
  return (
    <>
      <h3>Allgemein</h3>
      <Row label="Dein Name" hint="Für die Begrüßung und Antwortentwürfe.">
        <input className="input" value={s.userName} onChange={(e) => set({ userName: e.target.value })} placeholder="Vorname" />
      </Row>
      <Row label="Erscheinungsbild">
        <select className="select" value={s.theme} onChange={(e) => set({ theme: e.target.value as Settings['theme'] })}>
          <option value="system">Wie System</option>
          <option value="light">Hell</option>
          <option value="dark">Dunkel</option>
        </select>
      </Row>
      {updates?.state === 'store' ? (
        <Row label="Beim Anmelden starten" hint="Bei der Store-Version schaltest du das in Windows ein: Einstellungen → Apps → Autostart → Tagwerk. Tagwerk startet dann unauffällig im Hintergrund.">
          <span className="hint">in Windows</span>
        </Row>
      ) : (
        <Row label="Beim Anmelden starten" hint="Tagwerk startet unauffällig im Hintergrund. Gilt für die installierte App.">
          <Switch label="Beim Anmelden starten" checked={s.launchAtLogin} onChange={(v) => set({ launchAtLogin: v })} />
        </Row>
      )}
      <Row label={isMac() ? 'In der Menüleiste weiterlaufen' : 'Im Infobereich weiterlaufen'} hint="Beim Schließen des Fensters bleibt Tagwerk für Erinnerungen und Schnellnotizen aktiv.">
        <Switch label="Im Hintergrund weiterlaufen" checked={s.closeToTray} onChange={(v) => set({ closeToTray: v })} />
      </Row>
      <Row
        label="Schnellnotiz (systemweit)"
        hint={
          <>
            Funktioniert auch, wenn Tagwerk im Hintergrund ist. Format z. B. <code>CommandOrControl+Shift+Space</code>.
            {scError && <span className="error-text" style={{ display: 'block' }}>{scError}</span>}
          </>
        }
      >
        <input className="input" value={shortcut} onChange={(e) => setShortcut(e.target.value)} onBlur={saveShortcut} onKeyDown={(e) => e.key === 'Enter' && saveShortcut()} aria-label="Tastenkombination für Schnellnotiz" />
      </Row>
      <VersionRow />
    </>
  )
}

function OrderList<T extends { id: string; visible: boolean }>({ items, label, onChange }: { items: T[]; label: (id: string) => string; onChange: (items: T[]) => void }) {
  const move = (i: number, d: number) => {
    const next = [...items]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x)
    onChange(next)
  }
  return (
    <div className="order-list">
      {items.map((it, i) => (
        <div className="order-item" key={it.id}>
          <span className="grow">{label(it.id)}</span>
          <button className="btn ghost small icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${label(it.id)} nach oben`}>
            <ArrowUp />
          </button>
          <button className="btn ghost small icon-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`${label(it.id)} nach unten`}>
            <ArrowDown />
          </button>
          <button className="btn ghost small icon-btn" onClick={() => onChange(items.map((x) => (x.id === it.id ? { ...x, visible: !x.visible } : x)))} aria-label={it.visible ? `${label(it.id)} ausblenden` : `${label(it.id)} einblenden`} aria-pressed={it.visible}>
            {it.visible ? <Eye /> : <EyeOff />}
          </button>
        </div>
      ))}
    </div>
  )
}

function Dashboard() {
  const [s, set] = useSettings()
  return (
    <>
      <h3>Tagesübersicht</h3>
      <p>Reihenfolge und Sichtbarkeit der Bereiche auf „Heute“.</p>
      <OrderList items={s.dashboardCards} label={(id) => CARD_LABEL[id as DashboardCardId]} onChange={(dashboardCards) => set({ dashboardCards })} />
      <h3>Seitenleiste</h3>
      <p>Welche Bereiche in der Navigation erscheinen. Ausgeblendete bleiben über die Suche ({modKey()}+K) erreichbar.</p>
      <OrderList
        items={s.sidebar}
        label={(id) => VIEW_META[id as keyof typeof VIEW_META].label}
        onChange={(sidebar) => {
          if (!sidebar.some((x) => x.visible)) return
          set({ sidebar })
        }}
      />
    </>
  )
}

function CalendarSettings() {
  const [s, set] = useSettings()
  const hours = Array.from({ length: 24 }, (_, i) => i)
  return (
    <>
      <h3>Kalender</h3>
      <Row label="Arbeitszeit" hint="Freie Zeit und übervolle Tage werden innerhalb dieses Rahmens berechnet.">
        <select className="select" style={{ width: 90 }} value={s.workHours.start} onChange={(e) => set({ workHours: { ...s.workHours, start: Math.min(Number(e.target.value), s.workHours.end - 1) } })} aria-label="Beginn">
          {hours.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
        bis
        <select className="select" style={{ width: 90 }} value={s.workHours.end} onChange={(e) => set({ workHours: { ...s.workHours, end: Math.max(Number(e.target.value), s.workHours.start + 1) } })} aria-label="Ende">
          {hours.slice(1).map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
      </Row>
      <Row label="Freie Zeit anzeigen ab" hint="Kürzere Lücken gelten nicht als Zeit für konzentriertes Arbeiten.">
        <select className="select" value={s.focusMinMinutes} onChange={(e) => set({ focusMinMinutes: Number(e.target.value) })}>
          {[30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m} Minuten
            </option>
          ))}
        </select>
      </Row>
      <Row label="Puffer bei Ortswechsel" hint="Darunter wird ein Übergang zwischen Terminen an verschiedenen Orten als zu knapp markiert.">
        <select className="select" value={s.transitionBufferMinutes} onChange={(e) => set({ transitionBufferMinutes: Number(e.target.value) })}>
          {[0, 5, 10, 15, 20, 30].map((m) => (
            <option key={m} value={m}>
              {m === 0 ? 'Aus' : `${m} Minuten`}
            </option>
          ))}
        </select>
      </Row>
    </>
  )
}

function Notifications() {
  const [s, set] = useSettings()
  const n = s.notifications
  const setN = (patch: Partial<typeof n>) => set({ notifications: { ...n, ...patch } })
  const [vip, setVip] = useState(n.vipSenders.join(', '))
  const [test, setTest] = useState<string>('')
  const sendTest = async () => {
    const r = await window.tagwerk.app.notify({
      kind: 'test',
      title: 'So sehen Benachrichtigungen aus',
      body: 'Neue E-Mails, Termine und Erinnerungen erscheinen hier unten rechts – auch wenn Tagwerk im Hintergrund läuft.',
      target: { view: 'command', id: 'open-settings' }
    })
    setTest(
      r.shown
        ? 'Gesendet – schau unten rechts auf deinen Bildschirm.'
        : r.reason === 'focus'
          ? 'Der Fokus-Modus hält Benachrichtigungen gerade zurück.'
          : 'Windows hat die Benachrichtigung nicht angezeigt. Prüfe unter Windows-Einstellungen → System → Benachrichtigungen, ob Tagwerk erlaubt ist.'
    )
  }
  return (
    <>
      <h3>Benachrichtigungen</h3>
      <p>Erscheinen unten rechts auf dem Bildschirm – auch wenn das Fenster geschlossen ist und Tagwerk im Infobereich läuft. Ein Klick öffnet direkt den passenden Termin, die Mail oder die Übersicht.</p>

      <Row label="Darstellung" hint="Tagwerk-Pop-ups haben Schaltflächen zum Öffnen, Archivieren oder später Erinnern. Termine bleiben stehen, bis du sie wegklickst.">
        <Segmented
          label="Darstellung"
          value={n.style}
          onChange={(v) => setN({ style: v })}
          options={[
            { id: 'popup', label: 'Tagwerk-Pop-up' },
            { id: 'windows', label: 'Windows' }
          ]}
        />
      </Row>

      <div className="settings-group">Termine</div>
      <Row label="Vor Terminen erinnern" hint="Mit Uhrzeit, Ort und Warnung bei Überschneidungen. Für einzelne Termine stellst du die Erinnerung direkt im Termin ein.">
        <Switch label="Vor Terminen erinnern" checked={n.events} onChange={(v) => setN({ events: v })} />
      </Row>
      <Row label="Vorlaufzeit">
        <select className="select" value={n.leadMinutes} disabled={!n.events} onChange={(e) => setN({ leadMinutes: Number(e.target.value) })}>
          {[5, 10, 15, 30, 60].map((m) => (
            <option key={m} value={m}>
              {m === 60 ? '1 Stunde' : `${m} Minuten`} vorher
            </option>
          ))}
        </select>
      </Row>
      <Row label="Auch zum Beginn erinnern" hint="Zweiter Hinweis, wenn der Termin anfängt.">
        <Switch label="Auch zum Beginn erinnern" checked={n.eventsAtStart} disabled={!n.events} onChange={(v) => setN({ eventsAtStart: v })} />
      </Row>

      <div className="settings-group">E-Mails</div>
      <Row label="Neue E-Mails melden" hint="„Wichtige“: von Gmail als wichtig markiert, wartet auf deine Antwort oder kommt von einem deiner wichtigen Absender. Mehrere neue Mails kommen gebündelt in einer Meldung.">
        <Segmented
          label="Neue E-Mails melden"
          value={n.mail}
          onChange={(v) => setN({ mail: v })}
          options={[
            { id: 'off', label: 'Aus' },
            { id: 'important', label: 'Wichtige' },
            { id: 'all', label: 'Alle' }
          ]}
        />
      </Row>
      <Row label="Wichtige Absender" hint="Werden immer gemeldet. Komma-getrennt, z. B. „chef@firma.de, @uni.de“ (ganze Domain).">
        <input
          className="input"
          value={vip}
          disabled={n.mail === 'off'}
          placeholder="name@beispiel.de, @firma.de"
          spellCheck={false}
          onChange={(e) => setVip(e.target.value)}
          onBlur={() => setN({ vipSenders: vip.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /@/.test(x)) })}
          aria-label="Wichtige Absender"
        />
      </Row>

      <div className="settings-group">Tagesüberblick</div>
      <Row label="Morgendlicher Überblick" hint="Konflikte, Überfälliges und wartende E-Mails auf einen Blick.">
        <Switch label="Morgendlicher Überblick" checked={n.dailyBrief} onChange={(v) => setN({ dailyBrief: v })} />
      </Row>
      <Row label="Uhrzeit">
        <input type="time" className="input" value={n.briefTime} disabled={!n.dailyBrief} onChange={(e) => setN({ briefTime: e.target.value })} />
      </Row>

      <div className="settings-group">Wochenrückblick</div>
      <Row label="Wochenrückblick" hint="Erledigte Aufgaben, Fokuszeit, offene Mails und was nächste Woche ansteht. Jederzeit auch über „Heute“ → Wochenrückblick.">
        <Switch label="Wochenrückblick" checked={n.weeklyReview.enabled} onChange={(v) => setN({ weeklyReview: { ...n.weeklyReview, enabled: v } })} />
      </Row>
      <Row label="Wann">
        <div className="row" style={{ gap: 8 }}>
          <select className="select" style={{ width: 130 }} value={n.weeklyReview.day} disabled={!n.weeklyReview.enabled} onChange={(e) => setN({ weeklyReview: { ...n.weeklyReview, day: Number(e.target.value) } })} aria-label="Wochentag">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <option key={d} value={d}>
                {['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][d]}
              </option>
            ))}
          </select>
          <input type="time" className="input" style={{ width: 110 }} value={n.weeklyReview.time} disabled={!n.weeklyReview.enabled} onChange={(e) => setN({ weeklyReview: { ...n.weeklyReview, time: e.target.value } })} aria-label="Uhrzeit" />
        </div>
      </Row>

      <div className="settings-group">Ruhe</div>
      <Row label="Ruhezeiten" hint="In dieser Zeit meldet Tagwerk nichts. Der Fokus-Modus schaltet Meldungen zusätzlich stumm (Termine optional).">
        <Switch label="Ruhezeiten" checked={n.quiet.enabled} onChange={(v) => setN({ quiet: { ...n.quiet, enabled: v } })} />
      </Row>
      <Row label="Von – bis">
        <div className="row" style={{ gap: 8 }}>
          <input type="time" className="input" style={{ width: 110 }} value={n.quiet.from} disabled={!n.quiet.enabled} onChange={(e) => setN({ quiet: { ...n.quiet, from: e.target.value } })} aria-label="Ruhezeit von" />
          <span className="hint">bis</span>
          <input type="time" className="input" style={{ width: 110 }} value={n.quiet.to} disabled={!n.quiet.enabled} onChange={(e) => setN({ quiet: { ...n.quiet, to: e.target.value } })} aria-label="Ruhezeit bis" />
        </div>
      </Row>
      <Row label="Ton" hint="Leiser Hinweiston bei neuen Benachrichtigungen.">
        <Switch label="Ton" checked={n.sound} onChange={(v) => setN({ sound: v })} />
      </Row>

      <Row label="Test" hint={test || undefined}>
        <button className="btn small" onClick={sendTest}>
          Testbenachrichtigung senden
        </button>
      </Row>
    </>
  )
}

function Sources() {
  const data = useStore((s) => s.data)
  const mutate = useStore((s) => s.mutate)
  const toast = useStore((s) => s.toast)
  const [s, set] = useSettings()
  const [city, setCity] = useState(s.weather.city)
  const [importing, setImporting] = useState(false)

  const importIcs = async () => {
    setImporting(true)
    const r = await window.tagwerk.ics.import()
    setImporting(false)
    if (r.canceled) return
    if (!r.ok || !r.events || !r.import) return toast(r.error ?? 'Import fehlgeschlagen', { tone: 'error' })
    mutate((d) => ({ ...d, events: [...d.events, ...r.events!], sources: { ...d.sources, icsImports: [...d.sources.icsImports, r.import!] } }), {
      toast: `${r.import.count} Termine aus „${r.import.name}“ importiert`
    })
  }
  const removeImport = async (id: string, name: string) => {
    const ok = await confirm({ title: 'Import entfernen?', body: `Alle Termine aus „${name}“ werden aus Tagwerk entfernt. Die Originaldatei bleibt unverändert.`, confirmLabel: 'Entfernen', danger: true })
    if (ok) mutate((d) => ({ ...d, events: d.events.filter((e) => e.importId !== id), sources: { ...d.sources, icsImports: d.sources.icsImports.filter((i) => i.id !== id) } }), { toast: 'Import entfernt', undoable: true })
  }
  const toggleDemo = async () => {
    if (data.sources.demo) {
      const ok = await confirm({ title: 'Demo-Daten entfernen?', body: 'Alle Beispieltermine, -mails, -aufgaben und -projekte werden entfernt. Eigene Einträge und Importe bleiben erhalten.', confirmLabel: 'Demo-Daten entfernen', danger: true })
      if (ok) mutate(removeDemo, { toast: 'Demo-Daten entfernt', undoable: true })
    } else {
      const demo = createDemoData()
      mutate((d) => ({ ...d, tasks: [...demo.tasks, ...d.tasks], events: [...d.events, ...demo.events], emails: [...d.emails, ...demo.emails], notes: [...demo.notes, ...d.notes], projects: [...demo.projects, ...d.projects], docs: [...demo.docs, ...d.docs], sources: { ...d.sources, demo: true } }), { toast: 'Demo-Daten geladen' })
    }
  }

  return (
    <>
      <h3>Datenquellen</h3>
      <p>Tagwerk nutzt externe Konten nur, wenn du sie ausdrücklich verbindest. Synchronisierte Daten liegen lokal auf diesem Gerät, Zugangsdaten verschlüsselt im Schlüsselspeicher des Betriebssystems.</p>

      <div className="source-row">
        <div className="icon"><FlaskConical /></div>
        <div className="label">
          <b>Demo-Datenquelle {data.sources.demo ? <span className="tag demo">aktiv</span> : <span className="tag">aus</span>}</b>
          <span>Beispieltermine, -mails und -aufgaben zum Ausprobieren. Werden überall als „Demo“ gekennzeichnet.</span>
        </div>
        <button className="btn small" onClick={toggleDemo}>{data.sources.demo ? 'Entfernen' : 'Laden'}</button>
      </div>

      <GoogleSettings />

      <OneNoteSettings />

      <div className="source-row">
        <div className="icon"><CalendarPlus /></div>
        <div className="label">
          <b>Kalenderdatei (.ics) <span className="tag ok">verfügbar</span></b>
          <span>Export aus Outlook, Google Kalender oder Apple Kalender importieren. Importierte Termine sind schreibgeschützt und werden nicht automatisch aktualisiert.</span>
        </div>
        <button className="btn small" onClick={importIcs} disabled={importing}>{importing ? <Loader2 className="spin" /> : null} Datei importieren</button>
      </div>
      {data.sources.icsImports.map((i) => (
        <div key={i.id} className="source-row" style={{ paddingLeft: 46 }}>
          <div className="label">
            <b>{i.name}</b>
            <span>{i.count} Termine · importiert am {new Date(i.importedAt).toLocaleString('de-DE')}</span>
          </div>
          <button className="btn small ghost" onClick={() => removeImport(i.id, i.name)}><Trash2 /> Entfernen</button>
        </div>
      ))}

      {[
        { icon: Mail, name: 'Microsoft 365 / Outlook', text: 'Direkte Kontoverbindung (Microsoft Graph) ist noch nicht eingerichtet.' },
        { icon: Mail, name: 'E-Mail per IMAP/SMTP', text: 'Noch nicht verfügbar.' }
      ].map((x) => (
        <div key={x.name} className="source-row">
          <div className="icon"><x.icon /></div>
          <div className="label">
            <b>{x.name} <span className="tag">nicht verbunden</span></b>
            <span>{x.text}</span>
          </div>
          <button className="btn small" disabled title="Noch nicht verfügbar">Verbinden</button>
        </div>
      ))}

      <h3>Wetter</h3>
      <div className="source-row">
        <div className="icon"><CloudSun /></div>
        <div className="label">
          <b>Open-Meteo {s.weather.enabled && s.weather.city ? <span className="tag ok">aktiv</span> : <span className="tag">aus</span>}</b>
          <span>Kein Konto nötig. Übertragen wird nur der eingetragene Ort. Erscheint auf „Heute“, wenn die Karte „Wetter“ eingeblendet ist.</span>
        </div>
        <Switch
          label="Wetter aktivieren"
          checked={s.weather.enabled}
          onChange={(v) => {
            set({ weather: { ...s.weather, enabled: v } })
            if (v) set({ dashboardCards: s.dashboardCards.map((c) => (c.id === 'weather' ? { ...c, visible: true } : c)) })
          }}
        />
      </div>
      {s.weather.enabled && (
        <Row label="Ort">
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} onBlur={() => set({ weather: { ...s.weather, city: city.trim() } })} onKeyDown={(e) => e.key === 'Enter' && set({ weather: { ...s.weather, city: city.trim() } })} placeholder="z. B. Frankfurt am Main" />
        </Row>
      )}
      <Row label="Pendelzeit" hint="Benötigt einen Routendienst – noch nicht verfügbar.">
        <span className="tag">nicht verbunden</span>
      </Row>
    </>
  )
}

function ClaudeSettings() {
  const claude = useStore((s) => s.claude)
  const refresh = useStore((s) => s.refreshClaude)
  const [s, set] = useSettings()
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [state, setState] = useState<{ busy: boolean; error?: string; ok?: boolean }>({ busy: false })

  const save = async () => {
    setState({ busy: true })
    const r = await window.tagwerk.claude.setKey(key)
    setState({ busy: false, error: r.error, ok: r.ok })
    if (r.ok) {
      setKey('')
      refresh()
    }
  }
  const remove = async () => {
    const ok = await confirm({ title: 'Claude trennen?', body: 'Der gespeicherte API-Schlüssel wird von diesem Gerät gelöscht.', confirmLabel: 'Trennen', danger: true })
    if (!ok) return
    await window.tagwerk.claude.clearKey()
    refresh()
  }

  return (
    <>
      <h3>Claude</h3>
      <p>Claude beantwortet Fragen zu deinem Tag, fasst E-Mails zusammen und entwirft Antworten. Aktionen schlägt Claude nur vor – du bestätigst sie.</p>
      <Row label="Claude-Funktionen anzeigen" hint="Die Claude API ist kostenpflichtig (Abrechnung nach Nutzung bei Anthropic). Ausgeschaltet verschwinden Assistent und alle Claude-Knöpfe – Tagwerk funktioniert ohne Claude vollständig.">
        <Switch label="Claude-Funktionen anzeigen" checked={s.claude.enabled} onChange={(v) => set({ claude: { ...s.claude, enabled: v } })} />
      </Row>
      {s.claude.enabled && (
      <>
      <div className="source-row">
        <div className="icon"><KeyRound /></div>
        <div className="label">
          <b>Anthropic-API-Schlüssel {claude.configured ? <span className="tag ok">verbunden</span> : <span className="tag">nicht verbunden</span>}</b>
          <span>
            {claude.configured
              ? 'Verschlüsselt im Schlüsselspeicher des Betriebssystems gespeichert.'
              : 'Einen Schlüssel erstellst du auf platform.claude.com unter Settings → API keys. Er wird vor dem Speichern geprüft.'}
          </span>
        </div>
        {claude.configured && <button className="btn small" onClick={remove}>Trennen</button>}
      </div>
      {!claude.configured && !claude.encrypted && (
        <div className="callout" style={{ margin: '12px 0' }}>
          Die sichere Schlüsselablage des Betriebssystems ist nicht verfügbar. Ohne sie speichert Tagwerk keinen API-Schlüssel.
        </div>
      )}
      {!claude.configured && claude.encrypted && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0' }}>
          <div className="row">
            <input className="input" type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" aria-label="API-Schlüssel" autoComplete="off" spellCheck={false} onKeyDown={(e) => e.key === 'Enter' && key && save()} />
            <button className="btn icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Schlüssel verbergen' : 'Schlüssel anzeigen'}>{show ? <EyeOff /> : <Eye />}</button>
            <button className="btn primary" onClick={save} disabled={!key.trim() || state.busy}>{state.busy ? <Loader2 className="spin" /> : null} Prüfen und speichern</button>
          </div>
          {state.error && <div className="error-text">{state.error}</div>}
          <a className="link" href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">API-Schlüssel erstellen</a>
        </div>
      )}
      <Row label="Workspace-ID (optional)" hint="Nur nötig, wenn dein Schlüssel keinem Workspace zugeordnet ist. Beginnt mit „wrkspc_“.">
        <input
          className="input"
          defaultValue={s.claude.workspaceId ?? ''}
          placeholder="wrkspc_…"
          spellCheck={false}
          onBlur={(e) => set({ claude: { ...s.claude, workspaceId: e.target.value.trim() || undefined } })}
          aria-label="Workspace-ID"
        />
      </Row>
      {state.ok && <div className="row hint" style={{ padding: '8px 0' }}><Check size={14} color="var(--ok)" /> Claude ist verbunden.</div>}
      <Row label="Modell">
        <select className="select" value={s.claude.model} onChange={(e) => set({ claude: { ...s.claude, model: e.target.value } })}>
          {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Row>
      <Row label="E-Mail-Inhalte mitsenden" hint="Aus: Claude sieht nur Betreff, Absender und Status – Inhalte nur, wenn du eine Mail ausdrücklich zusammenfassen oder beantworten lässt.">
        <Switch label="E-Mail-Inhalte mitsenden" checked={s.claude.includeEmailBodies} onChange={(v) => set({ claude: { ...s.claude, includeEmailBodies: v } })} />
      </Row>
      <p className="hint" style={{ marginTop: 12 }}>
        Bei jeder Frage werden Termine der nächsten 7 Tage, offene Aufgaben, Projekte, Notiztitel und die Posteingangsübersicht an die Claude API von Anthropic übertragen. Nichts wird im Hintergrund gesendet.
      </p>
      </>
      )}
    </>
  )
}

function Privacy() {
  const [s, set] = useSettings()
  const mutate = useStore((x) => x.mutate)
  const toast = useStore((x) => x.toast)
  const chatCount = useStore((x) => x.data.chat.length)
  const wipe = async () => {
    const ok = await confirm({
      title: 'Alle Daten löschen?',
      body: 'Aufgaben, Termine, Notizen, Projekte, importierte Kalender, Gesprächsverlauf, Einstellungen und der gespeicherte API-Schlüssel werden unwiderruflich von diesem Gerät gelöscht. Tagwerk startet danach neu.',
      confirmLabel: 'Alles löschen',
      danger: true
    })
    if (!ok) return
    await window.tagwerk.data.wipe()
    location.reload()
  }
  return (
    <>
      <h3>Datenschutz & Aufbewahrung</h3>
      <p>Alle Daten werden ausschließlich lokal gespeichert. Protokolle enthalten keine Inhalte aus Mails, Notizen oder Gesprächen.</p>
      <Row label="Archivierte Aufgaben aufbewahren">
        <select className="select" value={s.retention.archivedTasksDays} onChange={(e) => set({ retention: { archivedTasksDays: Number(e.target.value) } })}>
          <option value={30}>30 Tage</option>
          <option value={90}>90 Tage</option>
          <option value={180}>6 Monate</option>
          <option value={365}>1 Jahr</option>
          <option value={0}>Unbegrenzt</option>
        </select>
      </Row>
      <Row label="Gesprächsverlauf mit Claude aufbewahren">
        <select className="select" value={s.claude.chatRetentionDays} onChange={(e) => set({ claude: { ...s.claude, chatRetentionDays: Number(e.target.value) } })}>
          <option value={1}>1 Tag</option>
          <option value={7}>7 Tage</option>
          <option value={30}>30 Tage</option>
          <option value={0}>Unbegrenzt</option>
        </select>
      </Row>
      <Row label="Gesprächsverlauf jetzt löschen" hint={chatCount ? `${chatCount} Nachrichten gespeichert` : 'Kein Verlauf vorhanden'}>
        <button className="btn small" disabled={!chatCount} onClick={() => mutate((d) => ({ ...d, chat: [] }), { toast: 'Verlauf gelöscht', undoable: true })}>Löschen</button>
      </Row>
      <Row label="Daten exportieren" hint="Alle Einträge als JSON-Datei, z. B. zur Sicherung.">
        <button className="btn small" onClick={async () => { const r = await window.tagwerk.data.exportJson(); if (r.ok) toast('Export gespeichert') }}><Download /> Exportieren</button>
      </Row>
      <Row label="Alle Daten löschen" hint="Setzt Tagwerk vollständig zurück.">
        <button className="btn small danger" onClick={wipe}><Trash2 /> Alles löschen</button>
      </Row>
    </>
  )
}

// ---------- Erster Start ----------

export function OnboardingDialog() {
  const settings = useStore((s) => s.settings)
  const [name, setName] = useState(settings.userName)
  const [withDemo, setWithDemo] = useState(true)
  const finish = async () => {
    const st = useStore.getState()
    await st.updateSettings({ userName: name.trim(), onboarded: true })
    if (!withDemo && st.data.sources.demo) st.replaceData(removeDemo(st.data))
    st.openDialog(null)
  }
  return (
    <Dialog
      title="Willkommen bei Tagwerk"
      onClose={finish}
      footer={<button className="btn primary" onClick={finish}>Loslegen</button>}
    >
      <p>Tagwerk bündelt Kalender, E-Mails, Aufgaben, Notizen und Projekte – ruhig und an einem Ort.</p>
      <label className="field">
        <span>Wie dürfen wir dich ansprechen?</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vorname" data-autofocus onKeyDown={(e) => e.key === 'Enter' && finish()} />
      </label>
      <div className="field">
        <span className="field-label">Womit möchtest du starten?</span>
        <label className="row" style={{ gap: 8 }}>
          <input type="radio" name="start" checked={withDemo} onChange={() => setWithDemo(true)} /> Mit Beispieldaten ausprobieren (klar als „Demo“ gekennzeichnet)
        </label>
        <label className="row" style={{ gap: 8 }}>
          <input type="radio" name="start" checked={!withDemo} onChange={() => setWithDemo(false)} /> Leer starten
        </label>
      </div>
      <p className="hint">Es ist noch kein Konto verbunden. Kalenderdateien und Claude kannst du jederzeit in den Einstellungen hinzufügen.</p>
    </Dialog>
  )
}

export function ShortcutsDialog() {
  const m = modKey()
  const rows: [string, string][] = [
    [`${m} K`, 'Suchen & Befehle'],
    [`${m} 1–6`, 'Bereiche wechseln'],
    [`${m} J`, 'Claude-Assistent ein/aus'],
    [`${m} N`, 'Neue Aufgabe'],
    [`${m} ⇧ N`, 'Neuer Termin'],
    [`${m} \\`, 'Seitenleiste ein/aus'],
    [`${m} ,`, 'Einstellungen'],
    [useStore.getState().settings.quickNoteShortcut.replace('CommandOrControl', m).replace(/\+/g, ' '), 'Schnellnotiz – systemweit'],
    ['T · ← →', 'Kalender: heute, zurück, weiter'],
    ['D · W · M', 'Kalender: Tag, Woche, Monat'],
    ['J · K', 'Posteingang: nächste / vorherige'],
    [`${m} ⇧ F`, 'Fokus-Modus'],
    ['Leertaste', 'Fokus: Pause / Weiter'],
    ['E', 'Posteingang: archivieren'],
    ['Entf', 'Posteingang: löschen (Papierkorb)'],
    ['S', 'Posteingang: merken (Stern)'],
    ['A', 'Posteingang: Antwort offen an/aus'],
    [`${m} Enter`, 'Antwort senden (mit Bestätigung)']
  ]
  return (
    <Dialog title="Tastenkürzel" onClose={() => useStore.getState().openDialog(null)}>
      <div className="list">
        {rows.map(([k, v]) => (
          <div key={v} className="setting" style={{ padding: '8px 0' }}>
            <div className="label">{v}</div>
            <div className="control">{k.split(' ').map((x, i) => <kbd key={i}>{x}</kbd>)}</div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
