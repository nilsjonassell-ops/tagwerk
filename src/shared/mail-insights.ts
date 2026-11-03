// Vorschläge aus E-Mails: Termine, Fristen, Aufgaben und wichtige Infos erkennen.
// Läuft komplett lokal (Regeln + die Datums-/Zeiterkennung aus parse-de) – ohne KI,
// ohne Server. Erkannt wird nur; angelegt wird erst nach Bestätigung in der Oberfläche.

import type { Email, MailSuggestion, SuggestionKind, SuggestionRecurrence } from './types.ts'
import { findAppointments, findDates, findTimes, stripQuoted, ymdOf, type Found } from './parse-de.ts'

const DAY = 86400_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const pad = (n: number) => String(n).padStart(2, '0')

const DEADLINE = /(?<![\p{L}])(bis\s+(?:zum|zur|spätestens|ende|einschließlich)|bis\s+(?=(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|morgen|übermorgen|heute|\d))|spätestens|frist|deadline|abgabe|einsendeschluss|anmeldeschluss|meldeschluss|fällig|zahlbar|zurückmelden\s+bis|rückmeldung\s+bis)/iu
const EVENT_WORDS = /(?<![\p{L}])(termin|treffen|meeting|besprechung|veranstaltung|klausur|prüfung|vorlesung|seminar|übergabe|besichtigung|webinar|vortrag|party|feier|geburtstag|abendessen|mittagessen|call|telefonat|sprechstunde|workshop|kick-?off|interview|vorstellungsgespräch|gespräch|arzttermin|konzert|training|spiel)(?![\p{L}])/iu
const REQUEST = /(?<![\p{L}])(bitte|könntest\s+du|kannst\s+du|könnt\s+ihr|könnten\s+sie|können\s+sie|würdest\s+du|würden\s+sie|denk(?:e|t)?\s+(?:bitte\s+)?daran|nicht\s+vergessen|wir\s+bitten|ich\s+bitte|bräuchte(?:n)?|brauche(?:n)?\s+(?:ich|wir)|benötige(?:n)?\s+(?:ich|wir))(?![\p{L}])/iu
const ACTION = /(schick|send|bestätig|prüf|überweis|zahl|ausfüll|unterschreib|unterzeichn|meld|ruf|antwort|lad|bring|reservier|buch|kümmer|vorbereit|les|aktualisier|teil|erledig|freischalt|einreich|abgeb|mitbring|zusag|absag|kontaktier|einricht|weiterleit|ergänz|korrigier|hochlad|vorbeikomm|abhol|kündig|verlänger|anmeld|registrier|einplan|entwurf|feedback|rückmeld)/iu
const RELATIVE = /(heute|morgen|übermorgen|nächste|kommende|diese[nmr]?|in\s+\d+|in\s+(?:einem|einer|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|\b(?:mo|di|mi|do|fr|sa)\.|ende|wochenende|monatsende)/iu
const GREETING = /^(hallo|hi|hey|liebe[rs]?|sehr geehrte[rs]?|guten\s+(?:morgen|tag|abend)|moin|servus|grüß\s+gott)\b[^,.!?]*[,!]?\s*/iu
const SIGNOFF = /^(viele|liebe|beste|schöne|freundliche)?\s*grüße|^mit\s+freundlichen|^gruß|^danke\b|^vielen\s+dank|^lg\b|^vg\b|^bg\b/iu

const REF = /(?<![\p{L}])(buchungs|bestell|auftrags|kunden|rechnungs|vorgangs|sendungs|tracking|reservierungs|ticket|mitglieds|vertrags|referenz|fall|antrags|matrikel)[-\s]?(?:nummer|nr\.?|id|code)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/]{3,})/giu
const AKTENZEICHEN = /(?<![\p{L}])(aktenzeichen|az\.)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/ ]{2,20}[A-Z0-9])/giu
const PLACE = /^\s*(ort|raum|treffpunkt|adresse|location|gebäude|wo)\s*:\s*(.{3,90})$/gimu
const MEETING_LINK = /(https?:\/\/[^\s<>"]*(?:zoom\.us|teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|webex\.com|whereby\.com|jit\.si)[^\s<>"]*)/giu
const AMOUNT = /(?<![\p{L}])(betrag|summe|gesamtbetrag|rechnungsbetrag|nachzahlung|guthaben)\s*(?:von|:)?\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*(?:€|eur))/giu

