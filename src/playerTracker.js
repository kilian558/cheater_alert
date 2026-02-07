const Database = require('better-sqlite3');
const path = require('path');

class PlayerTracker {
    constructor() {
        this.db = new Database(path.join(__dirname, '..', 'players.db'));
        this.initDatabase();
        this.trackedPlayers = new Map(); // steamId -> tracking data
    }

    initDatabase() {
        // Tabelle für Spieler-Sessions
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS player_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                steam_id TEXT NOT NULL,
                player_name TEXT NOT NULL,
                server_name TEXT NOT NULL,
                level INTEGER,
                start_time INTEGER NOT NULL,
                end_time INTEGER,
                total_kills INTEGER DEFAULT 0,
                total_deaths INTEGER DEFAULT 0,
                playtime_minutes REAL DEFAULT 0,
                is_suspicious BOOLEAN DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        // Tabelle für Waffen-Stats
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS weapon_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                weapon_name TEXT NOT NULL,
                kills INTEGER DEFAULT 0,
                FOREIGN KEY (session_id) REFERENCES player_sessions(id)
            )
        `);

        // Tabelle für Discord Messages (zum Updaten der Embeds)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS discord_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                channel_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (session_id) REFERENCES player_sessions(id)
            )
        `);

        console.log('Datenbank initialisiert');
    }

    startTracking(playerData, serverName) {
        const key = `${playerData.steamId}_${serverName}`;
        
        if (!this.trackedPlayers.has(key)) {
            const session = {
                steamId: playerData.steamId,
                playerName: playerData.name,
                serverName: serverName,
                level: playerData.level,
                startTime: Date.now(),
                lastUpdate: Date.now(),
                startKills: playerData.kills,
                startDeaths: playerData.deaths,
                currentKills: playerData.kills,
                currentDeaths: playerData.deaths,
                weapons: {},
                role: playerData.role,
                team: playerData.team,
                killHistory: [] // Timestamps der Kills für genauere KPM Berechnung
            };

            this.trackedPlayers.set(key, session);
            console.log(`Tracking gestartet für ${playerData.name} (${playerData.steamId}) auf ${serverName}`);
        }

        return key;
    }

    updatePlayer(playerData, serverName) {
        const key = `${playerData.steamId}_${serverName}`;
        const session = this.trackedPlayers.get(key);

        if (!session) {
            return null;
        }

        const now = Date.now();
        const newKills = playerData.kills - session.currentKills;

        // Füge Timestamps für neue Kills hinzu
        for (let i = 0; i < newKills; i++) {
            session.killHistory.push(now);
        }

        // Entferne Kills älter als 5 Minuten für Rolling KPM
        const fiveMinutesAgo = now - (5 * 60 * 1000);
        session.killHistory = session.killHistory.filter(ts => ts > fiveMinutesAgo);

        session.currentKills = playerData.kills;
        session.currentDeaths = playerData.deaths;
        session.lastUpdate = now;
        session.role = playerData.role;
        session.team = playerData.team;
        
        // CRCON v11+: Verwende playtime vom API wenn verfügbar (in Sekunden)
        if (playerData.playtime && playerData.playtime > 0) {
            session.apiPlaytimeSeconds = playerData.playtime;
        }
        
        // Update weapons data from CRCON
        if (playerData.weapons && Object.keys(playerData.weapons).length > 0) {
            session.weapons = playerData.weapons;
        }
        
        // Store additional CRCON stats
        if (playerData.combat !== undefined) {
            session.combatScore = playerData.combat;
        }

        return session;
    }

    getPlayerStats(key) {
        const session = this.trackedPlayers.get(key);
        if (!session) return null;

        const now = Date.now();
        
        // CRCON v11+: Verwende API playtime wenn verfügbar, sonst Session-Zeit
        let playtimeMinutes;
        let useApiData = false;
        if (session.apiPlaytimeSeconds && session.apiPlaytimeSeconds > 0) {
            // Verwende API-Spielzeit (in Sekunden -> Minuten)
            playtimeMinutes = session.apiPlaytimeSeconds / 60;
            useApiData = true;
        } else {
            // Fallback: Berechne Session-Zeit seit Bot-Start
            const playtimeMs = now - session.startTime;
            playtimeMinutes = playtimeMs / (1000 * 60);
        }
        
        const sessionKills = session.currentKills - session.startKills;
        const sessionDeaths = session.currentDeaths - session.startDeaths;

        // Overall KPM: Wenn API-Daten, verwende Total-Kills, sonst Session-Kills
        let overallKPM;
        if (useApiData) {
            overallKPM = playtimeMinutes > 0 ? session.currentKills / playtimeMinutes : 0;
        } else {
            overallKPM = playtimeMinutes > 0 ? sessionKills / playtimeMinutes : 0;
        }

        // Rolling KPM (letzte 5 Minuten)
        const rollingKPM = session.killHistory.length / 5;

        return {
            steamId: session.steamId,
            playerName: session.playerName,
            serverName: session.serverName,
            level: session.level,
            role: session.role,
            team: session.team,
            playtimeMinutes: playtimeMinutes,
            playtimeFormatted: this.formatPlaytime(playtimeMinutes),
            sessionKills: sessionKills,
            sessionDeaths: sessionDeaths,
            totalKills: session.currentKills,
            totalDeaths: session.currentDeaths,
            overallKPM: overallKPM.toFixed(2),
            rollingKPM: rollingKPM.toFixed(2),
            weapons: session.weapons || {},
            combatScore: session.combatScore || 0,
            startTime: session.startTime,
            lastUpdate: session.lastUpdate
        };
    }

    formatPlaytime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = Math.floor(minutes % 60);
        const secs = Math.floor((minutes * 60) % 60);
        return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    isSuspicious(key, config) {
        const stats = this.getPlayerStats(key);
        if (!stats) return false;

        // Nur Spieler unter dem konfigurierten Level tracken
        if (stats.level > config.maxLevelToTrack) {
            return false;
        }

        // Mindestens 15 Minuten Spielzeit oder 25 Kills
        const hasEnoughData = stats.playtimeMinutes >= config.minPlaytimeMinutes || 
                              stats.sessionKills >= config.minKillsToTrigger;

        if (!hasEnoughData) {
            return false;
        }

        // KPM Checks
        const kpmSuspicious = parseFloat(stats.overallKPM) >= config.suspiciousKPM;
        const rollingKpmSuspicious = parseFloat(stats.rollingKPM) >= config.suspiciousKPM;

        return kpmSuspicious || rollingKpmSuspicious;
    }

    saveSession(key) {
        const stats = this.getPlayerStats(key);
        if (!stats) return null;

        const stmt = this.db.prepare(`
            INSERT INTO player_sessions 
            (steam_id, player_name, server_name, level, start_time, end_time, 
             total_kills, total_deaths, playtime_minutes, is_suspicious)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            stats.steamId,
            stats.playerName,
            stats.serverName,
            stats.level,
            stats.startTime,
            Date.now(),
            stats.sessionKills,
            stats.sessionDeaths,
            stats.playtimeMinutes,
            0
        );

        return result.lastInsertRowid;
    }

    saveDiscordMessage(sessionId, channelId, messageId) {
        const stmt = this.db.prepare(`
            INSERT INTO discord_messages (session_id, channel_id, message_id)
            VALUES (?, ?, ?)
        `);

        stmt.run(sessionId, channelId, messageId);
    }

    getDiscordMessage(sessionId) {
        const stmt = this.db.prepare(`
            SELECT * FROM discord_messages 
            WHERE session_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `);

        return stmt.get(sessionId);
    }

    markAsResolved(key, status) {
        const session = this.trackedPlayers.get(key);
        if (!session) return;

        // Session als beendet markieren und Status setzen
        session.status = status; // 'banned' oder 'false_positive'
        this.trackedPlayers.delete(key);
        
        console.log(`Session für ${session.playerName} als ${status} markiert`);
    }

    stopTracking(key) {
        this.trackedPlayers.delete(key);
    }

    getActiveTrackedPlayers() {
        return Array.from(this.trackedPlayers.keys());
    }

    close() {
        this.db.close();
    }
}

module.exports = PlayerTracker;
