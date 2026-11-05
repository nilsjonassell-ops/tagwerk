// Rezepte aus dem Wikibooks-Kochbuch (de.wikibooks.org).
// Lizenz der Inhalte: CC BY-SA 4.0 – Quelle, Autorenschaft (Versionsgeschichte) und Lizenz werden immer angezeigt.
// Abruf über die offizielle MediaWiki-API, kein Schlüssel, keine Kosten. Die Zerlegung des Wikitexts ist regelbasiert.
import { parseIngredient } from './ingredients.ts'
import type { Ingredient, Recipe, RecipeHit, RecipeResult } from './types.ts'

export const WIKIBOOKS = {
  name: 'Wikibooks-Kochbuch',
  api: 'https://de.wikibooks.org/w/api.php',
  license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.de' },
  /** Kategorie, in der alle Rezepte stehen – filtert Lehrbücher und Technik-Seiten heraus */
  category: 'Kochbuch/ Alle Rezepte',
  prefix: 'Kochbuch/ '
}
/** Kennung für Wikimedia (User-Agent-Richtlinie): Name, Version, Kontakt über das öffentliche Projekt */
export const WIKI_AGENT = 'Tagwerk/1.8 (https://github.com/nilsjonassell-ops/tagwerk)'

const pagePath = (page: string) => encodeURIComponent(page.replace(/ /g, '_')).replace(/%2F/g, '/')
export const wikibooksUrl = (page: string) => `https://de.wikibooks.org/wiki/${pagePath(page)}`
export const wikibooksHistory = (page: string) => `https://de.wikibooks.org/w/index.php?title=${pagePath(page)}&action=history`
export const recipeIdFor = (page: string) => `wb:${page}`
export const titleOf = (page: string) => (page.startsWith(WIKIBOOKS.prefix) ? page.slice(WIKIBOOKS.prefix.length) : page).trim()

const ENT: Record<string, string> = { nbsp: ' ', thinsp: ' ', ensp: ' ', emsp: ' ', shy: '', amp: '&', lt: '<', gt: '>', quot: '"', ndash: '–', mdash: '—', frac12: '½', frac14: '¼', frac34: '¾', deg: '°' }

