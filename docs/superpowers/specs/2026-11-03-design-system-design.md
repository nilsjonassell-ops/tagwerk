# Teilprojekt A – Design-System

Stand: 2026-11-03 · Teil des ganzheitlichen Redesigns (A Design-System → B Dashboard → C Konten → D Mail → Aufgabe/Termin → E Fenster/Andock-Leiste → F Begrüßung). Jedes Teilprojekt wird einzeln umgesetzt und in der Web-Vorschau abgenommen; veröffentlicht wird alles gesammelt im großen Update.

## 1. Ziel

Tagwerk soll wie ein hochwertiges, ruhiges Markenprodukt wirken: ein einheitliches System aus Werten (Tokens) und Bausteinen statt mehrerer sich überschreibender CSS-Schichten. Glas nur gezielt. Menüs und Auswahlfelder funktionieren zuverlässig – auch während Animationen – und vollständig per Tastatur. Bestehende Funktionen bleiben unverändert.

**Erfolgskriterien**
- Ein Satz Gestaltungswerte in `tokens.css`; `glass.css` und `liquid.css` existieren nicht mehr.
- Keine nativen `<select>` mehr in der App; alle Menüs laufen über einen gemeinsamen `Popover`.
- Hintergrundunschärfe nur noch auf schwebenden Ebenen (Menüs/Popover) und hinter Dialogen.
- Modus (System/Hell/Dunkel) und 7 Akzentfarben wählbar, alle Kombinationen bestehen WCAG AA (geprüft per Test).
- „Bewegung reduzieren“ (Windows oder Einstellung) schaltet alle Animationen ab.
- Bunter Rand am Fokus-Knopf entfernt; Fokus-Einstellungen als aufgeräumtes Popover.
- Einstellungen neu gegliedert, eigener Reiter „Darstellung“.
- Alle bestehenden Tests grün, neue Tests (Kontrast, Tastatur/Menü-E2E) grün, keine Konsolenfehler in der Web-Vorschau.

## 2. Ausgangslage

- 7.595 Zeilen CSS in 11 Dateien; `app.css` (2.922) ist die Basis, `glass.css` (880) und `liquid.css` (422) überschreiben große Teile davon. 37× `backdrop-filter`.
- Drei Schriften gebündelt (Instrument Sans, Instrument Serif, Inter Variable); `glass.css` überschreibt die UI-Schrift stillschweigend mit Inter.
- 32 native `<select>` (u. a. Aufgabenwahl im Fokus-Modus, Erscheinungsbild).
- Menüs (`TakeOverMenu`, `FollowUpMenu`, `SnoozeMenu`) hängen absolut positioniert im Elternelement → werden bei Animationen/Scroll/`overflow` abgeschnitten oder verrutschen.
- `Dialog` in `components/ui.tsx` mit Fokusfalle ist vorhanden und wird erweitert.
- Keine Akzentfarben-Einstellung; „Erscheinungsbild“ ist ein natives Select in „Allgemein“.

## 3. Gestaltungswerte (`styles/tokens.css`)

