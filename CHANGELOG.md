# Hell Let Loose Anti-Cheat Monitor - CHANGELOG

## Version 2.4.3 - True Zero Stats Reset

### 🎯 Änderungen

#### Stats werden bei Script-Start und Match-Reset auf 0 gesetzt
- **Vorher**: System nutzte Baseline-Subtraktion (showValue = currentKills - startKills)
- **Nachher**: Stats sind tatsächlich auf 0 gesetzt, nicht nur kalkuliert
- **Betroffen**: Session Kills, Session Deaths, alle Statistiken
- **Verhalten**:
  - Bei Script-Start: Alle Stats starten bei 0 (nicht bei aktuellen API-Werten)
  - Bei Map-Wechsel: Alle Stats werden auf 0 zurückgesetzt (nicht Baseline verschoben)
  - Nur neue Kills/Deaths ab Tracking-Start werden gezählt

### 🔧 Technical Changes

- `startTracking()`: Initialisiert mit 0 statt API-Werten + `isFirstUpdate` Flag
- `updatePlayer()`: Erstes Update setzt Baseline ohne historische Kills zu zählen
- `resetServerSessions()`: Verschiebt Baseline für True-Zero-Effekt bei Match-Reset

---

## Version 2.4.2 - Playtime Reset bei Map-Wechsel

### 🎯 Änderungen

#### Spielzeit wird bei Map-Wechsel zurückgesetzt
- **Vorher**: Spielzeit lief über mehrere Maps weiter
- **Nachher**: Spielzeit startet bei neuer Map wieder bei 0:00:00
- **Methode**: `resetServerSessions()` in PlayerTracker

### 🔧 Technical Changes

- Neue Methode `playerTracker.resetServerSessions(serverName)`
- Map-Wechsel-Erkennung ruft Reset-Methode auf
- Resettet: `startTime`, `startKills`, `startDeaths`, `killHistory`

---

## Version 2.4.1 - False Positive Fix & Session Playtime

### 🎯 Änderungen

#### 1. False Positive Embeds werden nicht mehr geupdated
- **Problem**: Embed wurde weiter aktualisiert nach "False Positive" Button-Click
- **Lösung**: Tracking für als "False Positive" markierte Spieler wird gestoppt
- **Verhalten**: Nach Button-Click keine weiteren Updates für diesen Spieler

#### 2. Spielzeit zeigt NUR aktuelle Session
- **Vorher**: Zeigte Gesamte Serverzeit des Spielers (z.B. 50:00:00)
- **Nachher**: Zeigt nur Spielzeit seit Bot-Start / Match-Start (Session Zeit)
- **Konsequenz**: Playtime ist jetzt konsistent mit Session Kills/Deaths

### 🔧 Technical Changes

- False Positive Tracking in `index.js` (Set-basiert)
- Session-basierte Playtime-Berechnung in `getPlayerStats()`

---

## Version 2.4.0 - Separate KPM Thresholds & K/D Ratio

### 🎯 Neue Features

#### 1. Getrennte KPM Schwellwerte
- **OVERALL_KPM_THRESHOLD=1.25**: KPM für die gesamte Session (seit Bot-Start)
- **ROLLING_KPM_THRESHOLD=3.0**: KPM der letzten 5 Minuten (Killstreak-Erkennung)
- **Beide müssen überschritten sein** für einen Alert
- **Vorteil**: Erkennt Cheater mit anfangs normaler KPM aber plötzlichem Anstieg

#### 2. K/D Ratio im Embed
- Zeigt Kill/Death Verhältnis
- Format: `2.50` (2.5 Kills pro Death)
- Bei 0 Deaths: Zeigt nur Kills (z.B. `5.00`)

#### 3. Session-Only Stats
- **Alle Stats** nur für aktuelle Session (seit Bot-Start)
- Nicht mehr Total Server Stats
- Konsistent: Session Kills, Session Deaths, Session KPM, Session Playtime

#### 4. Rollen-Anzeige korrigiert
- Nutzt `/api/get_team_view` für korrekte Rollen
- **Problem behoben**: "unknown" Rollen und Artillerie-Spieler wurden nicht gefiltert

#### 5. Combat Score entfernt
- War meist leer und nicht nützlich
- Platz für wichtigere Stats

