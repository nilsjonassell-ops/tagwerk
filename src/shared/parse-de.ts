// Erkennung deutscher Datums- und Zeitangaben – für die Schnelleingabe von
// Aufgaben („Zahnarzt anrufen morgen 10 Uhr !hoch“) und für Terminvorschläge
// aus E-Mails („Passt dir Dienstag um 14 Uhr?“). Läuft komplett lokal.

import type { Priority, Recurrence } from './types.ts'

const DAY = 86400_000
const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag']
const WD_SHORT = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']
const MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']
const MON_SHORT = ['jan', 'feb', 'mär', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez']
const NUMBERS: Record<string, number> = { einem: 1, einen: 1, einer: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10 }

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const pad = (n: number) => String(n).padStart(2, '0')

export interface Found<T> {
  value: T
  index: number
  length: number
}

// \b kennt keine Umlaute – eigene Wortgrenzen
const L = '(?<![\\p{L}\\d])'
const R = '(?![\\p{L}\\d])'

// ---------- Datum ----------

/** Alle Datumsangaben im Text, bezogen auf „base“ (bei Mails: das Sendedatum). */
export function findDates(text: string, base: Date): Found<Date>[] {
  const today = startOfDay(base)
  const out: Found<Date>[] = []
  const add = (m: RegExpExecArray, d: Date | null) => {
    if (d && !isNaN(d.getTime())) out.push({ value: d, index: m.index, length: m[0].length })
  }
  const scan = (re: RegExp, fn: (m: RegExpExecArray) => Date | null) => {
    for (const m of text.matchAll(re)) add(m as RegExpExecArray, fn(m as RegExpExecArray))
  }

  scan(new RegExp(`${L}(übermorgen|morgen|heute)${R}`, 'giu'), (m) => {
    const w = m[1].toLowerCase()
    return addDays(today, w === 'heute' ? 0 : w === 'morgen' ? 1 : 2)
  })
  scan(new RegExp(`${L}in\\s+(\\d{1,2}|${Object.keys(NUMBERS).join('|')})\\s+(tag(?:en)?|woche(?:n)?)${R}`, 'giu'), (m) => {
    const n = /\d/.test(m[1]) ? Number(m[1]) : NUMBERS[m[1].toLowerCase()]
    return addDays(today, m[2].toLowerCase().startsWith('woche') ? n * 7 : n)
  })
  scan(new RegExp(`${L}(nächste|kommende)\\s+woche${R}(?!\\s*(?:am\\s+)?(?:${WEEKDAYS.join('|')}))`, 'giu'), () => {
    const diff = (8 - today.getDay()) % 7 || 7
    return addDays(today, diff)
  })
  // Wochentage: „Dienstag“, „am Di.“, „nächsten Freitag“, „nächste Woche Montag“
  scan(
    new RegExp(
      `${L}(?:(nächste|kommende)\\s+woche\\s+(?:am\\s+)?|(?:am\\s+)?(?:(nächsten|kommenden|diesen)\\s+)?)(${WEEKDAYS.join('|')}|(?:${WD_SHORT.filter((w) => w !== 'so').join('|')})\\.)${R}`,
      'giu'
    ),
    (m) => {
      const w = m[3].toLowerCase().replace('.', '')
      const idx = WEEKDAYS.indexOf(w) >= 0 ? WEEKDAYS.indexOf(w) : WD_SHORT.indexOf(w)
      let diff = (idx - today.getDay() + 7) % 7
      if (m[1]) {
        // Woche ab dem kommenden Montag
        const monday = (8 - today.getDay()) % 7 || 7
        return addDays(today, monday + ((idx + 6) % 7))
      }
      if (diff === 0) diff = m[2] ? 7 : 0
      else if (m[2]?.toLowerCase().startsWith('nächst') && diff < 2) diff += 7
      return addDays(today, diff)
    }
  )
  // 30.10. · 30.10.2026 · 3.11.26
  scan(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?(?![\d])/g, (m) => {
    const day = Number(m[1])
    const mon = Number(m[2])
    if (day < 1 || day > 31 || mon < 1 || mon > 12) return null
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear()
    let d = new Date(y, mon - 1, day)
    if (!m[3] && d.getTime() < today.getTime() - 60 * DAY) d = new Date(y + 1, mon - 1, day)
    return d
  })
  // 3. November · 3. Nov. · 3 Nov 2026
  scan(new RegExp(`${L}(\\d{1,2})\\.?\\s+(${MONTHS.join('|')}|(?:${MON_SHORT.join('|')})\\.?)(?:\\s+(\\d{4}))?${R}`, 'giu'), (m) => {
    const name = m[2].toLowerCase().replace('.', '')
    const mon = MONTHS.indexOf(name) >= 0 ? MONTHS.indexOf(name) : MON_SHORT.indexOf(name.slice(0, 3))
    if (mon < 0) return null
    const y = m[3] ? Number(m[3]) : today.getFullYear()
    let d = new Date(y, mon, Number(m[1]))
    if (!m[3] && d.getTime() < today.getTime() - 60 * DAY) d = new Date(y + 1, mon, Number(m[1]))
    return d
  })
  return dedupe(out)
}

// ---------- Uhrzeit ----------

export interface TimeValue {
  h: number
  m: number
  /** Ende, falls eine Spanne angegeben war („14–15 Uhr“) */
  end?: { h: number; m: number }
}

/** Uhrzeiten: „14 Uhr“, „um 9“, „14:30“, „14.30 Uhr“, „14–15:30 Uhr“, „von 9 bis 11 Uhr“, „3 Uhr nachmittags“. */
export function findTimes(text: string): Found<TimeValue>[] {
  const out: Found<TimeValue>[] = []
  const T = '(\\d{1,2})(?:[:.](\\d{2}))?'
  const re = new RegExp(
    `${L}(?:(?:um|ab|gegen|von)\\s+)?${T}(?:\\s*(?:-|–|bis)\\s*${T})?\\s*(uhr)?(?:\\s+(morgens|früh|vormittags|mittags|nachmittags|abends|nachts))?${R}`,
    'giu'
  )
  for (const m of text.matchAll(re)) {
    const raw = m[0].toLowerCase()
    const hasUm = /^(um|ab|gegen|von)\s/.test(raw)
    const hasUhr = !!m[5]
    const colon = m[2] !== undefined && /:/.test(raw)
    // Ohne „Uhr“, „um“ oder Doppelpunkt ist eine Zahl keine Uhrzeit (z. B. „3 Tage“, „30.10.“)
    if (!hasUhr && !hasUm && !colon) continue
    let h = Number(m[1])
    const min = m[2] ? Number(m[2]) : 0
    let eh = m[3] !== undefined ? Number(m[3]) : undefined
    const em = m[4] ? Number(m[4]) : 0
    if (h > 23 || min > 59 || (eh !== undefined && (eh > 24 || em > 59))) continue
    const part = m[6]?.toLowerCase()
    const pm = part === 'nachmittags' || part === 'abends' || (part === 'mittags' && h < 6)
    if (pm && h < 12) {
      h += 12
      if (eh !== undefined && eh < 12) eh += 12
    }
    // „von 9 bis 5“ → 17 Uhr
    if (eh !== undefined && eh < h && eh + 12 <= 24) eh += 12
    out.push({ value: { h, m: min, end: eh !== undefined ? { h: eh % 24, m: em } : undefined }, index: m.index!, length: m[0].length })
  }
  return out
}

// ---------- Schnelleingabe für Aufgaben ----------

export interface QuickTask {
  title: string
  due?: string
  /** HH:MM */
  time?: string
  priority?: Priority
  projectId?: string
  recurrence?: Recurrence
}

/**
 * „Zahnarzt anrufen morgen 10 Uhr !hoch #Privat“
 * Datum: heute, morgen, übermorgen, Wochentag, „nächste Woche“, „in 3 Tagen“, 12.11., 3. Dezember
 * Uhrzeit: 10 Uhr, um 9, 14:30 · Priorität: !hoch / !! · !mittel / ! · !niedrig
 * Projekt: #Name (Anfang genügt) · Wiederholung: täglich, werktags, wöchentlich, monatlich
 */
export function parseQuickTask(input: string, projects: { id: string; name: string }[], now = new Date()): QuickTask {
  let text = ` ${input} `
  const out: QuickTask = { title: '' }
  const cut = (index: number, length: number) => {
    text = text.slice(0, index) + ' '.repeat(length) + text.slice(index + length)
  }
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re)
    if (m && m.index !== undefined) {
      fn(m)
      cut(m.index, m[0].length)
    }
  }
  take(/\s!(hoch|h|wichtig|dringend)(?=\s)/iu, () => (out.priority = 'high'))
  take(/\s!(mittel|m|normal)(?=\s)/iu, () => (out.priority = 'medium'))
  take(/\s!(niedrig|n|gering|später)(?=\s)/iu, () => (out.priority = 'low'))
  take(/\s!!!?(?=\s)/, () => (out.priority = 'high'))
  take(/\s!(?=\s)/, () => (out.priority = 'medium'))
  take(/\s#([\p{L}\d-]+)/u, (m) => {
    const q = m[1].toLowerCase()
    const p = projects.find((x) => x.name.toLowerCase().replace(/\s+/g, '-').startsWith(q) || x.name.toLowerCase().startsWith(q))
    if (p) out.projectId = p.id
  })
  take(new RegExp(`${L}(täglich|werktags|wöchentlich|monatlich)${R}`, 'iu'), (m) => {
    out.recurrence = ({ täglich: 'daily', werktags: 'weekdays', wöchentlich: 'weekly', monatlich: 'monthly' } as const)[m[1].toLowerCase() as 'täglich']
  })
  const t = findTimes(text)[0]
  if (t) {
    out.time = `${pad(t.value.h)}:${pad(t.value.m)}`
    cut(t.index, t.length)
  }
  const d = findDates(text, now).sort((a, b) => b.length - a.length)[0]
  if (d) {
    out.due = ymdOf(d.value)
    cut(d.index, d.length)
  }
  // Uhrzeit ohne Datum: heute – oder morgen, wenn die Zeit schon vorbei ist
  if (out.time && !out.due) {
    const [h, m] = out.time.split(':').map(Number)
    const at = new Date(now)
    at.setHours(h, m, 0, 0)
    out.due = ymdOf(at.getTime() > now.getTime() ? now : addDays(now, 1))
  }
  if (out.recurrence && !out.due) out.due = ymdOf(now)
  out.title = text
    .replace(/\s+(am|um|bis)\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return out
}

