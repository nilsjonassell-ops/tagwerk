// Einkaufsliste: Einträge anlegen, Zutaten hinzufügen (zusammenfassen nur, wenn sicher vergleichbar),
// Folgeaktionen beim Löschen eines Gerichts und feldweises Zusammenführen gleichzeitiger Änderungen.
// Reine Logik ohne Ein-/Ausgabe – Desktop, Web-Vorschau und Tests nutzen denselben Code.
import { formatAmount, parseIngredient, unitInfo } from './ingredients.ts'
import type { Ingredient, ItemOrigin, ShoppingCategory, ShoppingField, ShoppingItem } from './types.ts'

export const CATEGORY_LABEL: Record<ShoppingCategory, string> = {
  produce: 'Obst & Gemüse',
  bakery: 'Brot & Backwaren',
  dairy: 'Milch, Käse & Eier',
  meat: 'Fleisch & Fisch',
  pantry: 'Vorrat & Konserven',
  spices: 'Gewürze & Kräuter',
  frozen: 'Tiefkühl',
  drinks: 'Getränke',
  household: 'Haushalt',
  other: 'Sonstiges'
}
export const CATEGORY_ORDER: ShoppingCategory[] = ['produce', 'bakery', 'dairy', 'meat', 'pantry', 'spices', 'frozen', 'drinks', 'household', 'other']

const KEYWORDS: [ShoppingCategory, RegExp][] = [
  ['household', /spülmittel|waschmittel|küchenrolle|toilettenpapier|müllbeutel|alufolie|frischhaltefolie|backpapier|schwamm|seife|zahnpasta|shampoo/],
  ['frozen', /tiefkühl|tk-|gefroren|eiswürfel|speiseeis/],
  ['drinks', /wasser|saft|bier|wein|limo|cola|kaffee|tee\b|sekt|mineralwasser/],
  ['spices', /salz|pfeffer|oregano|basilikum|thymian|rosmarin|petersilie|schnittlauch|dill|zimt|muskat|paprikapulver|curry|kümmel|lorbeer|chili|peperoncino|vanille|gewürz|kräuter|origano|koriander|kreuzkümmel|majoran|salbei/],
  ['dairy', /milch|sahne|butter|käse|quark|joghurt|jogurt|schmand|crème|creme fraiche|parmesan|mozzarella|feta|\bei\b|eier|eigelb|eiweiß|buttermilch/],
  ['meat', /fleisch|hähnchen|huhn|hühner|pute|rind|schwein|hack|speck|schinken|wurst|lachs|thunfisch|fisch|garnele|shrimps|salami|filet|steak|bacon/],
  ['bakery', /brot|brötchen|toast|baguette|croissant|semmel|knäcke/],
  ['produce', /tomate|zwiebel|knoblauch|kartoffel|möhre|karotte|paprika|zucchini|gurke|salat|spinat|lauch|porree|sellerie|kohl|brokkoli|blumenkohl|pilz|champignon|aubergine|kürbis|apfel|äpfel|banane|birne|zitrone|limette|orange|beere|kirsche|pflaume|traube|avocado|ingwer|rukola|rucola|radieschen|frühlingszwiebel|schalotte|mais\b|erbse|bohne|obst|gemüse/],
  ['pantry', /nudel|spaghetti|pasta|penne|reis|mehl|zucker|öl\b|olivenöl|essig|tomatenmark|dose|brühe|hefe|backpulver|haferflocken|linsen|kichererbse|honig|marmelade|senf|ketchup|mayonnaise|sojasoße|sojasauce|nüsse|mandel|haselnuss|walnuss|grieß|stärke|kakao|schokolade|müsli|couscous|bulgur|sirup/]
]

export function categorize(name: string): ShoppingCategory {
  const n = name.toLowerCase()
  for (const [cat, re] of KEYWORDS) if (re.test(n)) return cat
  return 'other'
}

const ALL_FIELDS: ShoppingField[] = ['name', 'amount', 'note', 'category', 'done', 'deleted']
const stampAll = (now: number) => Object.fromEntries(ALL_FIELDS.map((f) => [f, now])) as Record<ShoppingField, number>

let seq = 0
export const shoppingId = (now = Date.now()) => `si-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}${(seq++).toString(36)}`

export interface NewItemInput {
  name: string
  qty?: number
  qtyMax?: number
  unit?: string
  note?: string
  category?: ShoppingCategory
  origins?: ItemOrigin[]
  fromRecipe?: boolean
}

