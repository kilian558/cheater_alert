# Hell Let Loose Anti-Cheat Monitor

Ein automatisches Überwachungssystem für Hell Let Loose Server, das verdächtige Spieler mit hohen Kill-Raten erkennt und über Discord meldet.

## Features

- 🎯 **Automatische Erkennung** verdächtiger Spieler mit hoher KPM (Kills per Minute)
- 📊 **Live-Tracking** von Spielerstatistiken in Echtzeit
- 🤖 **Discord Integration** mit automatisch aktualisierten Embeds
- 🔨 **Ein-Klick Ban** direkt aus Discord
- ✅ **Fehlmeldungen** können markiert werden
- 🖥️ **Multi-Server Support** - Überwacht bis zu 3 Server gleichzeitig
- 💾 **SQLite Datenbank** für Session-Tracking
- 🔄 **PM2 Support** für zuverlässigen Betrieb

## Voraussetzungen

- **Linux Server** (Ubuntu/Debian empfohlen)
- **Node.js** >= 18.0.0
- **PM2** (Process Manager)
- **Discord Bot** mit Token
- **CRCON API Zugang** zu deinen Hell Let Loose Servern (Community RCON)

## Installation

### 1. Repository klonen oder Dateien hochladen

```bash
cd /home/your-user/
mkdir hll-monitor
cd hll-monitor
# Dateien hierhin kopieren
```

### 2. Dependencies installieren

```bash
npm install
```

### 3. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
nano .env
```

Fülle die `.env` Datei mit deinen Daten:

```env
# Discord Bot Configuration
DISCORD_TOKEN=dein_discord_bot_token
DISCORD_CLIENT_ID=deine_client_id
DISCORD_GUILD_ID=deine_server_id
DISCORD_CHANNEL_ID=channel_id_für_reports

# Hell Let Loose Server 1 (CRCON API)
SERVER1_NAME=Server 1
SERVER1_API_URL=https://gbg-hll.com:64301
SERVER1_API_TOKEN=your_crcon_api_token

# Hell Let Loose Server 2 (CRCON API)
SERVER2_NAME=Server 2
SERVER2_API_URL=https://gbg-hll.com:64302
SERVER2_API_TOKEN=your_crcon_api_token

# Hell Let Loose Server 3 (CRCON API)
SERVER3_NAME=Server 3
SERVER3_API_URL=https://gbg-hll.com:64303
SERVER3_API_TOKEN=your_crcon_api_token

# Detection Settings
MAX_LEVEL_TO_TRACK=100
MIN_KILLS_TO_TRIGGER=25
MIN_PLAYTIME_MINUTES=15
SUSPICIOUS_KPM_THRESHOLD=2.5
SUSPICIOUS_KPM_NO_VEHICLES=2.0

# Check Interval (in seconds)
CHECK_INTERVAL=30

