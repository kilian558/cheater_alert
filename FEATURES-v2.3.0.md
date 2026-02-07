# Version 2.3.0 - Level & Rollen-Filter mit Caching

## 🎯 Neue Features

### 1. Level-Filter mit API-Integration & Caching

**Problem gelöst**: CRCON v11+ hat das `level`-Feld aus `/api/get_live_scoreboard` entfernt.

**Lösung**: 
- Nutzt `/api/get_detailed_player_info` für präzise Level-Daten
- Intelligentes Caching reduziert API-Last auf Minimum
- Cache-Dauer konfigurierbar (Standard: 30 Minuten)

**Konfiguration**:
```env
ENABLE_LEVEL_CHECK=true
MAX_LEVEL_TO_TRACK=100
LEVEL_CACHE_DURATION_MINUTES=30
```

**Performance**:
- ✅ Ohne Cache: 100 Spieler = 100 zusätzliche API-Calls pro Check
- ✅ Mit Cache (30min): ~3-5 zusätzliche API-Calls pro Check (nur neue Spieler)

### 2. Rollen-Filter (Tank/Artillerie ausschließen)

**Problem gelöst**: Panzer- und Artillerie-Spieler haben natürlich höhere KPM.

**Lösung**:
- Nutzt `/api/get_team_view` für Rollen-Informationen
- Nur 1 zusätzlicher API-Call pro Check (für alle Spieler)
- Cache-Dauer: 25 Sekunden (vor dem nächsten Check)

**Konfiguration**:
```env
EXCLUDE_TANK_ROLES=true
EXCLUDE_ARTILLERY_ROLES=true
EXCLUDED_ROLES=tankcommander,crewman,spotter
ROLE_CACHE_DURATION_SECONDS=25
```

**Ausgeschlossene Rollen**:
- `tankcommander` - Panzerkommandant
- `crewman` - Panzerschütze/Fahrer
- `spotter` - Artillerie-Spotter

### 3. Automatischer PM2 Restart (Cache leeren)

**Problem gelöst**: Cache könnte über Zeit zu groß werden oder veraltete Daten enthalten.

**Lösung**:
- PM2 startet Bot täglich um 4:30 Uhr neu
- Cleant alle Caches automatisch
- Minimal-invasiv (Server sind nachts meist weniger frequentiert)

**Konfiguration** (ecosystem.config.js):
```javascript
cron_restart: '30 4 * * *'  // Täglich um 4:30 Uhr
```

## 📊 Performance-Vergleich

### Ohne neue Features (v2.2.0)
- API-Calls pro Check: 1 (get_live_scoreboard)
- Level-Check: ❌ Nicht möglich (zeigt immer 0)
- Rollen-Check: ❌ Nicht möglich

### Mit neuen Features (v2.3.0)
- API-Calls pro Check: ~2-4
  - 1x get_live_scoreboard (wie vorher)
  - 1x get_team_view (cached 25s)
  - 0-3x get_detailed_player_info (nur neue Spieler, cached 30min)
- Level-Check: ✅ Funktioniert mit Cache
- Rollen-Check: ✅ Funktioniert mit Cache

**Ergebnis**: Nur +1-3 API-Calls pro Check, aber volle Funktionalität!

## 🔧 Migration von v2.2.0 → v2.3.0

### 1. Code aktualisieren
```bash
cd /home/kilian/cheater_alert
git pull
```

### 2. .env erweitern
Füge zu deiner `.env` hinzu:
```env
# Level Check Settings
ENABLE_LEVEL_CHECK=true
LEVEL_CACHE_DURATION_MINUTES=30

# Role Filter Settings
EXCLUDE_TANK_ROLES=true
EXCLUDE_ARTILLERY_ROLES=true
EXCLUDED_ROLES=tankcommander,crewman,spotter
ROLE_CACHE_DURATION_SECONDS=25
```

### 3. PM2 neu starten
```bash
pm2 restart hll-anticheat-monitor
```