export function newItem(listId: string, x: NewItemInput, by: string | undefined, now: number): ShoppingItem {
  return {
    id: shoppingId(now),
    listId,
    name: x.name.trim(),
    qty: x.qty,
    qtyMax: x.qtyMax,
    unit: x.unit,
    note: x.note,
    category: x.category ?? categorize(x.name),
    done: false,
    origins: x.origins?.length ? x.origins : undefined,
    fromRecipe: x.fromRecipe || undefined,
    stamps: stampAll(now),
    by,
    createdAt: new Date(now).toISOString()
  }
}

/** „500 g Nudeln“ → Eintrag mit Menge und Einheit */
export function quickItem(listId: string, text: string, by: string | undefined, now: number): ShoppingItem {
  const i = parseIngredient(text)
  return newItem(listId, { name: i.name, qty: i.qty, qtyMax: i.qtyMax, unit: i.unit, note: i.note }, by, now)
}

export interface ItemPatch {
  name?: string
  qty?: number | undefined
  qtyMax?: number | undefined
  unit?: string | undefined
  note?: string | undefined
  category?: ShoppingCategory
  done?: boolean
  deleted?: boolean
}

/** Änderung durch eine Person – stempelt nur die geänderten Felder. Mengenänderung = „von Hand bearbeitet“. */
export function editItem(item: ShoppingItem, p: ItemPatch, by: string | undefined, now: number): ShoppingItem {
  const next: ShoppingItem = { ...item, stamps: { ...item.stamps }, by }
  const stamp = (f: ShoppingField) => (next.stamps[f] = Math.max(now, (item.stamps[f] ?? 0) + 1))
  if (p.name !== undefined && p.name.trim() && p.name.trim() !== item.name) {
    next.name = p.name.trim()
    stamp('name')
  }
  if ('qty' in p || 'unit' in p || 'qtyMax' in p) {
    const qty = 'qty' in p ? p.qty : item.qty
    const unit = 'unit' in p ? p.unit || undefined : item.unit
    const qtyMax = 'qtyMax' in p ? p.qtyMax : 'qty' in p ? undefined : item.qtyMax
    if (qty !== item.qty || unit !== item.unit || qtyMax !== item.qtyMax) {
      Object.assign(next, { qty, unit, qtyMax })
      next.edited = true
      stamp('amount')
    }
  }
  if ('note' in p && (p.note || undefined) !== item.note) {
    next.note = p.note || undefined
    stamp('note')
  }
  if (p.category && p.category !== item.category) {
    next.category = p.category
    stamp('category')
  }
  if (p.done !== undefined && p.done !== item.done) {
    next.done = p.done
    stamp('done')
  }
  if (p.deleted !== undefined && p.deleted !== !!item.deleted) {
    next.deleted = p.deleted || undefined
    stamp('deleted')
  }
  return next
}

export const visibleItems = (items: ShoppingItem[]) => items.filter((i) => !i.deleted)

// ---------- Zutaten hinzufügen ----------

const PREP = /^(frische?[nrs]?|gehackte?[nrs]?|getrocknete?[nrs]?|kleine?[nrs]?|große?[nrs]?|mittelgroße?[nrs]?|reife?[nrs]?|feine?[nrs]?|bio|tk|zerlassene?[nrs]?|weiche?[nrs]?)\s+/i
/** Vergleichsschlüssel: Kleinschreibung, einfache Zubereitungswörter weg, Singular/Plural angeglichen */
export function itemKey(name: string): string {
  let n = name.toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 3 && PREP.test(n); i++) n = n.replace(PREP, '')
  return n
    .split(' ')
    .map((w) => (w.length > 4 ? w.replace(/(en|n|e|s)$/, '') : w))
    .join(' ')
}

/** Lässt sich b in die Einheit von a umrechnen? */
function convert(qty: number, from: string | undefined, to: string | undefined): number | undefined {
  if ((from ?? '') === (to ?? '')) return qty
  const a = unitInfo(from)
  const b = unitInfo(to)
  if (!a || !b || a.family !== b.family || a.factor === undefined || b.factor === undefined) return undefined
  return (qty * a.factor) / b.factor
}
const round2 = (n: number) => Math.round(n * 100) / 100

export interface AddPick {
  ingredient: Ingredient
  /** Herkunft, z. B. „meal:<id>:<zutat>“ oder „<rezept>:<zutat>“ */
  originKey: string
  /** Lesbarer Name der Herkunft (Gericht oder Rezept) */
  label: string
}

export type AddAction = 'new' | 'merge' | 'separate' | 'duplicate' | 'present'

export interface PlanEntry extends AddPick {
  action: AddAction
  targetId?: string
  /** Warum getrennt bzw. was passiert – für die Übersicht vor dem Hinzufügen */
  reason?: string
  /** Menge des Zieleintrags danach */
  resultText?: string
}