# Blacklist Configuration
BLACKLIST_ID=1
```

## CRCON API Setup

Dieses System nutzt die **CRCON (Community RCON) REST API** statt dem traditionellen RCON Protokoll.

### Wichtig: Blacklist statt direktem Ban

Das System verwendet **CRCON Blacklists** statt direkter Bans:
- ✅ **Serverübergreifend** - Ein Ban gilt für alle Server mit derselben Blacklist
- ✅ **Zentralisiert** - CRCON managed die Bans
- ✅ **Automatischer Kick** - Spieler wird sofort gekickt und kann nicht mehr joinen
- ✅ **Appeal System** - Ban-Grund verweist auf gbg-hll.com für Appeals

**Ban-Ablauf:**
1. Spieler wird zur CRCON Blacklist hinzugefügt (permanent)
2. Grund: "Cheat alert appeal on gbg-hll.com"
3. Spieler wird automatisch gekickt falls noch online
4. Blacklist verhindert Rejoin auf allen konfigurierten Servern

### CRCON API Zugang einrichten:

1. Du brauchst Zugang zu einer CRCON Installation für deine HLL Server
2. Erstelle einen **API Token** in CRCON:
   - Gehe zu Settings → API Access
   - Erstelle einen neuen API Token
   - Wähle die benötigten Permissions:
     * `api.can_view_get_players`
     * `api.can_view_live_scoreboard`
     * `api.can_view_gamestate`
     * `api.can_add_blacklist_records` (für Bans)
     * `api.can_view_blacklists`
     * `api.can_kick_players`
   - Kopiere den generierten Token

3. Richte eine Blacklist ein (oder nutze die Default Blacklist ID 1)
4. Trage die API URL, den API Token und Blacklist ID in die `.env` ein

### API Endpoints die verwendet werden:

- `/api/get_live_scoreboard` - Echtzeit Spieler-Stats mit Waffen
- `/api/get_gamestate` - Map, Mode, Scores
- `/api/get_detailed_player_info` - Detaillierte Spieler-Infos
- `/api/add_blacklist_record` - Spieler zur Blacklist hinzufügen (serverübergreifend!)
- `/api/kick` - Spieler vom Server kicken

## Discord Bot Setup

### 1. Discord Bot erstellen

1. Gehe zu [Discord Developer Portal](https://discord.com/developers/applications)
2. Klicke auf "New Application"
3. Gib einen Namen ein (z.B. "HLL Anti-Cheat")
4. Gehe zu "Bot" im Menü
5. Klicke auf "Add Bot"
6. Kopiere den Bot Token
7. Aktiviere unter "Privileged Gateway Intents":
   - ✅ SERVER MEMBERS INTENT
   - ✅ MESSAGE CONTENT INTENT

### 2. Bot einladen

1. Gehe zu "OAuth2" > "URL Generator"
2. Wähle unter "Scopes":
   - ✅ `bot`
   - ✅ `applications.commands`
3. Wähle unter "Bot Permissions":
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Read Message History
4. Kopiere die URL und öffne sie im Browser
5. Wähle deinen Server aus

### 3. Channel ID erhalten

1. Aktiviere den Developer Mode in Discord (Benutzereinstellungen > Erweitert > Entwicklermodus)
2. Rechtsklick auf den Channel wo Reports erscheinen sollen
3. "ID kopieren"

## Verwendung

### Mit PM2 starten (empfohlen)

```bash
# PM2 global installieren (falls noch nicht vorhanden)
npm install -g pm2

# Bot starten
pm2 start ecosystem.config.js

# Status prüfen
pm2 status
Spieler-Erkennung

Der Bot überwacht alle Spieler auf den konfigurierten Servern und trackt:
- Spieler unter Level 100 (konfigurierbar)
- Kills pro Minute (KPM) - Overall und Rolling (5min)
- Waffen-Statistiken (aus CRCON Live Scoreboard)
- Spielzeit
- Combat Scorearten
pm2 restart hll-anticheat-monitor

# Autostart beim Systemstart (als Root)
pm2 startup
pm2 save
```

### Manuell starten (zum Testen)

```bash
npm start
```

## Funktionsweise

### 1. Spieler-Erkennung

Der Bot überwacht alle Spieler auf den konfigurierten Servern und trackt:
- Spieler unter Level 100 (konfigurierbar)
- Kills pro Minute (KPM)
- Rolling KPM (letzte 5 Minuten)
- Waffen-Statistiken
- Spielzeit

### 2. Schwellenwerte

Ein Spieler wird als verdächtig eingestuft wenn:
- **Mindestens 15 Minuten Spielzeit** ODER **25 Kills** erreicht sind
- **KPM >= 2.5** (konfigurierbar)
- **Level unter 100** (konfigurierbar)

### 3. Discord Meldung

Bei Erkennung wird ein Discord Embed gepostet mit:
- Spielername und Steam ID
- Level und Klasse
- Spielzeit
- Kills und Deaths
- Overall und Rolling KPM
- Waffen-Breakdown
- 2 Buttons: **Ban** und **False Positive**

### 4. Live-Updates

Das Embed wird alle 30 Sekunden aktualisiert mit den neuesten Stats, bis:
- Der Spieler gebannt wird (Ban Button → Zur Blacklist hinzugefügt → Gekickt)
- Als Fehlmeldung markiert wird (False Positive Button)
- Der Spieler den Server verlässt

**Ban-Prozess:**
1. Admin klickt "Ban Player" Button
2. Spieler wird zur CRCON Blacklist hinzugefügt (permanent)
3. Ban-Grund: "Cheat alert appeal on gbg-hll.com"
4. Spieler wird automatisch vom Server gekickt
5. Ban gilt **serverübergreifend** für alle Server mit derselben Blacklist

## Beispiel Discord Embed

```
⚠️ CRCON Watch KillRate Alert

Server 01 - Hamburg
```
Current Match
St. Mere Eglise Warfare
```