/** Wiki-Auszeichnung entfernen und lesbaren Text zurückgeben. */
export function cleanWiki(s: string): string {
  let t = s.replace(/<!--[\s\S]*?-->/g, '')
  t = t.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
  // Vorlagen, auch verschachtelt
  for (let i = 0; i < 5 && /\{\{/.test(t); i++) t = t.replace(/\{\{[^{}]*\}\}/g, '')
  t = t.replace(/\[\[(?:Bild|Image|Datei|File|Kategorie|Category):[^\]]*\]\]/gi, '')
  t = t.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
  t = t.replace(/\[\[([^\]]*)\]\]/g, (_, target: string) => {
    const clean = target.replace(/^w:\s*/i, '').split('#')[0]
    const parts = clean.split('/')
    return parts[parts.length - 1].trim()
  })
  t = t.replace(/\[(?:https?:)?\/\/\S+\s+([^\]]+)\]/g, '$1').replace(/\[(?:https?:)?\/\/\S+\]/g, '')
  t = t.replace(/'{2,5}/g, '')
  t = t.replace(/<br\s*\/?>/gi, ' ').replace(/<\/?[a-z][^>]*>/gi, '')
  t = t.replace(/&(#\d+|[a-z]+\d*);/gi, (all, e: string) => (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : (ENT[e.toLowerCase()] ?? all)))
  return t.replace(/[ \t\u00a0]+/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').replace(/\(\s+/g, '(').trim()
}

interface Heading {
  level: number
  text: string
  /** Zeilenindex der Überschrift */
  line: number
}

function infoValue(wikitext: string, labels: RegExp): string | undefined {
  // Vorlage {{Kochbuch/_Vorlage/_RezeptBox |Portionen = 2 …}}
  const tmpl = wikitext.replace(/<!--[\s\S]*?-->/g, '')
  for (const line of tmpl.split('\n')) {
    const m = line.match(/^\s*\|\s*([^=|]+?)\s*=\s*(.*)$/)
    if (m && labels.test(m[1])) {
      const v = cleanWiki(m[2])
      if (v) return v
    }
  }
  // Ältere Tabelle: „||Rezeptmenge für:“ und in der nächsten Zeile „||2-3 Personen“
  const lines = tmpl.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    const m = lines[i].match(/^\s*\|\|?\s*([^|]+?):?\s*$/)
    if (m && labels.test(m[1])) {
      const v = cleanWiki(lines[i + 1].replace(/^\s*\|\|?\s*/, ''))
      if (v && !/^\?+/.test(v)) return v
    }
  }
  return undefined
}

const isList = (l: string) => /^\s*[*#]/.test(l)
const listDepth = (l: string) => (l.match(/^\s*([*#]+)/)?.[1].length ?? 0)
const listText = (l: string) => l.replace(/^\s*[*#:]+\s*/, '')

/** Abschnitte, die keine Zutaten enthalten, auch wenn dort eine Liste steht */
const NOT_INGREDIENTS = /vorbemerk|geräte|geschirr|werkzeug|utensil|abkürzung|tipp|hinweis|anmerkung|weblink|beilage|servier|variation|variante|quelle|ernährung|menü|verwendung|wissenswert|foto|siehe|zubereitungszeit/i
const NUMWORD: Record<string, number> = { ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwölf: 12 }
/** „für 2 Personen“, „für vier Portionen“ */
function servingsIn(text: string): number | undefined {
  const m = text.match(/für\s+(\d+|[a-zäöü]+)\s*(?:[-–]\s*\d+\s*)?(?:personen|portionen|pers\.)/i)
  if (!m) return undefined
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMWORD[m[1].toLowerCase()]
  return n && n > 0 && n <= 200 ? n : undefined
}
/** Ende des eigentlichen Rezepts: Signatur „Erfasst von“, Benutzerlink */
const SIGNATURE = /^\s*('{2,5})?\s*(erfasst von|zubereitet von|\[\[benutzer:|--\s*\[\[benutzer:)/i

/** „Salz, Pfeffer und etwas Zucker“ → drei Zutaten. Zeilen mit Menge vorn oder „oder“ bleiben ganz. */
export function splitIngredientLine(text: string): string[] {
  const t = text.trim()
  if (!t || /^[\d½¼¾⅓⅔⅛]/.test(t) || /\boder\b/i.test(t)) return [t]
  const parts: string[] = []
  let depth = 0
  let cur = ''
  const push = () => {
    if (cur.trim()) parts.push(cur.trim())
    cur = ''
  }
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0) {
      if (ch === ',' || ch === '&') {
        push()
        continue
      }
      // „und“ trennt – außer nach Bindestrich („Gemüse- und Fleischbrühe“)
      const und = t.slice(i).match(/^\s+und\s+/)
      if (und && !/-\s*$/.test(cur)) {
        push()
        i += und[0].length - 1
        continue
      }
    }
    cur += ch
  }
  push()
  const clean = parts.map((p) => p.replace(/\s*(usw\.?|etc\.?)$/i, '').trim()).filter(Boolean)
  if (clean.length < 2 || clean.some((p) => p.split(/\s+/).length > 5)) return [t]
  return clean
}

interface Section {
  head: Heading
  /** Zeilen bis zur nächsten Überschrift gleicher oder höherer Ebene (inkl. Unterüberschriften) */
  from: number
  to: number
}
function sectionOf(lines: string[], heads: Heading[], h: Heading): Section {
  const next = heads.find((x) => x.line > h.line && x.level <= h.level)
  return { head: h, from: h.line + 1, to: next ? next.line : lines.length }
}

function parseIngredients(lines: string[], heads: Heading[], sections: Section[], page: string): { items: Ingredient[]; servings?: number } {
  const out: Ingredient[] = []
  let servings: number | undefined
  const base = page.replace(/\W+/g, '-')
  for (const sec of sections) {
    const title = cleanWiki(sec.head.text)
    servings ??= servingsIn(title)
    let group = /^zutaten\b/i.test(title) ? undefined : title || undefined
    let skip = false
    let started = false
    let stopped = false
    for (let i = sec.from; i < sec.to; i++) {
      const l = lines[i]
      if (SIGNATURE.test(l)) break
      const sub = heads.find((x) => x.line === i)
      if (sub) {
        const t = cleanWiki(sub.text)
        skip = NOT_INGREDIENTS.test(t)
        group = t || group
        stopped = false
        continue
      }
      if (skip) continue
      if (isList(l)) {
        if (stopped || listDepth(l) > 2) continue
        const text = cleanWiki(listText(l))
        if (!text) continue
        started = true
        for (const part of splitIngredientLine(text)) {
          const ing = parseIngredient(part, `${base}-${out.length}`)
          out.push(group ? { ...ing, group } : ing)
        }
        continue
      }
      const text = cleanWiki(l)
      if (!text) continue
      const n = servingsIn(text)
      if (n) {
        servings ??= n
        continue
      }
      // Kurze Zeile wie „''Für den Teig''“ → Gruppe; längerer Fließtext nach der Liste beendet den Abschnitt
      if (text.length <= 40 && !/[.!?]$/.test(text)) {
        group = text.replace(/:$/, '')
        stopped = false
      } else if (started) stopped = true
    }
  }
  return { items: out, servings }
}

function parseSteps(lines: string[], heads: Heading[], from: number, to: number): string[] {
  const steps: string[] = []
  let cur: string[] | null = null
  let prefix = ''
  const flush = () => {
    if (cur) {
      const s = cleanWiki(cur.join(' '))
      if (s) steps.push(prefix ? `${prefix}: ${s}` : s)
      if (s) prefix = ''
    }
    cur = null
  }
  for (let i = from; i < to; i++) {
    const l = lines[i]
    if (SIGNATURE.test(l)) break
    const h = heads.find((x) => x.line === i)
    if (h) {
      flush()
      prefix = cleanWiki(h.text)
      continue
    }
    if (!l.trim()) {
      // Leerzeile beendet Fortsetzungen eines Listenpunkts
      flush()
      continue
    }
    if (!cleanWiki(l)) continue
    if (isList(l) && listDepth(l) === 1) {
      flush()
      // „Schritt 1 – Der Teig“ → „Der Teig:“
      const t = listText(l).replace(/^Schritt\s*\d+\s*[–—-]\s*(.+)$/i, '$1:')
      cur = [t]
    } else if (cur) cur.push(listText(l))
    else cur = [l]
  }
  flush()
  return steps
}

/** Wikitext einer Kochbuch-Seite in ein Rezept umwandeln. */
export function parseWikibooksRecipe(page: string, wikitext: string, revision?: number, now = new Date().toISOString()): Recipe {
  const lines = wikitext.split('\n')
  const heads: Heading[] = []
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(={1,6})\s*(.*?)\s*\1\s*$/)
    if (m) return void heads.push({ level: m[1].length, text: m[2], line: i })
    // „Zutaten:“ / „Zubereitung:“ als einfacher Text
    const p = l.match(/^\s*'{0,5}\s*(Zutaten|Zubereitung)([^:]{0,40}):\s*'{0,5}\s*$/i)
    if (p) heads.push({ level: 2, text: `${p[1]}${p[2]}`, line: i })
  })
  const isZut = (h: Heading) => /zutat/i.test(cleanWiki(h.text))
  const zub = heads.find((h) => /^zubereitung\b/i.test(cleanWiki(h.text)) && !/zubereitungszeit/i.test(h.text))
  // Mehrere Varianten auf einer Seite: nur die Variante, zu der die erste Zubereitung gehört
  const variantStart = zub ? [...heads].reverse().find((h) => h.line < zub.line && h.level < zub.level) : undefined
  const lo = variantStart?.line ?? -1
  const hi = zub?.line ?? lines.length
  const candidates = heads
    .filter((h) => h.line > lo && h.line < hi && h !== variantStart)
    // nur oberste Abschnitte – Unterüberschriften werden beim Einlesen zu Gruppen
    .filter((h) => !heads.some((p) => p.line > lo && p.line < h.line && p.level < h.level && sectionOf(lines, heads, p).to > h.line))
    .map((h) => sectionOf(lines, heads, h))
    .filter((s) => !NOT_INGREDIENTS.test(cleanWiki(s.head.text)) && (isZut(s.head) || lines.slice(s.from, s.to).some(isList)))
  const ing = parseIngredients(lines, heads, candidates, page)
  const zubSec = zub ? sectionOf(lines, heads, zub) : undefined
  const steps = zubSec ? parseSteps(lines, heads, zubSec.from, zubSec.to) : []
  const servingsText = infoValue(wikitext, /^(portionen|rezeptmenge für|personen)$/i)
  const n = servingsText?.match(/\d+/)
  const servings = n && Number(n[0]) > 0 && Number(n[0]) <= 200 ? Number(n[0]) : ing.servings
  const time = infoValue(wikitext, /^(zubereitungszeit|zeitbedarf|arbeitszeit)$/i)
  const variants = heads.filter((h) => /^zutaten\b/i.test(cleanWiki(h.text))).length
  return {
    id: recipeIdFor(page),
    title: titleOf(page),
    source: { kind: 'wikibooks', name: WIKIBOOKS.name, url: wikibooksUrl(page), authorsUrl: wikibooksHistory(page), license: WIKIBOOKS.license, revision },
    servings,
    servingsText: servingsText ?? (ing.servings ? `${ing.servings} Personen` : undefined),
    time,
    ingredients: ing.items,
    steps,
    variantNote: variants > 1 && variantStart ? `Das Original enthält ${variants} Varianten – hier steht „${cleanWiki(variantStart.text)}“.` : variants > 1 ? `Das Original enthält ${variants} Varianten – hier steht die erste.` : undefined,
    savedAt: now,
    updatedAt: now
  }
}

// ---------- Abruf (Desktop und Web-Vorschau nutzen denselben Code) ----------

export type FetchJson = (url: string) => Promise<unknown>

/** Vorschautext: Hervorhebungen und die Navigationsleiste des Kochbuchs entfernen */
const NAV = /^(Startseite\s+)?Kochkurs\s+Kochtechniken\s+Zutaten\s+Rezepte\s+Kochzubehör\s+Maßangaben\s*/
const strip = (html: string) => cleanWiki(html.replace(/<span class="searchmatch">|<\/span>/g, '')).replace(NAV, '')

/** Seiten in der Rezept-Kategorie, die keine Rezepte sind */
const NOT_RECIPE = /\/ (Vorlage|Druckversion|Navigationsleiste|Inhaltsverzeichnis|Adventskalender)/i
/** Füllwörter, die bei der breiteren Suche wegfallen */
const STOP = new Set(['mit', 'und', 'oder', 'ohne', 'in', 'im', 'an', 'am', 'auf', 'aus', 'vom', 'von', 'zu', 'zum', 'zur', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'für', 'nach', 'art', 'à', 'la'])

async function searchOnce(fetchJson: FetchJson, srsearch: string): Promise<{ title: string; snippet?: string }[]> {
  const params = new URLSearchParams({ action: 'query', list: 'search', format: 'json', formatversion: '2', origin: '*', srlimit: '20', srprop: 'snippet', srsearch: `${srsearch} incategory:"${WIKIBOOKS.category}"` })
  const j = (await fetchJson(`${WIKIBOOKS.api}?${params}`)) as { query?: { search?: { title: string; snippet?: string }[] }; error?: { info?: string } }
  if (j.error) throw Object.assign(new Error(j.error.info ?? 'Fehler'), { api: true })
  return (j.query?.search ?? []).filter((x) => x.title.startsWith(WIKIBOOKS.prefix) && !NOT_RECIPE.test(x.title))
}

/** Suche im Kochbuch – nur Seiten aus der Rezept-Kategorie. Bei wenigen Treffern zusätzlich breiter (ODER, ohne Füllwörter). */
export async function searchWikibooks(fetchJson: FetchJson, q: string): Promise<RecipeResult<RecipeHit[]>> {
  const query = q.trim().replace(/["{}[\]|]/g, ' ').replace(/\s+/g, ' ')
  if (!query) return { ok: true, value: [] }
  try {
    const hits = await searchOnce(fetchJson, query)
    const words = query.split(' ').filter((w) => !STOP.has(w.toLowerCase()) && w.length > 1)
    if (hits.length < 5 && words.length > 1) {
      for (const h of await searchOnce(fetchJson, words.join(' OR '))) if (!hits.some((x) => x.title === h.title)) hits.push(h)
    }
    return { ok: true, value: hits.slice(0, 20).map((x) => ({ page: x.title, title: titleOf(x.title), snippet: strip(x.snippet ?? '').slice(0, 160) })) }
  } catch (e) {
    if ((e as { api?: boolean }).api) return { ok: false, error: `Wikibooks meldet: ${(e as Error).message}` }
    return { ok: false, error: 'Das Wikibooks-Kochbuch ist gerade nicht erreichbar.', offline: true }
  }
}

/** Ein Rezept laden und zerlegen. */
export async function getWikibooksRecipe(fetchJson: FetchJson, page: string): Promise<RecipeResult<Recipe>> {
  const params = new URLSearchParams({ action: 'parse', format: 'json', formatversion: '2', origin: '*', prop: 'wikitext|revid', redirects: '1', page })
  try {
    const j = (await fetchJson(`${WIKIBOOKS.api}?${params}`)) as { parse?: { title: string; wikitext: string; revid?: number }; error?: { code?: string; info?: string } }
    if (j.error || !j.parse) return { ok: false, error: j.error?.code === 'missingtitle' ? 'Dieses Rezept gibt es nicht mehr.' : `Wikibooks meldet: ${j.error?.info ?? 'Fehler'}` }
    const r = parseWikibooksRecipe(j.parse.title, j.parse.wikitext, j.parse.revid)
    if (!r.ingredients.length && !r.steps.length) return { ok: false, error: 'Auf dieser Seite wurde keine Zutatenliste gefunden. Öffne das Original.' }
    return { ok: true, value: r }
  } catch {
    return { ok: false, error: 'Das Wikibooks-Kochbuch ist gerade nicht erreichbar.', offline: true }
  }
}

/** Freie Websuche als Ausweg – öffnet nur Links, übernimmt keine Inhalte */
export const webSearchLinks = (q: string) => [
  { name: 'Chefkoch', url: `https://www.chefkoch.de/rs/s0/${encodeURIComponent(q.trim())}/Rezepte.html` },
  { name: 'Websuche', url: `https://duckduckgo.com/?q=${encodeURIComponent(`${q.trim()} Rezept`)}` }
]
