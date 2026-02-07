const https = require('https');

class CRCONApiClient {
    constructor(name, apiUrl, apiToken) {
        this.name = name;
        this.apiUrl = apiUrl.replace(/\/$/, ''); // Remove trailing slash
        this.apiToken = apiToken;
        this.connected = false;
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
                level: parseInt(player.level) || 0,
                // Additional CRCON data
                combat: player.combat || 0,
                offense: player.offense || 0,
                defense: player.defense || 0,
                support: player.support || 0,
                killsPerMinute: player.kills_per_minute || 0,
                killStreak: player.kill_streak || 0,
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

    async getGameState() {
        try {
            const state = await this.request('/api/get_gamestate', 'GET');
            
            if (!state) return null;

            return {
                map: state.current_map?.human_name || state.current_map?.id || 'Unknown',
                mapId: state.current_map?.id || 'unknown',
                mode: this.extractMode(state.current_map?.id),
                nextMap: state.next_map?.human_name || state.next_map?.id || 'Unknown',
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
        console.log(`[${this.name}] CRCON API getrennt`);
    }
}

module.exports = CRCONApiClient;
