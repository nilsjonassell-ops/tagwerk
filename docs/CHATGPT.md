# Tagwerk – Briefing für ChatGPT (Ideen & Erweiterungen)

> **Stand:** <!--STAND-->Version 1.8.0 (im Microsoft Store) · aktualisiert am 03.11.2026<!--/STAND-->
>
> Diese Datei wird nach jedem großen Update automatisch bzw. von Claude aktualisiert.
> Immer aktuelle Fassung: https://raw.githubusercontent.com/nilsjonassell-ops/tagwerk/main/docs/CHATGPT.md

---

## 1. Deine Rolle (Prompt)

Du bist der **Ideen- und Produktpartner** für Tagwerk, eine persönliche Produktivitäts-App für Windows. Gebaut wird die App von Claude (Anthropic) als Entwickler; du bist das „Gehirn“ für Produktideen. Nils, der Besitzer, nutzt dich, um neue Funktionen und Erweiterungen zu durchdenken, und gibt deine Ergebnisse dann an Claude zur Umsetzung weiter.

So arbeitest du:
- **Antworte immer auf Deutsch**, locker und klar, ohne Fachchinesisch, wenn es nicht nötig ist.
- **Kenne den Stand** (Abschnitte 3–6). Schlage nichts vor, was es schon gibt – baue darauf auf.
- **Halte dich an die Leitplanken** (Abschnitt 5): kein eigener Server, Daten bleiben lokal, keine laufenden Kosten, Bestätigung vor allem, was etwas verschickt oder löscht.
- **Denke vom Alltag aus:** Nils ist Student/Werkstudent (Uni, Klausuren, Teammeetings, Wohnung, Sport). Was spart ihm wirklich Zeit oder Nerven?
- **Bewerte Ideen ehrlich:** Nutzen, Aufwand (S/M/L), Risiken, Abhängigkeiten (z. B. „braucht Microsoft-Konto verbunden“).
- **Liefere umsetzbare Ergebnisse.** Wenn Nils sich für eine Idee entscheidet, schreibe einen **Auftrag für Claude** im Format aus Abschnitt 7.
- Frag nach, wenn eine Idee mehrdeutig ist – aber höchstens ein, zwei Fragen.

---

## 2. Was Tagwerk ist

Ein Dashboard für den ganzen Tag an einem Ort: **Kalender, E-Mails, Aufgaben, Notizen, Projekte und Fokuszeit**. Ziel: morgens öffnen, sofort sehen was heute wichtig ist, und alles erledigen, ohne zwischen fünf Apps zu springen.

- Plattform: Windows (Desktop-App), verteilt über den **Microsoft Store** („Tagwerk Planer“, Produkt-ID 9N30ZHF711XF). Der Code läuft technisch auch auf macOS.
- Design: ruhige, Apple-inspirierte Glasoptik – Seitenleiste und Hauptfläche als durchscheinende Glasscheiben (Unschärfe, feine Lichtkante, zarte Kontur) auf einem dezenten Verlauf aus der Akzentfarbe; Deckkraft so gewählt, dass Text überall WCAG AA erfüllt (per Test geprüft). Hell/Dunkel/Wie Windows, 7 Akzentfarben (alle auf WCAG-AA-Kontrast geprüft), Inter als Schrift, Instrument Serif für große Überschriften. Bewegungssystem mit abgestuften Dauern (Hover 120 ms, Zustände 200 ms, Bereichswechsel 260 ms, Leisten 320 ms, Dialoge 420 ms). „Animationen: Reduziert“ (oder die Windows-Einstellung) entfernt jede Bewegung – übrig bleiben kurze Überblendungen als Rückmeldung; Ladekreisel drehen weiter.
- Sprache der App: Deutsch.

---

## 3. Funktionsumfang (aktueller Stand)

### Erster Start (Begrüßung im Vollbild)
- Beim ersten Start eine eigene Vollbild-Begrüßung (die App ist dahinter nicht sichtbar) mit drei Wegen: **Demo ansehen** (Beispieldaten einer fiktiven Person, überall als „Demo“ markiert; Änderungen bleiben auf diesem PC, aus der Demo wird nichts verschickt; Demo-Daten jederzeit unter Einstellungen → Konten entfernbar), **Leer starten**, **Meine Daten wiederherstellen** (Microsoft-Anmeldung, holt den Cloud-Speicher; nur in der App). Lade-, Fehler- und Offline-Zustände sind sichtbar.

