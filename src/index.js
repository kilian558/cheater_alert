require('dotenv').config();
const CRCONApiClient = require('./rconClient');
const PlayerTracker = require('./playerTracker');
const DiscordBot = require('./discordBot');

class HLLAntiCheatMonitor {
    constructor() {
        // Konfiguration aus .env laden
        this.config = {
            maxLevelToTrack: parseInt(process.env.MAX_LEVEL_TO_TRACK) || 100,
            minKillsToTrigger: parseInt(process.env.MIN_KILLS_TO_TRIGGER) || 25,
            minPlaytimeMinutes: parseInt(process.env.MIN_PLAYTIME_MINUTES) || 15,
            // Separate KPM Schwellenwerte
            overallKPMThreshold: parseFloat(process.env.OVERALL_KPM_THRESHOLD) || 1.25,
            rollingKPMThreshold: parseFloat(process.env.ROLLING_KPM_THRESHOLD) || 3.0,
            suspiciousKPMNoVehicles: parseFloat(process.env.SUSPICIOUS_KPM_NO_VEHICLES) || 2.0,
            checkInterval: parseInt(process.env.CHECK_INTERVAL) || 30,
            // Level Check mit Cache
            enableLevelCheck: process.env.ENABLE_LEVEL_CHECK !== 'false',
            levelCacheDuration: parseInt(process.env.LEVEL_CACHE_DURATION_MINUTES) || 30,
            // Rollen-Filter
            excludeTankRoles: process.env.EXCLUDE_TANK_ROLES !== 'false',
            excludeArtilleryRoles: process.env.EXCLUDE_ARTILLERY_ROLES !== 'false',
            excludedRoles: (process.env.EXCLUDED_ROLES || 'tankcommander,crewman,artillery')
                .split(',')
                .map(r => r.trim().toLowerCase())
                .filter(r => r.length > 0),
            roleCacheDuration: parseInt(process.env.ROLE_CACHE_DURATION_SECONDS) || 25
        };

        // RCON Clients initialisieren
        this.servers = [];
        this.initServers();

        // Player Tracker initialisieren
        this.tracker = new PlayerTracker();

        // Discord Bot initialisieren
        this.discord = new DiscordBot(
            process.env.DISCORD_TOKEN,
            process.env.DISCORD_CHANNEL_ID
        );

        // Callbacks für Discord Bot
        this.setupDiscordCallbacks();

        // Game State Cache
        this.gameStates = new Map();

        // Bereits gemeldete Spieler (Track pro Tag)
        this.reportedPlayers = new Map(); // steamId_server -> { lastAlertDate: 'YYYY-MM-DD', matchId: 'mapId' }
        
        // Als False Positive markierte Spieler (werden nicht mehr geupdatet)
        this.falsePositivePlayers = new Set(); // steamId_server
    }

    initServers() {
        for (let i = 1; i <= 3; i++) {
            const name = process.env[`SERVER${i}_NAME`];
            const apiUrl = process.env[`SERVER${i}_API_URL`];
            const apiToken = process.env[`SERVER${i}_API_TOKEN`];

            if (name && apiUrl && apiToken) {
                const client = new CRCONApiClient(name, apiUrl, apiToken);
                this.servers.push(client);
                console.log(`Server ${i} konfiguriert: ${name} (${apiUrl})`);
            }
        }

        if (this.servers.length === 0) {
            console.error('FEHLER: Keine Server konfiguriert! Bitte .env Datei prüfen.');
            console.error('Benötigt: SERVER1_NAME, SERVER1_API_URL, SERVER1_API_TOKEN');
            process.exit(1);
        }
    }

