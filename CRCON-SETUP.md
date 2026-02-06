# CRCON API Setup Guide

## Was ist CRCON?

CRCON (Community RCON) ist eine moderne REST API für Hell Let Loose Server-Verwaltung. Es ist viel leistungsfähiger als das traditionelle RCON Protokoll und bietet:

- ✅ **Real-time stats** - Live Scoreboard mit detaillierten Spieler-Stats
- ✅ **Weapon tracking** - Welche Waffen verwendet wurden
- ✅ **REST API** - Einfach zu integrieren
- ✅ **Web Interface** - Grafische Verwaltung
- ✅ **Mehr Daten** - Viel mehr Informationen als RCON

## Benötigte CRCON Permissions

Dein CRCON User braucht diese API Permissions:

```
✅ api.can_view_get_players
✅ api.can_view_live_scoreboard  (WICHTIG!)
✅ api.can_view_gamestate
✅ api.can_view_detailed_player_info
✅ api.can_add_blacklist_records  (FÜR BANS!)
✅ api.can_view_blacklists
✅ api.can_kick_players
```

**Wichtig:** Statt `perma_ban` oder `temp_ban` nutzt das System **Blacklists**!
- Blacklist-Bans sind **serverübergreifend**
- Ein Ban auf Server 1 gilt automatisch für alle Server mit derselben Blacklist
- Ban-Grund: "Cheat alert appeal on gbg-hll.com"

## Server URLs

Für die gbg-hll.com Server:

| Server | CRCON URL |
|--------|-----------|
| Server 1 | `https://gbg-hll.com:64301` |
| Server 2 | `https://gbg-hll.com:64302` |
| Server 3 | `https://gbg-hll.com:64303` |

## .env Konfiguration

```env
# Server 1
SERVER1_NAME=German Battleground 1
SERVER1_API_URL=https://gbg-hll.com:64301
SERVER1_USERNAME=dein_username
SERVER1_PASSWORD=dein_password

# Server 2
SERVER2_NAME=German Battleground 2
SERVER2_API_URL=https://gbg-hll.com:64302
SERVER2_USERNAME=dein_username
SERVER2_PASSWORD=dein_password

# Server 3
SERVER3_NAME=German Battleground 3
SERVER3_API_URL=https://gbg-hll.com:64303
SERVER3_USERNAME=dein_username
SERVER3_PASSWORD=dein_password
```

## API Testen

Bevor du den Bot startest, teste die API Verbindung:

```bash
# Mit dem Test-Script
node test-crcon-api.js

# Oder manuell mit curl
curl -u username:password https://gbg-hll.com:64301/api/get_gamestate
```

**Erfolgreiche Antwort:**
```json
{
  "result": {
    "current_map": {
      "id": "stmereeglise_warfare",
      "human_name": "St. Mere Eglise Warfare"
    },
    "num_allied_players": 45,
    "num_axis_players": 47,
    ...
  },
  "failed": false
}
```

## CRCON User erstellen

Falls du Admin-Zugang zu CRCON hast:

1. Öffne CRCON Web Interface
2. Gehe zu **Settings** → **Multiple Server Admin** → **Users**
3. Klicke **Add User**
4. Username und Password vergeben
5. **Wichtig**: Alle benötigten Permissions aktivieren (siehe oben)
6. Speichern

### Blacklist einrichten

1. Gehe zu **Settings** → **Blacklists**
2. Prüfe welche Blacklist ID du verwenden willst (Standard: 1)
3. Stelle sicher dass alle deine Server zur selben Blacklist gehören
4. Trage die Blacklist ID in `.env` ein: `BLACKLIST_ID=1`

**Wie funktioniert's?**
- Bot fügt Spieler zur Blacklist hinzu
- CRCON synchronisiert automatisch über alle Server
- Spieler wird sofort gekickt und kann nicht mehr joinen

## Wichtige API Endpoints

Diese werden vom Bot verwendet:

| Endpoint | Zweck |
|----------|-------|
| `GET /api/get_live_scoreboard` | **Live Spieler-Stats** - Kills, Deaths, Waffen, KPM |
| `GET /api/get_gamestate` | Map, Mode, Scores, Spieleranzahl |
| `GET /api/get_detailed_player_info` | Detaillierte Spieler-History |
| `POST /api/add_blacklist_record` | **Spieler zur Blacklist hinzufügen (serverübergreifend!)** |
| `POST /api/kick` | Spieler vom Server kicken |

### Warum Blacklist statt direktem Ban?

**Vorteile der Blacklist API:**
- ✅ **Serverübergreifend** - Ein Ban gilt für alle Server
- ✅ **Zentralisiert** - CRCON managed alle Bans zentral
- ✅ **Automatisch** - Blacklist wird automatisch synchronisiert
- ✅ **Flexibel** - Kann später leicht entfernt/angepasst werden

## SSL Zertifikate

CRCON nutzt meist **self-signed SSL certificates**. Das ist normal!

Der Bot ignoriert SSL-Zertifikatsfehler automatisch:
```javascript
rejectUnauthorized: false
```

## Troubleshooting

### "Connection refused" oder "ECONNREFUSED"
→ Server URL falsch oder Server offline
→ Prüfe Port (64301, 64302, 64303)

### "401 Unauthorized"
→ Username oder Password falsch
→ Prüfe Credentials in .env

### "403 Forbidden" oder leere Daten
→ User hat nicht die nötigen Permissions
→ Prüfe API Permissions in CRCON

### "Request timeout"
→ Server antwortet nicht innerhalb 10 Sekunden
→ Prüfe Firewall / Netzwerk
→ Server möglicherweise überlastet

## Live Scoreboard Daten

Der Bot nutzt primär `/api/get_live_scoreboard` weil es die meisten Daten liefert:

```json
{
  "players": [
    {
      "player": "G I|I Fred._.",
      "player_id": "76561198177013833",
      "kills": 58,
      "deaths": 12,
      "combat": 450,
      "offense": 120,
      "defense": 80,
      "support": 200,
      "kills_per_minute": 1.3,
      "kill_streak": 5,
      "longest_kill_streak": 12,
      "team": "allies",
      "role": "Rifleman",
      "level": 50,
      "weapons": {
        "M1 GARAND": 32,
        "STRAFING RUN": 6,
        "BOMBING RUN": 10,
        "UNKNOWN": 10
      }
    }
  ]
}
```

**Alle diese Daten werden automatisch getracked und in Discord angezeigt!**

## Unterschied zu traditionellem RCON

| Feature | RCON | CRCON API |
|---------|------|-----------|
| Protokoll | Valve RCON | REST API (HTTPS) |
| Waffen-Stats | ❌ Nein | ✅ Ja |
| Live KPM | ❌ Nein | ✅ Ja |
| Combat Score | ❌ Nein | ✅ Ja |
| Einfach zu nutzen | ⚠️ Kompliziert | ✅ Einfach |
| Datenformat | Plain Text | JSON |

## Support

Falls du Probleme hast:

1. Führe `node test-crcon-api.js` aus
2. Prüfe die Logs im Terminal
3. Teste die API manuell mit curl
4. Kontaktiere deinen CRCON Admin für Permissions

---

**Wichtig:** Dieses System funktioniert **NUR** mit CRCON, nicht mit traditionellem RCON!