/** Was würde beim Hinzufügen passieren? Ändert nichts. */
export function planAdd(items: ShoppingItem[], listId: string, picks: AddPick[]): PlanEntry[] {
  const list = visibleItems(items).filter((i) => i.listId === listId)
  return picks.map((p) => {
    const ing = p.ingredient
    const dup = list.find((i) => i.origins?.some((o) => o.key === p.originKey))
    if (dup) return { ...p, action: 'duplicate', targetId: dup.id, reason: dup.done ? 'Schon gekauft' : 'Schon auf der Liste' }
    const key = itemKey(ing.name)
    const open = list.filter((i) => !i.done && itemKey(i.name) === key)
    if (!open.length) return { ...p, action: 'new' }
    if (ing.qty === undefined) {
      const t = open[0]
      return { ...p, action: 'present', targetId: t.id, reason: `„${t.name}“ steht schon auf der Liste` }
    }
    if (ing.qtyMax !== undefined) return { ...p, action: 'separate', reason: 'Mengenspanne – wird nicht zusammengerechnet' }
    for (const t of open) {
      if (t.qty === undefined || t.qtyMax !== undefined) continue
      const add = convert(ing.qty, ing.unit, t.unit)
      if (add !== undefined) return { ...p, action: 'merge', targetId: t.id, resultText: formatAmount(round2(t.qty + add), undefined, t.unit) }
    }
    const other = open.map((t) => formatAmount(t.qty, t.qtyMax, t.unit) || 'ohne Menge').join(', ')
    return { ...p, action: 'separate', reason: `Andere Einheit als auf der Liste (${other}) – eigener Eintrag` }
  })
}

/** Plan ausführen. Doppelte werden übersprungen, Vorhandenes bekommt nur die Herkunft dazu. */
export function applyAdd(items: ShoppingItem[], listId: string, plan: PlanEntry[], by: string | undefined, now: number): ShoppingItem[] {
  let next = [...items]
  for (const e of plan) {
    const ing = e.ingredient
    const origin: ItemOrigin = { key: e.originKey, label: e.label, qty: ing.qty, unit: ing.unit }
    if (e.action === 'duplicate') continue
    if ((e.action === 'merge' || e.action === 'present') && e.targetId) {
      next = next.map((t) => {
        if (t.id !== e.targetId) return t
        const u: ShoppingItem = { ...t, origins: [...(t.origins ?? []), origin], stamps: { ...t.stamps }, by }
        if (e.action === 'merge' && t.qty !== undefined && ing.qty !== undefined) {
          const add = convert(ing.qty, ing.unit, t.unit)
          if (add !== undefined) {
            u.qty = round2(t.qty + add)
            u.stamps.amount = Math.max(now, (t.stamps.amount ?? 0) + 1)
          }
        }
        return u
      })
      continue
    }
    next.push(newItem(listId, { name: ing.name, qty: ing.qty, qtyMax: ing.qtyMax, unit: ing.unit, note: ing.note, origins: [origin], fromRecipe: true }, by, now))
  }
  return next
}

export interface RemoveResult {
  items: ShoppingItem[]
  /** Von Hand geänderte Einträge – bleiben unverändert stehen */
  kept: ShoppingItem[]
  /** Angepasste oder entfernte Einträge */
  changed: number
}

/** Anteile einer Herkunft (z. B. eines gelöschten Gerichts) zurücknehmen. Gekauftes und Bearbeitetes bleibt. */
export function removeOrigins(items: ShoppingItem[], keyPrefix: string, by: string | undefined, now: number): RemoveResult {
  const kept: ShoppingItem[] = []
  let changed = 0
  const out = items.map((i) => {
    if (i.deleted || !i.origins?.some((o) => o.key.startsWith(keyPrefix))) return i
    if (i.done) return i
    if (i.edited) {
      kept.push(i)
      return i
    }
    const mine = i.origins.filter((o) => o.key.startsWith(keyPrefix))
    const rest = i.origins.filter((o) => !o.key.startsWith(keyPrefix))
    let qty = i.qty
    if (qty !== undefined) for (const o of mine) if (o.qty !== undefined) qty -= convert(o.qty, o.unit, i.unit) ?? 0
    const gone = qty !== undefined ? qty <= 0.001 : !rest.length && !!i.fromRecipe
    changed++
    if (gone) return editItem({ ...i, origins: rest.length ? rest : undefined }, { deleted: true }, by, now)
    return { ...i, qty: qty !== undefined ? round2(qty) : undefined, origins: rest.length ? rest : undefined, stamps: { ...i.stamps, amount: Math.max(now, (i.stamps.amount ?? 0) + 1) }, by }
  })
  return { items: out, kept, changed }
}

