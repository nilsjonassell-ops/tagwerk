// Gemeinsame Datentypen für Haupt- und Renderer-Prozess.

/** Herkunft eines Datensatzes – wird in der Oberfläche sichtbar gemacht. */
export type Source = 'demo' | 'local' | 'ics' | 'google' | 'outlook' | 'icloud'

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
  /** Uhrzeit HH:MM – zu dieser Zeit erinnert Tagwerk */
  dueTime?: string
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
  /** Zeitblock für diese Aufgabe (vom Planer angelegt) */
  taskId?: string
  /** Erinnerung: Minuten vorher (0 = zum Beginn), null = keine, fehlt = Standard aus den Einstellungen */
  reminderMinutes?: number | null
  /** Apple Kalender: Kalender-URL, Ressourcen-ETag und Name des Kalenders */
  calendarId?: string
  etag?: string
  calendarName?: string
  /** Aus dieser Mail-Unterhaltung übernommen */
  mailRef?: string
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
  /** Gemerkt (in Gmail: Stern) */
  starred?: boolean
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
  /** Mail hat Anhänge (werden nie automatisch geladen oder gespeichert) */
  hasAttachments?: boolean
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
  /** Zuletzt nach OneNote gespeichert */
  oneNote?: { pageId: string; sectionId: string; webUrl?: string; clientUrl?: string; savedAt: string }
  /** Aus dieser Mail-Unterhaltung übernommen */
  mailRef?: string
}

// ---------- Vorschläge aus E-Mails ----------

export type SuggestionKind = 'event' | 'deadline' | 'task' | 'note'

/** Wird bei jedem Anzeigen neu aus den Mails berechnet – gespeichert wird nur der Bearbeitungsstand. */
export interface MailSuggestion {
  id: string
  kind: SuggestionKind
  threadId: string
  mailId: string
  source: Source
  from: Person
  subject: string
  mailDate: string
  title: string
  /** Termin */
  start?: string
  end?: string
  allDay?: boolean
  /** Frist (YYYY-MM-DD, HH:MM) */
  due?: string
  dueTime?: string
  /** Notiz */
  noteBody?: string
  /** Angabe ist berechnet oder unvollständig – vor dem Übernehmen prüfen */
  uncertain: boolean
  reason?: string
  /** Fundstelle und Satz drumherum */
  phrase: string
  context: string
  hasAttachments?: boolean
  /** Weitere Mails derselben Unterhaltung mit derselben Angabe (Erinnerung, Nachtrag) */
  followUps?: number
  /** Wiederkehrender Termin („jeden Dienstag“, „alle zwei Wochen bis 15.12.“) */
  recurrence?: SuggestionRecurrence
  /** Kurz und verständlich: worauf die Erkennung beruht */
  basis: string
  /** Widersprüchliche Angaben (z. B. Wochentag passt nicht zum Datum) – ich entscheide */
  conflict?: { label: string; options: SuggestionOption[] }
  /** Von mir selbst „zur Bearbeitung“ vorgemerkt */
  manual?: boolean
}

export interface SuggestionOption {
  label: string
  start?: string
  end?: string
  due?: string
}

export interface SuggestionRecurrence {
  freq: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  /** Letzter Termin (YYYY-MM-DD), falls genannt */
  until?: string
  label: string
}

/** Regel: Mails von einem Absender oder mit einem Betreff schlagen ein Projekt vor */
export interface MailRule {
  id: string
  field: 'from' | 'subject'
  contains: string
  projectId: string
}

/** Wiedervorlage für eine Unterhaltung: erinnert, wenn bis dahin keine neue Nachricht kam */
export interface FollowUp {
  at: string
  setAt: string
}

export interface SuggestionState {
  status: 'done' | 'ignored' | 'snoozed'
  at: string
  /** Wiedervorlage */
  until?: string
  /** Was daraus angelegt wurde */
  created?: { kind: 'event' | 'task' | 'note'; id: string }
}

