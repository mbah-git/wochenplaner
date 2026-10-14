# WochenPlaner

Web-App, um die Mahlzeiten der Woche zu planen, Rezepte zu sammeln und die Einkaufsliste auf dem Handy abzuhaken.

**Stack:** Node.js 20 (Express 5) · EJS (Server-Rendering) · MySQL/MariaDB · Sessions in MySQL

## Funktionen

- Registrierung & Login (bcrypt-Passwörter, Sessions in der Datenbank, CSRF-Schutz, Rate-Limit)
- „Passwort vergessen?“ mit Einmal-Link per E-Mail
- **Rezepte:** Name, Portionen, Tags, Link zur Quelle, Zutaten und Zubereitung. Zutaten werden Zeile für
  Zeile erfasst („200 g Mehl“, „1½ dl Rahm“, „2 Zehen Knoblauch“, „Salz“) und in Menge, Einheit und Zutat
  zerlegt. Suche (auch in Zutaten), Filter nach Tag, Portionen-Rechner auf der Rezeptseite.
- **Wochenplan:** pro Tag Mittag- und Abendessen, Rezept zuweisen oder Freitext („Pizza bestellen“),
  Portionen pro Mahlzeit, Woche vor/zurück blättern, „Vorwoche übernehmen“, direkt aus einem Rezept einplanen
- **Einkaufsliste:** automatisch aus dem Wochenplan erzeugt. Gleiche Zutaten werden zusammengezählt
  (g/kg und ml/dl/l werden umgerechnet, „Tomate“ = „Tomaten“), Mengen nach Portionen skaliert und nach
  Kategorie in Einkaufsreihenfolge sortiert. Eigene Einträge („2 l Milch“), abhaken ohne Neuladen,
  „Erledigte ausblenden“, „Ab heute“. Kategorien lassen sich ändern; der Haushalt merkt sich das.
- **Haushalt:** mehrere Benutzer teilen Rezepte, Plan und Liste. Beitritt per Einladungscode oder -link
  (bei der Registrierung oder unter „Konto“).
- Admin-Bereich: Benutzer anlegen (auch direkt in einen Haushalt), sperren/entsperren, zum Admin machen,
  Passwörter setzen, löschen, Haushalte im Überblick, Test-E-Mail
- Mobile-first mit Tableiste unten, installierbar als App (PWA), Offline-Hinweis, Dark Mode
- Wöchentliches Datenbank-Backup per Cron-Job

## Projektstruktur

```
app.js                  Einstiegspunkt (auch für cPanel/Passenger)
db/schema.sql           Tabellen (idempotent)
scripts/migrate.js      npm run migrate    – legt Tabellen an
scripts/seed.js         npm run seed       – Admin-User, 10 Testrezepte, Wochenplan der laufenden Woche
scripts/backup-db.js    npm run backup     – Datenbank-Backup (Cron-Job)
scripts/dev-memory.js   npm run dev:memory – lokal ohne MySQL (In-Memory-Datenbank)
src/                    Konfiguration, DB-Pool, Middleware, Routen, Zutaten-/Kategorie-Logik
views/                  EJS-Templates
public/                 CSS, JS, Icons, Service Worker
```

## PWA

- `manifest.webmanifest` und `sw.js` werden von `app.js` unter `BASE_PATH` ausgeliefert, die Icons liegen in `public/icons/`.
- Der Service Worker cached nur statische Dateien. Seiten kommen immer frisch vom Server, weil sie
  Benutzerdaten und CSRF-Tokens enthalten. Ohne Verbindung erscheint `public/offline.html`.
- Werden Dateien in der Liste `PRECACHE` in `public/sw.js` geändert, `VERSION` dort hochzählen.

## Konfiguration

Alle Einstellungen kommen aus Umgebungsvariablen, siehe [.env.example](.env.example).
Zugangsdaten gehören **nie** ins Repository: Die `.env` ist per `.gitignore` ausgeschlossen.
Die App und die Skripte laden die `.env` im Projektordner; Werte aus cPanel haben Vorrang.

| Variable | Beschreibung |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL-Verbindung (bei cPanel mit Präfix `<cpanel-user>_`) |
| `SESSION_SECRET` | **Pflicht.** Langer Zufallswert zum Signieren der Session-Cookies |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Admin-User, den `npm run seed` anlegt bzw. aktualisiert |
| `APP_URL` | Öffentliche Adresse für Links in E-Mails und Einladungslinks |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Mailversand für „Passwort vergessen?“ (Port 465 = SSL) |
| `BASE_PATH` | Optional, wenn die App in einem Unterordner läuft, z. B. `/wochenplaner` |
| `ALLOW_REGISTRATION` | `false` schaltet die öffentliche Registrierung ab |
| `SEED_DEMO_USER` | `false` = kein Demo-Benutzer beim Seed |
| `BACKUP_DIR`, `BACKUP_KEEP` | Zielordner (Standard `~/backups/wochenplaner`) und Anzahl Backups (Standard 8) |

Datenbank-Änderungen spielt die App beim Start selbst ein (`npm run migrate` geht weiterhin).

## Deployment auf Namecheap (cPanel)

Platzhalter: `<cpanel-user>` = dein cPanel-Benutzername, `<github-user>` = GitHub-Konto des Repos.

### 1. Subdomain und Datenbank

1. cPanel → **Domains** → *Create A New Domain*: die Subdomain anlegen (Häkchen „Share document root“ entfernen).
   Danach unter **SSL/TLS Status** → *Run AutoSSL*, damit HTTPS funktioniert.
