#!/usr/bin/env node

/**
 * Test-Skript für Level- und Rollen-Informationen aus CRCON API
 * 
 * Testet:
 * 1. get_detailed_player_info - für Level-Daten
 * 2. get_team_view - für Rollen-Informationen (Tank/Artillerie)
 */

require('dotenv').config();
const https = require('https');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(apiUrl, endpoint, apiToken) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, apiUrl);
        
        const options = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiToken}`
            },
            rejectUnauthorized: false
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`JSON parse error: ${e.message}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function testLevelAndRoleInfo() {
    log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan');
    log('║       CRCON Level- & Rollen-Informationen Test              ║', 'cyan');
    log('╚══════════════════════════════════════════════════════════════╝', 'cyan');

    // Lade Server-Konfiguration (unterstützt beide Formate)
    const servers = [];
    for (let i = 1; i <= 10; i++) {
        // Unterstütze beide Formate: CRCON_API_URL_1 und SERVER1_API_URL
        const apiUrl = process.env[`CRCON_API_URL_${i}`] || process.env[`SERVER${i}_API_URL`];
        const apiToken = process.env[`CRCON_API_TOKEN_${i}`] || process.env[`SERVER${i}_API_TOKEN`];
        const name = process.env[`CRCON_SERVER_NAME_${i}`] || process.env[`SERVER${i}_NAME`] || `Server ${i}`;
        
        if (apiUrl && apiToken) {
            servers.push({ name, apiUrl, apiToken });
        }
    }

    if (servers.length === 0) {
        log('\n❌ Keine Server in .env konfiguriert', 'red');
        log('   Füge CRCON_API_URL_1 und CRCON_API_TOKEN_1 hinzu', 'yellow');
        return;
    }

    // Teste jeden Server
    for (const server of servers) {
        await testServer(server);
    }
}

