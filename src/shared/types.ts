// Gemeinsame Datentypen für Haupt- und Renderer-Prozess.

/** Herkunft eines Datensatzes – wird in der Oberfläche sichtbar gemacht. */
export type Source = 'demo' | 'local' | 'ics' | 'google'

export type Priority = 'high' | 'medium' | 'low'
export type TaskStatus = 'open' | 'doing' | 'done'
export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface Person {
  name: string
  email: string
}

export interface TaskOrigin {
  kind: 'email' | 'note' | 'meeting' | 'assistant'
  refId: string
  label: string
}

export interface Task {
  id: string
  title: string
  notes?: string
  priority: Priority
  /** Fälligkeitsdatum als YYYY-MM-DD */
  due?: string
  projectId?: string
  status: TaskStatus
  recurrence: Recurrence
  createdAt: string
  completedAt?: string
  archived?: boolean
  origin?: TaskOrigin
  source: Source
}

export interface CalEvent {
  id: string
  title: string
  /** ISO-Zeitstempel */
  start: string
  end: string
  allDay?: boolean
  location?: string
  attendees: Person[]
  notes?: string
  projectId?: string
  source: Source
  /** Importierte Termine (z. B. .ics) werden nicht zurückgeschrieben */
  readOnly?: boolean
  importId?: string
  /** ID im Ursprungssystem (z. B. Google-Kalender-Event-ID) */
  remoteId?: string
  /** Link zum Termin im Ursprungssystem */
  webLink?: string
  /** Ich bin nicht Organisator:in */
  organizer?: Person
}

export type MailFolder = 'inbox' | 'sent' | 'archive'

export interface Email {
  id: string
  threadId: string
  from: Person
  to: Person[]
  subject: string
  date: string
  body: string
  read: boolean
  important: boolean
  /** Erwartet eine Antwort von mir */
  needsReply: boolean
  replied: boolean
  folder: MailFolder
  projectId?: string
  source: Source
  /** Gmail-Nachrichten-ID */
  remoteId?: string
  /** Gmail-Thread-ID */
  remoteThreadId?: string
  /** RFC-822 Message-ID und References für korrekte Antwort-Verkettung */
  rfcMessageId?: string
  references?: string
}

export interface Note {
  id: string
  title: string
  body: string
  kind: 'note' | 'meeting'
  eventId?: string
  projectId?: string
  decisions?: string
  nextSteps?: string
  createdAt: string
  updatedAt: string
}

export type ProjectStatus = 'on-track' | 'at-risk' | 'paused' | 'done'

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  summary: string
  nextSteps: string[]
  hue: number
  source: Source
}

export interface DocRef {
  id: string
  title: string
  kind: 'Dokument' | 'Tabelle' | 'Präsentation' | 'PDF'
  projectId?: string
  updatedAt: string
  source: Source
}

export type ProposalKind =
  | 'create_task'
  | 'complete_task'
  | 'delete_task'
  | 'create_event'
  | 'update_event'
  | 'draft_reply'

export interface Proposal {
  id: string
  kind: ProposalKind
  payload: Record<string, unknown>
  status: 'pending' | 'confirmed' | 'rejected' | 'failed'
  note?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  proposals?: Proposal[]
  /** Rohe Inhaltsblöcke der API-Antwort (für den Gesprächsverlauf) */
  raw?: unknown
  error?: boolean
  createdAt: string
}

export interface IcsImport {
  id: string
  name: string
  importedAt: string
  count: number
}

export interface AppData {
  version: 1
  tasks: Task[]
  events: CalEvent[]
  emails: Email[]
  notes: Note[]
  projects: Project[]
  docs: DocRef[]
  chat: ChatMessage[]
  sources: {
    demo: boolean
    icsImports: IcsImport[]
    google?: { email: string; lastSync?: string }
  }
}

export type ThemeMode = 'system' | 'light' | 'dark'

export type ViewId = 'today' | 'calendar' | 'inbox' | 'tasks' | 'notes' | 'projects'

export type DashboardCardId = 'brief' | 'schedule' | 'tasks' | 'mail' | 'focus' | 'weather'

export interface Settings {
  userName: string
  theme: ThemeMode
  launchAtLogin: boolean
  closeToTray: boolean
  quickNoteShortcut: string
  notifications: {
    events: boolean
    leadMinutes: number
    dailyBrief: boolean
    briefTime: string
  }
  sidebar: { id: ViewId; visible: boolean }[]
  dashboardCards: { id: DashboardCardId; visible: boolean }[]
  workHours: { start: number; end: number }
  focusMinMinutes: number
  transitionBufferMinutes: number
  claude: {
    model: string
    /** Nur nötig für Schlüssel ohne Workspace-Zuordnung */
    workspaceId?: string
    includeEmailBodies: boolean
    chatRetentionDays: number
  }
  retention: {
    archivedTasksDays: number
  }
  weather: {
    enabled: boolean
    city: string
  }
  /** Gmail-Kategorien, die Tagwerk nicht in den Posteingang holt */
  gmailHiddenCategories: GmailCategory[]
  onboarded: boolean
}

export type GmailCategory = 'promotions' | 'social' | 'updates' | 'forums'