// ---------- Gemeinsamer Abgleich ----------

export interface MergeConflict {
  itemId: string
  name: string
  field: ShoppingField
  by?: string
}

const FIELD_KEYS: Record<ShoppingField, (keyof ShoppingItem)[]> = {
  name: ['name'],
  amount: ['qty', 'qtyMax', 'unit'],
  note: ['note'],
  category: ['category'],
  done: ['done'],
  deleted: ['deleted']
}
const val = (i: ShoppingItem, f: ShoppingField) => JSON.stringify(FIELD_KEYS[f].map((k) => i[k] ?? null))
const baseOf = (i: ShoppingItem) => i.syncedAt ?? (Date.parse(i.createdAt) || 0)

/**
 * Lokalen und gemeinsamen Stand feldweise zusammenführen:
 * je Feld gewinnt die jüngere Änderung; bei gleicher Zeit entscheidet eine feste Ordnung (beide Seiten erhalten dasselbe).
 * Haben beide seit dem letzten Abgleich dasselbe Feld unterschiedlich geändert und die andere Seite gewinnt, wird das gemeldet.
 */
export function mergeItems(local: ShoppingItem[], remote: ShoppingItem[]): { items: ShoppingItem[]; conflicts: MergeConflict[] } {
  const byId = new Map<string, ShoppingItem>()
  const conflicts: MergeConflict[] = []
  for (const r of remote) byId.set(r.id, r)
  const order: string[] = remote.map((r) => r.id)
  for (const l of local) {
    const r = byId.get(l.id)
    if (!r) {
      byId.set(l.id, l)
      order.push(l.id)
      continue
    }
    const out: ShoppingItem = { ...l, stamps: { ...l.stamps } }
    const base = Math.min(baseOf(l), baseOf(r))
    for (const f of ALL_FIELDS) {
      const lt = l.stamps[f] ?? 0
      const rt = r.stamps[f] ?? 0
      const lv = val(l, f)
      const rv = val(r, f)
      const remoteWins = rt > lt || (rt === lt && rv > lv)
      if (remoteWins) {
        for (const k of FIELD_KEYS[f]) (out as unknown as Record<string, unknown>)[k] = r[k]
        out.stamps[f] = rt
        if (lv !== rv && lt > base && rt > base) conflicts.push({ itemId: l.id, name: r.name, field: f, by: r.by })
      }
    }
    // Herkunftsangaben vereinen (haben keine Zeitstempel)
    const origins = new Map<string, ItemOrigin>()
    for (const o of [...(r.origins ?? []), ...(l.origins ?? [])]) origins.set(o.key, o)
    out.origins = origins.size ? [...origins.values()] : undefined
    out.edited = l.edited || r.edited || undefined
    out.fromRecipe = l.fromRecipe || r.fromRecipe || undefined
    out.by = (Math.max(...Object.values(r.stamps)) >= Math.max(...Object.values(l.stamps)) ? r.by : l.by) ?? l.by
    // Abgleich-Stand = was beide Seiten zuletzt gemeinsam hatten – lokale, noch nicht gesendete Änderungen bleiben „wartend“
    const synced = Math.max(l.syncedAt ?? 0, r.syncedAt ?? 0)
    out.syncedAt = synced || undefined
    byId.set(l.id, out)
  }
  return { items: order.map((id) => byId.get(id)!), conflicts }
}

/** Letzte Änderung eines Eintrags (ms) */
export const newestStamp = (i: ShoppingItem) => Math.max(0, ...Object.values(i.stamps).map((x) => x ?? 0))
/** Seit dem letzten gemeinsamen Abgleich lokal geändert */
export const pendingCount = (items: ShoppingItem[]) => items.filter((i) => i.syncedAt === undefined || newestStamp(i) > i.syncedAt).length
/** Stand ist jetzt in der gemeinsamen Datei */
export const markSynced = (items: ShoppingItem[]) => items.map((i) => ({ ...i, syncedAt: newestStamp(i) }))

const TOMB_MS = 30 * 86400_000
export const purgeTombstones = (items: ShoppingItem[], now: number) => items.filter((i) => !i.deleted || (i.stamps.deleted ?? 0) > now - TOMB_MS)

export const FIELD_LABEL: Record<ShoppingField, string> = { name: 'Name', amount: 'Menge', note: 'Notiz', category: 'Bereich', done: 'Erledigt', deleted: 'Löschen' }
