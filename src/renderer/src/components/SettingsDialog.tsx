import { useUpdateStatus, VersionRow } from '@/components/Updates'
import { useState, type ReactNode } from 'react'
import { useAccounts } from '@/lib/accounts'
import {
  ArrowDown, ArrowUp, Bell, CalendarDays, CalendarPlus, CloudSun, Database, Eye, EyeOff, FlaskConical, KeyRound, LayoutDashboard, Monitor, Shield, Sparkles, Trash2, Loader2, Check, Download,
  X
} from 'lucide-react'
import { createDemoData, removeDemo } from '@shared/demo'
import { CLAUDE_MODELS, type DashboardCardId, type Settings, type Source, type SuggestionKind } from '@shared/types'
import { confirm, useStore } from '@/lib/store'
import { VIEW_META } from './Sidebar'
import { GoogleSettings } from './GoogleSettings'
import { MicrosoftSettings } from './OneNoteSettings'
import { ICloudSettings } from './ICloudSettings'
import { Dialog, Segmented, Select, Switch } from './ui'
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
        <Select<Settings['theme']> aria-label="Erscheinungsbild" value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'system', label: 'Wie System' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }]} />
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
      <MailInsightsSettings />
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
        <Select aria-label="Beginn" style={{ width: 96 }} value={String(s.workHours.start)} onChange={(v) => set({ workHours: { ...s.workHours, start: Math.min(Number(v), s.workHours.end - 1) } })} options={hours.map((h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))} />
        bis
        <Select aria-label="Ende" style={{ width: 96 }} value={String(s.workHours.end)} onChange={(v) => set({ workHours: { ...s.workHours, end: Math.max(Number(v), s.workHours.start + 1) } })} options={hours.slice(1).map((h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))} />
      </Row>
      <Row label="Freie Zeit anzeigen ab" hint="Kürzere Lücken gelten nicht als Zeit für konzentriertes Arbeiten.">
        <Select aria-label="Freie Zeit anzeigen ab" value={String(s.focusMinMinutes)} onChange={(v) => set({ focusMinMinutes: Number(v) })} options={[30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} Minuten` }))} />
      </Row>
      <Row label="Puffer bei Ortswechsel" hint="Darunter wird ein Übergang zwischen Terminen an verschiedenen Orten als zu knapp markiert.">
        <Select aria-label="Puffer bei Ortswechsel" value={String(s.transitionBufferMinutes)} onChange={(v) => set({ transitionBufferMinutes: Number(v) })} options={[0, 5, 10, 15, 20, 30].map((m) => ({ value: String(m), label: m === 0 ? 'Aus' : `${m} Minuten` }))} />
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
        <Select aria-label="Vorlaufzeit" value={String(n.leadMinutes)} disabled={!n.events} onChange={(v) => setN({ leadMinutes: Number(v) })} options={[5, 10, 15, 30, 60].map((m) => ({ value: String(m), label: `${m === 60 ? '1 Stunde' : `${m} Minuten`} vorher` }))} />
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
          <Select aria-label="Wochentag" style={{ width: 140 }} value={String(n.weeklyReview.day)} disabled={!n.weeklyReview.enabled} onChange={(v) => setN({ weeklyReview: { ...n.weeklyReview, day: Number(v) } })} options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][d] }))} />
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
      <p>Tagwerk nutzt externe Konten nur, wenn du sie ausdrücklich verbindest. Deine Daten liegen auf diesem Gerät – und, wenn du den Cloud-Speicher einschaltest, zusätzlich in deinem eigenen OneDrive (Ordner „Apps/Tagwerk“). Einen Tagwerk-Server gibt es nicht. Zugangsdaten liegen verschlüsselt im Schlüsselspeicher des Betriebssystems.</p>

      <div className="settings-group">Microsoft – Outlook, OneNote und Cloud-Speicher</div>
      <MicrosoftSettings />

      <div className="settings-group">Apple Kalender</div>
      <ICloudSettings />

      <div className="settings-group">Gmail</div>
      <GoogleSettings />

      <div className="settings-group">Weitere Quellen</div>
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

      <div className="source-row">
        <div className="icon"><FlaskConical /></div>
        <div className="label">
          <b>Demo-Datenquelle {data.sources.demo ? <span className="tag demo">aktiv</span> : <span className="tag">aus</span>}</b>
          <span>Beispieltermine, -mails und -aufgaben zum Ausprobieren. Werden überall als „Demo“ gekennzeichnet.</span>
        </div>
        <button className="btn small" onClick={toggleDemo}>{data.sources.demo ? 'Entfernen' : 'Laden'}</button>
      </div>

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
        <Select aria-label="Modell" value={s.claude.model} onChange={(v) => set({ claude: { ...s.claude, model: v } })} options={CLAUDE_MODELS.map((m) => ({ value: m.id, label: m.label }))} />
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
        <Select aria-label="Archivierte Aufgaben aufbewahren" value={String(s.retention.archivedTasksDays)} onChange={(v) => set({ retention: { archivedTasksDays: Number(v) } })} options={[{ value: '30', label: '30 Tage' }, { value: '90', label: '90 Tage' }, { value: '180', label: '6 Monate' }, { value: '365', label: '1 Jahr' }, { value: '0', label: 'Unbegrenzt' }]} />
      </Row>
      <Row label="Gesprächsverlauf mit Claude aufbewahren">
        <Select aria-label="Gesprächsverlauf mit Claude aufbewahren" value={String(s.claude.chatRetentionDays)} onChange={(v) => set({ claude: { ...s.claude, chatRetentionDays: Number(v) } })} options={[{ value: '1', label: '1 Tag' }, { value: '7', label: '7 Tage' }, { value: '30', label: '30 Tage' }, { value: '0', label: 'Unbegrenzt' }]} />
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
  const online = useStore((s) => s.online)
  const [mode, setMode] = useState<'new' | 'restore'>('new')
  const [name, setName] = useState(settings.userName)
  const [withDemo, setWithDemo] = useState(true)
  const [phase, setPhase] = useState<'idle' | 'signin' | 'loading' | 'done' | 'empty' | 'error'>('idle')
  const [err, setErr] = useState('')
  const [summary, setSummary] = useState('')
  const finish = async () => {
    const st = useStore.getState()
    if (mode === 'restore') {
      await st.updateSettings({ onboarded: true })
    } else {
      await st.updateSettings({ userName: name.trim(), onboarded: true })
      if (!withDemo && st.data.sources.demo) st.replaceData(removeDemo(st.data))
    }
    st.openDialog(null)
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
    // Beispieldaten weg – gleich kommen deine echten Daten
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
        .join(' · ') +
        ` – zuletzt gesichert auf „${others[0].name}“`
    )
    setPhase('done')
  }
  const busy = phase === 'signin' || phase === 'loading'
  return (
    <Dialog
      title="Willkommen bei Tagwerk"
      onClose={busy ? () => {} : finish}
      footer={
        mode === 'restore' && phase !== 'done' && phase !== 'empty' ? (
          <>
            <button className="btn" onClick={() => (busy ? window.tagwerk.microsoft.cancelConnect() : setMode('new'))}>
              {busy ? 'Abbrechen' : 'Zurück'}
            </button>
            <button className="btn primary" onClick={restore} disabled={busy || !online}>
              {busy ? <Loader2 className="spin" /> : null} {phase === 'error' ? 'Erneut versuchen' : 'Mit Microsoft anmelden'}
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={finish}>
            Loslegen
          </button>
        )
      }
    >
      <p>Tagwerk bündelt Kalender, E-Mails, Aufgaben, Notizen und Projekte – ruhig und an einem Ort.</p>
      <div className="onb-choice" role="radiogroup" aria-label="Wie möchtest du starten?">
        <button role="radio" aria-checked={mode === 'new'} className={`onb-card ${mode === 'new' ? 'on' : ''}`} onClick={() => !busy && setMode('new')}>
          <Sparkles />
          <b>Neu starten</b>
          <span>Mit Beispieldaten ausprobieren oder leer beginnen.</span>
        </button>
        <button role="radio" aria-checked={mode === 'restore'} className={`onb-card ${mode === 'restore' ? 'on' : ''}`} onClick={() => !busy && setMode('restore')}>
          <Download />
          <b>Meine Daten wiederherstellen</b>
          <span>Du nutzt Tagwerk schon auf einem anderen PC? Mit Microsoft anmelden – alles ist wieder da.</span>
        </button>
      </div>

      {mode === 'new' && (
        <>
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
          <p className="hint">Konten (Outlook, Apple Kalender, Gmail) und den Cloud-Speicher verbindest du jederzeit unter Einstellungen → Datenquellen.</p>
        </>
      )}

      {mode === 'restore' && (
        <div className="onb-restore" aria-live="polite">
          {phase === 'idle' && (
            <p className="hint">
              Im Browser meldest du dich mit dem Microsoft-Konto an, mit dem du den Cloud-Speicher auf dem anderen PC eingeschaltet hast, und bestätigst den Zugriff (Outlook-Mail, Kalender, OneNote und der Tagwerk-Ordner in deinem OneDrive – später in den Einstellungen änderbar).
            </p>
          )}
          {phase === 'signin' && (
            <p className="row hint">
              <Loader2 className="spin" size={14} /> Warte auf deine Anmeldung im Browser …
            </p>
          )}
          {phase === 'loading' && (
            <p className="row hint">
              <Loader2 className="spin" size={14} /> Deine Daten werden aus OneDrive geladen …
            </p>
          )}
          {phase === 'done' && (
            <div className="onb-done">
              <Check />
              <div>
                <b>Willkommen zurück{useStore.getState().settings.userName ? `, ${useStore.getState().settings.userName}` : ''}!</b>
                <span>{summary}</span>
                <span className="hint">Konten wie Gmail und Apple Kalender verbindest du auf diesem PC einmal neu – Passwörter werden aus Sicherheitsgründen nie in die Cloud kopiert.</span>
              </div>
            </div>
          )}
          {phase === 'empty' && (
            <div className="onb-done">
              <Check />
              <div>
                <b>Angemeldet – der Cloud-Speicher ist noch leer.</b>
                <span>In diesem Microsoft-Konto liegen noch keine Tagwerk-Daten. Ab jetzt wird alles, was du hier anlegst, automatisch gesichert.</span>
              </div>
            </div>
          )}
          {phase === 'error' && <div className="error-text">{err}</div>}
        </div>
      )}
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
    [`${m} B`, 'Seitenleiste ein-/ausklappen'],
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

/** Vorschläge aus E-Mails: an/aus, Konten, Arten */
function MailInsightsSettings() {
  const [s, set] = useSettings()
  const emails = useStore((st) => st.data.emails)
  const mi = s.mailInsights
  const sources = [...new Set(emails.map((m) => m.source))]
  const kinds: { id: SuggestionKind; label: string }[] = [
    { id: 'event', label: 'Termine' },
    { id: 'deadline', label: 'Fristen' },
    { id: 'task', label: 'Aufgaben' },
    { id: 'note', label: 'Infos für Notizen' }
  ]
  const setMi = (patch: Partial<Settings['mailInsights']>) => set({ mailInsights: { ...mi, ...patch } })
  const on = (list: string[], id: string, v: boolean) => (v ? [...new Set([...list, id])] : list.filter((x) => x !== id))
  const label = (src: string) => (src === 'google' ? 'Gmail' : src === 'outlook' ? 'Outlook' : src === 'demo' ? 'Demo-Postfach' : src)
  const cloudOn = useAccounts((st) => st.cloud.available && st.cloud.enabled)
  return (
    <>
      <div className="settings-group">Vorschläge aus E-Mails</div>
      <Row label="Mails auswerten" hint="Tagwerk erkennt lokal auf diesem PC Termine, Fristen, Aufgaben und Infos in deinen Mails und schlägt sie im Posteingang unter „Aus Mails übernehmen“ vor. Ohne KI, ohne Server – angelegt wird nur, was du bestätigst.">
        <Switch label="Mails auswerten" checked={mi.enabled} onChange={(v) => setMi({ enabled: v })} />
      </Row>
      {mi.enabled && (
        <Row label="Prüfung pausieren" hint="Vorhandene Vorschläge bleiben erhalten, neue Mails werden nicht ausgewertet.">
          <Switch label="Prüfung pausieren" checked={!!mi.paused} onChange={(v) => setMi({ paused: v })} />
        </Row>
      )}
      {mi.enabled && sources.length > 0 && (
        <Row label="Geprüfte Postfächer" hint="Keins ausgewählt = alle.">
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            {sources.map((src) => (
              <label key={src} className="row" style={{ gap: 6 }}>
                <input type="checkbox" className="box-check" checked={!mi.sources.length || mi.sources.includes(src)} onChange={(e) => setMi({ sources: on(mi.sources.length ? mi.sources : sources, src, e.target.checked).length === sources.length ? [] : on(mi.sources.length ? mi.sources : sources, src, e.target.checked) as Source[] })} /> {label(src)}
              </label>
            ))}
          </div>
        </Row>
      )}
      {mi.enabled && <ExcludeEditor list={mi.excludeSenders ?? []} onChange={(excludeSenders) => setMi({ excludeSenders })} />}
      {mi.enabled && <MailRulesEditor />}
      {mi.enabled && (
        <Row label="Auf mehreren PCs" hint={cloudOn ? 'Was du übernommen, ignoriert oder zurückgestellt hast, gleicht der Cloud-Speicher (dein OneDrive) mit deinen anderen PCs ab.' : 'Ohne Cloud-Speicher gilt der Bearbeitungsstand nur auf diesem PC. Einschalten unter Datenquellen → Microsoft → Cloud-Speicher.'}>
          <span className="hint">{cloudOn ? 'wird abgeglichen' : 'nur dieser PC'}</span>
        </Row>
      )}
      {mi.enabled && (
        <Row label="Erkennen">
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            {kinds.map((k) => (
              <label key={k.id} className="row" style={{ gap: 6 }}>
                <input type="checkbox" className="box-check" checked={mi.kinds.includes(k.id)} onChange={(e) => setMi({ kinds: on(mi.kinds, k.id, e.target.checked) as SuggestionKind[] })} /> {k.label}
              </label>
            ))}
          </div>
        </Row>
      )}
    </>
  )
}

/** Regeln: Absender/Betreff → Projekt (für Vorschläge aus Mails) */
function MailRulesEditor() {
  const [s, set] = useSettings()
  const projects = useStore((st) => st.data.projects)
  const [field, setField] = useState<'from' | 'subject'>('from')
  const [contains, setContains] = useState('')
  const [projectId, setProjectId] = useState('')
  const rules = s.mailRules ?? []
  const add = () => {
    if (!contains.trim() || !projectId) return
    set({ mailRules: [...rules, { id: `r-${crypto.randomUUID()}`, field, contains: contains.trim(), projectId }] })
    setContains('')
  }
  return (
    <Row label="Regeln → Projekt" hint="Vorschläge aus passenden Mails bekommen dieses Projekt vorgeschlagen – im Dialog kannst du es jederzeit ändern.">
      <div style={{ display: 'grid', gap: 6, width: '100%' }}>
        {rules.map((r) => (
          <div key={r.id} className="row" style={{ gap: 8 }}>
            <span className="grow">
              {r.field === 'from' ? 'Absender enthält' : 'Betreff enthält'} „<b>{r.contains}</b>“ → {projects.find((p) => p.id === r.projectId)?.name ?? <i>gelöschtes Projekt</i>}
            </span>
            <button className="btn ghost small icon-btn" onClick={() => set({ mailRules: rules.filter((x) => x.id !== r.id) })} aria-label="Regel löschen" title="Regel löschen">
              <X />
            </button>
          </div>
        ))}
        {projects.length > 0 ? (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <Select<'from' | 'subject'> aria-label="Feld" style={{ width: 'auto' }} value={field} onChange={setField} options={[{ value: 'from', label: 'Absender enthält' }, { value: 'subject', label: 'Betreff enthält' }]} />
            <input className="input" style={{ flex: 1, minWidth: 120 }} value={contains} onChange={(e) => setContains(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={field === 'from' ? 'z. B. @uni-mannheim.de' : 'z. B. Hausarbeit'} aria-label="Enthält" />
            <Select aria-label="Projekt" style={{ width: 'auto' }} value={projectId} placeholder="Projekt …" onChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
            <button className="btn small" onClick={add} disabled={!contains.trim() || !projectId}>
              Hinzufügen
            </button>
          </div>
        ) : (
          <span className="hint">Lege zuerst ein Projekt an.</span>
        )}
      </div>
    </Row>
  )
}

/** Absender oder Mailinglisten von der Prüfung ausschließen */
function ExcludeEditor({ list, onChange }: { list: string[]; onChange: (l: string[]) => void }) {
  const [v, setV] = useState('')
  const add = () => {
    const x = v.trim().toLowerCase()
    if (!x) return
    onChange([...new Set([...list, x])])
    setV('')
  }
  return (
    <Row label="Nicht prüfen" hint="Absender, Domains oder Mailinglisten (z. B. „newsletter@“, „@liste.uni.de“), deren Mails nie ausgewertet werden.">
      <div style={{ display: 'grid', gap: 6, width: '100%' }}>
        {list.length > 0 && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {list.map((x) => (
              <span key={x} className="tag">
                {x}
                <button className="tag-x" onClick={() => onChange(list.filter((y) => y !== x))} aria-label={`${x} wieder prüfen`} title="Wieder prüfen">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 6 }}>
          <input className="input" style={{ flex: 1 }} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Adresse oder @domain" aria-label="Absender ausschließen" />
          <button className="btn small" onClick={add} disabled={!v.trim()}>
            Ausschließen
          </button>
        </div>
      </div>
    </Row>
  )
}