    setupDiscordCallbacks() {
        // Ban Callback
        this.discord.onBan(async (steamId, serverName, admin) => {
            console.log(`Ban-Request für ${steamId} auf ${serverName} von ${admin}`);
            
            // Use first server to add to blacklist (works cross-server)
            const server = this.servers[0];
            if (server) {
                const blacklistId = process.env.BLACKLIST_ID ? parseInt(process.env.BLACKLIST_ID) : 1;
                const success = await server.banPlayer(
                    steamId,
                    `Cheat alert appeal on gbg-hll.com`,
                    blacklistId
                );
                
                if (success) {
                    console.log(`✅ Spieler ${steamId} serverübergreifend geblacklisted & gekickt`);
                    console.log(`   Grund: Cheat alert appeal on gbg-hll.com`);
                    console.log(`   Aktiv auf allen ${this.servers.length} Servern`);
                }
            }

            // Tracking beenden
            const key = `${steamId}_${serverName}`;
            this.tracker.markAsResolved(key, 'banned');
            this.discord.removeMessage(key);
            this.reportedPlayers.delete(key);
        });

        // False Positive Callback
        this.discord.onFalsePositive((steamId, serverName, admin) => {
            console.log(`Fehlmeldung für ${steamId} auf ${serverName} von ${admin}`);
            
            const key = `${steamId}_${serverName}`;
            this.tracker.markAsResolved(key, 'false_positive');
            this.discord.removeMessage(key);
            this.reportedPlayers.delete(key);
            
            // Markiere als False Positive - keine weiteren Updates
            this.falsePositivePlayers.add(key);
            console.log(`  🚫 ${steamId} als False Positive markiert - keine weiteren Alerts`);
        });
    }

    async start() {
        console.log('=== HLL Anti-Cheat Monitor startet ===');
        console.log(`Überwache ${this.servers.length} Server(s)`);
        console.log(`Check Interval: ${this.config.checkInterval} Sekunden`);
        console.log(`Max Level zu tracken: ${this.config.maxLevelToTrack}`);
        console.log(`Level-Check aktiviert: ${this.config.enableLevelCheck} (Cache: ${this.config.levelCacheDuration}min)`);
        console.log(`Rollen-Filter: Tank=${this.config.excludeTankRoles}, Artillerie=${this.config.excludeArtilleryRoles}`);
        console.log(`Ausgeschlossene Rollen: ${this.config.excludedRoles.join(', ')}`);
        console.log(`Verdächtige Session KPM: ${this.config.overallKPMThreshold}`);
        console.log(`Verdächtige Rolling KPM (5min): ${this.config.rollingKPMThreshold}`);
        console.log('');

        // Discord Bot starten
        await this.discord.login();

        // Verbinde alle Server
        for (const server of this.servers) {
            try {
                await server.connect();
            } catch (error) {
                console.error(`Fehler beim Verbinden mit ${server.name}:`, error.message);
            }
        }

        // Starte Monitoring Loop
        this.startMonitoringLoop();

        // Graceful Shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    startMonitoringLoop() {
        this.monitoringInterval = setInterval(async () => {
            await this.checkAllServers();
        }, this.config.checkInterval * 1000);

        // Erste Prüfung sofort ausführen
        this.checkAllServers();
    }

    async checkAllServers() {
        for (const server of this.servers) {
            try {
                await this.checkServer(server);
            } catch (error) {
                console.error(`Fehler beim Prüfen von ${server.name}:`, error.message);
            }
        }
    }