export const cleanSubject = (s: string) => s.replace(/^((re|aw|fwd?|wg|antw)\s*:\s*)+/gi, '').trim() || '(ohne Betreff)'
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Sätze ohne Grußformel und Signatur */
function sentences(body: string): string[] {
  const lines = stripQuoted(body).split(/\r?\n/)
  const out: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    // „Viele Grüße“ beendet die Mail – „Vielen Dank für den Empfang! …“ nicht
    if (SIGNOFF.test(line) && line.length < 45) break
    for (const s of line.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„"])/u)) {
      // „zwischen 10 und 14 Uhr“ → „10–14 Uhr“ (versteht die Zeiterkennung)
      const t = s
        .replace(GREETING, '')
        .replace(/zwischen\s+(\d{1,2}(?:[:.]\d{2})?)\s*(?:uhr\s+)?und\s+(\d{1,2}(?:[:.]\d{2})?)\s*uhr/giu, '$1–$2 Uhr')
        .trim()
      if (t.length >= 4) out.push(t)
    }
  }
  return out
}

/** „Monatsende“, „Ende der Woche“, „Wochenende“ – kennt parse-de nicht */
function extraDates(text: string, base: Date): Found<Date>[] {
  const today = startOfDay(base)
  const out: Found<Date>[] = []
  const push = (re: RegExp, fn: () => Date) => {
    const m = re.exec(text)
    if (m) out.push({ value: fn(), index: m.index, length: m[0].length })
  }
  push(/(monatsende|ende\s+(?:des|dieses)\s+monats)/iu, () => new Date(today.getFullYear(), today.getMonth() + 1, 0))
  push(/ende\s+(?:der|dieser)\s+woche/iu, () => addDays(today, (5 - today.getDay() + 7) % 7))
  push(/(?<![\p{L}])(?:am\s+|übers?\s+|zum\s+)?wochenende/iu, () => addDays(today, (6 - today.getDay() + 7) % 7 || 7))
  return out
}

function allDates(text: string, base: Date): Found<Date>[] {
  const a = findDates(text, base)
  const b = extraDates(text, base).filter((x) => !a.some((y) => x.index < y.index + y.length && y.index < x.index + x.length))
  return [...a, ...b].sort((x, y) => x.index - y.index)
}