// ---------- OneNote (Microsoft Graph) ----------

export interface OneNoteSection {
  id: string
  name: string
  notebookId: string
  notebook: string
  webUrl?: string
}

export interface OneNotePage {
  id: string
  title: string
  sectionId: string
  section: string
  created: string
  modified: string
  webUrl?: string
  clientUrl?: string
}

export interface MicrosoftStatus {
  clientConfigured: boolean
  clientIdHint?: string
  connected: boolean
  email?: string
  expired: boolean
  /** Freigegebene Bereiche */
  caps: { notes: boolean; mail: boolean; calendar: boolean; sync: boolean }
  /** Anwendungs-ID ist in Tagwerk eingebaut (keine eigene Registrierung nötig) */
  builtInClient?: boolean
}

export interface MicrosoftConnectOptions {
  notes: boolean
  mail: boolean
  calendar: boolean
  /** Daten über OneDrive (App-Ordner) zwischen PCs abgleichen */
  sync?: boolean
}

// ---------- Cloud-Abgleich (OneDrive-App-Ordner) ----------

export interface CloudDevice {
  id: string
  name: string
  lastSeen: string
  self: boolean
}

export interface CloudStatus {
  /** Microsoft verbunden und OneDrive-Zugriff freigegeben */
  available: boolean
  enabled: boolean
  syncing: boolean
  lastSync?: string
  error?: string
  devices: CloudDevice[]
  deviceName: string
}

export type CloudCollection = 'tasks' | 'notes' | 'projects' | 'docs' | 'events' | 'focusLog'

/** Änderungen von anderen Geräten, die die Oberfläche auf ihren aktuellen Stand anwendet */
export interface CloudPatch {
  upsert: Partial<Record<CloudCollection, { id: string }[]>>
  remove: Partial<Record<CloudCollection, string[]>>
  replyMarks?: { set: Record<string, ReplyMark>; remove: string[] }
  suggestions?: { set: Record<string, SuggestionState>; remove: string[] }
  followUps?: { set: Record<string, FollowUp>; remove: string[] }
  reviewQueue?: { set: Record<string, { at: string }>; remove: string[] }
}

export interface CloudApi {
  status(): Promise<CloudStatus>
  setEnabled(on: boolean): Promise<CloudStatus>
  syncNow(): Promise<CloudStatus>
  /** Eingespielten Stand übernommen und gespeichert */
  ack(): Promise<void>
  onStatus(cb: (s: CloudStatus) => void): () => void
  onPatch(cb: (p: CloudPatch) => void): () => void
  onSettings(cb: (s: Settings) => void): () => void
}

export interface OutlookSyncResult {
  ok: boolean
  syncedAt: string
  events?: CalEvent[]
  emails?: Email[]
  errors: { calendar?: string; mail?: string; general?: string }
}

export type OutlookMailAction = 'read' | 'unread' | 'archive' | 'unarchive' | 'trash' | 'untrash' | 'flag' | 'unflag'

// ---------- Apple Kalender (iCloud, CalDAV) ----------

export interface ICloudCalendar {
  id: string
  name: string
  color?: string
  enabled: boolean
  readOnly?: boolean
}

export interface ICloudStatus {
  connected: boolean
  appleId?: string
  calendars: ICloudCalendar[]
  defaultCalendarId?: string
  error?: string
}

export interface ICloudApi {
  status(): Promise<ICloudStatus>
  connect(appleId: string, appPassword: string): Promise<{ ok: boolean; error?: string; status: ICloudStatus }>
  disconnect(): Promise<ICloudStatus>
  setCalendars(enabledIds: string[], defaultId?: string): Promise<ICloudStatus>
  sync(): Promise<{ ok: boolean; syncedAt: string; events?: CalEvent[]; error?: string }>
  createEvent(ev: CalEvent, calendarId?: string): Promise<MsResult<CalEvent>>
  updateEvent(ev: CalEvent): Promise<MsResult<CalEvent>>
  deleteEvent(ev: CalEvent): Promise<MsResult<null>>
  onChanged(cb: () => void): () => void
}

