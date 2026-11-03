# Design-System (Teilprojekt A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein einheitliches Design-System (Tokens + Bausteine) ersetzt die überlagerten Glas-Schichten; Menüs/Selects werden zuverlässig und tastaturbedienbar; Modus + 7 Akzentfarben wählbar.

**Architecture:** `tokens.css` ist die einzige Quelle für Werte; `data-theme`/`data-accent`/`data-motion` auf `<html>` schalten um. Schwebende UI läuft über einen `Popover`-Baustein (Portal + `@floating-ui/react`), auf dem `Menu` und `Select` aufbauen. CSS wird nach Bereichen aufgeteilt; `glass.css`/`liquid.css` werden aufgelöst.

**Tech Stack:** React 19, TypeScript, CSS-Variablen, `@floating-ui/react`, Node-Testrunner (`--experimental-strip-types`), Playwright gegen `out/web`.

**Spec:** `docs/superpowers/specs/2026-11-03-design-system-design.md`

## Global Constraints

- Kommunikation/Texte in der App: Deutsch.
- Keine Funktionsänderung außer den in der Spec genannten; alle 68 bestehenden Tests bleiben grün, `npm run typecheck` grün.
- `AccentId = 'petrol' | 'indigo' | 'blue' | 'green' | 'amber' | 'rose' | 'graphite'`, Standard `'indigo'`; `motion: 'system' | 'reduced'`, Standard `'system'`.
- Kontrast: Text ≥ 4,5:1, `--accent-ink` auf `--accent` ≥ 4,5:1, Akzent auf Fläche ≥ 3:1, `--ink-3` auf Fläche ≥ 4,5:1.
- `backdrop-filter` nur auf `--surface-2` (Menüs/Popover) und Dialog-Overlay.
- Dauern: 120/200/320 ms, `--ease: cubic-bezier(.2,.8,.2,1)`; bei `data-motion="reduced"` 0 ms.
- Keine E-Mail-Adresse von Nils in Dateien; kein Release.
- Nach jedem Task: `npm test`, `npm run typecheck`, `npm run build:web`; nach Tasks 3, 5, 7, 9 Push auf main (Web-Vorschau).

## Review Focus

- Menü/Select am Fensterrand (rechts unten) → klappt um und bleibt vollständig sichtbar (E2E in Task 4).
- Menü öffnen während die Seitenleiste ein-/ausklappt → bleibt am Auslöser, klickbar (E2E in Task 4).
- Alte Einstellungsdatei / Cloud-Wert mit unbekanntem `accent` (z. B. `'purple'`) → fällt auf `'indigo'` (Unit in Task 1).
- Pop-up-Fenster und Schnellnotiz übernehmen Akzent und Modus (Task 1: gemeinsame `applyAppearance`).
- Select mit leerem/ungültigem `value` (z. B. gelöschte Aufgabe im Fokus) → zeigt Platzhalter, kein Absturz (E2E in Task 4).

---

### Task 1: Einstellungen `accent`/`motion` + gemeinsame Anwendung

**Files:**
- Modify: `src/shared/types.ts` (Settings, DEFAULT_SETTINGS, neuer Typ `AccentId`, Konstante `ACCENTS`)
- Modify: `src/main/store.ts` (mergeSettings), `src/shared/cloud.ts` (SYNCED_SETTINGS)
- Create: `src/renderer/src/lib/appearance.ts`
- Modify: `src/renderer/src/App.tsx`, `Popup.tsx`, `QuickNote.tsx`, `src/web/bridge.ts`
- Test: `tests/appearance.test.ts`

**Interfaces:**
- Produces: `type AccentId`; `ACCENTS: { id: AccentId; label: string }[]` (Indigo, Petrol, Blau, Grün, Bernstein, Rose, Graphit); `normalizeAppearance(s: Partial<Settings>): { theme, accent, motion }` in `src/shared/appearance.ts`; `applyAppearance(s: Pick<Settings,'theme'|'accent'|'motion'>): () => void` (setzt `data-theme`, `data-accent`, `data-motion`, hört auf `prefers-color-scheme`/`prefers-reduced-motion`, gibt Abmelde-Funktion zurück).