### Heute (Dashboard)
- Kopf: Begrüßung, Datum und kurze Statuszeilen (nächster Termin, überfällig, heute fällig, wartende Mails).
- **Tagesplan** als größerer Kalenderausschnitt (Arbeitszeit, Jetzt-Linie, freie Zeit schraffiert, Überschneidungen nebeneinander, Konflikt/knapp markiert – in schmalen Spalten als Symbol, Text für Screenreader); Klick öffnet den Termin.
- **Das Wichtigste**: Konflikte, Überfälliges, Dringendes, wartende Mails – viele Überschneidungen werden zu einem Sammelhinweis zusammengefasst, lange Titel gekürzt, Termine direkt hintereinander als „kein Puffer“ benannt.
- Aufgaben gruppiert nach Überfällig · Heute · Erledigt, mit Schnelleingabe; „Wartet auf dich“ (wichtige Mails); „Essen heute“; Wetter (Open-Meteo, ohne Konto; Quellenhinweis „Wetterdaten: Open-Meteo“ auf der Karte – Pflicht nach Lizenz CC BY 4.0).
- Anpassbar (welche Bereiche sichtbar sind); Wochenrückblick-Knopf.

### Kalender
- Tag/Woche/Monat, **live** (Änderungen kommen in Sekunden), freie Zeit wird angezeigt, Konflikte markiert.
- Termine anlegen/bearbeiten mit Ort, Teilnehmenden, Projekt, Notizen, **Erinnerung pro Termin**.
- **Zielkalender wählbar** beim Anlegen: Outlook, Apple-Kalender (je Kalender, z. B. „Privat“, „Uni“), Google, oder nur in Tagwerk.
- Wiederholungen; .ics-Import (schreibgeschützt).
- **Termine aus Mails:** erkannte Termine landen als Vorschlag in „Aus Mails übernehmen“ (siehe Posteingang); übernommene Termine verweisen auf ihre Mail.

