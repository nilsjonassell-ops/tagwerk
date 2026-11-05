import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAmount, parseIngredient, scaleIngredient } from '../src/shared/ingredients.ts'
import { cleanWiki, parseWikibooksRecipe, wikibooksUrl } from '../src/shared/recipe-wiki.ts'

// Auszüge aus dem Wikibooks-Kochbuch (de.wikibooks.org), CC BY-SA 4.0 – nur als Testmaterial.
const TOMATENSAUCE = `__NOTOC__
{{:Kochbuch/ Navigationsleiste/ Ebenen}}
{| width="300px" align="right" border="1"
!align="center" colspan="2"|Überblick
|-----
||Rezeptmenge für:
||2-3 Personen
|-----
||Zeitbedarf:
||30 Minuten
|}

''' Tomatensauce '''

Die traditionelle italienische Nudelsauce

== Zutaten ==
* 2 kg frische Tomaten (oder die entsprechende Menge eingemachte Tomaten im Glas ohne Gewürze etc.)
* 1 kleine Zwiebel (kann auch weggelassen werden)
* 1-3 Knoblauchzehen
* Salz
* 1/4 - 1 getrocknete (winzige) Peperoncino oder Pfeffer
* 1 EL Tomatenmark

== Zubereitung ==
* Tomaten schälen, Kerne auslösen und zerteilen.
* Gehackte Zwiebel in ca. 2-3 EL Olivenöl andünsten.

== Tipps/Anmerkungen ==
* schmeckt herrlich zu jeder Art von Nudeln

[[Kategorie:Kochbuch/ Alle Rezepte|Tomatensauce]]`

const SPAGHETTI = `'''Spaghetti mit Tomatensoße'''

Weltweit bekannt als Spaghetti Napoli.
[[Bild: Spaghetti.jpg|thumb|Spaghetti]]

== Zutaten ==
* 500 g [[w: Spaghetti|Spaghetti]]
* 1 Dose (400&nbsp;g) Tomaten
* 100g Sellerie
* etwas Olivenöl
* geriebener [[w: Parmesan|Parmesankäse]]

== Zubereitung ==
* Schinkenwürfel in etwas Olivenöl anbraten
* Spaghetti [[w: al dente|''al dente'']] kochen
{{wikipedia|Spaghetti}}`

const APFEL = `{{:Kochbuch/_Vorlage/_RezeptBox
|Kategorie          =Eier- und Mehlspeisen
|Portionen          =2
|Zubereitungszeit   =15 Minuten
}}

=Apfelpfannkuchen - I=
==Zutaten==

* 250 g [[Kochbuch/ Getreidemehl|Mehl]]
* 3 [[Kochbuch/ Ei|Eier]]
* 1/2 l [[Kochbuch/ Milch|Milch]]

== Zubereitung==

* Schritt 1 – Der Teig
Die Äpfel werden geschält.
Mehl und Eier vermengen.
* Schritt 2 - Braten
Von beiden Seiten goldbraun braten.

=Apfelpfannkuchen - II=
==Zutaten==
* 75 g Weizen-Vollkornmehl

==Zubereitung==
* Anders.`

const BERLINER = `{{:Kochbuch/_Vorlage/_RezeptBox
|Portionen           = 15<!-- Anzahl Portionen oder Anzahl Personen -->
|Zubereitungszeit    = 50 min<!-- Arbeitszeit -->
}}

== Zutaten ==
* 500 g Mehl
* Packung Frischhefe (42g)
* Prise Salz

== Zubereitung ==
Das Mehl mit der Hälfte der Milch vermengen (nicht wärmer als 35&nbsp;°C).<ref>Fußnote</ref>

Den Teig zu einer Kugel formen und eine Stunde gehen lassen.`

test('Zutat: Menge, Einheit, Name und Zusatz', () => {
  const a = parseIngredient('2 kg frische Tomaten (oder eingemachte Tomaten)')
  assert.deepEqual([a.qty, a.unit, a.name, a.note], [2, 'kg', 'frische Tomaten', 'oder eingemachte Tomaten'])
  const b = parseIngredient('100g Sellerie')
  assert.deepEqual([b.qty, b.unit, b.name], [100, 'g', 'Sellerie'])
  const c = parseIngredient('1 EL Tomatenmark')
  assert.deepEqual([c.qty, c.unit, c.name], [1, 'EL', 'Tomatenmark'])
  const d = parseIngredient('0,5 Liter Milch')
  assert.deepEqual([d.qty, d.unit, d.name], [0.5, 'l', 'Milch'])
  const e = parseIngredient('2 Esslöffel Zucker')
  assert.equal(e.unit, 'EL')
})

