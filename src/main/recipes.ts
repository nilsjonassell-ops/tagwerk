// Rezeptsuche über das Wikibooks-Kochbuch (MediaWiki-API, ohne Schlüssel, ohne Kosten).
// Kennt sich gegenüber Wikimedia mit einem eindeutigen User-Agent aus (deren Richtlinie). Kurzer Zwischenspeicher schont das Abruflimit.
import { net } from 'electron'
import { getWikibooksRecipe, searchWikibooks, WIKI_AGENT } from '@shared/recipe-wiki'
import type { Recipe, RecipeHit, RecipeResult } from '@shared/types'

const fetchJson = async (url: string) => {
  const res = await net.fetch(url, { headers: { 'user-agent': WIKI_AGENT, 'api-user-agent': WIKI_AGENT, accept: 'application/json' } })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

const cache = new Map<string, { at: number; v: unknown }>()
async function cached<T>(key: string, fn: () => Promise<RecipeResult<T>>): Promise<RecipeResult<T>> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.v as RecipeResult<T>
  const r = await fn()
  if (r.ok) {
    cache.set(key, { at: Date.now(), v: r })
    if (cache.size > 200) cache.delete(cache.keys().next().value as string)
  }
  return r
}

export function searchRecipes(q: string): Promise<RecipeResult<RecipeHit[]>> {
  if (!net.isOnline()) return Promise.resolve({ ok: false, error: 'Offline – die Rezeptsuche braucht eine Internetverbindung. Gespeicherte Rezepte sind weiter verfügbar.', offline: true })
  return cached(`s:${q.trim().toLowerCase()}`, () => searchWikibooks(fetchJson, String(q ?? '').slice(0, 120)))
}

export function getRecipe(page: string): Promise<RecipeResult<Recipe>> {
  if (!net.isOnline()) return Promise.resolve({ ok: false, error: 'Offline – dieses Rezept ist noch nicht gespeichert.', offline: true })
  const p = String(page ?? '')
  if (!p.startsWith('Kochbuch/')) return Promise.resolve({ ok: false, error: 'Nur Rezepte aus dem Wikibooks-Kochbuch.' })
  return cached(`r:${p}`, () => getWikibooksRecipe(fetchJson, p))
}