- [ ] Test: `normalizeAppearance({accent:'purple', motion:'x'})` → `{accent:'indigo', motion:'system'}`; gültige Werte bleiben; `SYNCED_SETTINGS` enthält `accent` und `motion`.
- [ ] Test läuft rot.
- [ ] Implementieren (`mergeSettings` nutzt `normalizeAppearance`); alle vier Stellen, die heute `dataset.theme` setzen, rufen `applyAppearance`.
- [ ] `npm test`, `npm run typecheck` grün; Commit.

### Task 2: `tokens.css` + Kontrasttest

**Files:**
- Create: `src/renderer/src/styles/tokens.css`
- Create: `src/shared/palette.ts` (Akzent- und Neutralwerte als Daten; `tokens.css` wird daraus per Skript erzeugt)
- Create: `scripts/gen-tokens.mjs`, npm-Script `tokens`
- Test: `tests/contrast.test.ts`

**Interfaces:**
- Produces: CSS-Variablen laut Spec §3 (alte Namen + `--surface-0..3`, `--hover`, `--pressed`, `--selected`, `--disabled-ink`, `--ring`, `--sp-1..8`, `--r-sm/md/lg/pill`, `--shadow-1..3`, `--dur-fast/--dur/--dur-slow`, `--ease`, `--wash-1/2`, `--font-ui`, `--font-display`); `PALETTE` in `palette.ts` mit `neutral.light/dark` und `accents[AccentId].light/dark = { base, ink, soft, line }`.

- [ ] Test `contrast.test.ts`: für jedes `AccentId` × light/dark die vier Kontrastregeln aus den Global Constraints gegen `PALETTE` (WCAG-Luminanzformel im Test); zusätzlich: `tokens.css` enthält für jedes Akzent-ID einen Block `[data-accent='<id>']` (Generator aktuell).
- [ ] Rot; Palette + Generator schreiben, Werte so wählen, dass alle Regeln bestehen.
- [ ] `tokens.css` in `main.tsx` als erste Datei importieren; Commit.

### Task 3: Hintergrund, Rahmen, Schrift – Glas auflösen

**Files:**
- Delete: `styles/glass.css`, `styles/liquid.css`
- Create: `styles/shell.css` (Hintergrund-Wash, schwebende Seitenleiste/Hauptfläche, Kartenflächen, Glas-Regel für `--surface-2`/Overlay, Fallbacks)
- Move: Funktionsstile aus `glass.css` (freie Zeit, Ziehen im Kalender, Einplanen, Update-Hinweis) nach `calendar.css`/`shell.css`
- Modify: `app.css` Kopf (Instrument Sans raus), `motion.css` (Dauern über Tokens, Reduced-Block auf `[data-motion='reduced']`), `package.json` (`@fontsource/instrument-sans` entfernen)

- [ ] Vorher/Nachher-Screenshots (Dashboard, Inbox, Kalender, Einstellungen, Fokus × hell/dunkel) – keine fehlenden Elemente, keine unlesbaren Texte.
- [ ] `grep -c backdrop-filter styles/*.css` ≤ 6.
- [ ] Tests/Typecheck/Build; Commit; Push.

### Task 4: Popover, Menu, Select, Tooltip, Segmented

**Files:**
- Create: `components/ui/Popover.tsx`, `Menu.tsx`, `Select.tsx`, `Tooltip.tsx`, `Segmented.tsx`, `styles/ui.css`
- Modify: `components/ui.tsx` (re-export), `index.html`/`web/index.html` (`<div id="layer-root">`)
- Modify: `views/Inbox.tsx` (TakeOverMenu, FollowUpMenu), `components/Suggestions.tsx` (SnoozeMenu), alle 32 `<select>` in Editors, Focus, OneNote, PlanDialog, SettingsDialog, Suggestions, Notes, Projects
- Test: `tests/e2e/ui.mjs` (Playwright gegen `out/web`), npm-Script `test:e2e`

**Interfaces:**
- Produces:
  - `<Popover open anchor onClose placement? children />` (`anchor: HTMLElement | null`, `placement` Standard `'bottom-start'`)
  - `<Menu trigger={(props) => ReactNode} items={MenuItem[]} />`, `MenuItem = { id, label, icon?, hint?, sub?, checked?, danger?, disabled?, onSelect } | 'sep'`
  - `<Select value onChange options placeholder? searchable? aria-label size? />`, `options: { value: string; label: string; group?: string; hint?: string }[]`
  - `<Tooltip label>{child}</Tooltip>`, `<Segmented value onChange options aria-label />`