test('Zutat: Spannen, Brüche und Unicode-Brüche', () => {
  const a = parseIngredient('1-3 Knoblauchzehen')
  assert.deepEqual([a.qty, a.qtyMax, a.unit, a.name], [1, 3, undefined, 'Knoblauchzehen'])
  const b = parseIngredient('1/4 - 1 getrocknete Peperoncino')
  assert.deepEqual([b.qty, b.qtyMax], [0.25, 1])
  const c = parseIngredient('½ TL Salz')
  assert.deepEqual([c.qty, c.unit], [0.5, 'TL'])
  const d = parseIngredient('1 3/4 TL Backpulver')
  assert.equal(d.qty, 1.75)
  const e = parseIngredient('250 – 500 ml Milch')
  assert.deepEqual([e.qty, e.qtyMax, e.unit], [250, 500, 'ml'])
})

test('Zutat: ohne Menge bleibt ohne Menge (nichts erfinden)', () => {
  for (const raw of ['Salz', 'etwas Olivenöl', 'Prise Salz', 'Salz, Pfeffer und etwas Zucker']) {
    const i = parseIngredient(raw)
    assert.equal(i.qty, undefined, raw)
  }
  assert.equal(parseIngredient('etwas Olivenöl').name, 'Olivenöl')
  assert.equal(parseIngredient('etwas Olivenöl').note, 'etwas')
  const p = parseIngredient('Prise Salz')
  assert.deepEqual([p.unit, p.name], ['Prise', 'Salz'])
})

test('Zutat: Packungsgröße in Klammern wird Zusatz, nicht Menge', () => {
  const a = parseIngredient('1 Dose (400 g) Tomaten')
  assert.deepEqual([a.qty, a.unit, a.name, a.note], [1, 'Dose', 'Tomaten', '400 g'])
})

test('Mengen gut lesbar: Brüche bei Löffeln/Stück, Dezimalkomma bei Gewicht', () => {
  assert.equal(formatAmount(0.5, undefined, 'TL'), '½ TL')
  assert.equal(formatAmount(1.5, undefined, 'kg'), '1,5 kg')
  assert.equal(formatAmount(1, 3), '1–3')
  assert.equal(formatAmount(0.25), '¼')
  assert.equal(formatAmount(undefined, undefined, 'Prise'), 'Prise')
  assert.equal(formatAmount(1250, undefined, 'g'), '1250 g')
})

test('Portionen umrechnen: sinnvoll runden, Mengenlose bleiben gleich', () => {
  const half = scaleIngredient(parseIngredient('500 g Spaghetti'), 0.5)
  assert.equal(half.qty, 250)
  const third = scaleIngredient(parseIngredient('100 g Butter'), 1 / 3)
  assert.equal(third.qty, 35, 'Gramm auf 5 g gerundet')
  const eggs = scaleIngredient(parseIngredient('3 Eier'), 0.5)
  assert.equal(eggs.qty, 1.5)
  const range = scaleIngredient(parseIngredient('1-3 Knoblauchzehen'), 2)
  assert.deepEqual([range.qty, range.qtyMax], [2, 6])
  const salt = scaleIngredient(parseIngredient('Salz'), 3)
  assert.equal(salt.qty, undefined)
})

test('Wiki-Auszeichnung entfernen', () => {
  assert.equal(cleanWiki("500 g [[w: Spaghetti|Spaghetti]]"), '500 g Spaghetti')
  assert.equal(cleanWiki("[[Kochbuch/ Ei|Eier]] und [[Milch]]"), 'Eier und Milch')
  assert.equal(cleanWiki("''al dente'' '''fett'''"), 'al dente fett')
  assert.equal(cleanWiki('35&nbsp;°C<ref>x</ref> {{wikipedia|X}}'), '35 °C')
  assert.equal(cleanWiki('a <!-- Kommentar --> b'), 'a b')
})

test('Rezept (alte Tabelle): Portionen, Zeit, Zutaten, Schritte, Quelle', () => {
  const r = parseWikibooksRecipe('Kochbuch/ Tomatensauce', TOMATENSAUCE, 591430)
  assert.equal(r.title, 'Tomatensauce')
  assert.equal(r.servings, 2)
  assert.equal(r.servingsText, '2-3 Personen')
  assert.equal(r.time, '30 Minuten')
  assert.equal(r.ingredients.length, 6)
  assert.equal(r.ingredients[0].name, 'frische Tomaten')
  assert.equal(r.steps.length, 2)
  assert.equal(r.source.kind, 'wikibooks')
  assert.equal(r.source.url, 'https://de.wikibooks.org/wiki/Kochbuch/_Tomatensauce')
  assert.match(r.source.authorsUrl ?? '', /action=history/)
  assert.equal(r.source.license?.name, 'CC BY-SA 4.0')
  assert.equal(r.source.revision, 591430)
  assert.ok(r.ingredients.every((i) => i.id), 'jede Zutat hat eine ID')
})