export type MsResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: 'offline' | 'expired' | 'not-connected' | 'not-found' | 'unknown' }

export interface OneNoteSaveRequest {
  sectionId: string
  note: Pick<Note, 'title' | 'body' | 'kind' | 'decisions' | 'nextSteps' | 'createdAt'>
  meta?: { event?: string; project?: string }
  /** Frühere Fassung dieser Notiz in OneNote, die ersetzt wird */
  replacePageId?: string
}

export interface MicrosoftApi {
  status(): Promise<MicrosoftStatus>
  setClient(clientId: string): Promise<{ ok: boolean; error?: string }>
  clearClient(): Promise<void>
  connect(opts: MicrosoftConnectOptions): Promise<{ ok: boolean; error?: string; status: MicrosoftStatus }>
  cancelConnect(): Promise<void>
  disconnect(): Promise<MicrosoftStatus>
  /** Outlook Mail + Kalender */
  sync(opts?: { only?: 'mail' | 'calendar' }): Promise<OutlookSyncResult>
  mailAction(messageIds: string[], action: OutlookMailAction): Promise<MsResult<null>>
  reply(messageId: string, body: string): Promise<MsResult<null>>
  createEvent(ev: CalEvent, notify: boolean): Promise<MsResult<CalEvent>>
  updateEvent(ev: CalEvent): Promise<MsResult<CalEvent>>
  deleteEvent(remoteId: string): Promise<MsResult<null>>
  onChanged(cb: (what: 'mail' | 'calendar') => void): () => void
  sections(): Promise<MsResult<OneNoteSection[]>>
  pages(sectionId?: string): Promise<MsResult<OneNotePage[]>>
  pageText(pageId: string): Promise<MsResult<string>>
  savePage(req: OneNoteSaveRequest): Promise<MsResult<OneNotePage>>
  open(url: string): Promise<void>
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

export interface UpdateStatus {
  state: 'dev' | 'store' | 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'error'
  current: string
  version?: string
  percent?: number
  checkedAt?: number
  error?: string
}

/** Eine abgeschlossene Fokus-Sitzung */
export interface FocusEntry {
  id: string
  start: string
  end: string
  minutes: number
  taskId?: string
}

export type FocusSound = 'none' | 'rain' | 'brown' | 'white' | 'cafe'

/** Zustand für den Hauptprozess (Benachrichtigungen stumm, Fortschritt in der Taskleiste) */
export interface FocusSignal {
  active: boolean
  phase: 'focus' | 'break'
  /** ms seit 1970, null wenn pausiert */
  endsAt: number | null
  /** Restzeit in ms (maßgeblich, wenn pausiert) */
  remainingMs: number
  totalMs: number
  label: string
  allowMeetingAlerts: boolean
}

export interface ReplyMark {
  /** true = muss beantwortet werden, false = nicht mehr nötig */
  on: boolean
  /** Letzte eingegangene Nachricht beim Setzen – „nicht nötig“ gilt nur bis zur nächsten */
  msgId: string
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
  focusLog?: FocusEntry[]
  /** Von Hand gesetztes „Antwort offen“ je Unterhaltung (überlebt den Gmail-Abgleich) */
  replyMarks?: Record<string, ReplyMark>
  /** Bearbeitungsstand der Vorschläge aus Mails (übernommen, ignoriert, zurückgestellt) */
  suggestions?: Record<string, SuggestionState>
  /** Wiedervorlagen je Unterhaltung */
  followUps?: Record<string, FollowUp>
  /** „Zur Bearbeitung“ vorgemerkte Unterhaltungen */
  reviewQueue?: Record<string, { at: string }>
  sources: {
    demo: boolean
    icsImports: IcsImport[]
    google?: { email: string; lastSync?: string }
  }
}

export type ThemeMode = 'system' | 'light' | 'dark'

export type AccentId = 'indigo' | 'petrol' | 'blue' | 'green' | 'amber' | 'rose' | 'graphite'

/** Animationen: Windows-Einstellung folgen oder immer reduziert */
export type MotionMode = 'system' | 'reduced'

export type ViewId = 'today' | 'calendar' | 'inbox' | 'tasks' | 'notes' | 'projects'

export type DashboardCardId = 'brief' | 'schedule' | 'tasks' | 'mail' | 'focus' | 'weather'

export interface Settings {
  userName: string
  theme: ThemeMode
  /** Akzentfarbe der Oberfläche */
  accent: AccentId
  motion: MotionMode
  launchAtLogin: boolean
  /** Seitenleiste als schmaler Symbol-Streifen */
  sidebarCollapsed?: boolean
  closeToTray: boolean
  quickNoteShortcut: string
  notifications: {
    events: boolean
    leadMinutes: number
    /** Zusätzlich zum Beginn eines Termins erinnern */
    eventsAtStart: boolean
    dailyBrief: boolean
    briefTime: string
    /** Neue E-Mails melden: aus, nur wichtige oder alle */
    mail: 'off' | 'important' | 'all'
    /** Absender (E-Mail oder @domain), die immer gemeldet werden */
    vipSenders: string[]
    quiet: { enabled: boolean; from: string; to: string }
    sound: boolean
    /** Eigene Tagwerk-Pop-ups unten rechts oder Windows-Mitteilungen */
    style: 'popup' | 'windows'
    /** Wochenrückblick: Wochentag (0 = So … 5 = Fr) und Uhrzeit */
    weeklyReview: { enabled: boolean; day: number; time: string }
  }
  sidebar: { id: ViewId; visible: boolean }[]
  dashboardCards: { id: DashboardCardId; visible: boolean }[]
  workHours: { start: number; end: number }
  focusMinMinutes: number
  transitionBufferMinutes: number
  claude: {
    /** Claude-Funktionen in der Oberfläche anzeigen (kostenpflichtige API, daher standardmäßig aus) */
    enabled: boolean
    model: string
    /** Nur nötig für Schlüssel ohne Workspace-Zuordnung */
    workspaceId?: string
    includeEmailBodies: boolean
    chatRetentionDays: number
  }
  retention: {
    archivedTasksDays: number
  }
  /** Zuletzt gewählter Kalender für neue Termine */
  lastEventTarget?: string
  /** OneNote: zuletzt gewählter Abschnitt zum Speichern */
  oneNoteSectionId?: string
  weather: {
    enabled: boolean
    city: string
  }
  focus: {
    minutes: number
    breakMinutes: number
    longBreakMinutes: number
    /** Runden bis zur langen Pause */
    rounds: number
    pomodoro: boolean
    autoStartBreak: boolean
    allowMeetingAlerts: boolean
    sound: FocusSound
    volume: number
    chime: boolean
    dailyGoalMinutes: number
  }
  /** Gmail-Kategorien, die Tagwerk nicht in den Posteingang holt */
  gmailHiddenCategories: GmailCategory[]
  /** Vorschläge aus E-Mails: an/aus, geprüfte Konten (leer = alle) und Arten */
  mailInsights: {
    enabled: boolean
    /** Prüfung vorübergehend angehalten (Vorhandenes bleibt sichtbar) */
    paused?: boolean
    sources: Source[]
    kinds: SuggestionKind[]
    /** Absender oder Domains (z. B. „newsletter@…“, „@liste.de“), die nie geprüft werden */
    excludeSenders?: string[]
    /** Einstieg mit Vorschau abgeschlossen */
    introDone?: boolean
  }
  /** Regeln Absender/Betreff → Projekt */
  mailRules: MailRule[]
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
  accent: 'indigo',
  motion: 'system',
  launchAtLogin: false,
  closeToTray: true,
  quickNoteShortcut: 'CommandOrControl+Shift+Space',
  notifications: {
    events: true,
    leadMinutes: 10,
    eventsAtStart: false,
    dailyBrief: true,
    briefTime: '08:00',
    mail: 'important',
    vipSenders: [],
    quiet: { enabled: true, from: '22:00', to: '07:00' },
    sound: true,
    style: 'popup',
    weeklyReview: { enabled: true, day: 5, time: '16:00' }
  },
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
  claude: { enabled: false, model: 'claude-sonnet-5-5', includeEmailBodies: false, chatRetentionDays: 30 },
  retention: { archivedTasksDays: 180 },
  weather: { enabled: false, city: '' },
  focus: {
    minutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
    rounds: 4,
    pomodoro: true,
    autoStartBreak: true,
    allowMeetingAlerts: true,
    sound: 'none',
    volume: 0.4,
    chime: true,
    dailyGoalMinutes: 120
  },
  gmailHiddenCategories: ['promotions', 'social'],
  mailInsights: { enabled: true, sources: [], kinds: ['event', 'deadline', 'task', 'note'] },
  mailRules: [],
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
  sync(opts?: { only?: 'gmail' | 'calendar' }): Promise<GoogleSyncResult>
  /** Meldet, sobald sich in Gmail oder im Kalender etwas geändert hat. */
  onChanged(cb: (what: 'gmail' | 'calendar') => void): () => void
  createEvent(ev: CalEvent, notify: boolean): Promise<GResult<CalEvent>>
  updateEvent(ev: CalEvent, notify: boolean): Promise<GResult<CalEvent>>
  deleteEvent(remoteId: string, notify: boolean): Promise<GResult<null>>
  modifyThread(remoteThreadId: string, add: string[], remove: string[]): Promise<GResult<null>>
  trashThread(remoteThreadId: string, restore?: boolean): Promise<GResult<null>>
  send(p: GoogleSendParams): Promise<GResult<Email>>
}

export type NotifyKind = 'event' | 'mail' | 'brief' | 'focus' | 'system' | 'test' | 'update' | 'task' | 'review'

export interface NotifyRequest {
  title: string
  body: string
  kind: NotifyKind
  /** Was ein Klick öffnet */
  target?: { view: string; id?: string }
  /** Bei Terminen: für „Später erinnern“ */
  event?: { title: string; start: string; end: string; location?: string }
  /** Mehrere Mails in einer Meldung (eine Zeile je Mail) */
  lines?: string[]
}

export interface PopupAction {
  id: 'open' | 'archive' | 'snooze' | 'install' | 'later' | 'read' | 'done'
  label: string
  primary?: boolean
}

export interface PopupItem {
  id: string
  kind: NotifyKind
  title: string
  body: string
  lines?: string[]
  /** Zusatzzeile oben, z. B. „Termin · 14:30–15:00“ */
  meta?: string
  actions: PopupAction[]
  /** Bleibt stehen, bis man es wegklickt (Termine, Updates) */
  sticky: boolean
  sound: boolean
  at: number
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
  microsoft: MicrosoftApi
  icloud: ICloudApi
  cloud: CloudApi
  weather: { get(city: string): Promise<WeatherResult> }
  app: {
    notify(req: NotifyRequest): Promise<{ shown: boolean; reason?: string }>
    onNavigate(cb: (view: string) => void): () => void
    onOpen(cb: (target: { view: string; id?: string }) => void): () => void
    onCommand(cb: (cmd: string) => void): () => void
  }
  popup: {
    onItems(cb: (items: PopupItem[]) => void): () => void
    ready(): void
    size(height: number): void
    action(id: string, action: PopupAction['id'] | 'dismiss'): void
  }
  updates: {
    status(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    install(): void
    onStatus(cb: (s: UpdateStatus) => void): () => void
  }
  focus: {
    signal(s: FocusSignal): void
    onAction(cb: (action: 'pause' | 'resume' | 'stop' | 'skip' | 'open') => void): () => void
  }
  quickNote: {
    save(text: string): Promise<void>
    close(): void
  }
}
