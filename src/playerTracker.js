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
                // Starte bei 0 - zähle nur neue Kills/Deaths ab jetzt
                startKills: 0,
                startDeaths: 0,
                currentKills: 0,
                currentDeaths: 0,
                weapons: {},
                role: playerData.role,
                team: playerData.team,
                killHistory: [], // Timestamps der Kills für genauere KPM Berechnung
                isFirstUpdate: true // Flag für erstes Update
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
        
        // Beim ersten Update: Setze Baseline ohne historische Kills zu zählen
        if (session.isFirstUpdate) {
            session.startKills = playerData.kills;
            session.currentKills = playerData.kills;
            session.startDeaths = playerData.deaths;
            session.currentDeaths = playerData.deaths;
            // Setze auch Weapon-Baseline beim ersten Update
            if (playerData.weapons && Object.keys(playerData.weapons).length > 0) {
                session.weaponBaseline = { ...playerData.weapons };
                session.weapons = {}; // Session weapons starten bei 0
            }
            session.isFirstUpdate = false;
            console.log(`   📊 Baseline gesetzt für ${playerData.name}: Kills=${playerData.kills}, Deaths=${playerData.deaths}`);
        } else {
            // Prüfe auf Stat-Reset (Team-Switch, Match-Neustart, neue Map, etc.)
            if (playerData.kills < session.currentKills || playerData.deaths < session.currentDeaths) {
                console.log(`   🔄 NEUE MAP/RESET erkannt für ${playerData.name} - alles auf 0 zurücksetzen`);
                console.log(`      Alt: Kills=${session.currentKills}, Deaths=${session.currentDeaths}`);
                console.log(`      Neu: Kills=${playerData.kills}, Deaths=${playerData.deaths}`);
                
                // KOMPLETTER RESET: Alles auf 0
                session.startTime = now; // ⭐ WICHTIG: Startzeit zurücksetzen für Spielzeit
                session.startKills = playerData.kills;
                session.currentKills = playerData.kills;
                session.startDeaths = playerData.deaths;
                session.currentDeaths = playerData.deaths;
                session.killHistory = []; // Lösche Kill-History
                
                // Reset Weapon-Baseline und Session-Weapons
                if (playerData.weapons && Object.keys(playerData.weapons).length > 0) {
                    session.weaponBaseline = { ...playerData.weapons };
                    session.weapons = {};
                } else {
                    session.weaponBaseline = {};
                    session.weapons = {};
                }
            } else {
                // Normale Updates: Zähle nur neue Kills
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
            }
        }
        session.lastUpdate = now;
        session.role = playerData.role;
        session.team = playerData.team;
        
        // CRCON v11+: Verwende playtime vom API wenn verfügbar (in Sekunden)
        if (playerData.playtime && playerData.playtime > 0) {
            session.apiPlaytimeSeconds = playerData.playtime;
        }
        
        // Weapon-Tracking: Berechne Session-Kills pro Waffe
        // Baseline wird bereits im isFirstUpdate oder bei Reset gesetzt
        if (playerData.weapons && Object.keys(playerData.weapons).length > 0 && session.weaponBaseline) {
            const sessionWeapons = {};
            for (const [weapon, totalKills] of Object.entries(playerData.weapons)) {
                const baseline = session.weaponBaseline[weapon] || 0;
                const sessionKills = Math.max(0, totalKills - baseline);
                if (sessionKills > 0) {
                    sessionWeapons[weapon] = sessionKills;
                }
            }
            session.weapons = sessionWeapons;
        }
        
        // Store additional CRCON stats
        if (playerData.combat !== undefined) {
            session.combatScore = playerData.combat;
        }

        // Store API provided KPM if available
        if (playerData.killsPerMinute !== undefined) {
            session.apiKPM = playerData.killsPerMinute;
        }

        return session;
    }

    getPlayerStats(key) {
        const session = this.trackedPlayers.get(key);
        if (!session) return null;

        const now = Date.now();
        
        // Bevorzuge API playtime (in Sekunden) wenn verfügbar, sonst fallback auf berechnete Zeit
        let playtimeMinutes;
        let isApiPlaytime = false;

        if (session.apiPlaytimeSeconds && session.apiPlaytimeSeconds > 0) {
            playtimeMinutes = session.apiPlaytimeSeconds / 60;
            isApiPlaytime = true;
        } else {
            const playtimeMs = now - session.startTime;
            playtimeMinutes = playtimeMs / (1000 * 60);
        }
        
        // get_live_game_stats liefert bereits Match-nur Stats (reset bei Match-Start)
        // Verwende RAW Kills vom API für CRCON-genaue KPM (nicht sessionKills mit Baseline)
        // Dies gibt uns sofort die echte Match-KPM, auch wenn Bot mid-match startet
        const matchKills = Math.max(0, session.currentKills);
        const matchDeaths = Math.max(0, session.currentDeaths);
        
        // Berechne auch Session-Kills für Anomalie-Erkennung (Kills seit Bot-Start)
        const sessionKills = Math.max(0, session.currentKills - session.startKills);
        const sessionDeaths = Math.max(0, session.currentDeaths - session.startDeaths);

        // KPM Berechnung (Overall/Session)
        // Priorität 1: API KPM (wenn verfügbar)
        // Priorität 2: Berechnete Match-KPM (wenn API Playtime verfügbar)
        // Priorität 3: Session-KPM (Fallback wenn keine API Daten)
        let overallKPM;

        if (session.apiKPM !== undefined) {
            // Verwende direkt den Wert vom RCON
            overallKPM = session.apiKPM;
        } else if (isApiPlaytime) {
            // Exakte Match-KPM: Total Match Kills / Total Match Playtime
            overallKPM = playtimeMinutes > 0 ? matchKills / playtimeMinutes : 0;
        } else {
            // Fallback auf Session-KPM um inflated Values zu vermeiden
            overallKPM = playtimeMinutes > 0 ? sessionKills / playtimeMinutes : 0;
        }

        // Rolling KPM (letzte 5 Minuten)
        const rollingKPM = session.killHistory.length / 5;

        // K/D Ratio basierend auf Match-Total (wie CRCON)
        const kdRatio = matchDeaths > 0 ? (matchKills / matchDeaths).toFixed(2) : matchKills.toFixed(2);

        return {
            steamId: session.steamId,
            playerName: session.playerName,
            serverName: session.serverName,
            level: session.level,
            role: session.role || 'Unknown',
            team: session.team,
            playtimeMinutes: playtimeMinutes,
            playtimeFormatted: this.formatPlaytime(playtimeMinutes),
            sessionKills: sessionKills,
            sessionDeaths: sessionDeaths,
            totalKills: session.currentKills,
            totalDeaths: session.currentDeaths,
            overallKPM: overallKPM.toFixed(2),
            rollingKPM: rollingKPM.toFixed(2),
            kdRatio: kdRatio,
            weapons: session.weapons || {},
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

        // Separate KPM Checks
        const overallKpmSuspicious = parseFloat(stats.overallKPM) >= config.overallKPMThreshold;
        const rollingKpmSuspicious = parseFloat(stats.rollingKPM) >= config.rollingKPMThreshold;

        return overallKpmSuspicious || rollingKpmSuspicious;
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

    resetServerSessions(serverName) {
        const now = Date.now();
        let resetCount = 0;
        
        for (const [key, session] of this.trackedPlayers.entries()) {
            if (session.serverName === serverName) {
                // Match-Reset: Setze Session zurück, behalte aktuelle Kills als neue Baseline
                session.startTime = now;
                session.lastUpdate = now;
                session.startKills = session.currentKills; // Aktuelle Kills werden neue Baseline
                session.startDeaths = session.currentDeaths; // Aktuelle Deaths werden neue Baseline
                session.killHistory = []; // Leere Kill-History
                session.weapons = {}; // Reset Session Weapons
                session.weaponBaseline = null; // Reset Weapon Baseline für neues Match
                session.isFirstUpdate = false; // Kein First Update mehr
                resetCount++;
            }
        }
        
        if (resetCount > 0) {
            console.log(`  🔄 ${resetCount} Session(s) für ${serverName} zurückgesetzt (neues Match)`);
        }
        
        return resetCount;
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
