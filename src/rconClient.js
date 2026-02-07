const https = require('https');

class CRCONApiClient {
    constructor(name, apiUrl, apiToken) {
        this.name = name;
        this.apiUrl = apiUrl.replace(/\/$/, ''); // Remove trailing slash
        this.apiToken = apiToken;
        this.connected = false;
        
        // Cache für Team View (Rollen-Informationen)
        this.teamViewCache = null;
        this.teamViewCacheTime = 0;
        
        // Cache für Spieler-Level (reduce API load)
        this.levelCache = new Map(); // steamId -> { level, timestamp }
    }

    async connect() {
        try {
            // Test connection with a simple API call
            const gameState = await this.getGameState();
            if (gameState) {
                this.connected = true;
                console.log(`[${this.name}] CRCON API verbunden`);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`[${this.name}] Verbindungsfehler:`, error.message);
            return false;
        }
    }

    async request(endpoint, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, this.apiUrl);
            
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiToken}`
                },
                // Disable SSL verification for self-signed certificates
                rejectUnauthorized: false
            };

            const req = https.request(url, options, (res) => {
                let body = '';

                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on('end', () => {
                    try {
                        const json = JSON.parse(body);
                        if (json.failed) {
                            reject(new Error(json.error || 'Request failed'));
                        } else {
                            resolve(json.result);
                        }
                    } catch (e) {
                        reject(new Error(`JSON Parse Error: ${e.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (data && method !== 'GET') {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    async getPlayers() {
        try {
            // Use get_live_scoreboard for real-time stats
            const scoreboard = await this.request('/api/get_live_scoreboard', 'GET');
            
            console.log(`[${this.name}] API Response Type:`, typeof scoreboard);
            
            if (!scoreboard) {
                console.warn(`[${this.name}] Scoreboard ist null/undefined`);
                return [];
            }

            // Handle different response formats
            let players = [];
            if (Array.isArray(scoreboard)) {
                players = scoreboard;
            } else if (scoreboard.stats && Array.isArray(scoreboard.stats)) {
                // CRCON v11+ uses "stats" instead of "players"
                players = scoreboard.stats;
            } else if (scoreboard.players && Array.isArray(scoreboard.players)) {
                players = scoreboard.players;
            } else if (scoreboard.result && Array.isArray(scoreboard.result)) {
                players = scoreboard.result;
            } else {
                console.warn(`[${this.name}] Unbekanntes Scoreboard-Format:`, JSON.stringify(scoreboard).substring(0, 200));
                return [];
            }

            console.log(`[${this.name}] ${players.length} Spieler in Scoreboard gefunden`);
            
            if (players.length > 0) {
                // Debug: Zeige vollständiges erstes Spieler-Objekt zur Validierung
                console.log(`[${this.name}] Beispiel-Spieler (vollständig):`, JSON.stringify(players[0], null, 2));
            }

            return players.map(player => ({
                name: player.player || player.name || player.player_name || 'Unknown',
                steamId: player.player_id || player.steam_id_64 || player.steamId || 'unknown',
                team: player.team || 'Unknown',
                role: player.role || player.unit_name || 'Unknown',
                kills: parseInt(player.kills) || 0,
                deaths: parseInt(player.deaths) || 0,
                // CRCON v11+ hat kein level Feld mehr, verwende 0 als Fallback
                level: parseInt(player.level) || 0,
                // Spielzeit in Sekunden (CRCON v11+: time_seconds)
                playtime: parseInt(player.time_seconds) || 0,
                // Additional CRCON data
                combat: player.combat || 0,
                offense: player.offense || 0,
                defense: player.defense || 0,
                support: player.support || 0,
                killsPerMinute: player.kills_per_minute || 0,
                killStreak: player.kills_streak || player.kill_streak || 0,
                longestKillStreak: player.longest_kill_streak || 0,
                weapons: player.weapons || player.weapon || {}
            }));
        } catch (error) {
            console.error(`[${this.name}] Fehler beim Abrufen der Spieler:`, error.message);
            console.error(`[${this.name}] Stack:`, error.stack);
            return [];
        }
    }

    async getDetailedPlayer(steamId) {
        try {
            const data = await this.request(`/api/get_detailed_player_info?player_id=${steamId}`, 'GET');
            return data;
        } catch (error) {
            console.error(`[${this.name}] Fehler beim Abrufen detaillierter Spielerdaten:`, error.message);
            return null;
        }
    }

    /**
     * Hole Level eines Spielers mit Caching (reduce API load)
     * @param {string} steamId - Steam ID des Spielers
     * @param {number} cacheDurationMinutes - Cache-Dauer in Minuten (default: 30)
     * @returns {Promise<number>} - Spieler-Level oder 0 falls nicht verfügbar
     */
    async getPlayerLevel(steamId, cacheDurationMinutes = 30) {
        const now = Date.now();
        const cached = this.levelCache.get(steamId);
        
        // Prüfe Cache
        if (cached && now - cached.timestamp < cacheDurationMinutes * 60 * 1000) {
            return cached.level;
        }
        
        // Hole von API
        try {
            const detailedInfo = await this.getDetailedPlayer(steamId);
            const level = detailedInfo?.level || 0;
            
            // Speichere im Cache
            this.levelCache.set(steamId, { level, timestamp: now });
            
            return level;
        } catch (error) {
            console.error(`[${this.name}] Fehler beim Abrufen von Level für ${steamId}:`, error.message);
            return 0;
        }
    }

    /**
     * Hole Team View (Squad-Struktur mit Rollen) mit Caching
     * @param {number} cacheDurationSeconds - Cache-Dauer in Sekunden (default: 25)
     * @returns {Promise<object|null>} - Team view data oder null
     */
    async getTeamView(cacheDurationSeconds = 25) {
        const now = Date.now();
        
        // Prüfe Cache
        if (this.teamViewCache && now - this.teamViewCacheTime < cacheDurationSeconds * 1000) {
            return this.teamViewCache;
        }
        
        // Hole von API
        try {
            const teamView = await this.request('/api/get_team_view', 'GET');
            
            // Speichere im Cache
            this.teamViewCache = teamView;
            this.teamViewCacheTime = now;
            
            return teamView;
        } catch (error) {
            console.error(`[${this.name}] Fehler beim Abrufen von Team View:`, error.message);
            return null;
        }
    }

    /**
     * Hole Rolle eines Spielers aus Team View
     * @param {string} steamId - Steam ID des Spielers
     * @returns {Promise<string|null>} - Rolle oder null
     */
    async getPlayerRole(steamId) {
        const teamView = await this.getTeamView();
        if (!teamView) return null;
        
        // Suche Spieler in allen Teams und Squads
        for (const teamName of ['allies', 'axis']) {
            const team = teamView[teamName];
            if (!team || !team.squads) continue;
            
            // Prüfe Commander
            if (team.commander && team.commander.player_id === steamId) {
                return team.commander.role || null;
            }
            
            // Prüfe alle Squads
            for (const squad of Object.values(team.squads)) {
                if (!squad.players) continue;
                
                const player = squad.players.find(p => p.player_id === steamId);
                if (player) {
                    return player.role || null;
                }
            }
        }
        
        return null;
    }

    /**
     * Cleane alte Cache-Einträge
     */
    clearOldCache() {
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 Stunde
        
        for (const [steamId, data] of this.levelCache.entries()) {
            if (now - data.timestamp > maxAge) {
                this.levelCache.delete(steamId);
            }
        }
        
        console.log(`[${this.name}] Cache bereinigt. ${this.levelCache.size} Einträge verbleibend`);
    }

    async getGameState() {
        try {
            const state = await this.request('/api/get_gamestate', 'GET');
            
            if (!state) return null;

            // Verwende human_name wenn verfügbar, sonst formatiere die ID
            const mapName = state.current_map?.human_name || 
                           this.formatMapName(state.current_map?.id) || 
                           'Unknown';

            return {
                map: mapName,
                mapId: state.current_map?.id || 'unknown',
                mode: this.extractMode(state.current_map?.id),
                nextMap: state.next_map?.human_name || 
                        this.formatMapName(state.next_map?.id) || 
                        'Unknown',
                alliedScore: state.allied_score || 0,
                axisScore: state.axis_score || 0,
                timeRemaining: state.time_remaining || '0:00:00',
                players: {
                    allied: state.num_allied_players || 0,
                    axis: state.num_axis_players || 0,
                    total: (state.num_allied_players || 0) + (state.num_axis_players || 0)
                }
            };
        } catch (error) {
            console.error(`[${this.name}] Fehler beim Abrufen des Spielstatus:`, error.message);
            return null;
        }
    }

    formatMapName(mapId) {
        if (!mapId) return null;
        
        // Entferne Mode-Suffix (_warfare, _offensive, etc.)
        let name = mapId.replace(/_warfare|_offensive/gi, '');
        
        // Ersetze Underscores mit Leerzeichen
        name = name.replace(/_/g, ' ');
        
        // Capitalize jedes Wort
        name = name.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        
        // Füge Mode hinzu
        const mode = this.extractMode(mapId);
        
        return `${name} ${mode}`;
    }

    extractMode(mapId) {
        if (!mapId) return 'Warfare';
        if (mapId.includes('warfare')) return 'Warfare';
        if (mapId.includes('offensive')) return 'Offensive';
        return 'Warfare';
    }

    async getLiveGameStats() {
        try {
            const stats = await this.request('/api/get_live_game_stats', 'GET');
            return stats;
        } catch (error) {
            console.error(`[${this.name}] Fehler beim Abrufen der Live-Stats:`, error.message);
            return null;
        }
    }

    async banPlayer(steamId, reason, blacklistId = null) {
        try {
            // Use blacklist API for cross-server bans
            // If no blacklist_id provided, it will use the default blacklist (ID 1)
            const effectiveBlacklistId = blacklistId || 1;
            
            const payload = {
                player_id: steamId,
                blacklist_id: effectiveBlacklistId,
                reason: reason,
                admin_name: 'HLL AntiCheat Monitor',
                expires_at: null // Permanent (null = never expires)
            };

            // Add to blacklist
            await this.request('/api/add_blacklist_record', 'POST', payload);
            console.log(`[${this.name}] Spieler ${steamId} zur Blacklist hinzugefügt: ${reason}`);
            
            // Kick player if still online (blacklist will prevent rejoin)
            try {
                await this.kickPlayer(steamId, reason);
                console.log(`[${this.name}] Spieler ${steamId} wurde gekickt (Blacklist aktiv)`);
            } catch (kickError) {
                // Player might already be offline, that's ok
                console.log(`[${this.name}] Kick fehlgeschlagen (Spieler wahrscheinlich offline): ${kickError.message}`);
            }
            
            return true;
        } catch (error) {
            console.error(`[${this.name}] Fehler beim Blacklisten:`, error.message);
            return false;
        }
    }

    async kickPlayer(steamId, reason) {
        try {
            await this.request('/api/kick', 'POST', {
                player_id: steamId,
                reason: reason,
                by: 'HLL AntiCheat Monitor'
            });
            return true;
        } catch (error) {
            console.error(`[${this.name}] Fehler beim Kicken:`, error.message);
            return false;
        }
    }

    async messagePlayer(steamId, message) {
        try {
            await this.request('/api/message_player', 'POST', {
                player_id: steamId,
                message: message,
                by: 'HLL AntiCheat Monitor'
            });
            return true;
        } catch (error) {
            console.error(`[${this.name}] Fehler beim Senden der Nachricht:`, error.message);
            return false;
        }
    }

    disconnect() {
        this.connected = false;
        this.sessionId = null;
        
        // Cleane Cache
        this.teamViewCache = null;
        this.teamViewCacheTime = 0;
        this.levelCache.clear();
        
        console.log(`[${this.name}] CRCON API getrennt`);
    }
}

module.exports = CRCONApiClient;
