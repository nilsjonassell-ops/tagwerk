import { create } from 'zustand'
import { applyRetention, mailsToNotify } from '@shared/analysis'
import { createDemoData, emptyData } from '@shared/demo'
import { DEFAULT_SETTINGS, type AppData, type Email, type GoogleStatus, type Settings, type ViewId } from '@shared/types'

export const EMPTY_GOOGLE: GoogleStatus = {
  clientConfigured: false,
  connected: false,
  caps: { calendarRead: false, calendarWrite: false, gmailRead: false, gmailWrite: false },
  expired: false,
  encrypted: true
}

export interface GoogleSyncState {
  syncing: boolean
  lastSync?: string
  errors: { calendar?: string; gmail?: string; general?: string }
}

export interface Toast {
  id: number
  text: string
  tone?: 'default' | 'error'
  undo?: () => void
}

export interface Selection {
  calendar?: string
  inbox?: string
  tasks?: string
  notes?: string
  projects?: string
}

export type DialogState =
  | { kind: 'task'; id?: string; preset?: Partial<import('@shared/types').Task> }
  | { kind: 'event'; id?: string; preset?: Partial<import('@shared/types').CalEvent> }
  | { kind: 'project'; id?: string }
  | { kind: 'settings'; section?: string }
  | { kind: 'shortcuts' }
  | { kind: 'extract'; noteId: string }
  | { kind: 'onboarding' }
  | { kind: 'plan' }
  | null

interface State {
  ready: boolean
  loadError?: string
  data: AppData
  settings: Settings
  claude: { configured: boolean; encrypted: boolean }
  online: boolean
  view: ViewId
  selection: Selection
  sidebarHidden: boolean
  assistantOpen: boolean
  paletteOpen: boolean
  dialog: DialogState
  toasts: Toast[]
  /** Text, der beim Öffnen des Assistenten automatisch gesendet wird */
  assistantSeed?: { text: string; bodiesFor?: string[] }
  resolvedTheme: 'light' | 'dark'
  pendingDraft?: { threadId: string; body: string }
  google: GoogleStatus
  googleSync: GoogleSyncState

  init(): Promise<void>
  mutate(fn: (d: AppData) => AppData, opts?: { toast?: string; undoable?: boolean }): void
  replaceData(d: AppData): void
  updateSettings(patch: Partial<Settings>): Promise<void>
  refreshClaude(): Promise<void>
  refreshGoogle(): Promise<GoogleStatus>
  syncGoogle(opts?: { quiet?: boolean; mailOnly?: boolean }): Promise<void>
  go(view: ViewId, id?: string): void
  select(view: keyof Selection, id?: string): void
  toast(text: string, opts?: { tone?: Toast['tone']; undo?: () => void }): void
  dismissToast(id: number): void
  openDialog(d: DialogState): void
  setAssistant(open: boolean, seed?: string, bodiesFor?: string[]): void
  set(partial: Partial<State>): void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let toastSeq = 0

function scheduleSave(data: AppData) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.tagwerk.data.save(data).catch(() => {
      useStore.getState().toast('Speichern fehlgeschlagen. Deine letzten Änderungen sind noch nicht gesichert.', { tone: 'error' })
    })
  }, 350)
}

export const uid = (p: string) => `${p}-${crypto.randomUUID()}`