    async checkServer(server) {
        if (!server.connected) {
            console.log(`${server.name} nicht verbunden, versuche Reconnect...`);
            try {
                await server.connect();
            } catch (error) {
                console.error(`Reconnect fehlgeschlagen für ${server.name}`);
                return;
            }
        }

        // Hole Spieler-Daten
        const players = await server.getPlayers();
        console.log(`\n[${server.name}] ${players.length} Spieler online`);
        
        // Hole Game State (Map, Mode, etc.)
        let gameState = this.gameStates.get(server.name);
        const previousGameState = gameState;
        
        if (!gameState || Math.random() < 0.1) { // Nur gelegentlich updaten
            gameState = await server.getGameState();
            if (gameState) {
                // Prüfe ob neue Map (Match Ende)
                if (previousGameState && previousGameState.mapId !== gameState.mapId) {
                    console.log(`[${server.name}] 🔄 Map-Wechsel erkannt: ${previousGameState.map} → ${gameState.map}`);
                    console.log(`[${server.name}] 🗑️ False Positive Liste für diesen Server zurückgesetzt`);
                    
                    // Update alle aktiven Alerts mit "Match beendet" Status (außer False Positives)
                    for (const [key, reportData] of this.reportedPlayers.entries()) {
                        if (key.endsWith(`_${server.name}`) && reportData.matchId === previousGameState.mapId) {
                            // Überspringe False Positive markierte Spieler
                            if (this.falsePositivePlayers.has(key)) {
                                console.log(`  ⏩ ${key} ist False Positive - kein finales Update`);
                                continue;
                            }
                            
                            const stats = this.tracker.getPlayerStats(key);
                            if (stats) {
                                console.log(`  📢 Finales Update für ${stats.playerName} - Match beendet`);
                                await this.discord.updateSuspiciousPlayerAlert(
                                    key, 
                                    stats, 
                                    previousGameState,
                                    true // matchEnded = true
                                );
                            }
                        }
                    }
                    
                    // Entferne alle False Positive Markierungen für diesen Server
                    const keysToRemove = [];
                    for (const key of this.falsePositivePlayers) {
                        if (key.endsWith(`_${server.name}`)) {
                            keysToRemove.push(key);
                        }
                    }
                    keysToRemove.forEach(key => this.falsePositivePlayers.delete(key));
                    
                    // Reset alle Sessions für diesen Server (neues Match = neue Spielzeit)
                    this.tracker.resetServerSessions(server.name);
                }
                
                this.gameStates.set(server.name, gameState);
                console.log(`[${server.name}] Map: ${gameState.map} | Modus: ${gameState.mode}`);
            }
        }

        // Prüfe jeden Spieler
        for (const player of players) {
            await this.checkPlayer(player, server.name, gameState);
        }
        
        // Zeige Tracking-Zusammenfassung
        const trackedCount = Array.from(this.tracker.trackedPlayers.keys()).filter(k => k.endsWith(`_${server.name}`)).length;
        console.log(`[${server.name}] Tracking: ${trackedCount} Spieler werden überwacht`);
    }