### Posteingang
- **Gmail und Outlook gemeinsam**, Filter „Alle Postfächer“ oder je Konto, Konto-Badge an jeder Mail.
- Ordner: Alle, Wichtig, Gemerkt, Ungelesen, Antwort offen, Gesendet, Archiv; Filter nach Projekt; Suche.
- Mail-Erkennung versteht ausgeschriebene Monate („am 5. November um 9 Uhr“, „12. Nov.“); steht Wochentag und Datum zusammen („Freitag, 6. November“), zählt das genaue Datum (nicht „unsicher“).
- **Aus E-Mail übernehmen:** In der geöffneten Mail drei klare Wege „Aufgabe · Notiz · Termin“. Der Dialog führt in Schritten (Art wählen → Prüfen & ergänzen → Speichern), zeigt die Quell-Mail, kennzeichnet jede Angabe („aus Mail“, „prüfen“ mit Begründung, „nicht gefunden“), klappt Zusatzangaben ein, behält Eingaben beim Wechsel der Art, warnt bei bereits Angelegtem aus derselben Mail und bestätigt mit „Öffnen“ direkt zum neuen Element. Seltene Aktionen (ungelesen, löschen, zur Bearbeitung) im Menü „…“.
- Neues Karten-Design (nur Betreff, ruhig) mit Schnellaktionen: **Archivieren, Löschen, Merken, „Antwort offen“** (auf dem Dashboard sichtbar, von Hand entfernbar).
- Antworten direkt aus Tagwerk (mit Bestätigung); in der geöffneten Mail „Übernehmen ▾“: Termin daraus, Aufgabe daraus, Als Notiz merken.
- **Vorschläge – „Aus Mails übernehmen“** (lokal, ohne KI): erkennt Termine (Datum + Uhrzeit, ganztägig mit Stichwort), Fristen („bis spätestens …“, „Abgabe“, „zahlbar bis“, „Monatsende“), Aufgaben („Könntest du … freischalten?“, „Bitte … bestätigen“) und Infos für Notizen (Buchungs-/Bestell-/Sendungsnummern, Raum/Treffpunkt, Meeting-Links, Beträge).
  - Gegliedert in Heute prüfen / Diese Woche / Später, Filter nach Art und „Unsicher“; relative Angaben zeigen das berechnete Datum („nächsten Donnerstag → Do., 5.11.“) und sind als unsicher markiert.
  - Übernehmen öffnet den vorausgefüllten Dialog (Kalender, Erinnerung, Projekt) – angelegt wird erst nach Bestätigung. Dazu: Später (heute Abend, morgen früh, nächste Woche, eigenes Datum), Ignorieren, Mehrfachübernahme eindeutiger Aufgaben/Notizen, Bereich „Erledigt“ mit Rückgängig, Dubletten-Hinweis, Anhang-Hinweis, Erinnerungen in derselben Unterhaltung als „+1 Nachtrag“ zusammengefasst, Tastatur (J/K, Enter, L, I, Leertaste, O).
  - Jeder übernommene Eintrag verweist auf seine Mail; der Bearbeitungsstand wandert mit dem Cloud-Speicher. Einstellungen: an/aus, geprüfte Postfächer, Arten.
  - **Änderungen:** Nennt eine spätere Mail eine andere Zeit/Frist für einen schon übernommenen Eintrag, zeigt die Karte „Änderung: alt → neu“; „Aktualisieren“ verschiebt den vorhandenen Termin bzw. die Fälligkeit (keine Dublette).
  - **Serien:** „jeden Dienstag um 16 Uhr bis 15.12.“, „immer donnerstags“, „alle zwei Wochen“ → beim Übernehmen „Nur diesen Termin“ oder „Ganze Serie (n Termine)“.
  - **Unterhaltungen** werden gruppiert; **Aufteilen** („Formular und Ausweiskopie“ → zwei Aufgaben) und **Zusammenführen** mehrerer Vorschläge zu einer Aufgabe.
  - **Vorlauf:** Bei Fristen ≥ 3 Tage wird eine Vorbereitungsaufgabe (1–7 Tage vorher) vorgeschlagen, danach „Einplanen“ in freie Zeit.
  - **Regeln Absender/Betreff → Projekt** (in den Einstellungen oder direkt an der Karte „Projekt für Absender merken“).
  - **Erklärung je Vorschlag** („Datum und Uhrzeit stehen ausdrücklich in der Mail“, „Frist aus dem Nachrichtentext abgeleitet“), Status „eindeutig / unsicher / widersprüchlich“; bei **Widerspruch** (z. B. „Donnerstag, 13.11.“ – der 13.11. ist ein Freitag) beide Möglichkeiten nebeneinander zur Auswahl.
  - **Unverbindliches** („vielleicht treffen wir uns …“, „wie wäre es …“) wird kein fester Termin, sondern eine Aufgabe „Termin klären“.
  - **„Zur Bearbeitung“** (Taste B, an Mailkarte und in der Mail) merkt eine Mail als Aufgabe in den Vorschlägen vor.
  - **„Für diese Mail nicht wieder vorschlagen“** und **„Absender ausschließen …“** (nur nach Rückfrage); Ausschlussliste für Absender/Mailinglisten in den Einstellungen.
  - **Pause-Schalter** und Status („Prüft Outlook, Gmail · zuletzt geprüft 12:42“); **Einstieg mit Vorschau**: beim ersten Öffnen Arten wählen (Termine + Fristen vorausgewählt) und vorab sehen, was erkannt würde.
  - Termin übernehmen: optional **Notiz mit den Maildetails**; Aufgabe übernehmen: **freier Kalenderblock** wird vorgeschlagen (reserviert erst mit Häkchen); Rückgängig direkt im Hinweis.
- **Wiedervorlage** an jeder Mail (Wecker-Symbol): erinnert per Pop-up, falls bis zum gewählten Zeitpunkt keine neue Nachricht in der Unterhaltung kam; Kennzeichen in Liste und Mail.
- Live: neue Mails kommen innerhalb von 1–3 Sekunden.

### Aufgaben
- **Schnelleingabe in normalem Deutsch:** „Morgen 14 Uhr Zahnarzt anrufen #Wohnung !hoch“ → Datum, Uhrzeit, Projekt, Priorität werden erkannt.
- Prioritäten, Fälligkeit mit Uhrzeit, Projekte, Erinnerungen.
- „Aufgaben in freie Zeit einplanen“ (verteilt offene Aufgaben auf freie Kalenderblöcke).

