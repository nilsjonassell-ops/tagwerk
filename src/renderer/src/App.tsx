import { UpdateBanner } from '@/components/Updates'
import { FocusHost } from '@/components/Focus'
import { useFocus } from '@/lib/focus'
import { PlanDialog } from '@/components/PlanDialog'
import { WeeklyReview } from '@/components/WeeklyReview'
import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import type { ViewId } from '@shared/types'
import { useStore } from '@/lib/store'
import { archiveThread, createNote, markThread, toggleTask } from '@/lib/actions'
import { Sidebar } from '@/components/Sidebar'
import { AssistantPanel } from '@/components/Assistant'
import { CommandPalette } from '@/components/CommandPalette'
import { ConfirmHost, Toasts } from '@/components/Overlays'
import { EventDialog, ProjectDialog, TaskDialog } from '@/components/Editors'
import { OnboardingDialog, SettingsDialog, ShortcutsDialog } from '@/components/SettingsDialog'
import { TodayView } from '@/views/Today'
import { CalendarView } from '@/views/Calendar'
import { InboxView } from '@/views/Inbox'
import { TasksView } from '@/views/Tasks'
import { ExtractTasksDialog, NotesView } from '@/views/Notes'
import { ProjectsView } from '@/views/Projects'

const VIEWS: ViewId[] = ['today', 'calendar', 'inbox', 'tasks', 'notes', 'projects']