👤 Player: G I|I Fred._.
🆔 Player ID: 76561198177013833
📊 Player Level: 50

🎖️ Class: Rifleman
⏱️ Playtime: 0:45:29
💀 Kills: 58

📈 Overall KPM: 1.3
📊 Rolling KPM (5min): 2.8
☠️ Deaths: 12

🔫 Weapons:
```
M1 GARAND: 32
STRAFING RUN: 6
BOMBING RUN: 10
UNKNOWN: 10
```

[🔨 Ban Player] [✅ False Positive]
```

## Konfiguration

### Detection Settings erklärt

| `BLACKLIST_ID` | CRCON Blacklist ID | 1 |
| Variable | Beschreibung | Standard |
|----------|--------------|----------|
| `MAX_LEVEL_TO_TRACK` | Max. Level das überwacht wird | 100 |
| `MIN_KILLS_TO_TRIGGER` | Mindest-Kills für Alert | 25 |
| `MIN_PLAYTIME_MINUTES` | Mindest-Spielzeit für Alert | 15 |
| `SUSPICIOUS_KPM_THRESHOLD` | KPM Schwellenwert | 2.5 |
| `CHECK_INTERVAL` | Prüfintervall in Sekunden | 30 |

### Tipps zur Feinabstimmung

- **Zu viele False Positives?** → Erhöhe `SUSPICIOUS_KPM_THRESHOLD` auf 3.0
- **Zu weCRCON API Zugang mit `curl` oder Postman:
   ```bash
   curl -u username:password https://your-crcon-url:64301/api/get_gamestate
   ```

### Keine Discord Nachrichten

1. Prüfe ob Bot im Server ist
2. Prüfe Bot-Permissions (Send Messages, Embed Links)
3. Prüfe Channel ID in `.env`

### CRCON API Verbindung schlägt fehl

1. Teste API URL im Browser: `https://your-crcon-url:64301`
2. Prüfe API Token (nicht abgelaufen?)
3. Verifiziere dass der Token die nötigen API Permissions hat
4. Bei Self-Signed Certificates: SSL-Fehler sind normal (werden ignoriert)
tail -f logs/out.log
tail -f logs/error.log
```

## Troubleshooting

### Bot startet nicht

1. Prüfe `.env` Datei auf Fehler
2. Teste Discord Token: `node -e "require('discord.js'); const client = new require('discord.js').Client({intents:[]}); client.login('DEIN_TOKEN');"`
3. Prüfe RCON Zugangsdaten mit Tools wie `rcon-cli`

### Keine Discord Nachrichten

1. Prüfe ob Bot im Server ist
2. Prüfe Bot-Permissions (Send Messages, Embed Links)
3. Prüfe Channel ID in `.env`

### RCON Verbindung schlägt fehl

1. Teste RCON Port mit `telnet SERVER_IP RCON_PORT`
2. Prüfe Firewall-Regeln
3. Verifiziere RCON Passwort

### Spieler werden nicht erkannt

1. Reduziere `SUSPICIOUS_KPM_THRESHOLD` für Tests
2. Reduziere `MIN_PLAYTIME_MINUTES` auf 5 für Tests
3. Prüfe Logs: `pm2 logs hll-anticheat-monitor`

## Datenbank

Das System verwendet SQLite und erstellt automatisch `players.db` mit folgenden Tabellen:

- `player_sessions` - Spieler-Sessions mit Stats
- `weapon_stats` - Waffen-Details pro Session
- `discord_messages` - Zuordnung von Sessions zu Discord Messages

## Sicherheit

⚠️ **Wichtig**: Die `.env` Datei enthält sensible Daten!

```bash
# Setze korrekte Berechtigungen
chmod 600 .env
```

Füge `.env` zu `.gitignore` hinzu (bereits enthalten).

## Support

Bei Problemen oder Fragen:
1. Prüfe die Logs: `pm2 logs hll-anticheat-monitor`
2. Aktiviere Debug-Modus (siehe Code-Kommentare)
3. Erstelle ein Issue mit Log-Auszügen

## Lizenz

MIT License

## Credits

Entwickelt für die Hell Let Loose Community
Basierend auf RCON API und Discord.js

---

**Hinweis**: Dieses Tool ist zur Unterstützung der Server-Administration gedacht. Manuelle Überprüfung verdächtiger Spieler wird empfohlen.