// ---------- Terminvorschläge aus E-Mails ----------

export interface Appointment {
  start: string
  end: string
  /** Fundstelle im Text, z. B. „Dienstag um 14 Uhr“ */
  phrase: string
  /** Satz drumherum für die Vorschau */
  context: string
}

/** Entfernt zitierte Antworten („> …“, „Am … schrieb …:“), damit alte Termine nicht erneut auftauchen. */
export function stripQuoted(body: string): string {
  const lines = body.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    if (/^\s*(Am|On)\s.+(schrieb|wrote)\s*.*:\s*$/i.test(line)) break
    if (/^\s*-{2,}\s*(Ursprüngliche Nachricht|Original Message)/i.test(line)) break
    if (/^\s*(Von|From):\s.+/i.test(line) && out.length > 3) break
    if (/^\s*>/.test(line)) continue
    out.push(line)
  }
  return out.join('\n')
}

/**
 * Sucht Datum + Uhrzeit, die nah beieinander stehen. Nur künftige Termine.
 * „base“ = Sendedatum der Mail (für „morgen“, „Dienstag“ …).
 */
export function findAppointments(body: string, base: Date, now = new Date(), defaultMinutes = 60): Appointment[] {
  const text = stripQuoted(body).replace(/\s+/g, ' ')
  const dates = findDates(text, base)
  const times = findTimes(text)
  const out: Appointment[] = []
  const seen = new Set<string>()
  for (const d of dates) {
    // nächstgelegene Uhrzeit im Umkreis von 45 Zeichen, nicht über ein Satzende hinweg
    const near = times
      .map((t) => {
        const after = t.index >= d.index + d.length
        // nur die Lücke zwischen den Treffern prüfen – „5. November“ selbst ist kein Satzende
        const gap = after ? text.slice(d.index + d.length, t.index) : text.slice(t.index + t.length, d.index)
        const dist = gap.length
        return { t, dist, ok: dist <= 45 && !/[.!?](\s|$)/.test(gap) }
      })
      .filter((x) => x.ok)
      .sort((a, b) => a.dist - b.dist)[0]
    if (!near) continue
    const tv = near.t.value
    const start = new Date(d.value)
    start.setHours(tv.h, tv.m, 0, 0)
    if (start.getTime() < now.getTime()) continue
    const end = new Date(start)
    if (tv.end) end.setHours(tv.end.h, tv.end.m, 0, 0)
    if (end <= start) end.setTime(start.getTime() + defaultMinutes * 60_000)
    const key = start.toISOString()
    if (seen.has(key)) continue
    seen.add(key)
    const a = Math.min(d.index, near.t.index)
    const b = Math.max(d.index + d.length, near.t.index + near.t.length)
    const sStart = Math.max(0, text.lastIndexOf('. ', a) + 1, text.lastIndexOf('? ', a) + 1, text.lastIndexOf('! ', a) + 1)
    const nextEnd = [text.indexOf('. ', b), text.indexOf('? ', b), text.indexOf('! ', b)].filter((x) => x >= 0)
    const sEnd = nextEnd.length ? Math.min(...nextEnd) + 1 : text.length
    out.push({
      start: start.toISOString(),
      end: end.toISOString(),
      phrase: text.slice(a, b).trim(),
      context: text.slice(sStart, sEnd).trim().slice(0, 160)
    })
  }
  return out.sort((x, y) => x.start.localeCompare(y.start)).slice(0, 3)
}

function dedupe<T>(list: Found<T>[]): Found<T>[] {
  // längere Treffer gewinnen bei Überlappung („nächsten Freitag“ vor „Freitag“)
  const sorted = [...list].sort((a, b) => b.length - a.length)
  const kept: Found<T>[] = []
  for (const f of sorted) {
    if (kept.some((k) => f.index < k.index + k.length && k.index < f.index + f.length)) continue
    kept.push(f)
  }
  return kept.sort((a, b) => a.index - b.index)
}