### 🔧 Technical Changes

- Separate KPM Berechnung: Overall (Session) vs Rolling (5min)
- K/D Ratio Berechnung in `getPlayerStats()`
- Combat Score aus Discord Embed entfernt

---

## Version 2.3.1 - Discord Embed Fixes & Daily Alert Limit

### 🎯 Änderungen

#### 1. Discord Embed Stats korrigiert
- **Problem**: Zeigte Total Kills statt Session Kills
- **Fix**: Nutzt jetzt `stats.sessionKills` und `stats.sessionDeaths`

#### 2. Map Name formatiert
- **Vorher**: "utah_beach_warfare"
- **Nachher**: "Utah Beach Warfare" (pretty name)

#### 3. Daily Alert Limit
- **Pro Spieler nur 1 Alert pro Tag**
- Verhindert Spam bei mehrfachen Detektionen
- Embed wird weiterhin aktualisiert bis Match-Ende / Intervention

### 🔧 Technical Changes

- Alert-Tracking in `index.js` (Map mit Timestamps)
- Pretty-Name Formatierung für Maps
- Session-basierte Stats im Embed

---

## Version 2.3.0 - Level & Rollen-Filter mit Caching

### 🎯 Neue Features

#### 1. Level-Filter mit API-Integration
- **Problem gelöst**: CRCON v11+ hat `level`-Feld aus Scoreboard entfernt
- **Lösung**: Nutzt `/api/get_detailed_player_info` mit intelligentem Caching
- **Performance**: Cache reduziert API-Last von 100+ auf ~3-5 Calls pro Check
- **Konfiguration**:
  - `ENABLE_LEVEL_CHECK=true/false` - Level-Check aktivieren/deaktivieren
  - `LEVEL_CACHE_DURATION_MINUTES=30` - Cache-Dauer (Standard: 30min)

#### 2. Rollen-Filter (Tank/Artillerie ausschließen)
- **Problem gelöst**: Tank/Arti-Spieler haben natürlich höhere KPM
- **Lösung**: Nutzt `/api/get_team_view` um Spieler-Rollen zu prüfen
- **Performance**: Nur 1 zusätzlicher API-Call für alle Spieler (cached 25s)
- **Konfiguration**:
  - `EXCLUDE_TANK_ROLES=true` - Panzer-Rollen ausschließen
  - `EXCLUDE_ARTILLERY_ROLES=true` - Artillerie-Rollen ausschließen
  - `EXCLUDED_ROLES=tankcommander,crewman,spotter` - Anpassbare Rollenliste
  - `ROLE_CACHE_DURATION_SECONDS=25` - Cache-Dauer

#### 3. Automatischer PM2 Restart
- **Täglicher Neustart um 4:30 Uhr** via PM2 Cron
- Cleant automatisch alle Caches
- Verhindert Memory-Leaks bei langem Betrieb

### 🔧 Technical Changes

**rconClient.js**:
- ✨ `getPlayerLevel(steamId, cacheDuration)` - Level mit Cache
- ✨ `getTeamView(cacheDuration)` - Team View mit Cache
- ✨ `getPlayerRole(steamId)` - Spieler-Rolle aus Team View
- ✨ `clearOldCache()` - Automatisches Cache-Cleanup
- 🔄 `levelCache` Map für performantes Level-Caching
- 🔄 `teamViewCache` für Rollen-Caching

**index.js**:
- 🔄 `checkPlayer()` erweitert mit Rollen- und Level-Filter
- 🔄 Config erweitert um Level- und Rollen-Optionen
- 📊 Detaillierte Startup-Logs für neue Features

**ecosystem.config.js**:
- ✨ `cron_restart: '30 4 * * *'` - Täglicher Restart um 4:30

### 📝 Configuration Changes

**Neue .env Variablen**:
```env
# Level Check
ENABLE_LEVEL_CHECK=true
LEVEL_CACHE_DURATION_MINUTES=30

# Role Filter
EXCLUDE_TANK_ROLES=true
EXCLUDE_ARTILLERY_ROLES=true
EXCLUDED_ROLES=tankcommander,crewman,spotter
ROLE_CACHE_DURATION_SECONDS=25
```

### 📊 Performance Impact

