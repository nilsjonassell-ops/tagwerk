// Reine Tastatur-Logik für Menüs und Auswahllisten (ohne React, testbar).

export interface NavItem {
  label: string
  disabled?: boolean
}

export function findOption<T extends { value: string }>(options: T[], value: string | undefined | null): T | undefined {
  return options.find((o) => o.value === value)
}

/** Nächster wählbarer Eintrag für ↑ ↓ Pos1 Ende; läuft am Ende rundherum. -1, wenn nichts wählbar ist. */
export function moveIndex(items: NavItem[], current: number, key: string): number {
  const ok = (i: number) => !items[i]?.disabled
  const n = items.length
  if (!items.some((_, i) => ok(i))) return -1
  if (key === 'Home') return items.findIndex((_, i) => ok(i))
  if (key === 'End') {
    for (let i = n - 1; i >= 0; i--) if (ok(i)) return i
  }
  const step = key === 'ArrowUp' ? -1 : 1
  let i = current < 0 ? (step > 0 ? -1 : n) : current
  for (let k = 0; k < n; k++) {
    i = (i + step + n) % n
    if (ok(i)) return i
  }
  return current
}

/** Springt zum Eintrag, der mit `query` beginnt. Ein einzelner Buchstabe sucht ab dem nächsten Eintrag. */
export function typeahead(items: NavItem[], current: number, query: string): number {
  const q = query.toLocaleLowerCase('de-DE')
  const n = items.length
  const start = q.length === 1 ? current + 1 : Math.max(current, 0)
  for (let k = 0; k < n; k++) {
    const i = (start + k + n) % n
    const it = items[i]
    if (!it.disabled && it.label.toLocaleLowerCase('de-DE').startsWith(q)) return i
  }
  return -1
}
