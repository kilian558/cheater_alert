# HLL Anti-Cheat Monitor - Schnellstart

## Installation in 3 Schritten

### 1. Installation ausführen
```bash
chmod +x install.sh
./install.sh
```

### 2. Konfiguration anpassen
```bash
nano .env
```

Fülle mindestens aus:
- `DISCORD_TOKEN` - Dein Discord Bot Token
- `DISCORD_CHANNEL_ID` - Channel ID für Reports
- `SERVER1_NAME`, `SERVER1_API_URL`, `SERVER1_USERNAME`, `SERVER1_PASSWORD`

**Beispiel für CRCON API:**
```env
SERVER1_NAME=German Battleground 1
SERVER1_API_URL=https://gbg-hll.com:64301
SERVER1_USERNAME=admin
SERVER1_PASSWORD=your_password
```

### 3. Bot starten
```bash
pm2 start ecosystem.config.js
pm2 logs hll-anticheat-monitor
```

## Wichtige Befehle

```bash
# Status prüfen
pm2 status

# Logs anzeigen
pm2 logs hll-anticheat-monitor

# Bot neustarten
pm2 restart hll-anticheat-monitor

# Bot stoppen
pm2 stop hll-anticheat-monitor

# Autostart aktivieren
pm2 startup
pm2 save
```

## Discord Bot erstellen

1. Gehe zu https://discord.com/developers/applications
2. "New Application" → Name eingeben
3. "Bot" → "Add Bot"
4. Token kopieren → in `.env` eintragen
5. Bot Permissions: `Send Messages`, `Embed Links`, `Read Message History`
6. Bot einladen: OAuth2 → URL Generator → bot + applications.commands

## Support

Vollständige Dokumentation: [README.md](README.md)

Bei Problemen: Prüfe `pm2 logs hll-anticheat-monitor`
