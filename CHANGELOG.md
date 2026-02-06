# Hell Let Loose Anti-Cheat Monitor - CHANGELOG

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
