# Level & Rollen-Informationen aus CRCON API

## Überblick

Dieses Dokument beschreibt, wie man Level- und Rollen-Informationen aus der CRCON API auslesen kann.

## Problem

**Level-Daten**: CRCON v11+ hat das `level`-Feld aus `/api/get_live_scoreboard` entfernt.
**Rollen-Filter**: Bot soll Panzer- und Artillerie-Spieler ausschließen können.

## Mögliche Lösungen

### 1. Level-Informationen

Die API bietet **`/api/get_detailed_player_info?player_id=STEAM_ID`** an:

```javascript
// Beispiel-Request
GET /api/get_detailed_player_info?player_id=76561197963272009
Authorization: Bearer YOUR_API_TOKEN

// Mögliche Antwort-Felder (zu prüfen):
{
  "id": "76561197963272009",
  "names": [...],
  "sessions": [...],
  "total_playtime_seconds": 123456,
  // Möglicherweise:
  "level": 100,          // Falls verfügbar
  "rank": "Major",       // Falls verfügbar
  "experience": 50000    // Falls verfügbar
}
```

**⚠️ Hinweis**: Dieses Feld könnte NICHT verfügbar sein, da HLL selbst keine persistenten Level speichert.

### 2. Rollen-Informationen (Tank/Artillerie)

Die API bietet **`/api/get_team_view`** an:

```javascript
// Beispiel-Request
GET /api/get_team_view
Authorization: Bearer YOUR_API_TOKEN

// Erwartete Struktur:
{
  "allies": {
    "squads": {
      "Able": {
        "players": [
          {
            "name": "Player1",
            "steam_id_64": "76561...",
            "role": "tankcommander",  // oder "armor", "tank"
            "unit": "Sherman",
            "loadout": "..."
          }
        ]
      }
    },
    "commander": {...}
  },
  "axis": {...}
}
```

### 3. Alternative: get_status

```javascript
GET /api/get_status

// Könnte auch Rollen enthalten:
{
  "players": [
    {
      "name": "Player",
      "steam_id": "...",
      "role": "Officer"  // Möglicherweise
    }
  ]
}
```

## Test-Skript ausführen

```bash
# 1. Stelle sicher, dass .env konfiguriert ist
cp .env.example .env
nano .env  # Füge deine CRCON_API_URL_1 und CRCON_API_TOKEN_1 hinzu

# 2. Führe das Test-Skript aus
node test-level-role-api.js
```

## Was das Skript testet

1. **get_detailed_player_info**: Sucht nach `level`, `rank`, `xp`-Feldern
2. **get_team_view**: Sucht nach `role`, `unit`, `loadout`, `tank`, `artillery`-Feldern
3. **Struktur-Analyse**: Zeigt die vollständige Datenstruktur der ersten Antwort

## Erwartete Ergebnisse

### Szenario A: Level-Daten verfügbar ✅

```
✅ Level-relevante Felder gefunden:
   - level: 85
   - current_level: 85
```

→ **Lösung**: Nutze `get_detailed_player_info` vor der Überprüfung

### Szenario B: Level-Daten NICHT verfügbar ❌

```
❌ Keine Level/Rank/XP-Felder gefunden
```

→ **Lösung**: 
- Entferne `MAX_LEVEL_TO_TRACK` Filter komplett
- ODER nutze Playtime als Alternative: `MAX_PLAYTIME_HOURS=100`

### Szenario C: Rollen-Daten verfügbar ✅

```
✅ Rollen-relevante Felder in Team View gefunden:
   - allies.squads.Able.players[0].role: tankcommander
   - allies.squads.Baker.players[1].unit: Tiger
```

→ **Lösung**: Implementiere Rollen-Filter im Bot

### Szenario D: Rollen-Daten NICHT verfügbar ❌

```
⚠️ Keine Rollen-Felder in Team View gefunden
```

→ **Lösung**: Keine Filterung nach Rollen möglich

## Integration in den Bot

### Falls Level verfügbar:

```javascript
// In src/rconClient.js
async getPlayerWithLevel(steamId) {
  const url = `${this.apiUrl}/api/get_detailed_player_info?player_id=${steamId}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${this.apiToken}` }
  });
  const data = await response.json();
  return data.level || 0;
}

// In src/index.js
async function checkPlayer(playerData, serverName) {
  // Hole Level von API falls verfügbar
  if (config.MAX_LEVEL_TO_TRACK > 0) {
    playerData.level = await rconClient.getPlayerWithLevel(playerData.steamId);
    if (playerData.level > config.MAX_LEVEL_TO_TRACK) {
      return; // Spieler zu hoch-leveled
    }
  }
  // ... rest of logic
}
```

### Falls Rollen verfügbar:

```javascript
// In src/rconClient.js
async getPlayerRole(steamId) {
  const teamView = await this.makeRequest('/api/get_team_view');
  
  // Suche Spieler in allen Squads
  for (const team of ['allies', 'axis']) {
    if (!teamView[team]?.squads) continue;
    
    for (const squad of Object.values(teamView[team].squads)) {
      const player = squad.players?.find(p => p.steam_id_64 === steamId);
      if (player) return player.role || null;
    }
  }
  return null;
}

// In src/index.js
async function checkPlayer(playerData, serverName) {
  // Filter für Tank/Artillerie
  const excludedRoles = ['tankcommander', 'crewman', 'spotter', 'artillery'];
  
  const role = await rconClient.getPlayerRole(playerData.steamId);
  if (role && excludedRoles.some(r => role.toLowerCase().includes(r))) {
    console.log(`[${serverName}] 🚫 ${playerData.name} ist ${role} - überspringe`);
    return;
  }
  // ... rest of logic
}
```

## Performance-Überlegungen

### Problem: Viele API-Calls

Bei 100 Spielern:
- **get_detailed_player_info**: 100 zusätzliche API-Calls alle 30 Sekunden
- **get_team_view**: 1 zusätzlicher Call alle 30 Sekunden (besser!)

### Lösung: Caching

```javascript
// Cache für Team View (erneuert sich alle 30s sowieso)
let cachedTeamView = null;
let teamViewCacheTime = 0;

async function getPlayerRole(steamId) {
  const now = Date.now();
  
  // Cache für 25 Sekunden (vor dem nächsten Check)
  if (!cachedTeamView || now - teamViewCacheTime > 25000) {
    cachedTeamView = await this.makeRequest('/api/get_team_view');
    teamViewCacheTime = now;
  }
  
  // Suche in Cache...
}
```

## Konfiguration

Neue .env-Variablen:

```bash
# Level-Filter (falls verfügbar)
MAX_LEVEL_TO_TRACK=100
USE_API_LEVEL_CHECK=true  # Falls false, wird level ignoriert

# Rollen-Filter (falls verfügbar)
EXCLUDE_TANK_ROLES=true
EXCLUDE_ARTILLERY_ROLES=true
EXCLUDED_ROLES=tankcommander,crewman,spotter,artillery
```

## Nächste Schritte

1. **Führe Test-Skript aus**: `node test-level-role-api.js`
2. **Analysiere Ergebnisse**: Welche Felder sind verfügbar?
3. **Entscheide**:
   - Level verfügbar? → Implementiere API-basiertes Level-Checking
   - Level NICHT verfügbar? → Entferne MAX_LEVEL_TO_TRACK Filter
   - Rollen verfügbar? → Implementiere Rollen-Filter
   - Rollen NICHT verfügbar? → Keine Rollen-Filterung möglich
4. **Update Bot-Code** entsprechend

## Bekannte Einschränkungen

⚠️ **HLL speichert keine persistenten Level**: Spieler können sich in Community-Servern "hochleveln", aber CRCON hat keinen Zugriff auf diese Daten

⚠️ **Rollen ändern sich häufig**: Ein Spieler kann jederzeit die Rolle wechseln

⚠️ **API-Performance**: Zusätzliche API-Calls können CRCON belasten bei 100+ Spielern