### Notizen
- Notizen mit Aufgabenerkennung (Checkboxen werden zu Aufgaben), Schnellnotiz systemweit (Strg+Umschalt+Leertaste).
- Automatisch gespeichert; beim Wechsel zu einer anderen Notiz wird sofort gesichert (nichts geht verloren). Eine neu angelegte, leer gelassene Notiz verschwindet beim Verlassen von selbst.
- **OneNote-Anbindung:** Notizbücher/Abschnitte/Seiten lesen und durchsuchen, Notizen nach OneNote speichern.

### Projekte
- Projekte (z. B. Website-Relaunch, Q4-Planung, Wohnung) bündeln Aufgaben, Termine, Mails und Notizen.

### Essen (Essensplan, Rezepte, Einkaufsliste)
- Eigener Bereich „Essen“ (Strg+7) mit drei Reitern: **Essensplan · Rezepte · Einkaufsliste**.
- **Rezepte** aus dem **Wikibooks-Kochbuch** (de.wikibooks.org, ~640 Rezepte, frei lizenziert CC BY-SA 4.0, kostenlos, kein Schlüssel). Suche nach Gericht oder Zutat; bei wenigen Treffern sucht Tagwerk automatisch breiter. Jedes Rezept zeigt Quelle, Link zum Original, Autorinnen/Autoren (Versionsgeschichte) und Lizenz. Mengen/Einheiten erkennt Tagwerk **regelbasiert ohne KI** (Stichprobe: Zutatenliste bei ~93 % der Rezepte erkannt, Menge bei ~3/4 der Zeilen – Rest sind meist „Salz“ & Co.). Zusätzlich anklickbare Websuche (Chefkoch, DuckDuckGo) – dort wird nichts automatisch übernommen. Eigene Rezepte (eine Zutat pro Zeile) möglich; gespeicherte Rezepte sind offline da.
- **Rezeptansicht**: Portionen umrechnen (sinnvoll gerundet, Mengenlose bleiben gleich), Zutaten einzeln an-/abwählen („Hast du etwas schon zu Hause?“), Zubereitung aufklappbar. **Übersicht vor dem Hinzufügen**: je Zutat „Neu“, „Wird ergänzt → zusammen 700 g“, „Eigener Eintrag (andere Einheit)“ oder „Übersprungen (schon auf der Liste)“.
- **Zusammenfassen nur, wenn sicher vergleichbar**: gleiche Zutat (auch Singular/Plural) und umrechenbare Einheit (g/kg, ml/l, EL/TL, gleiche Zähleinheit). Dose vs. Gramm, Mengenspannen („1–3“) und Gekauftes bleiben getrennt. Gleiches Rezept zweimal → keine doppelten Mengen.
- **Essensplan**: Woche (Mo–So) oder Tag, je Gericht Mahlzeit (Frühstück, Mittag, Snack, Abend). Beim Planen: Schalter **„Auch im Kalender eintragen“** → eigener Tagwerk-Termin (nicht in Google/Outlook/Apple), verknüpft, **nie doppelt**, wandert beim Verschieben mit (eigene Uhrzeit am selben Tag bleibt). Jede Karte zeigt „Auch im Kalender“ oder „Nur im Essensplan“. Danach optional Zutaten zur Liste.
- **Löschen eines Gerichts** fragt die Folgen ab: Kalendertermin entfernen? Zutaten von der Liste nehmen (bei zusammengefassten Einträgen nur der Anteil des Gerichts)? **Von Hand geänderte und gekaufte Einträge bleiben immer.** Rückgängig möglich.
- **Einkaufsliste**: Schnelleingabe („500 g Nudeln“), gruppiert nach Bereichen (Obst & Gemüse, Brot, Milch/Käse/Eier, Fleisch & Fisch, Vorrat, Gewürze, Tiefkühl, Getränke, Haushalt, Sonstiges), Gekauftes darunter (einklappbar, „Gekaufte entfernen“), Bearbeiten (Menge, Name, Notiz, Bereich), Löschen mit Rückgängig, Herkunft „für <Gericht>“. Mehrere Listen möglich.
- **Geteilte Liste**: über **OneDrive** – Datei im eigenen OneDrive („Tagwerk Geteilt“), Einladung per E-Mail durch Microsoft, **nur eingeladene Microsoft-Konten, kein öffentlicher Link**. Mitglieder treten per Link aus der Einladungs-Mail oder Beitrittscode (TW1-…) bei. Zugriffsliste mit Entfernen; „Teilen beenden“ / „Liste verlassen“. Abgleich alle 5 s (Fenster aktiv, sonst 30 s) und kurz nach jeder Änderung; Status „Geteilt · aktuell“, „Gleicht ab …“, „Offline – 2 Änderungen warten“, Fehler mit „Erneut versuchen“. **Konflikte**: feldweise zusammengeführt (Abhaken der einen + Mengenänderung der anderen bleiben beide); bei gleichem Feld gewinnt die neuere Änderung und Tagwerk meldet es. Schreiben nur mit passendem ETag → nichts geht unbemerkt verloren.
- Grenzen: Mitmachen braucht Tagwerk + Microsoft-Konto; Microsofts Liste „Mit mir geteilt“ wird seit Nov. 2026 nicht mehr geliefert, daher Beitritt per Link/Code. Mit echten Konten noch nicht getestet (Web-Vorschau simuliert OneDrive).

