// OneNote-Zustand der Oberfläche: Verbindung, Abschnitte, Seiten und Seiteninhalte.
// Nichts davon wird dauerhaft gespeichert – OneNote bleibt die Quelle.

import { create } from 'zustand'
import type { MicrosoftStatus, Note, OneNotePage, OneNoteSection } from '@shared/types'
import { useStore } from './store'
import { projectName } from './format'

interface OneNoteState {
  status: MicrosoftStatus
  sections: OneNoteSection[]
  sectionsLoaded: boolean
  /** Seiten je Abschnitt ('' = zuletzt geändert, alle Abschnitte) */
  pages: Record<string, OneNotePage[]>
  text: Record<string, string>
  loading: boolean
  error?: string
  refreshStatus(): Promise<MicrosoftStatus>
  loadSections(force?: boolean): Promise<void>
  loadPages(sectionId: string, force?: boolean): Promise<void>
  loadText(pageId: string): Promise<void>
  reset(): void
}

const EMPTY: MicrosoftStatus = { clientConfigured: false, connected: false, expired: false }

export const useOneNote = create<OneNoteState>((set, get) => ({
  status: EMPTY,
  sections: [],
  sectionsLoaded: false,
  pages: {},
  text: {},
  loading: false,

  async refreshStatus() {
    const status = await window.tagwerk.microsoft.status()
    set({ status })
    return status
  },

  async loadSections(force) {
    if (get().sectionsLoaded && !force) return
    set({ loading: true, error: undefined })
    const r = await window.tagwerk.microsoft.sections()
    if (r.ok) set({ sections: r.value, sectionsLoaded: true, loading: false })
    else {
      set({ loading: false, error: r.error })
      if (r.code === 'expired') void get().refreshStatus()
    }
  },

  async loadPages(sectionId, force) {
    if (get().pages[sectionId] && !force) return
    set({ loading: true, error: undefined })
    const r = await window.tagwerk.microsoft.pages(sectionId || undefined)
    if (r.ok) set({ pages: { ...get().pages, [sectionId]: r.value }, loading: false })
    else set({ loading: false, error: r.error })
  },

  async loadText(pageId) {
    if (get().text[pageId] !== undefined) return
    const r = await window.tagwerk.microsoft.pageText(pageId)
    set({ text: { ...get().text, [pageId]: r.ok ? r.value : `⚠ ${r.error}` } })
  },

  reset() {
    set({ sections: [], sectionsLoaded: false, pages: {}, text: {}, error: undefined })
  }
}))

/** Speichert eine Tagwerk-Notiz als OneNote-Seite (oder ersetzt die frühere Fassung). */
export async function saveNoteToOneNote(note: Note, sectionId: string): Promise<boolean> {
  const st = useStore.getState()
  const ev = note.eventId ? st.data.events.find((e) => e.id === note.eventId) : undefined
  const r = await window.tagwerk.microsoft.savePage({
    sectionId,
    note: { title: note.title, body: note.body, kind: note.kind, decisions: note.decisions, nextSteps: note.nextSteps, createdAt: note.createdAt },
    meta: {
      event: ev ? `${ev.title}, ${new Date(ev.start).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : undefined,
      project: projectName(st.data, note.projectId)
    },
    // Nur ersetzen, wenn die Notiz schon in genau diesem Abschnitt liegt
    replacePageId: note.oneNote?.sectionId === sectionId ? note.oneNote.pageId : undefined
  })
  if (!r.ok) {
    st.toast(`Nicht nach OneNote gespeichert: ${r.error}`, { tone: 'error' })
    return false
  }
  const updated = note.oneNote?.sectionId === sectionId
  st.mutate((d) => ({
    ...d,
    notes: d.notes.map((n) =>
      n.id === note.id ? { ...n, oneNote: { pageId: r.value.id, sectionId, webUrl: r.value.webUrl, clientUrl: r.value.clientUrl, savedAt: new Date().toISOString() } } : n
    )
  }))
  if (st.settings.oneNoteSectionId !== sectionId) void st.updateSettings({ oneNoteSectionId: sectionId })
  // Die Seitenliste des Abschnitts ist jetzt veraltet
  const on = useOneNote.getState()
  const { [sectionId]: _a, '': _b, ...rest } = on.pages
  useOneNote.setState({ pages: rest })
  st.toast(updated ? 'In OneNote aktualisiert' : 'Nach OneNote gespeichert')
  return true
}

/** Öffnet eine Seite bevorzugt in der OneNote-App, sonst im Browser. */
export function openInOneNote(p: { clientUrl?: string; webUrl?: string }, prefer: 'app' | 'web' = 'app') {
  const url = prefer === 'app' ? (p.clientUrl ?? p.webUrl) : (p.webUrl ?? p.clientUrl)
  if (url) void window.tagwerk.microsoft.open(url)
}
