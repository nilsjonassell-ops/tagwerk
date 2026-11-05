# Datenschutzerklärung für Tagwerk

Stand: 5. November 2026

Tagwerk ist eine Desktop-App für Kalender, E-Mail, Aufgaben, Notizen und Fokuszeit. Diese Erklärung beschreibt, welche Daten die App verarbeitet.

## Kurz gesagt

- Tagwerk hat **keinen eigenen Server**. Es gibt kein Benutzerkonto bei Tagwerk, keine Werbung, kein Tracking und keine Analyse-Dienste.
- Deine Daten (Aufgaben, Notizen, Projekte, Einstellungen, zwischengespeicherte Termine und E-Mails) liegen auf deinem Computer, im App-Datenordner deines Windows-Benutzerkontos. Nur wenn du den **Cloud-Speicher** einschaltest, liegt zusätzlich eine Kopie in **deinem eigenen OneDrive** (siehe unten).
- Daten verlassen deinen Computer nur in Richtung der Dienste, die **du selbst verbindest oder einschaltest** – Google, Microsoft, Apple iCloud, Open-Meteo (Wetter) und Anthropic (Claude). Tagwerk spricht dabei direkt von deinem PC aus mit diesen Diensten; es gibt keinen Zwischenserver.
- Wie bei jeder Internetverbindung sieht der jeweilige Dienst dabei technisch bedingt deine IP-Adresse. Für die Verarbeitung dort gelten zusätzlich die Datenschutzbestimmungen des Dienstes (Links unten).

## Google-Kalender und Gmail (optional)

Wenn du dein Google-Konto verbindest, ruft Tagwerk über die offiziellen Google-Schnittstellen direkt von deinem Computer aus deine Termine und E-Mails ab. Je nach erteilter Berechtigung kann Tagwerk auch Termine anlegen, ändern und löschen sowie E-Mails als gelesen markieren, archivieren, in den Papierkorb verschieben, markieren (Stern) und Antworten senden – immer nur, wenn du das in der App auslöst.

- Die Anmeldedaten (Zugriffs-Token) werden mit der Windows-Verschlüsselung deines Benutzerkontos gespeichert.
- Die Daten werden nicht an Dritte weitergegeben und nicht für Werbung verwendet.
- Für die Anmeldung legst du dir einen eigenen Google-Zugang (OAuth-Client) in deinem Google-Cloud-Projekt an; Tagwerk nutzt also keinen gemeinsamen Zugang des Entwicklers.
- Tagwerk hält sich an die [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), einschließlich der Anforderungen zur eingeschränkten Nutzung („Limited Use“).
- Du kannst die Verbindung jederzeit in Tagwerk unter Einstellungen → Konten trennen oder den Zugriff unter <https://myaccount.google.com/permissions> widerrufen.

## Microsoft: Outlook, OneNote und Cloud-Speicher (optional)

Wenn du dein Microsoft-Konto verbindest, greift Tagwerk über Microsoft Graph direkt von deinem Computer aus auf die Bereiche zu, die du auswählst: Outlook-Posteingang (lesen, archivieren, löschen, markieren, antworten), Outlook-Kalender (lesen, anlegen, ändern, löschen), OneNote (lesen und Notizen speichern) und den Cloud-Speicher.

- **Cloud-Speicher:** Tagwerk speichert deine Aufgaben, Notizen, Projekte, selbst angelegten Termine, „Antwort offen“-Markierungen und Einstellungen im App-Ordner deines OneDrive („Apps/Tagwerk“), damit sie auf deinen anderen PCs verfügbar sind. Tagwerk hat dafür nur Zugriff auf diesen einen Ordner, nicht auf deine übrigen OneDrive-Dateien. E-Mails und Termine aus verbundenen Konten werden nicht in den Cloud-Speicher kopiert. Zugangsdaten werden nie hochgeladen.
- Die Anmeldung wird mit der Windows-Verschlüsselung deines Benutzerkontos gespeichert. Daten werden nicht an Dritte weitergegeben.
- Du kannst die Verbindung in Tagwerk trennen, den Cloud-Speicher pausieren, den Ordner „Apps/Tagwerk“ in OneDrive löschen oder den Zugriff unter <https://account.live.com/consent/Manage> widerrufen.
- Datenschutzbestimmungen von Microsoft: <https://privacy.microsoft.com/de-de/privacystatement>

## Apple Kalender über iCloud (optional)

Wenn du deinen Apple Kalender verbindest, ruft Tagwerk mit deiner Apple-ID und einem App-spezifischen Passwort (CalDAV) deine Kalender direkt bei Apple ab und legt auf deinen Wunsch Termine an, ändert oder löscht sie. Das App-spezifische Passwort wird verschlüsselt gespeichert und kann jederzeit unter <https://account.apple.com> widerrufen werden. Datenschutzbestimmungen von Apple: <https://www.apple.com/de/legal/privacy/>

## Wetter (optional)

Wenn du das Wetter einschaltest, sendet Tagwerk den von dir eingetragenen Ortsnamen an den Wetterdienst Open-Meteo (<https://open-meteo.com>), um ihn in Koordinaten umzuwandeln und die Vorhersage abzurufen. Es werden keine weiteren Daten übertragen, und Open-Meteo braucht kein Konto. Datenschutz bei Open-Meteo: <https://open-meteo.com/en/terms#privacy>

Wetterdaten von [Open-Meteo.com](https://open-meteo.com/), lizenziert unter [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Claude (optional, standardmäßig aus)

Tagwerk enthält eine optionale Anbindung an Claude (Anthropic). Sie ist standardmäßig ausgeschaltet und funktioniert nur mit einem eigenen API-Schlüssel. Nur wenn du sie einschaltest und eine Anfrage stellst, werden die dafür nötigen Inhalte an Anthropic gesendet. Die Kosten rechnet Anthropic direkt über deinen eigenen Schlüssel ab. Der Schlüssel wird mit der Windows-Verschlüsselung deines Benutzerkontos gespeichert. Datenschutzbestimmungen von Anthropic: <https://www.anthropic.com/legal/privacy>

Die Mail-Vorschläge (Termine, Fristen, Aufgaben aus Mails erkennen) laufen ohne Claude vollständig auf deinem PC.

## Marken

Google, Gmail, Microsoft, Outlook, OneNote, OneDrive, Apple, iCloud und Claude sind Marken ihrer jeweiligen Inhaber. Tagwerk ist ein unabhängiges Projekt und wird von diesen Unternehmen weder betrieben noch empfohlen.

## Updates

Die Version aus dem Microsoft Store wird über den Microsoft Store aktualisiert. Dabei gelten die Datenschutzbestimmungen von Microsoft.

## Daten löschen

In Tagwerk unter Einstellungen → Datenschutz kannst du alle lokalen Daten exportieren oder löschen. Eine Kopie im Cloud-Speicher entfernst du, indem du den Ordner „Apps/Tagwerk“ in deinem OneDrive löschst. Beim Deinstallieren der Store-App entfernt Windows die App-Daten.

## Kontakt

Fragen zum Datenschutz: über <https://github.com/nilsjonassell-ops/tagwerk/issues>