**Stufe 1 – Grundwerte**
- Neutrale Skala, leicht grün-grau (wie heute), je 12 Stufen für Hell und Dunkel (`--n-1 … --n-12`).
- 7 Akzentfamilien mit je drei Tönen (Basis, weich, Linie) pro Modus: `petrol` (Standard, entspricht dem heutigen #1c5f68 / #74b6bd), `indigo`, `blue`, `green`, `amber`, `rose`, `graphite`.
- Statusfarben `alert`, `attention`, `ok` wie heute.

**Stufe 2 – Bedeutungswerte**
- Heutige Namen bleiben gültig (`--bg`, `--canvas`, `--raised`, `--sunken`, `--ink`, `--ink-2`, `--ink-3`, `--line`, `--line-soft`, `--accent`, `--accent-ink`, `--accent-soft`, `--accent-line`, `--alert*`, `--attention*`, `--ok*`, `--focus-ring`, `--shadow-pop`, `--hatch`) und werden aus den Grundwerten abgeleitet.
- Neu: Ebenen `--surface-0` (Grund) · `--surface-1` (Fläche, deckend) · `--surface-2` (schwebend: Menüs, Popover; einzige Ebene mit Glas) · `--surface-3` (Overlay hinter Dialogen).
- Neu: Zustände `--hover`, `--pressed`, `--selected`, `--disabled-ink`; `--ring` (2 px Akzent, 2 px Abstand).

**Stufe 3 – Akzentwechsel**
- `<html data-theme="light|dark" data-accent="petrol|…">`; `data-accent` tauscht nur die Akzent-Bedeutungswerte. Umschalten ohne Neuladen.

**Skalen**
- Abstand: `--sp-1…--sp-8` = 4, 8, 12, 16, 20, 24, 32, 48 px.
- Schrift: bestehende `--fs-xs … --fs-3xl` bleiben; dazu feste Zeilenhöhen (`--lh-tight` 1.2, `--lh` 1.45) und Stärken (400/500/600).
- Radien: `--r-sm` 6, `--r-md` 10, `--r-lg` 14, `--r-pill` 999 px.
- Schatten: `--shadow-1` (leicht), `--shadow-2` (Popover), `--shadow-3` (Dialog). Flächen nutzen Linien, keine Schatten.
- Bewegung: `--dur-fast` 120 ms, `--dur` 200 ms, `--dur-slow` 320 ms, `--ease` `cubic-bezier(.2,.8,.2,1)`.

**Schrift**
- UI: Inter Variable (bereits gebündelt), `font-variant-numeric: tabular-nums` für Uhrzeiten, Zähler, Timer.
- Display: Instrument Serif nur für große Überschriften (Datum im Dashboard, Begrüßung).
- Instrument Sans wird entfernt (Import und Abhängigkeit).

**Glas-Regel**
- `backdrop-filter` nur auf `--surface-2` und dem Dialog-Overlay.
- Rückfall auf deckende Flächen bei `prefers-reduced-transparency: reduce`, `prefers-reduced-motion: reduce` oder `motion = reduced`.

**Reduzierte Bewegung**
- `html[data-motion="reduced"]` (gesetzt bei Einstellung „Reduziert“ oder bei `system` + `prefers-reduced-motion`) setzt alle Dauern auf 0 ms; Ein-/Ausblenden bleibt als sofortiger Deckkraftwechsel. Alle Animationen müssen die Dauer-Werte nutzen.

## 4. Bausteine (`renderer/src/components/ui/`)

Eine Datei pro Baustein; `components/ui.tsx` re-exportiert für bestehende Importe.

| Baustein | Aufgabe | Verhalten |
|---|---|---|
| `Popover` | Grundlage alles Schwebenden | Portal in `#layer-root` (oberste Ebene, außerhalb jeder Animation); Positionierung mit `@floating-ui/react` (`flip`, `shift`, `offset`, `autoUpdate`); schließt bei Esc, Klick außerhalb, Verschwinden des Auslösers; Fokus zurück zum Auslöser; Einblenden + 4 px Gleiten aus Richtung des Auslösers; Klicks während der Animation werden verarbeitet. |
| `Menu` | Aktionsmenüs | auf `Popover`; Rollen `menu`/`menuitem`; ↑↓, Pos1/Ende, Buchstaben-Sprung, Enter/Leertaste; Einträge mit Symbol, Untertitel, Tastaturhinweis, Häkchen; `danger`-Einträge rot, mit Trennlinie zuletzt. |
| `Select` | Ersatz aller nativen `<select>` | Rollen `combobox`/`listbox`/`option`; gleiche Tastatur wie `Menu`, dazu Tippen zum Springen; Gruppen; optionales Suchfeld (`searchable`, automatisch ab 8 Einträgen); kontrollierte API `value`/`onChange`/`options`; `aria-label` Pflicht. |
| `Dialog` | modale Dialoge | bestehender Baustein erweitert: Overlay `--surface-3` mit Unschärfe, Größen `sm`/`md`/`lg`, fester Kopf/Fuß, scrollender Inhalt; optional `dirty` → Rückfrage vor Schließen. |
| `Button` | Knöpfe | Varianten `primary`, `secondary`, `ghost`, `danger`; Größen `sm`/`md`/`lg`; `IconButton` mit Pflicht-`label`; Fokusring nur bei `:focus-visible`. Bestehende `.btn`-Klassen werden auf die neuen Werte umgestellt, damit nicht jede Stelle umgeschrieben werden muss. |
| `Segmented` | Umschalter (Tag/Woche, Dauer) | Rolle `radiogroup`, Pfeiltasten. |
| `Switch` | Ein/Aus | vorhanden, neu gestaltet. |
| `Card`, `Badge`, `Tooltip` | Flächen, Kennzeichen, Hinweise | Tooltip verzögert (500 ms), auch bei Tastaturfokus. |

**Fokus-Modus**
- `FocusLaunch`: ruhiger Akzent-Knopf mit Zielscheibe, kein Verlauf, kein farbiger Schatten. Laufende Sitzung → bestehende Fortschrittspille.
- Einstellungen im Fokus-Setup: Aufgabe (`Select` mit Suche), Dauer (`Segmented` 25/50/90/eigene), Start-Knopf; Enter startet.

**Bestehende Menüs** `TakeOverMenu`, `FollowUpMenu`, `SnoozeMenu` werden auf `Menu` umgestellt (Inhalt unverändert).

## 5. Einstellungen

Reiter-Reihenfolge: **Darstellung** (neu) · Allgemein · Übersicht · Kalender · Benachrichtigungen · **Konten** (bisher „Datenquellen“, Inhalt unverändert; Überarbeitung in Teilprojekt C) · **Mail-Vorschläge** (aus „Datenquellen“ herausgelöst) · Claude · Datenschutz.

- **Darstellung:** Modus als drei Vorschaukarten (Mini-Ansicht von Tagwerk), Akzentfarbe als 7 runde Felder (`radiogroup`, Pfeiltasten, Name als Tooltip und Beschriftung), Animationen `System`/`Reduziert` (Segmented), Seitenleisten-Einstellungen (aus „Übersicht“ verschoben).
- **Allgemein:** Name, Autostart, im Infobereich weiterlaufen, Schnellnotiz-Kürzel.
- Einheitliches Zeilenraster: links Beschriftung + Hinweis, rechts Bedienelement.
- Befehlspalette (Strg+K): Einträge „Design: System/Hell/Dunkel“ und „Akzent: <Farbe>“.

**Daten**
- `Settings.accent: AccentId` (Standard `'petrol'`), `Settings.motion: 'system' | 'reduced'` (Standard `'system'`).
- `AccentId = 'petrol' | 'indigo' | 'blue' | 'green' | 'amber' | 'rose' | 'graphite'`.
- Beide in `DEFAULT_SETTINGS`, `mergeSettings` (unbekannte Werte → Standard) und `SYNCED_SETTINGS` (wie `theme`).
- Anwendung im Renderer an derselben Stelle wie heute `data-theme` (auch im Pop-up-Fenster).
- Web-Brücke: keine neue Schnittstelle nötig.

## 6. Umstellung (jeder Schritt lauffähig, danach Push → Web-Vorschau)

1. **Werte:** `tokens.css` anlegen und zuerst importieren; alte Variablen zeigen auf neue Werte; Instrument Sans entfernen, Inter als UI-Schrift.
2. **Bausteine:** `Popover`, `Menu`, `Select`, `Dialog`-Erweiterung, `Button`, `Segmented`, `Tooltip`; die drei Menüs und alle 32 Selects umstellen.
3. **CSS aufteilen:** `app.css` in `base.css`, `layout.css` und je eine Datei pro Ansicht/Bereich; feste Farben/Abstände/Radien durch Werte ersetzen; Dunkel-Sonderregeln entfernen, wo die Werte es abdecken; ungenutzte Regeln löschen.
4. **Glas auflösen:** `glass.css`/`liquid.css` in die Ebenen überführen bzw. löschen; Fokus-Knopf und Fokus-Popover.
5. **Einstellungen:** Reiter „Darstellung“, Akzent/Motion-Einstellungen, Neugliederung, Befehlspalette.

## 7. Fehlerbehandlung und Grenzen

- Unbekannter `accent`/`motion`-Wert aus alter Datei oder Cloud → Standard.
- `Popover` ohne Platz → `flip`/`shift`; Auslöser entfernt → schließt.
- Kein `backdrop-filter`-Support oder Transparenz reduziert → deckende Fläche.
- Pop-up-Fenster (`popup.css`) nutzt dieselben Werte.
- Optische Abweichungen gegenüber heute sind beabsichtigt; funktionale nicht.

## 8. Tests

- `npm test`: neuer `tests/contrast.test.ts` – berechnet aus den Werten in `tokens.css` für alle 7 Akzente × Hell/Dunkel: Text auf Fläche ≥ 4,5:1, Text auf Akzent (`--accent-ink` auf `--accent`) ≥ 4,5:1, Akzent auf Fläche (Bedienelemente/Ring) ≥ 3:1, `--ink-3` auf Fläche ≥ 4,5:1. Bestehende 68 Tests bleiben grün.
- Playwright gegen `out/web` (`tests/e2e/ui.mjs`, `npm run test:e2e`): Menü während Seitenleisten-Animation öffnen → sichtbar und klickbar; Esc/Klick außerhalb schließt, Fokus zurück; Select komplett per Tastatur; Dialog hält Fokus; Akzentwechsel ändert `--accent` sofort; keine Konsolenfehler.
- Bildvergleich (`npm run test:visual`, nur lokal): Dashboard, Posteingang, Kalender, Einstellungen, Fokus × Hell/Dunkel/reduzierte Bewegung.
- `npm run typecheck` grün.

## 9. Dokumentation

`docs/CHATGPT.md` (Funktionsumfang: Darstellung/Akzent; Versionsverlauf „Noch nicht veröffentlicht“), README bei Bedarf.

## 10. Nicht Teil von A

Neue Funktionen; Inhalte von Dashboard (B), Konten (C), Mail-Dialog (D); Fenster-Start und Andock-Leiste (E); Begrüßung (F).