### 4. Logs prüfen
```bash
pm2 logs hll-anticheat-monitor --lines 50
```

Erwartete Ausgabe:
```
Level-Check aktiviert: true (Cache: 30min)
Rollen-Filter: Tank=true, Artillerie=true
Ausgeschlossene Rollen: tankcommander, crewman, spotter
```

## 🧪 Testing

### Manueller Test der neuen Features
```bash
# Test-Skript ausführen (optional)
node test-level-role-api.js
```

Erwartete Ausgabe:
- ✅ Level-Daten gefunden (`level: 164`)
- ✅ Rollen-Daten gefunden (`role: "tankcommander"`)

### Produktions-Testing
Beobachte die Logs nach dem Restart:

**Spieler mit Tank-Rolle wird übersprungen**:
```
  🔍 Player123 (Lvl 85):
     🚫 Spielt tankcommander - überspringe
```

**Spieler mit hohem Level wird übersprungen**:
```
  🔍 VeteranPlayer (Lvl 150):
     🚫 Level 150 > 100 - überspringe
```

## ⚙️ Feintuning

### Reduziere API-Last weiter
Falls CRCON Server überlastet:
```env
# Cache länger halten
LEVEL_CACHE_DURATION_MINUTES=60
ROLE_CACHE_DURATION_SECONDS=50

# Check-Intervall erhöhen
CHECK_INTERVAL=60
```

### Aggressive Filterung
Falls zu viele False Positives:
```env
# Mehr Rollen ausschließen
EXCLUDED_ROLES=tankcommander,crewman,spotter,engineer,antitank
```

### Deaktiviere Features selektiv
```env
# Level-Check deaktivieren (spart API-Calls)
ENABLE_LEVEL_CHECK=false

# Rollen-Filter deaktivieren
EXCLUDE_TANK_ROLES=false
EXCLUDE_ARTILLERY_ROLES=false
```

## 🐛 Troubleshooting

### Problem: "Level-Check aktiviert: false" obwohl true in .env

**Lösung**: PM2 restart erforderlich
```bash
pm2 restart hll-anticheat-monitor
```

### Problem: Viele API-Calls trotz Cache

**Ursache**: Viele neue Spieler joinen gleichzeitig

**Lösung**: Normal! Cache built sich auf nach 1-2 Checks

### Problem: PM2 Cron funktioniert nicht

**Prüfe PM2 Cron**:
```bash
pm2 describe hll-anticheat-monitor | grep cron
```

**Sollte zeigen**:
```
│ cron restart       │ 30 4 * * *
```

**Falls nicht**: PM2 neu laden
```bash
pm2 delete hll-anticheat-monitor
pm2 start ecosystem.config.js
```

## 📈 Monitoring

### Cache-Statistiken in Logs
Bei jedem Cache-Cleanup (alle ~1h):
```
[Server 1] Cache bereinigt. 87 Einträge verbleibend
```

### Täglicher Restart
Um 4:30 Uhr in logs:
```
[PM2] Restarting /home/kilian/cheater_alert/src/index.js
=== HLL Anti-Cheat Monitor startet ===
Level-Check aktiviert: true (Cache: 30min)
```

## 🎯 Best Practices

1. **Lass Cache-Einstellungen auf Standard** (30min Level, 25s Rollen)
2. **Prüfe Logs nach Update** auf korrekte Konfiguration
3. **Beobachte erste 24h** auf Performance-Probleme
4. **Passe EXCLUDED_ROLES an** basierend auf deinen Erfahrungen

## 🔮 Zukünftige Verbesserungen

- [ ] Whitelist für vertrauenswürdige High-Level-Spieler
- [ ] Statistik-Dashboard für Cache-Hits
- [ ] Auto-Tuning von Cache-Dauer basierend auf Server-Last
- [ ] Erweiterte Rollen-Filter (Squad Leader, Commander)
