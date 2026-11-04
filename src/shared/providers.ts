// Übersicht der Konten: welche Anbieter Tagwerk tatsächlich unterstützt und in welchem Zustand sie sind.
// Reine Logik – die Konten-Seite (renderer/components/ProvidersOverview) zeigt das an.
import type { CloudStatus, GoogleStatus, ICloudStatus, MicrosoftStatus } from './types.ts'

export type ProviderGroup = 'mail' | 'calendar' | 'notes'
export type ProviderKind = 'google' | 'microsoft' | 'apple' | 'ics'
export type ProviderState = 'connected' | 'disconnected' | 'expired' | 'error' | 'syncing' | 'unsupported' | 'available'
export type ProviderAction = 'connect' | 'manage' | 'reconnect' | 'import' | null

export interface ProviderRow {
  id: string
  group: ProviderGroup
  /** Logo */
  kind: ProviderKind
  name: string
  state: ProviderState
  /** Zustand als Text (nie nur Farbe) */
  stateLabel: string
  detail: string
  action: ProviderAction
  /** Abschnitt mit den Kontoeinstellungen */
  section?: 'microsoft' | 'apple' | 'google'
}

export interface ProviderInput {
  google: Pick<GoogleStatus, 'connected' | 'expired' | 'email' | 'caps'>
  googleSync: { syncing: boolean; errors: { calendar?: string; gmail?: string; general?: string } }
  ms: Pick<MicrosoftStatus, 'connected' | 'expired' | 'email' | 'caps'>
  outlookSync: { syncing: boolean; error?: string }
  icloud: Pick<ICloudStatus, 'connected' | 'appleId' | 'calendars' | 'error'>
  icloudSync: { syncing: boolean; error?: string }
  cloud: Pick<CloudStatus, 'available' | 'enabled' | 'syncing' | 'error'>
}

export const GROUP_LABEL: Record<ProviderGroup, string> = { mail: 'E-Mail', calendar: 'Kalender', notes: 'Notizen & Sicherung' }

const LABEL: Record<ProviderState, string> = {
  connected: 'Verbunden',
  disconnected: 'Nicht verbunden',
  expired: 'Anmeldung abgelaufen',
  error: 'Fehler beim Abgleich',
  syncing: 'Wird abgeglichen …',
  unsupported: 'Nicht unterstützt',
  available: 'Verfügbar'
}

/** Gemeinsame Regel: abgelaufen › Fehler › lädt › verbunden › nicht verbunden */
function stateOf(o: { connected: boolean; expired?: boolean; granted: boolean; syncing?: boolean; error?: string }): ProviderState {
  if (o.expired) return 'expired'
  if (!o.connected || !o.granted) return 'disconnected'
  if (o.error) return 'error'
  if (o.syncing) return 'syncing'
  return 'connected'
}
const actionOf = (s: ProviderState): ProviderAction => (s === 'expired' ? 'reconnect' : s === 'disconnected' ? 'connect' : s === 'unsupported' ? null : 'manage')

