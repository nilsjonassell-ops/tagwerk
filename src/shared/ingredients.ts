// Zutaten: Menge, Einheit und Name aus Freitext erkennen, lesbar formatieren, Portionen umrechnen.
// Regelbasiert und lokal – keine KI. Was nicht sicher erkannt wird, bleibt ohne Menge statt geraten.
import type { Ingredient } from './types.ts'

export type UnitFamily = 'mass' | 'volume' | 'spoon' | 'count'

interface UnitDef {
  unit: string
  family: UnitFamily
  /** Umrechnung in die Grundeinheit der Familie (g, ml, TL, Stück) – nur bei Masse/Volumen/Löffeln */
  factor?: number
}

const UNITS: Record<string, UnitDef> = {}
const def = (unit: string, family: UnitFamily, factor: number | undefined, ...aliases: string[]) => {
  for (const a of [unit, ...aliases]) UNITS[a.toLowerCase()] = { unit, family, factor }
}
def('g', 'mass', 1, 'gr', 'gr.', 'gramm')
def('kg', 'mass', 1000, 'kilo', 'kilogramm')
def('mg', 'mass', 0.001, 'milligramm')
def('ml', 'volume', 1, 'milliliter')
def('cl', 'volume', 10, 'zentiliter')
def('dl', 'volume', 100, 'deziliter')
def('l', 'volume', 1000, 'liter', 'ltr', 'ltr.')
def('EL', 'spoon', 3, 'el.', 'essl.', 'esslöffel', 'eßlöffel')
def('TL', 'spoon', 1, 'tl.', 'teel.', 'teelöffel', 'kaffeelöffel')
def('Msp.', 'count', undefined, 'msp', 'messerspitze', 'messerspitzen')
def('Prise', 'count', undefined, 'prisen')
def('Stück', 'count', undefined, 'stk', 'stk.', 'stck.')
def('Dose', 'count', undefined, 'dosen')
def('Packung', 'count', undefined, 'packungen', 'pck', 'pck.', 'pkg', 'pkg.', 'päckchen', 'pckg.', 'p.')
def('Beutel', 'count', undefined, 'btl', 'btl.', 'tüte', 'tüten')
def('Bund', 'count', undefined, 'bunde')
def('Becher', 'count', undefined)
def('Glas', 'count', undefined, 'gläser')
def('Tasse', 'count', undefined, 'tassen')
def('Scheibe', 'count', undefined, 'scheiben')
def('Zehe', 'count', undefined, 'zehen')
def('Zweig', 'count', undefined, 'zweige')
def('Blatt', 'count', undefined, 'blätter')
def('Stange', 'count', undefined, 'stangen')
def('Kopf', 'count', undefined, 'köpfe')
def('Knolle', 'count', undefined, 'knollen')
def('Würfel', 'count', undefined)
def('Handvoll', 'count', undefined)
def('Tropfen', 'count', undefined)
def('Schuss', 'count', undefined)

export const unitInfo = (u?: string): UnitDef | undefined => (u ? UNITS[u.toLowerCase()] : undefined)
export const isMetric = (u?: string) => {
  const f = unitInfo(u)?.family
  return f === 'mass' || f === 'volume'
}

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅕': 0.2 }
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d*[½¼¾⅓⅔⅛⅕]|\d+(?:[.,]\d+)?)`
const LEAD = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|–|—|bis)\s*(${NUM}))?\s*`)

function toNumber(s: string): number {
  s = s.trim()
  const glyph = s.match(/^(\d*)([½¼¾⅓⅔⅛⅕])$/)
  if (glyph) return (glyph[1] ? Number(glyph[1]) : 0) + FRACTIONS[glyph[2]]
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = s.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  // Tausenderpunkt: „1.500“ = 1500 (Dezimalzahlen haben im Deutschen ein Komma)
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''))
  return Number(s.replace(',', '.'))
}

/** Mengenwörter ohne Zahl – werden Zusatz, nicht Menge */
const VAGUE = /^(etwas|wenig|einige|ein paar|nach geschmack|nach belieben|evtl\.?|eventuell|wahlweise|optional|reichlich)\s+/i
/** Zahlwörter am Anfang */
const WORDS: Record<string, number> = { ein: 1, eine: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, acht: 8, zehn: 10, halbe: 0.5, halben: 0.5 }
/** Wörter zwischen Zahl und Einheit („2 gehäufte EL“) – werden Zusatz */
const MEASURE_ADJ = /^((?:gut|knapp|gehäuft|gestrichen|reichlich|groß|klein|leicht gehäuft)(?:e|er|en|es)?)\s+/i

let seq = 0
const nextId = () => `ing-${Date.now().toString(36)}-${(seq++).toString(36)}`

