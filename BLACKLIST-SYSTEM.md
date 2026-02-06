# Blacklist System - Quick Reference

## Was ist eine Blacklist?

Eine CRCON Blacklist ist eine **serverübergreifende Ban-Liste**:
- Ein Spieler auf der Blacklist kann **keinen** der konfigurierten Server joinen
- CRCON synchronisiert die Blacklist automatisch über alle Server
- Admins können Bans zentral verwalten

## Wie funktioniert der Ban?

### 1. Automatischer Ablauf

```
Verdächtiger Spieler erkannt
         ↓
Discord Alert mit Buttons
         ↓
Admin klickt "Ban Player"
         ↓
Bot fügt Spieler zur Blacklist hinzu
         ↓
Bot kickt Spieler vom Server
         ↓
Spieler kann nicht mehr joinen (alle Server!)
```

### 2. Ban-Details

- **Methode:** `POST /api/add_blacklist_record`
- **Grund:** `Cheat alert appeal on gbg-hll.com`
- **Dauer:** Permanent (`expires_at: null`)
- **Admin:** `HLL AntiCheat Monitor`
- **Kick:** Automatisch nach Blacklist-Eintrag

### 3. Serverübergreifend

```
Spieler wird auf Server 1 gebannt
         ↓
CRCON fügt zur Blacklist hinzu
         ↓
Server 1, 2, 3 synchronisieren
         ↓
Spieler ist auf ALLEN Servern gebannt
```

## Konfiguration

### .env Einstellungen

```env
# Blacklist ID aus CRCON
# Standard: 1 (Default Blacklist)
# Alle Server sollten dieselbe Blacklist nutzen
BLACKLIST_ID=1
```

### Blacklist ID herausfinden

1. Öffne CRCON Web Interface
2. Navigiere zu: **Settings** → **Blacklists**
3. Notiere die ID der Blacklist die du nutzen möchtest
4. Trage sie in `.env` ein

### Blacklist erstellen (falls keine existiert)

1. In CRCON: **Settings** → **Blacklists** → **Create New**
2. Name vergeben (z.B. "Anti-Cheat Blacklist")
3. Sync Method: **KICK_ONLY** (empfohlen)
4. Servers: Alle deine Server auswählen
5. ID notieren und in `.env` eintragen

## API Endpoints

### add_blacklist_record

**POST** `/api/add_blacklist_record`

```json
{
  "player_id": "76561198177013833",
  "blacklist_id": 1,
  "reason": "Cheat alert appeal on gbg-hll.com",
  "expires_at": null,
  "admin_name": "HLL AntiCheat Monitor"
}
```

**Response:**
```json
{
  "result": {
    "id": 12345,
    "player_id": "76561198177013833",
    "blacklist_id": 1,
    "reason": "Cheat alert appeal on gbg-hll.com",
    "expires_at": null
  },
  "failed": false
}
```

### kick (nach Blacklist)

**POST** `/api/kick`

```json
{
  "player_id": "76561198177013833",
  "reason": "Cheat alert appeal on gbg-hll.com",
  "by": "HLL AntiCheat Monitor"
}
```

## Benötigte Permissions

```
✅ api.can_view_blacklists
✅ api.can_add_blacklist_records
✅ api.can_kick_players
```

## Vorteile gegenüber direktem Ban

| Feature | Direct Ban | Blacklist Ban |
|---------|-----------|---------------|
| Serverübergreifend | ❌ Nein | ✅ Ja |
| Zentralisiert | ❌ Nein | ✅ Ja (CRCON) |
| Einfach zu managen | ⚠️ Kompliziert | ✅ Einfach |
| Auto-Sync | ❌ Nein | ✅ Ja |
| Expiration | ⚠️ Manuell | ✅ Automatisch |

## Troubleshooting

### "Failed to add blacklist record"

**Mögliche Ursachen:**
- Blacklist ID existiert nicht → Prüfe in CRCON
- Fehlende Permission → `api.can_add_blacklist_records`
- Ungültige Steam ID → Prüfe Format

### "Kick failed but blacklist active"

**Das ist OK!**
- Spieler ist wahrscheinlich schon offline
- Blacklist verhindert trotzdem Rejoin
- Log: "Spieler wahrscheinlich offline"

### Spieler kann trotzdem joinen

**Prüfe:**
1. Ist der Server mit der Blacklist verknüpft?
2. Hat CRCON die Blacklist synchronisiert?
3. Ist der Sync Method korrekt? (KICK_ONLY empfohlen)
4. Ist der richtige `player_id` (Steam ID) verwendet worden?

## Appeal Prozess

Der Ban-Grund verweist auf **gbg-hll.com** für Appeals:

```
"Cheat alert appeal on gbg-hll.com"
```

**Empfohlener Appeal-Prozess:**
1. Spieler sieht Ban-Message mit Website
2. Spieler besucht gbg-hll.com
3. Spieler erstellt Appeal mit Steam ID
4. Admin reviewed den Fall
5. Bei False Positive: Blacklist-Eintrag löschen in CRCON

## Code Beispiel

```javascript
// Ban Player mit Blacklist
const success = await server.banPlayer(
    steamId,
    'Cheat alert appeal on gbg-hll.com',
    blacklistId  // aus .env (Standard: 1)
);

// Was passiert intern:
// 1. POST /api/add_blacklist_record (player zur Blacklist)
// 2. POST /api/kick (player kicken falls online)
// 3. CRCON synchronisiert auf alle Server
```

## Monitoring

Der Bot loggt jeden Ban:

```
[Server 1] Spieler 76561198177013833 zur Blacklist hinzugefügt: Cheat alert appeal on gbg-hll.com
[Server 1] Spieler 76561198177013833 wurde gekickt (Blacklist aktiv)
✅ Spieler 76561198177013833 serverübergreifend geblacklisted & gekickt
   Grund: Cheat alert appeal on gbg-hll.com
   Aktiv auf allen 3 Servern
```

## Best Practices

1. **Eine Blacklist für alle Server** - Nutze dieselbe Blacklist ID
2. **Sync Method: KICK_ONLY** - Automatischer Kick beim Join-Versuch
3. **Aussagekräftige Reasons** - Mit Appeal-Prozess
4. **Regelmäßig reviewen** - False Positives entfernen
5. **Logs monitoren** - Erfolgreiche Bans prüfen

---

**Wichtig:** Blacklists sind permanent bis sie manuell in CRCON entfernt werden!
