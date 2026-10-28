import { create } from 'zustand'
import { applyRetention } from '@shared/analysis'
import { createDemoData, emptyData } from '@shared/demo'
import { DEFAULT_SETTINGS, type AppData, type Settings, type ViewId } from '@shared/types'

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

  init(): Promise<void>
  mutate(fn: (d: AppData) => AppData, opts?: { toast?: string; undoable?: boolean }): void
  replaceData(d: AppData): void
  updateSettings(patch: Partial<Settings>): Promise<void>
  refreshClaude(): Promise<void>
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

  async init() {
    try {
      const [loaded, settings, claude] = await Promise.all([
        window.tagwerk.data.load(),
        window.tagwerk.settings.get(),
        window.tagwerk.claude.status()
      ])
      let data = loaded
      const firstRun = !data
      if (!data) {
        data = createDemoData()
        await window.tagwerk.data.save(data)
      }
      data = applyRetention(data, new Date(), settings.retention.archivedTasksDays, settings.claude.chatRetentionDays)
      set({ data, settings, claude, ready: true, dialog: firstRun || !settings.onboarded ? { kind: 'onboarding' } : null })
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
    set({ assistantOpen: open, assistantSeed: seed ? { text: seed, bodiesFor } : undefined })
  },

  set(partial) {
    set(partial)
  }
}))

// ---- Bestätigungsdialog als Promise ----

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel: string
  danger?: boolean
}

type ConfirmState = (ConfirmOptions & { resolve: (ok: boolean) => void }) | null

export const useConfirm = create<{ state: ConfirmState; set: (s: ConfirmState) => void }>((set) => ({
  state: null,
  set: (state) => set({ state })
}))

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirm.getState().set({ ...opts, resolve }))
}