test('Rezept ohne Infokasten: Portionen unbekannt, Wiki-Links bereinigt', () => {
  const r = parseWikibooksRecipe('Kochbuch/ Spaghetti mit Tomatensoße', SPAGHETTI, 1)
  assert.equal(r.servings, undefined)
  assert.equal(r.ingredients[0].name, 'Spaghetti')
  assert.equal(r.ingredients[4].name, 'geriebener Parmesankäse')
  assert.equal(r.steps[1], 'Spaghetti al dente kochen')
  assert.ok(!r.steps.some((s) => s.includes('{{')))
})

test('RezeptBox-Vorlage und mehrere Varianten: erste Variante, Hinweis aufs Original', () => {
  const r = parseWikibooksRecipe('Kochbuch/ Apfelpfannkuchen', APFEL, 1)
  assert.equal(r.servings, 2)
  assert.equal(r.time, '15 Minuten')
  assert.deepEqual(
    r.ingredients.map((i) => i.name),
    ['Mehl', 'Eier', 'Milch']
  )
  assert.equal(r.steps.length, 2, 'Fortsetzungszeilen gehören zum Schritt')
  assert.match(r.steps[0], /Der Teig.*geschält.*vermengen/s)
  assert.match(r.variantNote ?? '', /Varianten/)
})

test('Zubereitung als Absätze, Kommentare in der Vorlage', () => {
  const r = parseWikibooksRecipe('Kochbuch/ Berliner Pfannkuchen', BERLINER, 1)
  assert.equal(r.servings, 15)
  assert.equal(r.time, '50 min')
  assert.equal(r.steps.length, 2)
  assert.equal(r.steps[0], 'Das Mehl mit der Hälfte der Milch vermengen (nicht wärmer als 35 °C).')
  assert.equal(r.ingredients[1].unit, 'Packung')
})

test('Seitenadresse mit Unterstrichen und Sonderzeichen', () => {
  assert.equal(wikibooksUrl('Kochbuch/ Spaghetti mit Tomatensoße'), 'https://de.wikibooks.org/wiki/Kochbuch/_Spaghetti_mit_Tomatenso%C3%9Fe')
})

// ---------- Echte Sonderfälle aus dem Kochbuch (Stichprobe von 25 Seiten) ----------
import { splitIngredientLine } from '../src/shared/recipe-wiki.ts'

test('Tausenderpunkt: „1.500“ ist 1500, „1,5“ ist 1,5', () => {
  assert.equal(parseIngredient('1.500 g saure Äpfel').qty, 1500)
  assert.equal(parseIngredient('1,5 kg Mehl').qty, 1.5)
  assert.equal(parseIngredient('1.5 l Wasser').qty, 1.5)
})

test('Zahlwörter und Mengen-Adjektive vor der Einheit', () => {
  const a = parseIngredient('eine rote Zwiebel')
  assert.deepEqual([a.qty, a.name], [1, 'rote Zwiebel'])
  const b = parseIngredient('2 gehäufte EL Kurkuma')
  assert.deepEqual([b.qty, b.unit, b.name, b.note], [2, 'EL', 'Kurkuma', 'gehäufte'])
  const c = parseIngredient('1 gestrichener Teelöffel Salz')
  assert.deepEqual([c.qty, c.unit, c.name], [1, 'TL', 'Salz'])
  const d = parseIngredient('4 EßLöffel Honig')
  assert.equal(d.unit, 'EL')
})

test('Komma nach Menge: Rest wird Zusatz', () => {
  const a = parseIngredient('2 Fischfilets, zum Beispiel Dorade oder Seezunge')
  assert.deepEqual([a.qty, a.name, a.note], [2, 'Fischfilets', 'zum Beispiel Dorade oder Seezunge'])
  const b = parseIngredient('1 Stück frischer Ingwer, etwa 3 cm')
  assert.deepEqual([b.unit, b.name, b.note], ['Stück', 'frischer Ingwer', 'etwa 3 cm'])
})