2. cPanel → **MySQL® Databases**: Datenbank `<cpanel-user>_wochenplaner` und Benutzer
   `<cpanel-user>_wochenplaner` anlegen, Benutzer mit **ALL PRIVILEGES** zur Datenbank hinzufügen.

### 2. Repository auf den Server klonen

Das GitHub-Repo ist privat. GitHub erlaubt einen Deploy-Key nur für **ein** Repository – ist der
cPanel-Schlüssel schon bei einem anderen Repo eingetragen, braucht es einen zweiten:

1. cPanel → **SSH Access** → *Manage SSH Keys* → *Generate a New Key*, Name z. B. `wochenplaner_deploy`,
   ohne Passphrase. Danach unter *Public Keys* → *View/Download* den Key kopieren.
2. GitHub → Repo → **Settings → Deploy keys → Add deploy key** → Key einfügen (nur Lesezugriff).
3. cPanel → **Terminal**, eine SSH-Zuordnung für diesen Key anlegen und testen:
   ```bash
   printf 'Host github-wochenplaner\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/wochenplaner_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config && chmod 600 ~/.ssh/config && ssh -T git@github-wochenplaner
   ```
   Erwartet: „Hi <github-user>/wochenplaner! You've successfully authenticated …“
4. cPanel → **Git™ Version Control** → *Create*
   - Clone URL: `git@github-wochenplaner:<github-user>/wochenplaner.git`
   - Repository Path: `repositories/wochenplaner`

### 3. Node.js-App einrichten

cPanel → **Setup Node.js App** → *Create Application*

| Feld | Wert |
|---|---|
| Node.js version | 20 |
| Application mode | Production |
| Application root | `repositories/wochenplaner` |
| Application URL | die Subdomain aus Schritt 1 |
| Application startup file | `app.js` |

*Create* klicken, dann **Run NPM Install**.

### 4. `.env` auf dem Server

cPanel → **File Manager** → `repositories/wochenplaner` (versteckte Dateien anzeigen) → `.env.example`
kopieren als `.env` und ausfüllen: `DB_*`, `SESSION_SECRET` (Pflicht, sonst Error 503), `ADMIN_*`,
`APP_URL`, `SMTP_*`, `MAIL_FROM`. Die `.env` gilt für die App **und** für Cron-Jobs (die sehen die
Umgebungsvariablen aus „Setup Node.js App“ nicht).

### 5. Datenbank anlegen, Admin und Testdaten

cPanel → **Terminal**:

```bash
source /home/<cpanel-user>/nodevenv/repositories/wochenplaner/20/bin/activate && cd ~/repositories/wochenplaner && npm run setup
```

Das legt alle Tabellen an, den Admin aus `ADMIN_EMAIL` / `ADMIN_PASSWORD` mit eigenem Haushalt,
10 Testrezepte, einen gefüllten Wochenplan für die laufende Woche und einen Demo-Benutzer im selben
Haushalt. Ein erneuter Lauf setzt das Admin-Passwort zurück und legt keine doppelten Testdaten an.

### 6. Neustart

Der Server läuft mit LiteSpeed; der Restart-Button beendet den alten Prozess nicht zuverlässig. Sicher ist
im **Terminal**:

```bash
pkill -u <cpanel-user> -f lsnode
```

(Das startet alle Node-Apps des Kontos beim nächsten Aufruf neu.) Fehler stehen in `stderr.log` im App-Ordner.

### 7. Updates einspielen

1. Lokal committen und nach GitHub pushen.
2. cPanel → **Git™ Version Control** → *Manage* → *Pull or Deploy* → **Update from Remote**.
3. Bei neuen Abhängigkeiten: **Setup Node.js App** → *Run NPM Install*.
4. Neustart wie in Schritt 6. Kontrolle: Neue Seiten-Inhalte sind sichtbar (statische Dateien allein beweisen den Neustart nicht).

### 8. Wöchentliches Datenbank-Backup

cPanel → **Cron Jobs** → *Add New Cron Job*, *Once Per Week* (`0 3 * * 0`), Befehl:

```bash
{ . /home/<cpanel-user>/nodevenv/repositories/wochenplaner/20/bin/activate && cd /home/<cpanel-user>/repositories/wochenplaner && npm run --silent backup; } >> /home/<cpanel-user>/wochenplaner-backup.log 2>&1
```

Die Backups liegen in `~/backups/wochenplaner/` (die letzten 8). Wiederherstellen: phpMyAdmin → Datenbank
wählen → *Importieren* → `.sql.gz`-Datei.

## Lokale Entwicklung

### Ohne Datenbank (In-Memory)

Voraussetzung: Node.js 22.5 oder neuer (nutzt das eingebaute SQLite).

```bash
npm install
npm run dev:memory
```

Die App läuft auf http://localhost:3000 mit Testdaten; Zugangsdaten stehen in der Konsole und in
`scripts/dev-memory.js`. E-Mails (z. B. „Passwort vergessen?“) erscheinen in der Konsole.
MySQL-spezifische Befehle werden dafür übersetzt; vor einem Deploy mit Schema-Änderungen trotzdem
einmal gegen MySQL testen.

### Mit MySQL

`.env` aus `.env.example` erstellen und auf eine lokale MySQL/MariaDB zeigen lassen, dann:

```bash
npm run setup
npm run dev
```