async function testServer({ name, apiUrl, apiToken }) {
    log(`\n${'─'.repeat(60)}`, 'cyan');
    log(`📡 Server: ${name}`, 'cyan');
    log(`   URL: ${apiUrl}`, 'blue');
    log('─'.repeat(60), 'cyan');

    try {
        // 1. Hole aktuelle Spieler-Liste
        log('\n🔍 Schritt 1: Hole Spieler-Liste...', 'yellow');
        const players = await makeRequest(apiUrl, '/api/get_players', apiToken);
        
        if (!players || players.length === 0) {
            log('   ⚠️  Keine Spieler online', 'yellow');
            return;
        }

        log(`   ✅ ${players.length} Spieler gefunden`, 'green');

        // Nimm die ersten 3 Spieler für Tests
        const testPlayers = players.slice(0, 3);
        log(`   📋 Teste mit ${testPlayers.length} Spielern`, 'blue');

        // 2. Teste get_detailed_player_info für Level-Daten
        log('\n🔍 Schritt 2: Teste get_detailed_player_info (Level-Daten)...', 'yellow');
        
        for (const player of testPlayers) {
            const playerName = player.name || player.player || 'Unknown';
            const playerId = player.player_id || player.steam_id_64;

            log(`\n   👤 Spieler: ${playerName}`, 'magenta');
            log(`      Steam ID: ${playerId}`, 'blue');

            try {
                const detailedInfo = await makeRequest(
                    apiUrl, 
                    `/api/get_detailed_player_info?player_id=${playerId}`, 
                    apiToken
                );

                // Zeige vollständige Struktur des ersten Spielers
                if (testPlayers.indexOf(player) === 0) {
                    log('\n   📦 Vollständige Datenstruktur:', 'cyan');
                    log(JSON.stringify(detailedInfo, null, 2).split('\n').map(l => '      ' + l).join('\n'), 'blue');
                }

                // Suche nach Level-Informationen
                const levelFields = [];
                if (detailedInfo) {
                    Object.keys(detailedInfo).forEach(key => {
                        if (key.toLowerCase().includes('level') || 
                            key.toLowerCase().includes('rank') || 
                            key.toLowerCase().includes('xp')) {
                            levelFields.push({ key, value: detailedInfo[key] });
                        }
                    });
                }

                if (levelFields.length > 0) {
                    log(`   ✅ Level-relevante Felder gefunden:`, 'green');
                    levelFields.forEach(f => {
                        log(`      - ${f.key}: ${JSON.stringify(f.value)}`, 'green');
                    });
                } else {
                    log(`   ❌ Keine Level/Rank/XP-Felder gefunden`, 'red');
                }

                // Suche nach Rollen-Informationen
                const roleFields = [];
                if (detailedInfo) {
                    Object.keys(detailedInfo).forEach(key => {
                        if (key.toLowerCase().includes('role') || 
                            key.toLowerCase().includes('unit') || 
                            key.toLowerCase().includes('loadout') ||
                            key.toLowerCase().includes('class')) {
                            roleFields.push({ key, value: detailedInfo[key] });
                        }
                    });
                }

                if (roleFields.length > 0) {
                    log(`   ℹ️  Rollen-relevante Felder gefunden:`, 'cyan');
                    roleFields.forEach(f => {
                        log(`      - ${f.key}: ${JSON.stringify(f.value)}`, 'cyan');
                    });
                }

            } catch (error) {
                log(`   ❌ Fehler: ${error.message}`, 'red');
            }
        }

        // 3. Teste get_team_view für Rollen-Informationen
        log('\n🔍 Schritt 3: Teste get_team_view (Rollen-Informationen)...', 'yellow');
        
        try {
            const teamView = await makeRequest(apiUrl, '/api/get_team_view', apiToken);

            log('\n   📦 Team View Struktur (Ausschnitt):', 'cyan');
            const preview = JSON.stringify(teamView, null, 2).split('\n').slice(0, 50);
            log(preview.map(l => '      ' + l).join('\n'), 'blue');

            // Analysiere Struktur
            if (teamView) {
                log('\n   📊 Analyse der Team View Daten:', 'cyan');
                
                // Suche nach Rollen-Informationen in der Struktur
                const searchForRoles = (obj, path = '') => {
                    const findings = [];
                    
                    if (typeof obj !== 'object' || obj === null) return findings;
                    
                    Object.keys(obj).forEach(key => {
                        const lowerKey = key.toLowerCase();
                        const currentPath = path ? `${path}.${key}` : key;
                        
                        if (lowerKey.includes('role') || 
                            lowerKey.includes('unit') || 
                            lowerKey.includes('loadout') ||
                            lowerKey.includes('tank') ||
                            lowerKey.includes('armor') ||
                            lowerKey.includes('artillery') ||
                            lowerKey.includes('class')) {
                            findings.push({
                                path: currentPath,
                                value: typeof obj[key] === 'object' ? '{...}' : obj[key]
                            });
                        }
                        
                        // Rekursiv suchen (nur 3 Ebenen tief)
                        if (path.split('.').length < 3 && typeof obj[key] === 'object') {
                            findings.push(...searchForRoles(obj[key], currentPath));
                        }
                    });
                    
                    return findings;
                };

                const roleFindings = searchForRoles(teamView);
                
                if (roleFindings.length > 0) {
                    log(`   ✅ Rollen-relevante Felder in Team View gefunden:`, 'green');
                    roleFindings.slice(0, 10).forEach(f => {
                        log(`      - ${f.path}: ${f.value}`, 'green');
                    });
                    if (roleFindings.length > 10) {
                        log(`      ... und ${roleFindings.length - 10} weitere`, 'blue');
                    }
                } else {
                    log(`   ⚠️  Keine Rollen-Felder in Team View gefunden`, 'yellow');
                }

                // Zeige Struktur der Teams/Squads
                if (teamView.allies || teamView.axis) {
                    log('\n   🔍 Team-Struktur erkannt:', 'cyan');
                    ['allies', 'axis'].forEach(team => {
                        if (teamView[team] && teamView[team].squads) {
                            log(`      ${team.toUpperCase()}: ${Object.keys(teamView[team].squads).length} Squads`, 'blue');
                            
                            // Zeige ersten Squad als Beispiel
                            const firstSquad = Object.values(teamView[team].squads)[0];
                            if (firstSquad && firstSquad.players && firstSquad.players[0]) {
                                const examplePlayer = firstSquad.players[0];
                                log(`      Beispiel-Spieler-Daten: ${JSON.stringify(examplePlayer, null, 2).split('\n').map(l => '         ' + l).join('\n')}`, 'blue');
                            }
                        }
                    });
                }
            }

        } catch (error) {
            log(`   ❌ Team View Fehler: ${error.message}`, 'red');
        }

    } catch (error) {
        log(`\n❌ Server-Fehler: ${error.message}`, 'red');
    }
}

// Zusammenfassung
async function main() {
    await testLevelAndRoleInfo();
    
    log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan');
    log('║                      Zusammenfassung                         ║', 'cyan');
    log('╚══════════════════════════════════════════════════════════════╝', 'cyan');
    log('\n📋 Getestete Endpoints:', 'yellow');
    log('   1. /api/get_detailed_player_info?player_id=X - Für Level-Daten', 'blue');
    log('   2. /api/get_team_view - Für Rollen-Informationen (Squad/Unit/Role)', 'blue');
    log('\n🔧 Nächste Schritte:', 'yellow');
    log('   - Prüfe die Ausgabe oben auf Level/Rank/XP-Felder', 'blue');
    log('   - Prüfe auf role/unit/loadout-Felder in Team View', 'blue');
    log('   - Falls gefunden: Integration in Bot implementieren', 'blue');
    log('');
}

main().catch(error => {
    log(`\n💥 Fataler Fehler: ${error.message}`, 'red');
    process.exit(1);
});