/** Freitext wie „2 kg frische Tomaten (oder aus der Dose)“ zerlegen. */
export function parseIngredient(raw: string, id?: string): Ingredient {
  const original = raw.replace(/\s+/g, ' ').trim()
  const notes: string[] = []
  // Klammerzusätze („(400 g)“, „(oder …)“) sind Zusatz, nicht Menge
  let text = original.replace(/\s*\(([^()]*)\)/g, (_, inner: string) => {
    if (inner.trim()) notes.push(inner.trim())
    return ' '
  })
  text = text.replace(/\s+/g, ' ').trim()
  let qty: number | undefined
  let qtyMax: number | undefined
  let unit: string | undefined

  const approx = text.match(/^(ca\.?|circa|etwa)\s+/i)
  if (approx) {
    notes.unshift('ca.')
    text = text.slice(approx[0].length)
  }
  const vague = text.match(VAGUE)
  if (vague) {
    notes.unshift(vague[1].toLowerCase())
    text = text.slice(vague[0].length)
  }

  const m = text.match(LEAD)
  if (m) {
    qty = toNumber(m[1])
    if (m[2]) qtyMax = toNumber(m[2])
    text = text.slice(m[0].length)
  } else {
    const w = text.match(/^(\S+)\s+(?=\S)/)
    const n = w ? WORDS[w[1].toLowerCase()] : undefined
    // „Eine Prise Salz“ → 1 Prise, „eine rote Zwiebel“ → 1; „ein paar“ wurde oben schon abgefangen
    if (w && n !== undefined) {
      qty = n
      text = text.slice(w[0].length)
    }
  }
  // „eine halbe Zwiebel“, „1 halber Liter“
  const half = qty === 1 ? text.match(/^halbe[nrs]?\s+/i) : null
  if (half) {
    qty = 0.5
    text = text.slice(half[0].length)
  }
  if (qty !== undefined && !Number.isFinite(qty)) qty = undefined
  if (qtyMax !== undefined && (!Number.isFinite(qtyMax) || qtyMax <= (qty ?? 0))) qtyMax = undefined

  // „2 gehäufte EL“: Mengen-Adjektiv vor der Einheit wird Zusatz
  const adj = qty !== undefined ? text.match(MEASURE_ADJ) : null
  if (adj && unitInfo(text.slice(adj[0].length).match(/^([A-Za-zÄÖÜäöüß]+\.?)/)?.[1])) {
    notes.unshift(adj[1].toLowerCase())
    text = text.slice(adj[0].length)
  }
  // Einheit direkt danach (auch angeklebt: „100g“ ist durch LEAD schon getrennt)
  const tok = text.match(/^([A-Za-zÄÖÜäöüß]+\.?)(?=\s|$)/)
  if (tok) {
    const u = unitInfo(tok[1])
    // Ohne Zahl nur ausgeschriebene Einheiten („Prise Salz“), nie einzelne Buchstaben
    if (u && (qty !== undefined || tok[1].replace('.', '').length > 2)) {
      unit = u.unit
      text = text.slice(tok[0].length).trim()
    }
  }
  // „2 Fischfilets, zum Beispiel Dorade“: nach einer Menge ist der Rest hinter dem Komma ein Zusatz
  if (qty !== undefined || unit) {
    const c = text.indexOf(', ')
    if (c > 0) {
      notes.push(text.slice(c + 2).trim())
      text = text.slice(0, c)
    }
  }
  // „Sbrinz Käse: Der Sbrinz kommt aus …“ – Erklärung nach dem Doppelpunkt ist Zusatz
  const colon = text.indexOf(': ')
  // „Zum Backen: Speiseöl“ – Zweck vorn, Zutat dahinter
  if (colon > 0 && /^(zum|zur|für|als)\b/i.test(text)) {
    notes.push(text.slice(0, colon).trim())
    text = text.slice(colon + 2)
  } else if (colon > 0 && text.slice(colon + 2).trim().split(/\s+/).length > 2) {
    notes.push(text.slice(colon + 2).trim())
    text = text.slice(0, colon)
  }
  const name = text.replace(/[.;:]+$/, '').trim() || original
  return { id: id ?? nextId(), raw: original, qty, qtyMax, unit, name, note: notes.length ? notes.join('; ') : undefined }
}

const GLYPH: [number, string][] = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾']
]

function fmtNum(n: number, metric: boolean): string {
  if (metric || n >= 10) return String(Math.round(n * 100) / 100).replace('.', ',')
  const whole = Math.floor(n + 1e-9)
  const rest = n - whole
  if (rest < 0.02) return String(whole)
  const g = GLYPH.find(([v]) => Math.abs(v - rest) < 0.02)
  if (g) return whole ? `${whole}${g[1]}` : g[1]
  return String(Math.round(n * 10) / 10).replace('.', ',')
}

/** „½ TL“, „1,5 kg“, „1–3“ – Menge ohne Zahl zeigt nur die Einheit. */
export function formatAmount(qty?: number, qtyMax?: number, unit?: string): string {
  if (qty === undefined) return unit ?? ''
  const metric = isMetric(unit)
  const n = qtyMax !== undefined ? `${fmtNum(qty, metric)}–${fmtNum(qtyMax, metric)}` : fmtNum(qty, metric)
  return unit ? `${n} ${unit}` : n
}

/** Sinnvoll runden: Gramm/Milliliter auf 5, Kilo/Liter auf 0,05, Löffel/Stück auf Viertel. */
export function roundAmount(n: number, unit?: string): number {
  const u = unitInfo(unit)
  if (u?.family === 'mass' || u?.family === 'volume') {
    if ((u.factor ?? 1) >= 1000) return Math.max(0.05, Math.round(n * 20) / 20)
    if (n >= 10) return Math.round(n / 5) * 5
    return Math.max(1, Math.round(n))
  }
  return Math.max(0.25, Math.round(n * 4) / 4)
}

export function scaleIngredient(ing: Ingredient, factor: number): Ingredient {
  if (ing.qty === undefined || !Number.isFinite(factor) || factor <= 0 || factor === 1) return ing
  return { ...ing, qty: roundAmount(ing.qty * factor, ing.unit), qtyMax: ing.qtyMax !== undefined ? roundAmount(ing.qtyMax * factor, ing.unit) : undefined }
}