export function App() {
  const ready = useStore((s) => s.ready)
  const loadError = useStore((s) => s.loadError)
  const view = useStore((s) => s.view)
  const sidebarHidden = useStore((s) => s.sidebarHidden)
  const sidebarCollapsed = useStore((s) => !!s.settings.sidebarCollapsed)
  const assistantOpen = useStore((s) => s.assistantOpen)
  const paletteOpen = useStore((s) => s.paletteOpen)
  const dialog = useStore((s) => s.dialog)
  const theme = useStore((s) => s.settings.theme)
  const settings = useStore((s) => s.settings)

  useEffect(() => {
    useStore.getState().init()
  }, [])

  // Design: hell / dunkel / wie System
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
      useStore.getState().set({ resolvedTheme: resolved })
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  // Google: beim Start, alle 5 Minuten, bei Rückkehr ins Fenster und wenn wieder online.
  // Posteingang und Kalender kommen zusätzlich live: Der Hauptprozess prüft jede
  // Sekunde, ob sich bei Google etwas geändert hat.
  const googleConnected = useStore((s) => s.google.connected)
  const online = useStore((s) => s.online)
  useEffect(() => {
    if (!ready || !googleConnected || !online) return
    const st = useStore.getState
    st().syncGoogle({ quiet: true })
    const t = setInterval(() => st().syncGoogle({ quiet: true }), 5 * 60_000)
    const onFocus = () => {
      const last = st().googleSync.lastSync
      if (!last || Date.now() - new Date(last).getTime() > 2 * 60_000) st().syncGoogle({ quiet: true })
    }
    window.addEventListener('focus', onFocus)
    const offMail = window.tagwerk.google.onChanged((what) => st().syncGoogle({ quiet: true, only: what }))
    return () => {
      offMail()
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [ready, googleConnected, online])

  // Online/Offline
  useEffect(() => {
    const on = () => useStore.getState().set({ online: navigator.onLine })
    window.addEventListener('online', on)
    window.addEventListener('offline', on)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', on)
    }
  }, [])

  // Befehle aus Menü, Tray und Hauptprozess
  useEffect(() => {
    const st = useStore.getState
    const offNav = window.tagwerk.app.onNavigate((v) => VIEWS.includes(v as ViewId) && st().go(v as ViewId))
    // Klick auf eine Benachrichtigung: passende Ansicht und Eintrag öffnen
    const offOpen = window.tagwerk.app.onOpen((t) => {
      if (t.view === 'command' && t.id) return runCommand(t.id)
      if (VIEWS.includes(t.view as ViewId)) st().go(t.view as ViewId, t.id)
    })
    const offCmd = window.tagwerk.app.onCommand(runCommand)
    const offNote = window.tagwerk.data.onExternalNote((note) => {
      st().set({ data: { ...st().data, notes: [note, ...st().data.notes.filter((n) => n.id !== note.id)] } })
      st().toast('Schnellnotiz gespeichert')
    })
    return () => {
      offNav()
      offOpen()
      offCmd()
      offNote()
    }
  }, [])

  // Globale Tastenkürzel innerhalb des Fensters
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const st = useStore.getState()
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')
      if (mod && !e.altKey && /^[1-6]$/.test(e.key)) {
        const visible = st.settings.sidebar.filter((s) => s.visible).map((s) => s.id)
        const target = visible[Number(e.key) - 1] ?? VIEWS[Number(e.key) - 1]
        if (target) st.go(target)
        e.preventDefault()
      } else if (mod && e.key.toLowerCase() === 'k') {
        st.set({ paletteOpen: !st.paletteOpen })
        e.preventDefault()
      } else if (mod && e.key.toLowerCase() === 'j') {
        st.setAssistant(!st.assistantOpen)
        e.preventDefault()
      } else if (mod && e.key === ',') {
        runCommand('open-settings')
        e.preventDefault()
      } else if (mod && (e.key === '\\' || (!e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b'))) {
        runCommand('toggle-sidebar')
        e.preventDefault()
      } else if (mod && e.key === '/') {
        runCommand('show-shortcuts')
        e.preventDefault()
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        const f = useFocus.getState()
        f.show(!f.open)
        e.preventDefault()
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'n') {
        runCommand('new-event')
        e.preventDefault()
      } else if (mod && e.altKey && e.key.toLowerCase() === 'n') {
        runCommand('new-note')
        e.preventDefault()
      } else if (mod && e.key.toLowerCase() === 'n') {
        runCommand('new-task')
        e.preventDefault()
      } else if (!typing && !mod && e.key === '/' && !st.dialog) {
        st.set({ paletteOpen: true })
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) {
    return (
      <div className="splash" aria-busy="true">
        <span className="brand">Tagwerk</span>
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="splash">
        <div className="empty">
          <AlertCircle />
          <strong>Deine Daten konnten nicht geladen werden</strong>
          <p>Die Datendatei ist möglicherweise beschädigt. Starte Tagwerk neu. Bleibt der Fehler, exportiere über die Einstellungen eine Sicherung oder setze die App zurück.</p>
          <button className="btn" onClick={() => location.reload()}>
            Neu laden
          </button>
        </div>
      </div>
    )
  }

  const platform = window.tagwerk.platform.platform
  return (
    <div className={`app platform-${platform} ${sidebarHidden ? 'sidebar-hidden' : ''} ${sidebarCollapsed ? 'sb-collapsed' : ''} ${assistantOpen ? 'panel-open' : ''}`}>
      <Sidebar />
      <main className="main" aria-label="Inhalt">
        {view === 'today' && <TodayView />}
        {view === 'calendar' && <CalendarView />}
        {view === 'inbox' && <InboxView />}
        {view === 'tasks' && <TasksView />}
        {view === 'notes' && <NotesView />}
        {view === 'projects' && <ProjectsView />}
      </main>
      {assistantOpen && settings.claude.enabled ? <AssistantPanel /> : <div />}

      {paletteOpen && <CommandPalette />}
      {dialog?.kind === 'task' && <TaskDialog key={dialog.id ?? 'new'} id={dialog.id} preset={dialog.preset} />}
      {dialog?.kind === 'event' && <EventDialog key={dialog.id ?? 'new'} id={dialog.id} preset={dialog.preset} />}
      {dialog?.kind === 'project' && <ProjectDialog id={dialog.id} />}
      {dialog?.kind === 'settings' && <SettingsDialog section={dialog.section} />}
      {dialog?.kind === 'shortcuts' && <ShortcutsDialog />}
      {dialog?.kind === 'extract' && <ExtractTasksDialog noteId={dialog.noteId} />}
      {dialog?.kind === 'onboarding' && <OnboardingDialog />}
      {dialog?.kind === 'plan' && <PlanDialog />}
      {dialog?.kind === 'review' && <WeeklyReview />}
      <FocusHost />
      <UpdateBanner />
      <ConfirmHost />
      <Toasts />
    </div>
  )
}

function runCommand(cmd: string) {
  const st = useStore.getState()
  // Schaltflächen aus den Pop-ups unten rechts
  if (cmd.startsWith('mail-archive:')) return void archiveThread(cmd.slice(13))
  if (cmd.startsWith('mail-read:')) return void markThread(cmd.slice(10), { read: true })
  if (cmd.startsWith('task-done:')) {
    const t = st.data.tasks.find((x) => x.id === cmd.slice(10))
    if (t && t.status !== 'done') toggleTask(t.id)
    return
  }
  if (cmd.startsWith('task:')) {
    st.go('tasks')
    return st.openDialog({ kind: 'task', id: cmd.slice(5) })
  }
  switch (cmd) {
    case 'weekly-review':
      return st.openDialog({ kind: 'review' })
    case 'open-general-settings':
      return st.openDialog({ kind: 'settings', section: 'general' })
    case 'new-task':
      return st.openDialog({ kind: 'task' })
    case 'new-event':
      return st.openDialog({ kind: 'event' })
    case 'new-note':
      return createNote()
    case 'open-settings':
      return st.openDialog({ kind: 'settings' })
    case 'open-google-settings':
      return st.openDialog({ kind: 'settings', section: 'sources' })
    case 'open-search':
      return st.set({ paletteOpen: true })
    case 'open-assistant':
      return st.setAssistant(true)
    case 'toggle-assistant':
      return st.setAssistant(!st.assistantOpen)
    case 'toggle-sidebar':
      // Ein-/Ausklappen (schmaler Symbol-Streifen) statt komplett verstecken
      return void st.updateSettings({ sidebarCollapsed: !st.settings.sidebarCollapsed })
    case 'focus-open':
    case 'focus-start':
      return useFocus.getState().show(true)
    case 'show-shortcuts':
      return st.openDialog({ kind: 'shortcuts' })
  }
}