- [ ] E2E: Menü „Übernehmen“ öffnen → Popover im `#layer-root`, vollständig im Viewport; Esc schließt, Fokus zurück auf Auslöser; Auslöser rechts unten (Fenster 800×600) → Menü klappt nach oben; Menü öffnen während Strg+B die Seitenleiste animiert → Eintrag klickbar.
- [ ] E2E: Select per Tastatur (Fokus, Enter, ↓↓, Enter) ändert Wert; Select mit unbekanntem Wert zeigt Platzhalter.
- [ ] E2E: `document.querySelectorAll('select').length === 0` in Dashboard, Inbox, Aufgaben, Notizen, Projekte, Einstellungen (alle Reiter), Fokus, Aufgaben- und Termin-Dialog.
- [ ] Rot; implementieren; grün; Commit.

### Task 5: Dialog + Button

**Files:** Modify `components/ui.tsx` (Dialog: `size?: 'sm'|'md'|'lg'`, `dirty?: boolean`), `styles/ui.css`, `app.css` (`.btn`-Familie auf Tokens; Varianten `primary|secondary|ghost|danger`, Größen `small|''|large`)

- [ ] E2E: Dialog öffnen → Tab bleibt im Dialog; Esc schließt, Fokus zurück; Overlay hat `backdrop-filter`.
- [ ] Commit; Push.

### Task 6: Fokus-Knopf + Fokus-Setup

**Files:** Modify `components/Focus.tsx` (Setup: Aufgabe = `Select searchable`, Dauer = `Segmented` 25/50/90/Eigene), `styles/focus.css` (`.focus-launch` ohne Verlauf/Farbschatten)

- [ ] E2E: Fokus öffnen, Aufgabe per Suche wählen, Dauer 50, Enter startet → Pille zeigt 50:00/49:5x.
- [ ] `grep -n "gradient" styles/focus.css` enthält keine `.focus-launch`-Regel; Commit.

### Task 7: Einstellungen neu gegliedert + Darstellung + Befehlspalette

**Files:** Modify `components/SettingsDialog.tsx` (Reiter-Liste laut Spec §5, neuer `AppearanceSettings`, `MailInsightsSettings` als eigener Reiter `suggestions`, Seitenleiste nach Darstellung), Create `components/AppearancePicker.tsx`, Modify `components/CommandPalette.tsx`, `tests/e2e/ui.mjs`

**Interfaces:** Consumes `ACCENTS`, `applyAppearance` (Task 1).

- [ ] E2E: Reiter-Reihenfolge exakt `Darstellung, Allgemein, Übersicht, Kalender, Benachrichtigungen, Konten, Mail-Vorschläge, Claude, Datenschutz`; Akzent „Grün“ per Pfeiltaste → `html[data-accent=green]` und `--accent` geändert; Befehlspalette „Akzent: Rose“ wirkt.
- [ ] Bestehende Playwright-Skripte, die „Datenquellen“ anklicken, auf „Konten“ umstellen.
- [ ] Commit; Push.

### Task 8: `app.css` aufteilen + aufräumen

**Files:** Split `app.css` an den Abschnittsgrenzen in `base.css`, `layout.css`, `controls.css`, `today.css`, `calendar.css`, `panes.css`, `tasks.css`, `notes.css`, `projects.css`, `assistant.css`, `overlays.css`, `settings.css`, `responsive.css`; Dunkel-Sonderregeln entfernen, wo Tokens reichen; feste Farben/Radien durch Tokens.

- [ ] Screenshot-Vergleich vor/nach dem Split identisch bis auf beabsichtigte Änderungen.
- [ ] Commit.

### Task 9: Bildvergleich, Doku, Abschluss

**Files:** Create `tests/e2e/visual.mjs` (npm `test:visual`), Modify `docs/CHATGPT.md`, `README.md`

- [ ] Alle Tests, Typecheck, Build; E2E grün; keine Konsolenfehler.
- [ ] Briefing: Funktionsumfang „Darstellung“, Versionsverlauf „Noch nicht veröffentlicht“.
- [ ] Commit; Push; Web-Vorschau live prüfen.