export const GMAIL_CATEGORIES: { id: GmailCategory; label: string; hint: string }[] = [
  { id: 'promotions', label: 'Werbung', hint: 'Angebote, Newsletter von Shops, Rabatte' },
  { id: 'social', label: 'Soziale Netzwerke', hint: 'Instagram, LinkedIn, Facebook & Co.' },
  { id: 'updates', label: 'Benachrichtigungen', hint: 'Rechnungen, Bestätigungen, Kontoauszüge' },
  { id: 'forums', label: 'Foren', hint: 'Mailinglisten und Diskussionsgruppen' }
]

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  theme: 'system',
  launchAtLogin: false,
  closeToTray: true,
  quickNoteShortcut: 'CommandOrControl+Shift+Space',
  notifications: { events: true, leadMinutes: 10, dailyBrief: true, briefTime: '08:00' },
  sidebar: [
    { id: 'today', visible: true },
    { id: 'calendar', visible: true },
    { id: 'inbox', visible: true },
    { id: 'tasks', visible: true },
    { id: 'notes', visible: true },
    { id: 'projects', visible: true }
  ],
  dashboardCards: [
    { id: 'brief', visible: true },
    { id: 'schedule', visible: true },
    { id: 'tasks', visible: true },
    { id: 'mail', visible: true },
    { id: 'focus', visible: true },
    { id: 'weather', visible: false }
  ],
  workHours: { start: 8, end: 18 },
  focusMinMinutes: 60,
  transitionBufferMinutes: 10,
  claude: { model: 'claude-sonnet-5-5', includeEmailBodies: false, chatRetentionDays: 30 },
  retention: { archivedTasksDays: 180 },
  weather: { enabled: false, city: '' },
  gmailHiddenCategories: ['promotions', 'social'],
  onboarded: false
}

export const CLAUDE_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 – ausgewogen' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 – schnell' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 – gründlich' }
]

// ---- IPC-Verträge ----

export interface ClaudeRequest {
  model: string
  system: string
  messages: unknown[]
  tools?: unknown[]
  max_tokens?: number
}

export type ClaudeResult =
  | { ok: true; content: unknown[]; stop_reason: string }
  | { ok: false; error: string; code: 'no-key' | 'offline' | 'auth' | 'rate' | 'server' | 'bad-request' | 'unknown' }

export interface WeatherResult {
  ok: boolean
  city?: string
  temperature?: number
  min?: number
  max?: number
  code?: number
  precipitation?: number
  error?: string
}

export interface IcsResult {
  ok: boolean
  canceled?: boolean
  import?: IcsImport
  events?: CalEvent[]
  error?: string
}

// ---- Google ----

export interface GoogleCapabilities {
  calendarRead: boolean
  calendarWrite: boolean
  gmailRead: boolean
  gmailWrite: boolean
}

export interface GoogleStatus {
  /** OAuth-Client (Client-ID/Secret) hinterlegt */
  clientConfigured: boolean
  clientIdHint?: string
  connected: boolean
  email?: string
  caps: GoogleCapabilities
  /** Anmeldung abgelaufen oder widerrufen – neu verbinden */
  expired: boolean
  /** Wann die Anmeldung abläuft (ms seit 1970); fehlt, wenn sie nicht abläuft */
  expiresAt?: number
  encrypted: boolean
}

export interface GoogleConnectOptions {
  calendar: boolean
  gmail: boolean
  /** false = nur lesen */
  write: boolean
}

export type GoogleErrorCode = 'not-connected' | 'expired' | 'scope' | 'api-disabled' | 'offline' | 'rate' | 'not-found' | 'conflict' | 'unknown'

export type GResult<T> = { ok: true; value: T } | { ok: false; code: GoogleErrorCode; error: string }

export interface GoogleSyncResult {
  ok: boolean
  syncedAt: string
  events?: CalEvent[]
  emails?: Email[]
  errors: { calendar?: string; gmail?: string; general?: string }
  status: GoogleStatus
}

export interface GoogleSendParams {
  remoteThreadId: string
  to: Person[]
  subject: string
  body: string
  inReplyTo?: string
  references?: string
}

export interface GoogleApi {
  status(): Promise<GoogleStatus>
  setClient(c: { clientId: string; clientSecret: string }): Promise<{ ok: boolean; error?: string }>
  importClientFile(): Promise<{ ok: boolean; canceled?: boolean; error?: string }>
  clearClient(): Promise<void>
  connect(opts: GoogleConnectOptions): Promise<{ ok: boolean; error?: string; status: GoogleStatus }>
  cancelConnect(): Promise<void>
  disconnect(): Promise<GoogleStatus>
  sync(): Promise<GoogleSyncResult>
  createEvent(ev: CalEvent, notify: boolean): Promise<GResult<CalEvent>>
  updateEvent(ev: CalEvent, notify: boolean): Promise<GResult<CalEvent>>
  deleteEvent(remoteId: string, notify: boolean): Promise<GResult<null>>
  modifyThread(remoteThreadId: string, add: string[], remove: string[]): Promise<GResult<null>>
  send(p: GoogleSendParams): Promise<GResult<Email>>
}

export interface PlatformInfo {
  platform: 'win32' | 'darwin' | 'linux'
  version: string
}

export interface TagwerkApi {
  platform: PlatformInfo
  data: {
    load(): Promise<AppData | null>
    save(data: AppData): Promise<void>
    exportJson(): Promise<{ ok: boolean; path?: string }>
    wipe(): Promise<void>
    onExternalNote(cb: (note: Note) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  claude: {
    status(): Promise<{ configured: boolean; encrypted: boolean }>
    setKey(key: string): Promise<{ ok: boolean; error?: string }>
    clearKey(): Promise<void>
    send(req: ClaudeRequest): Promise<ClaudeResult>
  }
  ics: { import(): Promise<IcsResult> }
  google: GoogleApi
  weather: { get(city: string): Promise<WeatherResult> }
  app: {
    notify(title: string, body: string): Promise<void>
    onNavigate(cb: (view: string) => void): () => void
    onCommand(cb: (cmd: string) => void): () => void
  }
  quickNote: {
    save(text: string): Promise<void>
    close(): void
  }
}
