import { useMemo } from 'react'
import { CalendarDays, CheckSquare, FolderKanban, Inbox, NotebookPen, Settings as SettingsIcon, Sparkles, Sun, WifiOff } from 'lucide-react'
import { groupThreads, isDueToday, isOverdue } from '@shared/analysis'
import type { ViewId } from '@shared/types'
import { useStore } from '@/lib/store'
import { modKey } from '@/lib/format'

export const VIEW_META: Record<ViewId, { label: string; icon: typeof Sun; key: string }> = {
  today: { label: 'Heute', icon: Sun, key: '1' },
  calendar: { label: 'Kalender', icon: CalendarDays, key: '2' },
  inbox: { label: 'Posteingang', icon: Inbox, key: '3' },
  tasks: { label: 'Aufgaben', icon: CheckSquare, key: '4' },
  notes: { label: 'Notizen', icon: NotebookPen, key: '5' },
  projects: { label: 'Projekte', icon: FolderKanban, key: '6' }
}

export function Sidebar() {
  const view = useStore((s) => s.view)
  const go = useStore((s) => s.go)
  const data = useStore((s) => s.data)
  const settings = useStore((s) => s.settings)
  const claude = useStore((s) => s.claude)
  const online = useStore((s) => s.online)
  const assistantOpen = useStore((s) => s.assistantOpen)
  const setAssistant = useStore((s) => s.setAssistant)
  const openDialog = useStore((s) => s.openDialog)
  const selection = useStore((s) => s.selection)

  const counts = useMemo(() => {
    const now = new Date()
    const unread = groupThreads(data.emails.filter((e) => e.folder === 'inbox')).filter((t) => t.unread).length
    const overdue = data.tasks.filter((t) => isOverdue(t, now)).length
    const due = data.tasks.filter((t) => isDueToday(t, now)).length
    return { unread, overdue, due }
  }, [data.emails, data.tasks])

  const activeProjects = data.projects.filter((p) => p.status !== 'done').slice(0, 6)
  const google = useStore((s) => s.google)
  const syncing = useStore((s) => s.googleSync.syncing)
  const syncErr = useStore((s) => s.googleSync.errors)
  const googleProblem = google.expired || !!syncErr.general || !!syncErr.calendar || !!syncErr.gmail
  const sourceLabel = google.expired
    ? 'Google: neu anmelden'
    : google.connected
      ? `${syncing ? 'Synchronisiert …' : googleProblem ? 'Google: Fehler' : 'Google verbunden'}${data.sources.demo ? ' + Demo' : ''}`
      : data.sources.demo
        ? 'Demo-Daten aktiv'
        : data.sources.icsImports.length
          ? 'Kalender importiert'
          : 'Nur lokale Daten'
  const dotClass = google.expired || (google.connected && googleProblem) ? 'off' : google.connected ? 'on' : data.sources.demo ? 'demo' : 'on'

  return (
    <aside className="sidebar" aria-label="Navigation">
      <div className="sidebar-top drag">
        <svg className="brand-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M5 15a7 7 0 0 1 14 0z" />
          <rect x="2" y="16.5" width="20" height="2.2" rx="1.1" />
        </svg>
        <span className="brand">Tagwerk</span>
      </div>
      <nav className="nav">
        {settings.sidebar
          .filter((s) => s.visible)
          .map(({ id }) => {
            const m = VIEW_META[id]
            const Icon = m.icon
            const count =
              id === 'inbox' ? (counts.unread ? <span className="count">{counts.unread}</span> : null)
              : id === 'tasks' ? (counts.overdue ? <span className="count alert" title={`${counts.overdue} überfällig`}>{counts.overdue + counts.due}</span> : counts.due ? <span className="count">{counts.due}</span> : null)
              : null
            return (
              <button key={id} className="nav-item" aria-current={view === id ? 'page' : undefined} onClick={() => go(id)} title={`${m.label} (${modKey()}+${m.key})`}>
                <Icon aria-hidden="true" />
                <span className="label">{m.label}</span>
                {count ?? <span className="kbd-hint">{modKey()} {m.key}</span>}
              </button>
            )
          })}
      </nav>

      {activeProjects.length > 0 && (
        <>
          <div className="sidebar-section-label">Projekte</div>
          <nav className="nav">
            {activeProjects.map((p) => (
              <button
                key={p.id}
                className="nav-item project-link"
                aria-current={view === 'projects' && selection.projects === p.id ? 'page' : undefined}
                onClick={() => go('projects', p.id)}
              >
                <span className="project-dot" style={{ background: `hsl(${p.hue} 40% 50%)` }} />
                <span className="label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
              </button>
            ))}
          </nav>
        </>
      )}

      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <button className="nav-item" aria-pressed={assistantOpen} onClick={() => setAssistant(!assistantOpen)} title={`Claude-Assistent (${modKey()}+J)`}>
          <Sparkles aria-hidden="true" />
          <span className="label">Claude</span>
          <span className="count">{claude.configured ? '' : 'nicht verbunden'}</span>
        </button>
        <button className="nav-item" onClick={() => openDialog({ kind: 'settings' })} title={`Einstellungen (${modKey()}+,)`}>
          <SettingsIcon aria-hidden="true" />
          <span className="label">Einstellungen</span>
        </button>
        <button className="source-status" onClick={() => openDialog({ kind: 'settings', section: 'sources' })} title="Verbundene Datenquellen anzeigen">
          {online ? <span className={`status-dot ${dotClass}`} /> : <WifiOff size={13} />}
          <span className="label">{online ? sourceLabel : 'Offline – lokale Daten'}</span>
        </button>
      </div>
    </aside>
  )
}