    async checkPlayer(playerData, serverName, gameState) {
        const server = this.servers.find(s => s.name === serverName);
        if (!server) return;

        // Hole Spieler-Role vom Team View
        const role = await server.getPlayerRole(playerData.steamId);
        if (role) {
            playerData.role = role; // Setze die echte Role
        }

        // 1. ROLLEN-FILTER: Prüfe ob Spieler ausgeschlossene Rolle hat
        if (this.config.excludeTankRoles || this.config.excludeArtilleryRoles) {
            if (role) {
                const roleLower = role.toLowerCase();
                const isExcluded = this.config.excludedRoles.some(excludedRole => 
                    roleLower.includes(excludedRole)
                );
                
                if (isExcluded) {
                    console.log(`  🚫 ${playerData.name} spielt ${role} - überspringe`);
                    return;
                }
            }
        }

        // 2. LEVEL-FILTER: Prüfe Level mit API Call + Cache
        let actualLevel = playerData.level; // Fallback auf Scoreboard-Level (meist 0)
        
        if (this.config.enableLevelCheck && this.config.maxLevelToTrack > 0) {
            actualLevel = await server.getPlayerLevel(
                playerData.steamId, 
                this.config.levelCacheDuration
            );
            
            // Ignoriere Spieler über dem Level-Limit
            if (actualLevel > this.config.maxLevelToTrack) {
                // console.log(`  🚫 ${playerData.name} ist Level ${actualLevel} - überspringe`);
                return;
            }
            
            // Update playerData mit echtem Level
            playerData.level = actualLevel;
        }

        const key = `${playerData.steamId}_${serverName}`;

        // Starte Tracking falls nicht bereits gestartet
        if (!this.tracker.trackedPlayers.has(key)) {
            this.tracker.startTracking(playerData, serverName);
            console.log(`  ➕ Neuer Spieler: ${playerData.name} (Lvl ${playerData.level}) - ${playerData.kills} Kills`);
        }

        // Update Spieler-Daten
        this.tracker.updatePlayer(playerData, serverName);

        // Hole aktuelle Stats
        const stats = this.tracker.getPlayerStats(key);
        if (!stats) return;

        // Debug-Logging für jeden Spieler
        // Verwende totalKills (Match-Total) für CRCON-genaue Anzeige
        const hasEnoughData = stats.playtimeMinutes >= this.config.minPlaytimeMinutes || stats.totalKills >= this.config.minKillsToTrigger;
        const kpmValue = parseFloat(stats.overallKPM);
        const rollingKpmValue = parseFloat(stats.rollingKPM);
        
        console.log(`  🔍 ${stats.playerName} (Lvl ${stats.level})`);
        console.log(`     Spielzeit: ${stats.playtimeFormatted} | Match Kills: ${stats.totalKills} (Session: +${stats.sessionKills})`);
        console.log(`     KPM: ${stats.overallKPM} (Schwelle: ${this.config.overallKPMThreshold}) | Rolling: ${stats.rollingKPM} (Schwelle: ${this.config.rollingKPMThreshold})`);
        const isThresholdMet = kpmValue >= this.config.overallKPMThreshold || rollingKpmValue >= this.config.rollingKPMThreshold;
        let suspiciousStatus = '❌';
        if (isThresholdMet) {
            suspiciousStatus = hasEnoughData ? '✅' : '⏳ (zu wenig Daten)';
        }

        console.log(`     Genug Daten: ${hasEnoughData ? '✅' : '❌'} | Verdächtig: ${suspiciousStatus}`);
        console.log(`     Role: ${stats.role || 'Unknown'}`);

        // Prüfe ob als False Positive markiert
        if (this.falsePositivePlayers.has(key)) {
            // console.log(`  ⏩ ${stats.playerName} ist als False Positive markiert - überspringe`);
            return;
        }

        // Prüfe ob verdächtig
        if (this.tracker.isSuspicious(key, this.config)) {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const currentMapId = gameState?.mapId || 'unknown';
            const reportData = this.reportedPlayers.get(key);
            
            // Prüfe ob bereits heute gemeldet ODER ob neue Map (Match Ende)
            const shouldSendNewAlert = !reportData || 
                                       reportData.lastAlertDate !== today || 
                                       reportData.matchId !== currentMapId;
            
            if (shouldSendNewAlert) {
                // Neuer Alert (neuer Tag oder neue Map)
                console.log(`\n🚨🚨🚨 VERDÄCHTIGER SPIELER ERKANNT! 🚨🚨🚨`);
                console.log(`   Name: ${stats.playerName} (${stats.steamId})`);
                console.log(`   Server: ${serverName}`);
                console.log(`   Session KPM: ${stats.overallKPM} (Schwelle: ${this.config.overallKPMThreshold})`);
                console.log(`   Rolling KPM: ${stats.rollingKPM} (Schwelle: ${this.config.rollingKPMThreshold})`);
                console.log(`   Level: ${stats.level} | Match Kills: ${stats.totalKills} | K/D: ${stats.kdRatio}`);
                console.log(`   Spielzeit: ${stats.playtimeFormatted} | Role: ${stats.role}`);
                console.log(`   Grund: ${!reportData ? 'Erste Meldung' : reportData.lastAlertDate !== today ? 'Neuer Tag' : 'Neue Map'}`);
                console.log(`🚨🚨🚨 Discord Alert wird gesendet! 🚨🚨🚨\n`);
                
                await this.discord.sendSuspiciousPlayerAlert(key, stats, gameState || { map: 'Unknown', mode: 'Warfare' });
                this.reportedPlayers.set(key, {
                    lastAlertDate: today,
                    matchId: currentMapId
                });
            } else {
                // Update existierende Meldung (gleicher Tag & gleiche Map)
                await this.discord.updateSuspiciousPlayerAlert(key, stats, gameState || { map: 'Unknown', mode: 'Warfare' });
            }
        }
    }

    async shutdown() {
        console.log('\n=== Shutdown wird eingeleitet ===');
        
        // Stoppe Monitoring Loop
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        // Trenne RCON Verbindungen
        for (const server of this.servers) {
            server.disconnect();
        }

        // Schließe Datenbank
        this.tracker.close();

        // Discord Bot herunterfahren
        await this.discord.shutdown();

        console.log('Shutdown abgeschlossen');
        process.exit(0);
    }
}

// Starte den Monitor
const monitor = new HLLAntiCheatMonitor();
monitor.start().catch(error => {
    console.error('Fataler Fehler beim Starten:', error);
    process.exit(1);
});