test('Sammelzeilen ohne Menge werden getrennte Zutaten', () => {
  assert.deepEqual(splitIngredientLine('Salz, Pfeffer und etwas Zucker'), ['Salz', 'Pfeffer', 'etwas Zucker'])
  assert.deepEqual(splitIngredientLine('Salz & Pfeffer nach Belieben'), ['Salz', 'Pfeffer nach Belieben'])
  assert.deepEqual(splitIngredientLine('Salz, Pfeffer, Olivenöl, 1 Zitrone, Thymianzweige'), ['Salz', 'Pfeffer', 'Olivenöl', '1 Zitrone', 'Thymianzweige'])
  // Mit Menge am Anfang oder „oder“: nicht zerlegen
  assert.deepEqual(splitIngredientLine('2 Fischfilets, zum Beispiel Dorade'), ['2 Fischfilets, zum Beispiel Dorade'])
  assert.deepEqual(splitIngredientLine('Zucker oder 1 kleinere, geriebene Karotte'), ['Zucker oder 1 kleinere, geriebene Karotte'])
})

test('„Zutaten für 2 Personen“ als Überschrift liefert Portionen', () => {
  const r = parseWikibooksRecipe('Kochbuch/ Ofenfisch', `'''Ofenfisch'''\n\n== Zutaten für 2 Personen ==\n* 2 Fischfilets\n* 50 ml Weißwein\n\n== Zubereitung ==\n* Fisch würzen\n* Garen`, 1)
  assert.equal(r.servings, 2)
  assert.equal(r.ingredients.length, 2)
})

test('Zahlwort in der Portionsangabe („für vier Personen:“ im Zutatenteil)', () => {
  const r = parseWikibooksRecipe('Kochbuch/ Blaue Zipfel', `==Zutaten==\n\nfür vier Personen:\n\n*4–8 Zwiebeln\n*1/2 l Wasser\n\n==Zubereitung==\n*Zwiebeln schneiden`, 1)
  assert.equal(r.servings, 4)
  assert.deepEqual([r.ingredients[0].qty, r.ingredients[0].qtyMax], [4, 8])
})

test('Zusätzliche Zutatenliste vor der Zubereitung (Salatsoße) und kursive Gruppen', () => {
  const r = parseWikibooksRecipe('Kochbuch/ Schichtsalat', `== Zutaten ==\n* 1 Dose Ananas\n* 5 Eier\n\n== Salatsoße ==\n* 500 g Salat-Mayonnaise\n* ½ Becher Schlagsahne\n\n== Zubereitung ==\n* Schichten`, 1)
  assert.equal(r.ingredients.length, 4)
  assert.equal(r.ingredients[2].group, 'Salatsoße')
  const k = parseWikibooksRecipe('Kochbuch/ Frankfurter Apfelkuchen', `== Zutaten für einen Kuchen ==\n\n''Für den Teig''\n* 300 g Mehl\n* Prise Salz\n\n''Für den Belag''\n* 1.500 g saure Äpfel\n\n== Zubereitung ==\n* Backen`, 1)
  assert.deepEqual(k.ingredients.map((i) => i.group), ['Für den Teig', 'Für den Teig', 'Für den Belag'])
  assert.equal(k.ingredients[2].qty, 1500)
})

test('Kräutermischung + „Weitere Zutaten“ (Grüne Sauce), Geräte-Listen ausgenommen', () => {
  const r = parseWikibooksRecipe(
    'Kochbuch/ Grüne Sauce',
    `Text.\n\n== Kräutermischung ==\n==== Zu gleichen Teilen ====\n* 2 Bund Borretsch\n* 2 Bund Kerbel\n\n== Weitere Zutaten ==\n* 2 Becher Sauerrahm zu 200 g\n* Salz\n\n== Benötigte Geräte ==\n* Mixer\n\n== Zubereitung ==\nKräuter waschen.`,
    1
  )
  assert.deepEqual(r.ingredients.map((i) => i.name), ['Borretsch', 'Kerbel', 'Sauerrahm zu 200 g', 'Salz'])
  assert.equal(r.steps.length, 1)
})

test('„Zutaten:“ und „Zubereitung:“ als einfacher Text statt Überschrift', () => {
  const r = parseWikibooksRecipe('Kochbuch/ Mit Spinat gefüllte Hähnchenbrust', `'''Mit Spinat gefüllte Hähnchenbrust'''\n\nZutaten:\n* 4 Hähnchenbrustfilets mit Haut\n* 300g frischer Spinat\n\n\nZubereitung:\nDen Backofengrill vorheizen.\n\nDie Filets salzen.`, 1)
  assert.equal(r.ingredients.length, 2)
  assert.equal(r.ingredients[1].qty, 300)
  assert.equal(r.steps.length, 2)
})

