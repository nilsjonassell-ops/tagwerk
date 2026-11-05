// Gespeicherte Reihenfolgen (Seitenleiste, Übersichtskarten) um neue Einträge aus Updates ergänzen,
// ohne die eigene Reihenfolge und Sichtbarkeit zu verlieren. Unbekannte Einträge fallen weg.
export function completeList<T extends { id: string }>(user: T[] | undefined, defaults: T[]): T[] {
  if (!Array.isArray(user)) return defaults.map((x) => ({ ...x }))
  const known = new Set(defaults.map((x) => x.id))
  const kept = user.filter((x) => x && known.has(x.id))
  for (const def of defaults) if (!kept.some((x) => x.id === def.id)) kept.push({ ...def })
  return kept
}