const WD = 'montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag'
const WD_LIST = WD.split('|')
// Unverbindlich: „vielleicht treffen wir uns“, „wie wäre es mit …“ → kein fester Termin
const TENTATIVE = /(?<![\p{L}])(vielleicht|eventuell|evtl\.|möglicherweise|unter\s+umständen|wenn\s+es\s+(?:klappt|passt)|falls\s+(?:es\s+)?(?:klappt|passt)|wie\s+wäre\s+es|wie\s+wär'?s|hättest\s+du\s+(?:lust|zeit)|hätten\s+sie\s+zeit|könnten\s+wir\s+uns|sollen\s+wir\s+uns|lust\s+auf)(?![\p{L}])/iu

/** Wochentag passt nicht zum Datum („Donnerstag, 13.11.“ – der 13.11. ist ein Freitag) */
export function weekdayConflict(s: string, base: Date): { named: number; explicit: Date; alt: Date; label: string } | null {
  const wd = new RegExp(`(?<![\\p{L}])(${WD})(?![\\p{L}])`, 'iu').exec(s)
  if (!wd) return null
  // WD_LIST beginnt mit Montag, getDay() mit Sonntag = 0
  const named = (WD_LIST.indexOf(wd[1].toLowerCase()) + 1) % 7
  const explicit = findDates(s, base).find((d) => /\d/.test(s.slice(d.index, d.index + d.length)) && !/^\s*in\s/iu.test(s.slice(d.index, d.index + d.length)))
  if (!explicit || explicit.value.getDay() === named) return null
  // Der genannte Wochentag in derselben Woche wie das Datum (näheste Abweichung)
  let diff = ((named - explicit.value.getDay()) + 7) % 7
  if (diff > 3) diff -= 7
  const alt = new Date(explicit.value)
  alt.setDate(alt.getDate() + diff)
  const f = (d: Date) => d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' })
  return { named, explicit: explicit.value, alt, label: `„${wd[1]}“ passt nicht zum ${f(explicit.value)}` }
}

/** Wiederholung im Satz: „jeden Dienstag“, „immer donnerstags“, „alle zwei Wochen“, „monatlich“ – mit „bis …“ als Ende */
export function recurrenceOf(s: string, base: Date): SuggestionRecurrence | undefined {
  let freq: SuggestionRecurrence['freq'] | undefined
  if (/(?<![\p{L}])(jeden\s+tag|täglich)(?![\p{L}])/iu.test(s)) freq = 'daily'
  else if (/(alle\s+(zwei|2)\s+wochen|zweiwöchentlich|14-tägig|vierzehntägig|alle\s+14\s+tage)/iu.test(s)) freq = 'biweekly'
  else if (/(monatlich|jeden\s+monat|einmal\s+im\s+monat)/iu.test(s)) freq = 'monthly'
  else if (new RegExp(`(?<![\\p{L}])((jeden|jede)\\s+(${WD})|(${WD})s|wöchentlich|jede\\s+woche|einmal\\s+pro\\s+woche)(?![\\p{L}])`, 'iu').test(s)) freq = 'weekly'
  if (!freq) return undefined
  const m = /(?<![\p{L}])bis\s+(?:zum\s+|einschließlich\s+)?(.{0,30})/iu.exec(s)
  const end = m ? findDates(m[1], base)[0] : undefined
  const until = end && end.index === 0 ? ymdOf(end.value) : undefined
  const names = { daily: 'täglich', weekly: 'wöchentlich', biweekly: 'alle zwei Wochen', monthly: 'monatlich' }
  return { freq, until, label: `${names[freq]}${until ? ` bis ${fmtDay(new Date(`${until}T12:00:00`))}` : ''}` }
}

/** Termine einer Serie ab dem ersten (höchstens 26, Standard: 8 Wochen bzw. 6 Monate) */
export function seriesStarts(start: Date, r: SuggestionRecurrence): Date[] {
  const out: Date[] = []
  const until = r.until ? new Date(`${r.until}T23:59:59`) : null
  const max = until ? 26 : r.freq === 'monthly' ? 6 : r.freq === 'daily' ? 14 : 8
  for (let i = 0; out.length < max && i < 400; i++) {
    const d = new Date(start)
    if (r.freq === 'daily') d.setDate(d.getDate() + i)
    else if (r.freq === 'weekly') d.setDate(d.getDate() + 7 * i)
    else if (r.freq === 'biweekly') d.setDate(d.getDate() + 14 * i)
    else d.setMonth(d.getMonth() + i)
    if (until && d.getTime() > until.getTime()) break
    out.push(d)
  }
  return out
}

const fmtDay = (d: Date) => d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })

/** Relative Angaben („nächsten Donnerstag“) werden berechnet – das ist eine Annahme und wird so markiert. */
function uncertainty(phrase: string, d: Date): string | undefined {
  if (!RELATIVE.test(phrase)) return undefined
  return `„${phrase.trim()}“ → ${fmtDay(d)}`
}