test('Unterabschnitte in der Zubereitung werden zum Schritt-Titel', () => {
  const r = parseWikibooksRecipe('Kochbuch/ Hühnerbrust', `== Zutaten ==\n* 1 Kopf Wirsing\n\n== Zubereitung ==\n=== Wirsing ===\n* Strunk entfernen.\n* Schmoren.\n=== Kartoffelpüree ===\n* Kartoffeln garen.`, 1)
  assert.deepEqual(r.steps, ['Wirsing: Strunk entfernen.', 'Schmoren.', 'Kartoffelpüree: Kartoffeln garen.'])
})

test('Gewürze als Unterpunkte werden einzelne Zutaten', () => {
  const r = parseWikibooksRecipe('Kochbuch/ Dinkelstollen', `== Zutaten ==\n*350 ml Wasser\n*<sup>1</sup>/<sub>2</sub> Packung (125 Gramm) Butter\n* gemahlene Gewürze\n**Zimt\n**Vanille\n\n== Zubereitung ==\n* Mischen`, 1)
  assert.deepEqual(r.ingredients.map((i) => i.name), ['Wasser', 'Butter', 'gemahlene Gewürze', 'Zimt', 'Vanille'])
  assert.deepEqual([r.ingredients[1].qty, r.ingredients[1].unit, r.ingredients[1].note], [0.5, 'Packung', '125 Gramm'])
})

// ---------- Nachbesserungen aus der Stichprobe von 80 Seiten ----------
import { searchWikibooks } from '../src/shared/recipe-wiki.ts'

test('Schmale Leerzeichen (&thinsp;) und „eine halbe Zwiebel“', () => {
  assert.equal(cleanWiki('600&thinsp;g Dinkelmehl'), '600 g Dinkelmehl')
  const a = parseIngredient('eine halbe Zwiebel')
  assert.deepEqual([a.qty, a.name], [0.5, 'Zwiebel'])
  const b = parseIngredient('1 halbe Zwiebel')
  assert.deepEqual([b.qty, b.name], [0.5, 'Zwiebel'])
})

test('Erklärung nach Doppelpunkt wird Zusatz', () => {
  const a = parseIngredient('Sbrinz Käse: Der Sbrinz kommt aus der Innerschweiz')
  assert.deepEqual([a.name, a.note], ['Sbrinz Käse', 'Der Sbrinz kommt aus der Innerschweiz'])
})

test('Suche: Nicht-Rezepte raus, bei wenigen Treffern breiter suchen (ODER, ohne Füllwörter)', async () => {
  const calls: string[] = []
  const fetchJson = async (url: string) => {
    const q = new URL(url).searchParams.get('srsearch') ?? ''
    calls.push(q)
    if (/ OR /.test(q)) return { query: { search: [{ title: 'Kochbuch/ Pasta' }, { title: 'Kochbuch/ Tomatensauce' }, { title: 'Kochbuch/ Spaghetti mit Tomatensoße' }] } }
    return { query: { search: [{ title: 'Kochbuch/ Tomatensauce' }, { title: 'Kochbuch/ Druckversion' }, { title: 'Kochbuch/ Adventskalender 2007: Türchen 7' }] } }
  }
  const r = await searchWikibooks(fetchJson, 'Nudeln mit Tomatensauce')
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.value.map((h) => h.title), ['Tomatensauce', 'Pasta', 'Spaghetti mit Tomatensoße'])
  assert.equal(calls.length, 2)
  assert.match(calls[1], /^Nudeln OR Tomatensauce incategory:/)
})

test('Zweckangabe vor dem Doppelpunkt („Zum Backen: Speiseöl“)', () => {
  const a = parseIngredient('Zum Backen: Speiseöl')
  assert.deepEqual([a.name, a.note], ['Speiseöl', 'Zum Backen'])
})

test('Suchvorschau ohne Kochbuch-Navigationsleiste', async () => {
  const fetchJson = async () => ({ query: { search: Array.from({ length: 6 }, (_, i) => ({ title: `Kochbuch/ R${i}`, snippet: i ? 'Kochkurs Kochtechniken Zutaten Rezepte Kochzubehör Maßangaben Gebratene Nudeln sind' : 'Startseite Kochkurs Kochtechniken Zutaten Rezepte Kochzubehör Maßangaben <span class="searchmatch">Tomatensauce</span> Die traditionelle' })) } })
  const r = await searchWikibooks(fetchJson, 'x')
  assert.equal(r.ok && r.value[0].snippet, 'Tomatensauce Die traditionelle')
  assert.equal(r.ok && r.value[1].snippet, 'Gebratene Nudeln sind')
})