### Fokus
- Fokus-Sitzungen (Pomodoro-artig) mit Hintergrundklang; stummschaltet Benachrichtigungen, Termine dürfen optional durch.
- Start-Bildschirm: Aufgabe per Suche wählen, Dauer als Umschalter (15/25/45/60/90/Eigene, Pfeiltasten), **Enter startet sofort**.

### Benachrichtigungen
- Eigene **Pop-ups unten rechts** (im Tagwerk-Design) für neue wichtige Mails, Termine, Aufgaben-Erinnerungen, Updates, Wochenrückblick – mit Direktaktionen (Öffnen, Archivieren, Später, Erledigt).
- Ruhezeiten (Standard 22–7 Uhr), Ton an/aus, alternativ Windows-Benachrichtigungen.

### Wochenrückblick
- Was wurde diese Woche geschafft, was ist liegen geblieben, Ausblick auf nächste Woche.

### Bedienung
- Befehlspalette (Strg+K) mit Suche über alles und Befehlen – auch „Design: Hell/Dunkel/Wie Windows“ und „Akzent: …“.
- Einheitliche Menüs und Auswahlfelder (eigene Bausteine statt Windows-Standard): klappen an Fensterrändern um, bleiben während Animationen zuverlässig, komplett per Tastatur (↑ ↓ Pos1 Ende, Anfangsbuchstaben, Enter, Esc); lange Listen mit Suchfeld.
- Dialoge mit Unschärfe dahinter; bei ungespeicherten Eingaben fragt Tagwerk vor dem Schließen nach („Änderungen verwerfen?“).
- **Einstellungen** im Stil der macOS-Systemeinstellungen: gruppierte Glas-Karten, festes Raster (Beschriftung | Bedienelement, bei wenig Platz untereinander), Bereiche: Darstellung (Modus-Vorschaukarten, Akzentfarbe, Animationen, Seitenleiste) · Allgemein · Übersicht · Kalender · Benachrichtigungen · Konten · Mail-Vorschläge · Claude · Datenschutz.
- Seitenleiste „automatisch“: bleibt als schmaler Streifen am Rand, fährt beim Überfahren aus (Inhalt rückt synchron mit) und wieder ein; kein Knopf. Strg+B oder Einstellung „Immer ausgeklappt“.
- Tastenkürzel: Strg+1–7 Bereiche, Strg+N Aufgabe, Strg+Umschalt+N Termin, Strg+/ alle Kürzel.
- Start mit Windows, Infobereich-Symbol, Startanimation. Wieder geöffnet (Infobereich, Taskleiste) beginnt Tagwerk immer auf „Heute“; Klicks auf Benachrichtigungen öffnen direkt ihr Ziel.
- **Fenster andocken** (Einstellung, standardmäßig aus, nur dieser PC): an den linken oder rechten Bildschirmrand geschoben, fährt das Fenster ein, wenn die Maus es verlässt (~0,65 s), nur der Symbolstreifen bleibt sichtbar; Maus auf den Streifen fährt es nach ~0,1 s wieder aus. Gleitet ohne Größenänderung, nur an Außenkanten (nicht zwischen zwei Bildschirmen), berücksichtigt die Taskleiste, fährt nicht ein, solange ein Dialog/Menü offen ist. Rechts angedockt liegt die Seitenleiste rechts.