**v2.2.0 (ohne neue Features)**:
- API-Calls pro Check: 1
- Level-Check: ❌ Nicht möglich
- Rollen-Check: ❌ Nicht möglich

**v2.3.0 (mit allen Features aktiv)**:
- API-Calls pro Check: 2-4
  - 1x get_live_scoreboard
  - 1x get_team_view (cached)
  - 0-3x get_detailed_player_info (nur neue Spieler, cached)
- Level-Check: ✅ Funktioniert
- Rollen-Check: ✅ Funktioniert

**Ergebnis**: +1-3 API-Calls, aber deutlich genauere Erkennung!

### 🐛 Bug Fixes

- ✅ Level zeigt jetzt echte Werte statt 0
- ✅ Tank/Arti-Spieler werden korrekt ausgefiltert
- ✅ Cache verhindert excessive API-Load

### 📖 Documentation

- ✨ Neue Datei: `FEATURES-v2.3.0.md` - Detaillierte Feature-Dokumentation
- ✨ Neue Datei: `API-LEVEL-ROLE-INFO.md` - API-Struktur Dokumentation
- ✨ Neue Datei: `test-level-role-api.js` - Test-Tool für neue Features
- 🔄 `.env.example` - Erweitert mit neuen Optionen
- 🔄 `.env.production.example` - Erweitert mit Erklärungen

### ⚠️ Migration Guide v2.2.0 → v2.3.0

1. **Code aktualisieren**:
   ```bash
   cd /home/kilian/cheater_alert
   git pull
   ```

2. **.env erweitern** (optional, Features haben sinnvolle Defaults):
   ```bash
   nano .env
   # Füge hinzu:
   ENABLE_LEVEL_CHECK=true
   LEVEL_CACHE_DURATION_MINUTES=30
   EXCLUDE_TANK_ROLES=true
   EXCLUDE_ARTILLERY_ROLES=true
   EXCLUDED_ROLES=tankcommander,crewman,spotter
   ROLE_CACHE_DURATION_SECONDS=25
   ```

3. **PM2 neu starten**:
   ```bash
   pm2 restart hll-anticheat-monitor
   pm2 logs --lines 50
   ```

4. **Logs prüfen** auf:
   ```
   Level-Check aktiviert: true (Cache: 30min)
   Rollen-Filter: Tank=true, Artillerie=true
   ```

### 🧪 Testing

Neues Test-Tool verfügbar:
```bash
node test-level-role-api.js
```

Zeigt verfügbare Level- und Rollen-Daten aus CRCON API.

---

## Version 2.2.0 - API Token Authentication

### 🔐 Breaking Changes

- **API Token statt Username/Passwort**
  - Verwendet jetzt Bearer Token Authentifizierung  
  - Sicherer als Basic Auth mit Username/Passwort
  - `.env` Variablen geändert: `SERVER*_USERNAME` und `SERVER*_PASSWORD` → `SERVER*_API_TOKEN`

### ✨ Configuration Changes

- **Neue .env Variablen:**
  - `SERVER1_API_TOKEN` (vorher: SERVER1_USERNAME + SERVER1_PASSWORD)
  - `SERVER2_API_TOKEN` (vorher: SERVER2_USERNAME + SERVER2_PASSWORD)
  - `SERVER3_API_TOKEN` (vorher: SERVER3_USERNAME + SERVER3_PASSWORD)

### 🛠️ Technical Changes

- `CRCONApiClient` constructor: Verwendet jetzt `apiToken` statt `username` + `password`
- HTTP Header: `Authorization: Bearer TOKEN` statt `Basic Auth`
- Kein Login-Endpoint mehr nötig
- Vereinfachte Verbindungslogik

### 📝 Documentation Updates

- README.md: Token-Generierung in CRCON erklärt
- CRCON-SETUP.md: API Token Erstellung dokumentiert
- QUICKSTART.md: Beispiele aktualisiert
- test-crcon-api.js: Verwendet Bearer Token

### ⚠️ Migration Guide

Wenn du von v2.1.0 updatest:

1. Generiere API Token in CRCON (Settings → API Access)
2. Aktualisiere `.env`:
   ```bash
   # Alt:
   SERVER1_USERNAME=admin
   SERVER1_PASSWORD=password123
   
   # Neu:
   SERVER1_API_TOKEN=your_generated_token_here
   ```