export function providerRows(i: ProviderInput): ProviderRow[] {
  const rows: ProviderRow[] = []
  const add = (r: Omit<ProviderRow, 'stateLabel' | 'action'> & { action?: ProviderAction }) => rows.push({ ...r, stateLabel: LABEL[r.state], action: r.action === undefined ? actionOf(r.state) : r.action })

  const g = i.google
  const gErr = i.googleSync.errors.general
  const gmail = stateOf({ connected: g.connected, expired: g.expired, granted: g.caps.gmailRead, syncing: i.googleSync.syncing, error: i.googleSync.errors.gmail ?? gErr })
  add({
    id: 'gmail',
    group: 'mail',
    kind: 'google',
    name: 'Gmail',
    state: gmail,
    detail: gmail === 'error' ? (i.googleSync.errors.gmail ?? gErr ?? '') : g.connected && g.caps.gmailRead ? (g.email ?? '') : g.connected ? 'Google verbunden, Gmail nicht freigegeben' : 'Posteingang lesen, archivieren und beantworten',
    section: 'google'
  })
  const m = i.ms
  const oMail = stateOf({ connected: m.connected, expired: m.expired, granted: m.caps.mail, syncing: i.outlookSync.syncing, error: i.outlookSync.error })
  add({
    id: 'outlook-mail',
    group: 'mail',
    kind: 'microsoft',
    name: 'Outlook',
    state: oMail,
    detail: oMail === 'error' ? (i.outlookSync.error ?? '') : m.connected && m.caps.mail ? (m.email ?? '') : m.connected ? 'Microsoft verbunden, Mail nicht freigegeben' : 'outlook.de, hotmail, live – privates Microsoft-Konto',
    section: 'microsoft'
  })
  add({ id: 'icloud-mail', group: 'mail', kind: 'apple', name: 'iCloud Mail', state: 'unsupported', detail: 'Tagwerk verbindet von Apple nur den Kalender.', action: null })

  const gCal = stateOf({ connected: g.connected, expired: g.expired, granted: g.caps.calendarRead, syncing: i.googleSync.syncing, error: i.googleSync.errors.calendar ?? gErr })
  add({
    id: 'google-calendar',
    group: 'calendar',
    kind: 'google',
    name: 'Google Kalender',
    state: gCal,
    detail: gCal === 'error' ? (i.googleSync.errors.calendar ?? gErr ?? '') : g.connected && g.caps.calendarRead ? `${g.email ?? ''}${g.caps.calendarWrite ? '' : ' · nur lesen'}` : g.connected ? 'Google verbunden, Kalender nicht freigegeben' : 'Termine lesen und – falls freigegeben – anlegen',
    section: 'google'
  })
  const oCal = stateOf({ connected: m.connected, expired: m.expired, granted: m.caps.calendar, syncing: i.outlookSync.syncing, error: i.outlookSync.error })
  add({
    id: 'outlook-calendar',
    group: 'calendar',
    kind: 'microsoft',
    name: 'Outlook-Kalender',
    state: oCal,
    detail: oCal === 'error' ? (i.outlookSync.error ?? '') : m.connected && m.caps.calendar ? (m.email ?? '') : m.connected ? 'Microsoft verbunden, Kalender nicht freigegeben' : 'Termine lesen, anlegen, verschieben und löschen',
    section: 'microsoft'
  })
  const ic = i.icloud
  const aCal = stateOf({ connected: ic.connected, granted: true, syncing: i.icloudSync.syncing, error: i.icloudSync.error ?? ic.error })
  const enabled = ic.calendars.filter((c) => c.enabled).length
  add({
    id: 'apple-calendar',
    group: 'calendar',
    kind: 'apple',
    name: 'Apple Kalender',
    state: aCal,
    detail: aCal === 'error' ? (i.icloudSync.error ?? ic.error ?? '') : ic.connected ? `${ic.appleId ?? ''} · ${enabled} von ${ic.calendars.length} Kalendern` : 'iCloud-Kalender von iPhone, iPad und Mac',
    section: 'apple'
  })
  add({ id: 'ics', group: 'calendar', kind: 'ics', name: 'Kalenderdatei (.ics)', state: 'available', detail: 'Einmalig importieren – schreibgeschützt, ohne Abgleich', action: 'import' })

  const note = stateOf({ connected: m.connected, expired: m.expired, granted: m.caps.notes })
  add({ id: 'onenote', group: 'notes', kind: 'microsoft', name: 'OneNote', state: note, detail: m.connected && m.caps.notes ? 'Notizbücher lesen und Notizen speichern' : 'Mit dem Microsoft-Konto', section: 'microsoft' })
  const c = i.cloud
  const cloud: ProviderState = m.expired ? 'expired' : !c.available || !c.enabled ? 'disconnected' : c.error ? 'error' : c.syncing ? 'syncing' : 'connected'
  add({
    id: 'cloud',
    group: 'notes',
    kind: 'microsoft',
    name: 'Cloud-Speicher (OneDrive)',
    state: cloud,
    detail: cloud === 'error' ? (c.error ?? '') : cloud === 'connected' || cloud === 'syncing' ? 'Daten auf jedem PC wiederherstellen' : 'Braucht ein verbundenes Microsoft-Konto mit Cloud-Speicher',
    section: 'microsoft'
  })
  return rows
}