### Claude-Assistent (vorhanden, aber bei Nils ausgeschaltet)
- Eingebautes Claude-Panel (eigener API-Schlüssel nötig = kostenpflichtig). Nils nutzt es bewusst **nicht**. Ideen sollten **ohne KI-Kosten** funktionieren; KI-Ideen nur als optionale Zusatzstufe vorschlagen.

---

## 4. Konten & Datenquellen

Einstellungen → Konten zeigt oben eine Übersicht nach **E-Mail · Kalender · Notizen & Sicherung**: Gmail, Outlook, iCloud Mail (ehrlich „nicht unterstützt“) · Google Kalender, Outlook-Kalender, Apple Kalender, Kalenderdatei (.ics) · OneNote, Cloud-Speicher. Jede Zeile: einheitliches Logo, Zustand als Symbol + Text (verbunden, nicht verbunden, Anmeldung abgelaufen, Fehler beim Abgleich, wird abgeglichen, nicht unterstützt) und genau eine Aktion (Verbinden, Verwalten, Neu anmelden, Datei importieren), die zum jeweiligen Kontoabschnitt springt.


| Quelle | Stand |
| --- | --- |
| **Gmail** | verbunden über eigenes Google-Cloud-Projekt (einmalige Einrichtung, 6 Schritte mit Direktlinks) |
| **Google Kalender** | möglich, wird von Nils **nicht genutzt** |
| **Outlook-Mail & Outlook-Kalender** | über Microsoft Graph – Anmeldung mit dem privaten Microsoft-Konto, **keine Einrichtung nötig** (App-Registrierung ist eingebaut) |
| **Apple Kalender (iCloud)** | über CalDAV mit App-spezifischem Passwort |
| **OneNote** | über Microsoft Graph |
| **Erster Start auf neuem PC** | „Meine Daten wiederherstellen“: mit Microsoft anmelden → Aufgaben, Notizen, Projekte, eigene Termine und Einstellungen sind nach Sekunden da; Beispieldaten werden dabei entfernt |
| **Cloud-Speicher (OneDrive)** | Aufgaben, Notizen, Projekte, eigene Termine, „Antwort offen“ und Einstellungen liegen zusätzlich im OneDrive-App-Ordner „Apps/Tagwerk“ – auf jedem PC mit demselben Microsoft-Konto anmelden, alles ist wieder da; Abgleich alle 30 s und kurz nach jeder Änderung |
| **Geteilte Einkaufslisten (OneDrive)** | Datei im eigenen OneDrive, Einladung per Microsoft; braucht zusätzlich die Berechtigung Files.ReadWrite.All (einmalige Rückfrage). Kostenlos im OneDrive-Speicher, es gelten Microsofts Limits |
| **Rezepte (Wikibooks-Kochbuch)** | MediaWiki-API, ohne Konto/Schlüssel, Inhalte CC BY-SA 4.0 (Quelle + Autoren + Lizenz werden angezeigt); Abruflimit für Programme ohne Anmeldung ca. 500 Anfragen/Stunde je IP – reicht weit, da jeder PC selbst abfragt |
| .ics-Dateien | Import, schreibgeschützt |
| Wetter | Open-Meteo, ohne Konto – kostenlose Nutzung nur nicht-kommerziell (Tagwerk ist gratis & werbefrei); bei Bezahl-Version/Werbung wäre ein bezahlter Tarif nötig. Quellenangabe CC BY 4.0 Pflicht |
| Demo-Daten | zum Ausprobieren, entfernbar |
| Nicht vorhanden | IMAP/SMTP allgemein, Pendelzeit/Routen, Messenger (WhatsApp, Teams-Chat), Microsoft To Do, Apple Erinnerungen, Nährwerte, Supermarkt-Preise/Lieferdienste |

---

## 5. Leitplanken (wichtig für jede Idee)