function hashStr(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

function requestTitle(sentence: string, subject: string, cut: { index: number; length: number }[] = []): string {
  // Datums- und Fristangaben stehen in der Fälligkeit, nicht im Titel
  let base = sentence
  for (const c of [...cut].sort((a, b) => b.index - a.index)) base = base.slice(0, c.index) + base.slice(c.index + c.length)
  let t = base
    .replace(/,\s*(damit|weil|sodass|so dass|um|da|dann|denn|wenn|falls|sonst)\b.*$/iu, '')
    .replace(REQUEST, ' ')
    .replace(/(?<![\p{L}])(spätestens|bis\s+(?:zum|zur|spätestens)?|heute\s+noch|noch\s+heute|am|um)(?=\s*$|\s+[,.?!])/giu, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s*((und|aber|also|außerdem|noch|dann|mir|uns|bitte|kurz|mal)\s+)+/iu, '')
    .replace(/^\s*(wir|ich|du|ihr|sie)\s+(?=\p{Ll})/u, '')
    .replace(/\s*[?!.]+$/u, '')
    .replace(/\s+(mal|noch|kurz|gerne?|eben)\s+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // „das freischalten lassen“ allein sagt nichts – Betreff davor
  t = t.replace(/\s+(spätestens|bis)\s*$/iu, '').trim()
  if (/^(das|es|dies|diese[ns]?|sie|ihn|ihm|dafür|darum|davon|mir|uns)\b/iu.test(t)) t = `${cleanSubject(subject)}: ${t}`
  else if (t.length < 28) t = `${cap(t)} – ${cleanSubject(subject)}`
  return short(cap(t), 90)
}

export interface DetectOptions {
  now?: Date
  kinds?: SuggestionKind[]
}

/** Vorschläge aus einer einzelnen eingegangenen Mail. */
export function detectMailSuggestions(m: Email, opts: DetectOptions = {}): MailSuggestion[] {
  if (m.folder === 'sent') return []
  const now = opts.now ?? new Date()
  const kinds = new Set<SuggestionKind>(opts.kinds ?? ['event', 'deadline', 'task', 'note'])
  const base = new Date(m.date)
  const today = startOfDay(now)
  const subject = cleanSubject(m.subject)
  // Mailtext zuerst (genauere Titel), Betreff zuletzt als Ergänzung
  // Nur der Anfang sehr langer Mails (Newsletter, Verläufe) – das Wichtige steht oben, und die Oberfläche bleibt schnell
  const text = (m.body ?? '').slice(0, 20_000)
  const body = sentences(text)
  const sents = [...body, m.subject.replace(/^((re|aw|fwd?|wg)\s*:\s*)+/gi, '')]
  const out: MailSuggestion[] = []
  const common = { threadId: m.threadId, mailId: m.id, source: m.source, from: m.from, subject: m.subject, mailDate: m.date, hasAttachments: !!m.hasAttachments }
  const has = (kind: SuggestionKind, key: string) => out.some((x) => x.kind === kind && (x.start ?? x.due ?? x.title) === key)

  sents.forEach((s, i) => {
    const isSubject = i === sents.length - 1
    // Serie: „bis 15.12.“ ist dann das Ende, keine Frist; „dienstags“ zählt als nächster Dienstag
    const rec = recurrenceOf(s, base)
    const sd = rec ? s.replace(new RegExp(`(${WD})s(?![\\p{L}])`, 'giu'), '$1') : s
    const dates = allDates(sd, base)
    const deadline = !rec && DEADLINE.test(s)
    const request = REQUEST.test(s) && ACTION.test(s)

    if (dates.length) {
      // Termin: Datum + Uhrzeit nah beieinander (vorhandene Erkennung)
      const found = deadline ? [] : findAppointments(sd, base, now)
      // Bei einer Serie zählt nur der erste Termin (das Enddatum ist kein eigener Termin)
      const appts = rec ? found.slice(0, 1) : found
      // Unverbindlich („vielleicht treffen wir uns Freitag um 18 Uhr“) → Aufgabe zur Klärung statt festem Termin
      if (appts.length && TENTATIVE.test(s) && !isSubject && kinds.has('task')) {
        const a = appts[0]
        const title = `Termin klären: ${short(subject, 70)}`
        if (!has('task', title))
          out.push({
            ...common,
            id: `ms:${m.id}:task:${hashStr(s)}`,
            kind: 'task',
            title,
            uncertain: true,
            reason: `Unverbindlich formuliert – möglicher Termin ${fmtDay(new Date(a.start))}, ${new Date(a.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`,
            basis: 'Unverbindlich formuliert („vielleicht“, „wie wäre es …“) – deshalb kein fester Termin, sondern eine Aufgabe zur Klärung.',
            phrase: a.phrase,
            context: short(s, 220)
          })
        return
      }
      if (appts.length && kinds.has('event')) {
        // Bei Serien ist ein zweites Datum das Ende, kein Widerspruch
        const clash = rec ? null : weekdayConflict(sd, base)
        for (const a of clash ? appts.slice(0, 1) : appts) {
          if (has('event', a.start)) continue
          const d = dates.find((x) => a.phrase.includes(sd.slice(x.index, x.index + x.length)))
          const why = d ? uncertainty(sd.slice(d.index, d.index + d.length), new Date(a.start)) : undefined
          const vague = /\b(gegen|ca\.|circa|ungefähr|etwa)\b/iu.test(a.phrase)
          const question = /\?\s*$/.test(s)
          let start = a.start
          let end = a.end
          let conflict: MailSuggestion['conflict']
          if (clash) {
            const at = (day: Date) => {
              const x = new Date(day)
              const src = new Date(a.start)
              x.setHours(src.getHours(), src.getMinutes(), 0, 0)
              return x
            }
            const dur = new Date(a.end).getTime() - new Date(a.start).getTime()
            const opt = (day: Date) => ({ label: `${day.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}, ${at(day).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`, start: at(day).toISOString(), end: new Date(at(day).getTime() + dur).toISOString() })
            conflict = { label: clash.label, options: [opt(clash.explicit), opt(clash.alt)] }
            start = conflict.options[0].start!
            end = conflict.options[0].end!
          }
          out.push({
            ...common,
            id: `ms:${m.id}:event:${start}`,
            kind: 'event',
            title: subject,
            start,
            end,
            uncertain: !!why || vague || question || !!conflict,
            reason: conflict ? `Widersprüchlich: ${conflict.label}` : why ?? (vague ? `Uhrzeit ungefähr: „${a.phrase}“` : question ? 'Als Frage formuliert – noch nicht zugesagt' : undefined),
            basis: conflict
              ? 'Wochentag und Datum widersprechen sich – bitte wähle, was gemeint ist.'
              : why
                ? `Datum aus „${d ? sd.slice(d.index, d.index + d.length) : a.phrase}“ berechnet, Uhrzeit steht in der Mail.`
                : question
                  ? 'Datum und Uhrzeit stehen in der Mail, aber als Frage – der Termin ist noch nicht zugesagt.'
                  : isSubject
                    ? 'Datum und Uhrzeit stehen ausdrücklich im Betreff.'
                    : 'Datum und Uhrzeit stehen ausdrücklich in der Mail.',
            recurrence: rec,
            conflict,
            phrase: a.phrase,
            context: isSubject ? `Betreff: ${s}` : short(s, 220)
          })
        }
        return
      }
      const d = dates[0]
      const phrase = s.slice(d.index, d.index + d.length)
      const day = d.value
      // Frist: Datum + „bis …“, „spätestens“, „Abgabe“ …
      if (deadline && kinds.has('deadline')) {
        if (day.getTime() < today.getTime()) return
        const t = findTimes(s)[0]
        const due = ymdOf(day)
        if (has('deadline', due)) return
        out.push({
          ...common,
          id: `ms:${m.id}:deadline:${due}`,
          kind: 'deadline',
          title: request && !isSubject ? requestTitle(s, m.subject, [d]) : `Frist: ${short(subject, 80)}`,
          due,
          dueTime: t ? `${pad(t.value.h)}:${pad(t.value.m)}` : undefined,
          uncertain: !!uncertainty(phrase, day),
          reason: uncertainty(phrase, day),
          basis: `Frist aus dem ${isSubject ? 'Betreff' : 'Nachrichtentext'} abgeleitet („${short(s.slice(Math.max(0, (DEADLINE.exec(s)?.index ?? 0)), (DEADLINE.exec(s)?.index ?? 0) + 40).trim(), 40)}“).`,
          phrase,
          context: isSubject ? `Betreff: ${s}` : short(s, 220)
        })
        return
      }
      // Bitte mit Datum („Können Sie mir heute noch bestätigen …?“) → Aufgabe mit Fälligkeit
      if (request && !isSubject && kinds.has('task') && day.getTime() >= today.getTime()) {
        const due = ymdOf(day)
        const title = requestTitle(s, m.subject, [d])
        if (has('task', title)) return
        out.push({
          ...common,
          id: `ms:${m.id}:task:${hashStr(s)}`,
          kind: 'task',
          title,
          due,
          uncertain: !!uncertainty(phrase, day),
          reason: uncertainty(phrase, day),
          basis: 'Bitte mit Datum im Nachrichtentext erkannt.',
          phrase,
          context: short(s, 220)
        })
        return
      }
      // Ganztägiger Termin: Datum + Termin-Stichwort, aber keine Uhrzeit (keine Fragen/Bitten)
      if (EVENT_WORDS.test(s) && !REQUEST.test(s) && !/\?\s*$/.test(s) && kinds.has('event') && day.getTime() >= today.getTime()) {
        const start = new Date(day)
        const key = start.toISOString()
        if (has('event', key) || out.some((x) => x.kind === 'event' && x.start?.slice(0, 10) === ymdOf(day))) return
        out.push({
          ...common,
          id: `ms:${m.id}:event:${ymdOf(day)}`,
          kind: 'event',
          title: subject,
          start: key,
          end: new Date(day.getTime() + DAY).toISOString(),
          allDay: true,
          uncertain: true,
          reason: `Keine Uhrzeit genannt${uncertainty(phrase, day) ? ` · ${uncertainty(phrase, day)}` : ''}`,
          basis: 'Datum und Anlass („Klausur“, „Termin“ …) stehen in der Mail, eine Uhrzeit fehlt.',
          phrase,
          context: isSubject ? `Betreff: ${s}` : short(s, 220)
        })
        return
      }
    }
    // Aufgabe: Bitte + Tätigkeit, ohne Datum
    if (!isSubject && request && kinds.has('task') && out.filter((x) => x.kind === 'task').length < 2) {
      const title = requestTitle(s, m.subject)
      if (has('task', title)) return
      out.push({ ...common, id: `ms:${m.id}:task:${hashStr(s)}`, kind: 'task', title, uncertain: false, basis: 'Bitte um eine Tätigkeit im Nachrichtentext erkannt.', phrase: s, context: short(s, 220) })
    }
  })

  // Infos für eine Notiz: Nummern, Ort/Raum, Meeting-Link, Beträge
  if (kinds.has('note')) {
    const text = stripQuoted((m.body ?? '').slice(0, 20_000))
    const lines: string[] = []
    const add = (l: string) => !lines.includes(l) && lines.push(l)
    for (const x of text.matchAll(REF)) add(`${cap(x[1].toLowerCase())}nummer: ${x[2]}`)
    for (const x of text.matchAll(AKTENZEICHEN)) add(`Aktenzeichen: ${x[2].trim()}`)
    for (const x of text.matchAll(PLACE)) add(`${cap(x[1].toLowerCase())}: ${x[2].trim()}`)
    for (const x of text.matchAll(MEETING_LINK)) add(`Link: ${x[1].replace(/[).,]+$/, '')}`)
    for (const x of text.matchAll(AMOUNT)) add(`${cap(x[1].toLowerCase())}: ${x[2].replace(/\s+/g, ' ')}`)
    if (lines.length) {
      out.push({
        ...common,
        id: `ms:${m.id}:note`,
        kind: 'note',
        title: `Infos: ${short(subject, 80)}`,
        noteBody: lines.slice(0, 8).join('\n'),
        uncertain: false,
        basis: 'Nummern, Ort, Link oder Betrag stehen wörtlich in der Mail.',
        phrase: lines[0],
        context: lines.slice(0, 3).join(' · ')
      })
    }
  }
  return out.slice(0, 5)
}

/** Alle Vorschläge aus den eingegangenen Mails der letzten Tage. */
export function detectAll(emails: Email[], opts: DetectOptions & { days?: number; sources?: string[]; exclude?: string[] } = {}): MailSuggestion[] {
  const now = opts.now ?? new Date()
  const since = now.getTime() - (opts.days ?? 30) * DAY
  const list: MailSuggestion[] = []
  // Erinnerungen und Nachträge in derselben Unterhaltung („kurze Erinnerung an die Freigabe bis Freitag“)
  // ergeben keinen zweiten Vorschlag – der erste bleibt (stabile ID), spätere zählen als Nachtrag.
  const seen = new Map<string, MailSuggestion>()
  const sorted = [...emails].sort((a, b) => a.date.localeCompare(b.date))
  for (const m of sorted) {
    if (m.folder === 'sent' || new Date(m.date).getTime() < since) continue
    if (opts.sources?.length && !opts.sources.includes(m.source)) continue
    if (isExcluded(m.from.email, opts.exclude)) continue
    for (const s of detectMailSuggestions(m, opts)) {
      const key = `${s.threadId}|${s.kind === 'task' && s.due ? 'deadline' : s.kind}|${s.start ?? s.due ?? s.title}`
      const first = seen.get(key)
      if (first) {
        first.followUps = (first.followUps ?? 0) + 1
        continue
      }
      seen.set(key, s)
      list.push(s)
    }
  }
  return list
}

/** Zeitpunkt, nach dem ein Vorschlag einsortiert wird (Termin, Frist oder Mail-Eingang). */
export const suggestionWhen = (s: MailSuggestion) => (s.start ? new Date(s.start) : s.due ? new Date(`${s.due}T${s.dueTime ?? '23:59'}:00`) : new Date(s.mailDate))

/** Heute prüfen / Diese Woche / Später */
export function suggestionBucket(s: MailSuggestion, now = new Date()): 'today' | 'week' | 'later' {
  const today = startOfDay(now)
  const when = suggestionWhen(s)
  const hasDate = !!(s.start || s.due)
  const newMail = new Date(s.mailDate).getTime() >= today.getTime()
  if (hasDate && when.getTime() < addDays(today, 2).getTime()) return 'today'
  if (!hasDate && newMail) return 'today'
  if (hasDate ? when.getTime() < addDays(today, 7).getTime() : new Date(s.mailDate).getTime() >= addDays(today, -3).getTime()) return 'week'
  return 'later'
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^(frist|infos?)\s*:\s*/u, '')
    .replace(/[^\p{L}\d ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Möglicherweise schon vorhanden? (gleiche Zeit oder sehr ähnlicher Titel am selben Tag) */
export function findDuplicate(
  s: MailSuggestion,
  data: { events: { id: string; title: string; start: string; mailRef?: string }[]; tasks: { id: string; title: string; due?: string; status: string; origin?: { refId: string } }[]; notes: { id: string; title: string; mailRef?: string }[] }
): { kind: 'event' | 'task' | 'note'; id: string; title: string } | null {
  const t = norm(s.title)
  const similar = (x: string) => {
    const n = norm(x)
    return !!n && !!t && (n === t || (n.length > 8 && t.includes(n)) || (t.length > 8 && n.includes(t)))
  }
  if (s.kind === 'event' && s.start) {
    const at = new Date(s.start).getTime()
    const day = s.start.slice(0, 10)
    const e = data.events.find((e) => Math.abs(new Date(e.start).getTime() - at) < 60_000 || (e.start.slice(0, 10) === day && similar(e.title)) || (e.mailRef === s.threadId && e.start.slice(0, 10) === day))
    return e ? { kind: 'event', id: e.id, title: e.title } : null
  }
  if (s.kind === 'deadline' || s.kind === 'task') {
    const x = data.tasks.find((x) => x.status !== 'done' && ((x.origin?.refId === s.threadId && (!s.due || x.due === s.due)) || similar(x.title)))
    return x ? { kind: 'task', id: x.id, title: x.title } : null
  }
  if (s.kind === 'note') {
    const n = data.notes.find((n) => n.mailRef === s.threadId || similar(n.title))
    return n ? { kind: 'note', id: n.id, title: n.title } : null
  }
  return null
}

/** Ausgeschlossener Absender? Einträge sind Adressen oder Teile davon („@newsletter.de“, „noreply@“). */
export function isExcluded(email: string, list?: string[]): boolean {
  const e = (email ?? '').toLowerCase()
  return !!e && (list ?? []).some((x) => x.trim() && e.includes(x.trim().toLowerCase()))
}
