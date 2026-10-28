import { addDays, parseYmd, startOfDay, ymd } from '@shared/analysis'
import type { AppData, Priority, Recurrence } from '@shared/types'

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('de-DE', o)
export const fDayLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
export const fDayMed = fmt({ weekday: 'short', day: 'numeric', month: 'short' })
export const fDate = fmt({ day: '2-digit', month: '2-digit', year: 'numeric' })
export const fMonthYear = fmt({ month: 'long', year: 'numeric' })
export const fTime = fmt({ hour: '2-digit', minute: '2-digit' })
export const fWeekdayShort = fmt({ weekday: 'short' })

export function greeting(now: Date, name: string): string {
  const h = now.getHours()
  const g = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Guten Tag' : 'Guten Abend'
  return name ? `${g}, ${name}` : g
}

/** „heute“, „morgen“, „gestern“, „vor 3 Tagen“, „Fr, 30. Okt.“ */
export function dueLabel(due: string, now = new Date()): { text: string; tone: 'overdue' | 'today' | 'normal' } {
  const d = parseYmd(due)
  const t = startOfDay(now)
  const diff = Math.round((d.getTime() - t.getTime()) / 86400_000)
  if (diff === 0) return { text: 'heute', tone: 'today' }
  if (diff === 1) return { text: 'morgen', tone: 'normal' }
  if (diff === -1) return { text: 'gestern', tone: 'overdue' }
  if (diff < 0) return { text: `seit ${-diff} Tagen`, tone: 'overdue' }
  if (diff < 7) return { text: fWeekdayShort.format(d), tone: 'normal' }
  return { text: fDayMed.format(d), tone: 'normal' }
}

export function mailDate(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (d.toDateString() === now.toDateString()) return fTime.format(d)
  if (d.toDateString() === addDays(now, -1).toDateString()) return 'gestern'
  if (now.getTime() - d.getTime() < 6 * 86400_000) return fWeekdayShort.format(d)
  return fmt({ day: 'numeric', month: 'short' }).format(d)
}

export const PRIORITY_LABEL: Record<Priority, string> = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' }
export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'Keine',
  daily: 'Täglich',
  weekdays: 'Werktags',
  weekly: 'Wöchentlich',
  monthly: 'Monatlich'
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s-]/gu, '').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function hueFor(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

export function projectHue(data: AppData, projectId?: string): number {
  return data.projects.find((p) => p.id === projectId)?.hue ?? 210
}

export function projectName(data: AppData, projectId?: string): string | undefined {
  return data.projects.find((p) => p.id === projectId)?.name
}

const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag']
const WD_SHORT = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']

export interface ParsedQuickAdd {
  title: string
  due?: string
  priority?: Priority
  projectId?: string
  recurrence?: Recurrence
}

/**
 * Schnelleingabe: „Bericht schreiben morgen !! #Q4“
 * Datum: heute, morgen, übermorgen, Wochentag, „nächste woche“, TT.MM.
 * Priorität: ! = mittel, !! = hoch. Projekt: #Name (Präfix genügt).
 * Wiederholung: täglich, werktags, wöchentlich, monatlich
 */
export function parseQuickAdd(input: string, data: AppData, now = new Date()): ParsedQuickAdd {
  let text = ` ${input} `
  const out: ParsedQuickAdd = { title: '' }
  const today = startOfDay(now)
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re)
    if (m) {
      fn(m)
      text = text.replace(m[0], ' ')
    }
  }
  take(/\s!!\s/, () => (out.priority = 'high'))
  take(/\s!\s/, () => (out.priority = 'medium'))
  take(/\s#([\p{L}\d-]+)/u, (m) => {
    const q = m[1].toLowerCase()
    const p = data.projects.find((x) => x.name.toLowerCase().replace(/\s+/g, '-').startsWith(q) || x.name.toLowerCase().startsWith(q))
    if (p) out.projectId = p.id
  })
  take(/\s(täglich|werktags|wöchentlich|monatlich)\s/i, (m) => {
    out.recurrence = ({ täglich: 'daily', werktags: 'weekdays', wöchentlich: 'weekly', monatlich: 'monthly' } as const)[
      m[1].toLowerCase() as 'täglich'
    ]
  })
  take(/\s(übermorgen)\s/i, () => (out.due = ymd(addDays(today, 2))))
  take(/\s(morgen)\s/i, () => (out.due = ymd(addDays(today, 1))))
  take(/\s(heute)\s/i, () => (out.due = ymd(today)))
  take(/\snächste woche\s/i, () => {
    const diff = ((8 - today.getDay()) % 7) || 7
    out.due = ymd(addDays(today, diff))
  })
  take(/\s(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?\s/, (m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear()
    let d = new Date(y, Number(m[2]) - 1, Number(m[1]))
    if (!m[3] && d < today) d = new Date(y + 1, Number(m[2]) - 1, Number(m[1]))
    if (!isNaN(d.getTime())) out.due = ymd(d)
  })
  if (!out.due) {
    take(new RegExp(`\\s(?:am\\s)?(${WEEKDAYS.join('|')}|${WD_SHORT.join('|')})\\s`, 'i'), (m) => {
      const w = m[1].toLowerCase()
      const idx = WEEKDAYS.indexOf(w) >= 0 ? WEEKDAYS.indexOf(w) : WD_SHORT.indexOf(w)
      const diff = ((idx - today.getDay() + 7) % 7) || 7
      out.due = ymd(addDays(today, diff))
    })
  }
  if (out.recurrence && !out.due) out.due = ymd(today)
  out.title = text.replace(/\s+/g, ' ').trim()
  return out
}

export function toLocalInput(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return { date: ymd(d), time: fTime.format(d) }
}

export function fromLocalInput(date: string, time: string): string {
  const [h, m] = time.split(':').map(Number)
  const d = parseYmd(date)
  d.setHours(h || 0, m || 0, 0, 0)
  return d.toISOString()
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

export function durationLabel(min: number): string {
  if (min < 60) return `${min} Min.`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`
}

export const isMac = () => window.tagwerk?.platform.platform === 'darwin'
export const modKey = () => (isMac() ? '⌘' : 'Strg')