/** Neue E-Mails seit dem letzten Abgleich melden – gebündelt, je nach Einstellung nur wichtige. */
function notifyNewMail(before: Email[], after: Email[], me: string | undefined, settings: Settings) {
  const mode = settings.notifications.mail
  const list = mailsToNotify(before, after, me, mode, settings.notifications.vipSenders)
  if (!list.length) return
  const label = mode === 'all' ? 'neue' : 'neue wichtige'
  if (list.length === 1) {
    const m = list[0]
    const preview = m.body.replace(/\s+/g, ' ').trim().slice(0, 110)
    void window.tagwerk.app.notify({
      kind: 'mail',
      title: `${m.from.name || m.from.email}${m.needsReply ? ' · wartet auf Antwort' : ''}`,
      body: `${m.subject || '(ohne Betreff)'}${preview ? `\n${preview}` : ''}`,
      target: { view: 'inbox', id: m.threadId }
    })
  } else {
    void window.tagwerk.app.notify({
      kind: 'mail',
      title: `${list.length} ${label} E-Mails`,
      body: list.length > 3 ? `+ ${list.length - 3} weitere` : '',
      lines: list.slice(0, 3).map((m) => `${m.from.name || m.from.email}: ${m.subject || '(ohne Betreff)'}`),
      target: { view: 'inbox' }
    })
  }
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  data: emptyData(),
  settings: DEFAULT_SETTINGS,
  claude: { configured: false, encrypted: true },
  online: navigator.onLine,
  view: 'today',
  selection: {},
  sidebarHidden: false,
  assistantOpen: false,
  paletteOpen: false,
  dialog: null,
  toasts: [],
  resolvedTheme: 'light',
  google: EMPTY_GOOGLE,
  googleSync: { syncing: false, errors: {} },

  async init() {
    try {
      const [loaded, settings, claude, google] = await Promise.all([
        window.tagwerk.data.load(),
        window.tagwerk.settings.get(),
        window.tagwerk.claude.status(),
        window.tagwerk.google.status()
      ])
      let data = loaded
      const firstRun = !data
      if (!data) {
        data = createDemoData()
        await window.tagwerk.data.save(data)
      }
      data = applyRetention(data, new Date(), settings.retention.archivedTasksDays, settings.claude.chatRetentionDays)
      set({ data, settings, claude, google, googleSync: { syncing: false, errors: {}, lastSync: data.sources.google?.lastSync }, ready: true, dialog: firstRun || !settings.onboarded ? { kind: 'onboarding' } : null })
    } catch (err) {
      set({ ready: true, loadError: (err as Error).message })
    }
  },

  mutate(fn, opts) {
    const prev = get().data
    const next = fn(prev)
    if (next === prev) return
    set({ data: next })
    scheduleSave(next)
    if (opts?.toast) {
      get().toast(opts.toast, opts.undoable ? { undo: () => get().replaceData(prev) } : undefined)
    }
  },

  replaceData(d) {
    set({ data: d })
    scheduleSave(d)
  },

  async updateSettings(patch) {
    const next = await window.tagwerk.settings.set(patch)
    set({ settings: next })
  },

  async refreshClaude() {
    set({ claude: await window.tagwerk.claude.status() })
  },

  async refreshGoogle() {
    const google = await window.tagwerk.google.status()
    set({ google })
    return google
  },

  async syncGoogle(opts) {
    if (get().googleSync.syncing) {
      // Läuft schon ein Abruf, danach noch einmal den Posteingang holen
      if (opts?.mailOnly) mailAgain = true
      return
    }
    set({ googleSync: { ...get().googleSync, syncing: true } })
    try {
      const before = get().data.emails.filter((e) => e.source === 'google')
      const r = await window.tagwerk.google.sync(opts?.mailOnly ? { only: 'gmail' } : undefined)
      set({ google: r.status })
      if (r.emails) notifyNewMail(before, r.emails, r.status.email, get().settings)
      // Google ist die Quelle der Wahrheit: Google-Datensätze werden je Dienst vollständig ersetzt.
      get().mutate((d) => {
        let next = d
        if (r.events) {
          // Lokale Zusatzinfos (Projekt, Aufgabe) bleiben beim Abgleich erhalten
          const local = new Map(next.events.filter((e) => e.source === 'google').map((e) => [e.remoteId, e]))
          const merged = r.events.map((e) => {
            const old = local.get(e.remoteId)
            return old ? { ...e, projectId: e.projectId ?? old.projectId, taskId: e.taskId ?? old.taskId } : e
          })
          next = { ...next, events: [...next.events.filter((e) => e.source !== 'google'), ...merged] }
        }
        if (r.emails) next = { ...next, emails: [...next.emails.filter((e) => e.source !== 'google'), ...r.emails] }
        if (r.status.connected && r.status.email) next = { ...next, sources: { ...next.sources, google: { email: r.status.email, lastSync: r.syncedAt } } }
        return next
      })
      set({ googleSync: { syncing: false, lastSync: r.events || r.emails ? r.syncedAt : get().googleSync.lastSync, errors: r.errors } })
      const err = r.errors.general ?? r.errors.calendar ?? r.errors.gmail
      if (err && !opts?.quiet) get().toast(err, { tone: 'error' })
    } catch {
      set({ googleSync: { ...get().googleSync, syncing: false, errors: { general: 'Synchronisation fehlgeschlagen.' } } })
    }
    if (mailAgain) {
      mailAgain = false
      void get().syncGoogle({ quiet: true, mailOnly: true })
    }
  },

  go(view, id) {
    const sel = id ? { ...get().selection, [view]: id } : get().selection
    set({ view, selection: sel, paletteOpen: false })
  },

  select(view, id) {
    set({ selection: { ...get().selection, [view]: id } })
  },

  toast(text, opts) {
    const id = ++toastSeq
    set({ toasts: [...get().toasts.slice(-2), { id, text, ...opts }] })
    setTimeout(() => get().dismissToast(id), opts?.undo ? 7000 : 4000)
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  openDialog(d) {
    set({ dialog: d, paletteOpen: false })
  },

  setAssistant(open, seed, bodiesFor) {
    if (open && !get().settings.claude.enabled) return
    set({ assistantOpen: open, assistantSeed: seed ? { text: seed, bodiesFor } : undefined })
  },

  set(partial) {
    set(partial)
  }
}))

let mailAgain = false

// ---- Bestätigungsdialog als Promise ----

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel: string
  danger?: boolean
  /** Optionales Häkchen im Dialog, z. B. „Teilnehmende benachrichtigen“ */
  option?: { label: string; initial: boolean }
}

type ConfirmState = (ConfirmOptions & { resolve: (ok: boolean, checked: boolean) => void }) | null

export const useConfirm = create<{ state: ConfirmState; set: (s: ConfirmState) => void }>((set) => ({
  state: null,
  set: (state) => set({ state })
}))

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirm.getState().set({ ...opts, resolve: (ok) => resolve(ok) }))
}

export function confirmWithOption(opts: ConfirmOptions & { option: { label: string; initial: boolean } }): Promise<{ ok: boolean; checked: boolean }> {
  return new Promise((resolve) => useConfirm.getState().set({ ...opts, resolve: (ok, checked) => resolve({ ok, checked }) }))
}