3. Restart: `pm2 restart hll-anticheat-monitor`

---

## Version 2.1.0 - Blacklist System

### 🚀 Major Changes

- **Blacklist statt Direct Ban**
  - Verwendet CRCON Blacklist API (`add_blacklist_record`) statt `perma_ban`
  - **Serverübergreifend** - Ein Ban gilt für alle Server
  - Automatic Kick nach Blacklist-Eintrag
  - Ban-Grund: "Cheat alert appeal on gbg-hll.com"

### ✨ New Features

- **Cross-Server Bans**
  - Spieler wird zur CRCON Blacklist hinzugefügt (permanent)
  - Alle Server mit derselben Blacklist bannen automatisch
  - Zentralisierte Ban-Verwaltung über CRCON

- **Automatic Kick**
  - Nach Blacklist-Eintrag wird Spieler automatisch gekickt
  - Falls Spieler offline: Blacklist verhindert Rejoin
  - Graceful Fallback bei Kick-Fehlern

- **Appeal System Integration**
  - Ban-Grund verweist auf gbg-hll.com
  - Spieler sehen wo sie Appeal stellen können
  - Konsistenter Ban-Grund über alle Bans

### 🛠️ Technical Changes

- **New API Endpoints:**
  - `POST /api/add_blacklist_record` - Zur Blacklist hinzufügen
  - `POST /api/kick` - Spieler kicken
  
- **Removed API Endpoints:**
  - `POST /api/perma_ban` - Nicht mehr verwendet
  - `POST /api/temp_ban` - Nicht mehr verwendet

- **New Configuration:**
  - `BLACKLIST_ID` in .env - CRCON Blacklist ID (Standard: 1)

### 📦 New Files

- `BLACKLIST-SYSTEM.md` - Komplette Blacklist Dokumentation

### 🔧 Required CRCON Permissions (Updated)

```
✅ api.can_view_blacklists (NEW)
✅ api.can_add_blacklist_records (NEW - replaces can_perma_ban_players)
✅ api.can_kick_players (NEW)
❌ api.can_perma_ban_players (nicht mehr benötigt)
❌ api.can_temp_ban_players (nicht mehr benötigt)
```

### 📝 Configuration Changes

**NEW in .env:**
```env
# Blacklist ID aus CRCON (Standard: 1)
BLACKLIST_ID=1
```

### ⚠️ Breaking Changes

- **Permissions geändert** - Nutzer brauchen Blacklist-Permissions statt Ban-Permissions
- **Ban-Verhalten geändert** - Serverübergreifend statt per-Server
- **Ban-Grund fixiert** - Immer "Cheat alert appeal on gbg-hll.com"

### 🎯 Migration from v2.0.0

1. Update CRCON User Permissions
2. Füge `BLACKLIST_ID=1` zur `.env` hinzu
3. Prüfe Blacklist Setup in CRCON
4. Teste mit `npm run test`
5. Restart Bot: `pm2 restart hll-anticheat-monitor`

### 🐛 Bug Fixes

- Fixed: Bans waren nicht serverübergreifend
- Fixed: Spieler konnten nach Ban auf anderen Servern joinen
- Fixed: Keine zentrale Ban-Verwaltung

### 📚 Documentation Updates

- README.md aktualisiert für Blacklist-System
- CRCON-SETUP.md erweitert mit Blacklist-Anleitung
- Neue BLACKLIST-SYSTEM.md mit vollständiger Doku
- test-crcon-api.js testet jetzt auch Blacklists

---

## Version 2.0.0 - CRCON API Integration

### 🚀 Major Changes

- **CRCON REST API Integration**
  - Ersetzt traditionelles RCON Protokoll durch moderne REST API
  - Nutzt Community RCON (CRCON) für bessere Performance und mehr Daten
  - Unterstützt die Server: https://gbg-hll.com:64301-64303

### ✨ New Features

- **Real-time Weapon Tracking**
  - Zeigt alle verwendeten Waffen mit Kill-Counts
  - Direkt aus CRCON Live Scoreboard
  - Automatische Sortierung nach Kills

