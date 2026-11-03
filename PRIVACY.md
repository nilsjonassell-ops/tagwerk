# Datenschutzerklärung für Tagwerk

Stand: 3. November 2026

Tagwerk ist eine Desktop-App für Kalender, E-Mail, Aufgaben, Notizen und Fokuszeit. Diese Erklärung beschreibt, welche Daten die App verarbeitet.

## Kurz gesagt

- Tagwerk hat **keinen eigenen Server**. Es gibt kein Benutzerkonto bei Tagwerk, keine Werbung, kein Tracking und keine Analyse-Dienste.
- Deine Daten (Aufgaben, Notizen, Projekte, Einstellungen, zwischengespeicherte Termine und E-Mails) liegen auf deinem Computer, im App-Datenordner deines Windows-Benutzerkontos. Nur wenn du den **Cloud-Speicher** einschaltest, liegt zusätzlich eine Kopie in **deinem eigenen OneDrive** (siehe unten).
- Daten verlassen deinen Computer nur in Richtung der Dienste, die **du selbst verbindest** – zum Beispiel Google, Microsoft oder Apple iCloud.

## Google-Kalender und Gmail (optional)

Wenn du dein Google-Konto verbindest, ruft Tagwerk über die offiziellen Google-Schnittstellen direkt von deinem Computer aus deine Termine und E-Mails ab. Je nach erteilter Berechtigung kann Tagwerk auch Termine anlegen, ändern und löschen sowie E-Mails als gelesen markieren, archivieren, in den Papierkorb verschieben, markieren (Stern) und Antworten senden – immer nur, wenn du das in der App auslöst.

- Die Anmeldedaten (Zugriffs-Token) werden mit der Windows-Verschlüsselung deines Benutzerkontos gespeichert.
- Die Daten werden nicht an Dritte weitergegeben und nicht für Werbung verwendet.
- Tagwerk hält sich an die [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), einschließlich der Anforderungen zur eingeschränkten Nutzung („Limited Use“).
- Du kannst die Verbindung jederzeit in Tagwerk unter Einstellungen → Datenquellen trennen oder den Zugriff unter <https://myaccount.google.com/permissions> widerrufen.

## Microsoft: Outlook, OneNote und Cloud-Speicher (optional)

Wenn du dein Microsoft-Konto verbindest, greift Tagwerk über Microsoft Graph direkt von deinem Computer aus auf die Bereiche zu, die du auswählst: Outlook-Posteingang (lesen, archivieren, löschen, markieren, antworten), Outlook-Kalender (lesen, anlegen, ändern, löschen), OneNote (lesen und Notizen speichern) und den Cloud-Speicher.

- **Cloud-Speicher:** Tagwerk speichert deine Aufgaben, Notizen, Projekte, selbst angelegten Termine, „Antwort offen“-Markierungen und Einstellungen im App-Ordner deines OneDrive („Apps/Tagwerk“), damit sie auf deinen anderen PCs verfügbar sind. Tagwerk hat dafür nur Zugriff auf diesen einen Ordner, nicht auf deine übrigen OneDrive-Dateien. E-Mails und Termine aus verbundenen Konten werden nicht in den Cloud-Speicher kopiert. Zugangsdaten werden nie hochgeladen.
- Die Anmeldung wird mit der Windows-Verschlüsselung deines Benutzerkontos gespeichert. Daten werden nicht an Dritte weitergegeben.
- Du kannst die Verbindung in Tagwerk trennen, den Cloud-Speicher pausieren, den Ordner „Apps/Tagwerk“ in OneDrive löschen oder den Zugriff unter <https://account.live.com/consent/Manage> widerrufen.

## Apple Kalender über iCloud (optional)

Wenn du deinen Apple Kalender verbindest, ruft Tagwerk mit deiner Apple-ID und einem App-spezifischen Passwort (CalDAV) deine Kalender direkt bei Apple ab und legt auf deinen Wunsch Termine an, ändert oder löscht sie. Das App-spezifische Passwort wird verschlüsselt gespeichert und kann jederzeit bei Apple widerrufen werden.

## Wetter (optional)

Für die Wetteranzeige sendet Tagwerk den von dir eingetragenen Ortsnamen an den Wetterdienst Open-Meteo (<https://open-meteo.com>), um die Vorhersage abzurufen. Es werden keine weiteren Daten übertragen.

## Claude (optional, standardmäßig aus)

Tagwerk enthält eine optionale Anbindung an Claude (Anthropic). Sie ist standardmäßig ausgeschaltet und funktioniert nur mit einem eigenen API-Schlüssel. Nur wenn du sie einschaltest und eine Anfrage stellst, werden die dafür nötigen Inhalte an Anthropic gesendet.

## Updates

Die Version aus dem Microsoft Store wird über den Microsoft Store aktualisiert. Dabei gelten die Datenschutzbestimmungen von Microsoft.

## Daten löschen

In Tagwerk unter Einstellungen → Datenschutz kannst du alle lokalen Daten löschen. Beim Deinstallieren der Store-App entfernt Windows die App-Daten.

## Kontakt

Fragen zum Datenschutz: über <https://github.com/nilsjonassell-ops/tagwerk/issues>