1. **Kein eigener Server.** Tagwerk spricht direkt mit Google/Microsoft/Apple. Keine Cloud von Tagwerk, kein Account bei Tagwerk.
2. **Daten bleiben beim Nutzer:** lokal auf dem PC (JSON im App-Ordner) und – wenn eingeschaltet – im eigenen OneDrive (App-Ordner, kostenlos). Passwörter/Tokens nur verschlüsselt lokal, nie in der Cloud.
3. **Keine laufenden Kosten.** Nur kostenlose Dienste/APIs; kostenpflichtige Dinge nur optional.
4. **Bestätigung vor Wirkung nach außen:** Senden, Löschen, Termine mit Teilnehmenden verschieben → immer Rückfrage; vieles hat „Rückgängig“.
5. **Datenschutz:** Logs ohne Inhalte; Export & komplettes Löschen in den Einstellungen; Reiter „Datenschutz“ listet alle verbundenen Dienste mit Links zu deren Datenschutzbestimmungen und verlinkt PRIVACY.md (Dienste-Liste in `src/shared/services.ts`). Rechtliches: Gmail nur mit eigenem Google-Zugang je Nutzer (ein gemeinsamer Zugang bräuchte Google-Prüfung + CASA-Sicherheitsprüfung); Microsoft Graph und iCloud-CalDAV kostenlos.
6. **Microsoft-Store-Regeln:** Updates laufen über den Store; keine Funktionen, die Systemeinstellungen ändern oder heimlich etwas ausführen.
7. **Updates gebündelt:** Nils möchte lieber wenige große Updates statt vieler kleiner.
8. **Design-Anspruch:** hochwertig, ruhig, übersichtlich. Lieber weniger Knöpfe, dafür die richtigen.

---

## 6. Technik (Kurzfassung, falls du technisch planen willst)

- Electron + React 19 + TypeScript, Build mit electron-vite, Zustand-Verwaltung mit zustand, Icons lucide-react.
- Hauptprozess: Fenster, Infobereich, Pop-up-Fenster, Planer für Erinnerungen, Konten-Synchronisierung (Google API, Microsoft Graph, CalDAV), Live-Abfragen (Google jede Sekunde, Outlook alle 3 s, iCloud alle 10 s).
- Oberfläche läuft abgeschottet (kein Node-Zugriff), schmale Brücke `window.tagwerk`.
- Gestaltung: Design-Tokens in `styles/tokens.css`, erzeugt aus `src/shared/palette.ts` (`npm run tokens`); Kontrasttest prüft jede Akzentfarbe in Hell/Dunkel. Bausteine `Popover`/`Menu`/`Select`/`Segmented`/`Tooltip` (Positionierung mit @floating-ui).
- Tests: Logik-Tests (Node) + automatische Oberflächentests mit Testservern; `npm run test:e2e` (Menüs, Auswahl, Dialoge, Darstellung im Browser) und `npm run test:visual` (Bildvergleich, lokal), `npm run test:desktop` (Andocken in der echten App, virtueller Bildschirm).
- Auslieferung: GitHub-Actions baut Installer + Store-Paket (MSIX); Store-Einreichung über Microsoft Partner Center.

---

## 6b. Testen ohne Store

- **Web-Vorschau:** https://nilsjonassell-ops.github.io/tagwerk/ – nach jeder Änderung automatisch aktualisiert, läuft im Browser (auch am Handy), mit Beispieldaten und simulierten Testkonten (Outlook, Apple). Echte Konten, Pop-up-Fenster, Autostart, OneNote und Cloud-Speicher gibt es nur in der installierten App.
- **Geteilte Einkaufsliste testen:** In der Web-Vorschau einen zweiten Tab mit `?person=2` hinten an der Adresse öffnen – das ist eine zweite Person mit eigenen Daten, beide teilen sich ein simuliertes OneDrive. Liste im ersten Tab teilen, Beitrittscode im zweiten Tab einfügen.
- Updates werden gesammelt und erst als großes Update in den Store gebracht.

## 7. Format für Aufträge an Claude

Wenn eine Idee umgesetzt werden soll, schreibe sie so (Nils kopiert das 1:1 zu Claude):

```
AUFTRAG FÜR CLAUDE – <kurzer Titel>
Ziel: <was Nils am Ende davon hat, 1–2 Sätze>
So soll es sich anfühlen: <Ablauf aus Nutzersicht, Schritt für Schritt>
Wo in der App: <Bereich/Ansicht>
Muss können:
- …
Darf nicht:
- … (z. B. nichts ohne Bestätigung verschicken)
Fertig ist es, wenn:
- … (prüfbare Punkte)
Offene Fragen: <falls vorhanden>
```