- **Combat Score Tracking**
  - Zeigt Combat/Offense/Defense/Support Scores
  - Zusätzliche Metrik für Cheat-Erkennung

- **Improved Player Stats**
  - Live Scoreboard statt verzögerte RCON Daten
  - Präzisere KPM Berechnung
  - Kill Streak Tracking

- **Better API Error Handling**
  - Automatisches Retry bei Connection Errors
  - SSL Certificate Validation Bypass für Self-Signed Certs
  - Detaillierte Error Logs

### 🛠️ Technical Improvements

- **Removed Dependencies**
  - `node-rcon` entfernt (nicht mehr benötigt)
  - Native HTTPS statt external RCON library
  - Kleineres Package, weniger Fehleranfälligkeit

- **New Test Script**
  - `npm run test` testet alle CRCON Verbindungen
  - Zeigt detaillierte Connection Info
  - Validiert API Permissions

- **Better Configuration**
  - `.env.production.example` mit echten Server URLs
  - `CRCON-SETUP.md` mit kompletter Setup-Anleitung
  - Mehr Kommentare und Erklärungen

### 📦 New Files

- `test-crcon-api.js` - API Connection Test Script
- `CRCON-SETUP.md` - Detaillierte CRCON Setup Anleitung
- `.env.production.example` - Production-Ready Config Beispiel

### 🔧 API Endpoints Used

- `GET /api/get_live_scoreboard` - Real-time player stats
- `GET /api/get_gamestate` - Map, mode, scores
- `GET /api/get_detailed_player_info` - Detailed player info
- `POST /api/perma_ban` - Permanent bans
- `POST /api/temp_ban` - Temporary bans

### 📝 Configuration Changes

**OLD (.env):**
```env
SERVER1_HOST=123.45.67.89
SERVER1_PORT=27015
SERVER1_PASSWORD=rcon_password
```

**NEW (.env):**
```env
SERVER1_API_URL=https://gbg-hll.com:64301
SERVER1_USERNAME=api_username
SERVER1_PASSWORD=api_password
```

### ⚠️ Breaking Changes

- **RCON Support entfernt** - Nur noch CRCON API
- **Config Format geändert** - Neue .env Variablen
- **Andere Permissions** - CRCON API Permissions statt RCON Passwort

### 🔍 Detection Improvements

- **Waffen-basierte Erkennung** möglich
  - Kann Artillery/Vehicle Kills herausfiltern
  - Bessere False-Positive Reduktion

- **Rolling KPM** (5 Minuten Fenster)
  - Erkennt Kill-Spikes besser
  - Weniger False Positives bei starken Starts

- **Combat Score Analyse**
  - Zusätzliche Metrik für Validierung
  - Cheater haben oft ungewöhnliche Score-Verhältnisse

### 📊 Stats Now Tracked

- Kills & Deaths (wie vorher)
- **NEW:** Weapons mit Kill-Counts
- **NEW:** Combat Score
- **NEW:** Kill Streaks
- **NEW:** Team & Role
- Overall KPM
- Rolling KPM (5min Fenster)
- Playtime

### 🐛 Bug Fixes

- Fixed: Player Level 0 bei neuen Spielern
- Fixed: Reconnect Logic bei API Timeouts
- Fixed: Discord Embed Update Race Conditions
- Fixed: Weapon Namen Parsing

### 📚 Documentation Updates

- README.md komplett überarbeitet für CRCON
- Neue CRCON-SETUP.md mit detaillierter Anleitung
- QUICKSTART.md aktualisiert
- Inline Code Kommentare verbessert

### 🚀 Migration Guide

1. Update Dependencies: `npm install`
2. Kopiere `.env.production.example` zu `.env`
3. Konfiguriere CRCON API URLs und Credentials
4. Teste Verbindung: `npm run test`
5. Starte Bot: `pm2 start ecosystem.config.js`

### 🎯 Roadmap

- [ ] Weapon-Type Filter (Infantry nur / No Artillery)
- [ ] Multi-Language Support
- [ ] Historical Stats Comparison
- [ ] Machine Learning basierte Erkennung
- [ ] Web Dashboard

---

## Version 1.0.0 - Initial Release

- Basic RCON Integration
- Discord Bot
- Kill Rate Tracking
- Ban Funktionalität
