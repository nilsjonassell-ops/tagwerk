// Zustand und Abgleich der weiteren Konten: Outlook (Mail + Kalender über Microsoft)
// und Apple Kalender (iCloud). Google bleibt im Hauptspeicher (store.ts).

import { create } from 'zustand'
import type { CalEvent, Email, ICloudStatus, MicrosoftStatus, Source } from '@shared/types'
import { useStore, notifyNewMail } from './store'
import { useOneNote } from './onenote'

interface SyncState {
  syncing: boolean
  lastSync?: string
  error?: string
}

interface AccountsState {
  ms: MicrosoftStatus
  icloud: ICloudStatus
  outlookSync: SyncState
  icloudSync: SyncState
  refresh(): Promise<void>
  syncOutlook(opts?: { quiet?: boolean; only?: 'mail' | 'calendar' }): Promise<void>
  syncICloud(opts?: { quiet?: boolean }): Promise<void>
}

export const EMPTY_MS: MicrosoftStatus = { clientConfigured: false, connected: false, expired: false, caps: { notes: false, mail: false, calendar: false } }
const EMPTY_IC: ICloudStatus = { connected: false, calendars: [] }

/** Ersetzt die Datensätze einer Quelle, behält aber lokale Zusatzinfos (Projekt, Aufgabe). */
export function mergeSource(source: Source, events?: CalEvent[], emails?: Email[]) {
  useStore.getState().mutate((d) => {
    let next = d
    if (events) {
      const local = new Map(next.events.filter((e) => e.source === source).map((e) => [e.id, e]))
      const merged = events.map((e) => {
        const old = local.get(e.id)
        return old ? { ...e, projectId: e.projectId ?? old.projectId, taskId: e.taskId ?? old.taskId } : e
      })
      next = { ...next, events: [...next.events.filter((e) => e.source !== source), ...merged] }
    }
    if (emails) {
      const local = new Map(next.emails.filter((e) => e.source === source).map((e) => [e.id, e]))
      const merged = emails.map((e) => ({ ...e, projectId: e.projectId ?? local.get(e.id)?.projectId }))
      next = { ...next, emails: [...next.emails.filter((e) => e.source !== source), ...merged] }
    }
    return next
  })
}

const pending = { outlook: new Set<'mail' | 'calendar'>(), icloud: false }

export const useAccounts = create<AccountsState>((set, get) => ({
  ms: EMPTY_MS,
  icloud: EMPTY_IC,
  outlookSync: { syncing: false },
  icloudSync: { syncing: false },

  async refresh() {
    const [ms, icloud] = await Promise.all([window.tagwerk.microsoft.status(), window.tagwerk.icloud.status()])
    set({ ms, icloud })
    useOneNote.setState({ status: ms })
  },

  async syncOutlook(opts) {
    const ms = get().ms
    if (!ms.connected || (!ms.caps.mail && !ms.caps.calendar)) return
    if (get().outlookSync.syncing) {
      if (opts?.only) pending.outlook.add(opts.only)
      return
    }
    set({ outlookSync: { ...get().outlookSync, syncing: true } })
    const before = useStore.getState().data.emails.filter((e) => e.source === 'outlook')
    const r = await window.tagwerk.microsoft.sync(opts?.only ? { only: opts.only } : undefined).catch(() => null)
    if (r) {
      if (r.emails) notifyNewMail(before, r.emails, ms.email, useStore.getState().settings)
      mergeSource('outlook', r.events, r.emails)
      const err = r.errors.general ?? r.errors.mail ?? r.errors.calendar
      set({ outlookSync: { syncing: false, lastSync: r.events || r.emails ? r.syncedAt : get().outlookSync.lastSync, error: err } })
      if (err && !opts?.quiet) useStore.getState().toast(err, { tone: 'error' })
      if (r.errors.general?.includes('abgelaufen')) void get().refresh()
    } else set({ outlookSync: { ...get().outlookSync, syncing: false, error: 'Outlook-Abgleich fehlgeschlagen.' } })
    if (pending.outlook.size) {
      const only = pending.outlook.size === 1 ? [...pending.outlook][0] : undefined
      pending.outlook.clear()
      void get().syncOutlook({ quiet: true, only })
    }
  },

  async syncICloud(opts) {
    if (!get().icloud.connected) return
    if (get().icloudSync.syncing) {
      pending.icloud = true
      return
    }
    set({ icloudSync: { ...get().icloudSync, syncing: true } })
    const r = await window.tagwerk.icloud.sync().catch(() => null)
    if (r?.ok && r.events) {
      mergeSource('icloud', r.events)
      set({ icloudSync: { syncing: false, lastSync: r.syncedAt } })
      void window.tagwerk.icloud.status().then((icloud) => set({ icloud }))
    } else {
      const err = r?.error ?? 'Apple-Kalender-Abgleich fehlgeschlagen.'
      set({ icloudSync: { ...get().icloudSync, syncing: false, error: err } })
      if (!opts?.quiet) useStore.getState().toast(err, { tone: 'error' })
    }
    if (pending.icloud) {
      pending.icloud = false
      void get().syncICloud({ quiet: true })
    }
  }
}))

/** Nach dem Trennen: Daten dieser Quelle aus Tagwerk entfernen. */
export function removeSource(source: Source, what: { events?: boolean; emails?: boolean } = { events: true, emails: true }) {
  useStore.getState().mutate((d) => ({
    ...d,
    events: what.events ? d.events.filter((e) => e.source !== source) : d.events,
    emails: what.emails ? d.emails.filter((e) => e.source !== source) : d.emails
  }))
}

export const SOURCE_LABEL: Partial<Record<Source, string>> = { google: 'Gmail', outlook: 'Outlook', icloud: 'iCloud', demo: 'Demo' }