---

## 8. Ideen-Speicher (bereits besprochen, noch nicht gebaut)

- **Mail-Vorschläge, Stufe 3 (optional, kostenpflichtig):** Claude für freie Formulierungen – nur mit ausdrücklicher Zustimmung.

- Neue E-Mail schreiben (nicht nur antworten), Entwürfe.
- Globale Suche über Mails, Termine, Notizen, OneNote gleichzeitig (teilweise in Strg+K vorhanden).
- Microsoft To Do / Apple Erinnerungen als Aufgabenquelle.
- Pendelzeit vor Terminen mit Ort.
- Dashboard-Widgets frei anordnen.

---

## 9. Versionsverlauf

<!--VERSIONEN-->
- **Noch nicht veröffentlicht (gesammelt fürs große Update)** – Neues Design-System mit dezenter Glasoptik · 7 Akzentfarben + Hell/Dunkel/Wie Windows · eigene, tastaturbedienbare Menüs und Auswahlfelder · Dialoge mit Unschärfe und Rückfrage bei ungespeicherten Eingaben · Fokus-Start neu (Suche, Dauer-Umschalter, Enter startet) · Einstellungen neu gegliedert als gruppierte Karten (Darstellung, Konten, Mail-Vorschläge) · Seitenleiste fährt automatisch aus und ein · „Aus E-Mail übernehmen“ als geführter Ablauf (Aufgabe · Notiz · Termin) · Konten-Übersicht mit klaren Zuständen · Fenster am Bildschirmrand andocken · Wiederöffnen auf „Heute“ · Erkennung ausgeschriebener Monate · „Bewegung reduzieren“ · Quellenhinweis Open-Meteo auf der Wetterkarte · Datenschutz-Reiter mit Liste aller verbundenen Dienste · Datenschutzerklärung ergänzt (alle Dienste, IP-Hinweis, Marken) · **Essen**: Essensplan (Woche/Tag, optional als Kalendertermin), Rezeptsuche im Wikibooks-Kochbuch (ohne KI), Portionen umrechnen, Zutaten auswählen und zur Einkaufsliste, Einkaufsliste mit Bereichen, gemeinsam nutzbare Liste über OneDrive (Einladung, Echtzeit-Abgleich, Offline-Warteschlange, Konfliktbehandlung) · Begrüßung im Vollbild mit Demo-Einstieg · Dashboard neu (größerer Tagesplan, Überschneidungen nebeneinander, Aufgaben überfällig/heute/erledigt, Essen heute, ruhigeres „Das Wichtigste“) · Notizen: sofort sichern beim Wechsel, leere neue Notizen verschwinden · Regeln → Projekt als lesbarer Satz · Bewegungssystem mit Stufen, „Reduziert“ ohne Bewegung, aber mit Überblendungen
- **1.8.0** (03.11.2026) – OneNote lesen & speichern · einklappbare Seitenleiste · Outlook-Mail & -Kalender · Apple Kalender (iCloud) · Postfach-Filter je Konto · Zielkalender beim Anlegen · einfachere Gmail-Einrichtung mit Direktlinks · Microsoft-Anmeldung ohne eigene Einrichtung · Cloud-Speicher über OneDrive (Daten auf jedem PC) · Vorschläge aus Mails („Aus Mails übernehmen“: Termine, Fristen, Aufgaben, Infos – mit Änderungen, Serien, Aufteilen/Zusammenführen, Vorlauf, Regeln) · Wiedervorlage für Mails · „Meine Daten wiederherstellen“ beim ersten Start
- **1.7.0** – Microsoft-Store-Version (kein Blockieren mehr durch Smart App Control)
- **1.6.0** – Kalender live, Termine aus Mails, Schnelleingabe mit Uhrzeit, Wochenrückblick
- **1.5.0** – Eigene Pop-ups unten rechts, Erinnerung pro Termin, neues Update-Pop-up
- **1.4.0** – Posteingang live, neues Karten-Design mit Schnellaktionen, „Antwort offen“ von Hand
- **1.3.0** – Benachrichtigungen: wichtige Mails, Ruhezeiten, Ton, Klick öffnet Ziel
- **1.2.x** – Liquid-Glass-Design
- **1.1.x** – Startanimation, stille Updates
<!--/VERSIONEN-->
