# Tagwerk

Persönliches Produktivitäts-Dashboard für Windows und macOS: Kalender, E-Mails, Aufgaben, Notizen und Projekte an einem Ort – mit integriertem Claude-Assistenten.

## Starten

Voraussetzung: Node.js 20 oder neuer. Im Projektordner (z. B. in PowerShell):

```bash
npm install
npm run dev        # Entwicklungsmodus mit Hot Reload
npm run build      # Produktions-Build nach out/
npm start          # Produktions-Build starten
npm test           # Logik-Tests (Konflikte, freie Zeit, Wiederholungen, ICS-Import …)
npm run dist:win   # Windows-Installer (.exe) nach release/ – auf Windows ausführen
                   # (nicht signiert: SmartScreen → „Weitere Informationen“ → „Trotzdem ausführen“)
npm run dist:mac   # macOS-Image (.dmg) – auf einem Mac ausführen
```

## Technik und Aufbau

Electron + React + TypeScript (Vite über electron-vite).

- **Hauptprozess** (`src/main`): Fenster, Tray-/Menüleistensymbol, systemweite Tastenkombination, Benachrichtigungen, Autostart, lokale Datenablage (JSON im App-Datenordner, atomar geschrieben), verschlüsselter API-Schlüssel (`safeStorage` – Windows DPAPI / macOS-Schlüsselbund), Claude-API-Aufrufe, ICS-Import, Wetter.
- **Preload** (`src/preload`): schmale, typisierte Brücke (`window.tagwerk`). Die Oberfläche läuft isoliert und ohne Node-Zugriff (contextIsolation, sandbox, CSP).
- **Oberfläche** (`src/renderer`): React-Ansichten Heute, Kalender, Posteingang, Aufgaben, Notizen, Projekte, Claude-Panel, Befehlspalette, Einstellungen.
- **Gemeinsame Logik** (`src/shared`): Konflikterkennung, freie Zeitblöcke, Briefing, Wiederholungen, Aufgabenerkennung in Notizen, Suche, Demo-Datenquelle.

## Datenquellen

| Quelle | Status |
| --- | --- |
| Demo-Datenquelle | aktiv beim ersten Start, überall als „Demo“ gekennzeichnet, in den Einstellungen entfernbar |
| Kalenderdatei (.ics) | verfügbar – Import aus Outlook, Google oder Apple Kalender, schreibgeschützt |
| Claude (Anthropic API) | verfügbar – eigener API-Schlüssel in Einstellungen → Claude |
| Wetter (Open-Meteo) | verfügbar, optional, ohne Konto |
| Google Kalender / Gmail | nicht verbunden – OAuth-Client muss eingerichtet werden |
| Microsoft 365 / Outlook | nicht verbunden – App-Registrierung (Microsoft Graph) nötig |
| IMAP/SMTP | nicht verbunden |
| Pendelzeit | nicht verbunden – Routendienst nötig |

Im Demo-Postfach werden Antworten nur lokal abgelegt und nie versendet.

## Sicherheit und Kontrolle

- Claude schlägt Aktionen nur vor (Aufgabe anlegen/erledigen/löschen, Termin anlegen/ändern, Antwortentwurf); jede Aktion braucht einen Klick zur Bestätigung.
- Senden, Löschen und das Verschieben von Terminen mit Teilnehmenden verlangen eine Bestätigung; die meisten Änderungen lassen sich per „Rückgängig“ zurücknehmen.
- E-Mail-Inhalte gehen standardmäßig nur an Claude, wenn eine Mail ausdrücklich zusammengefasst oder beantwortet wird.
- Logs enthalten keine Inhalte. Aufbewahrung, Export und vollständiges Löschen in Einstellungen → Datenschutz.

## Tastenkürzel

`Strg/⌘ K` Suche & Befehle · `Strg/⌘ 1–6` Bereiche · `Strg/⌘ J` Claude · `Strg/⌘ N` Aufgabe · `Strg/⌘ ⇧ N` Termin · `Strg/⌘ ⇧ Leertaste` Schnellnotiz (systemweit) · `Strg/⌘ /` alle Kürzel
