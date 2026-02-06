#!/usr/bin/env node

/**
 * CRCON API Test Script
 * 
 * Testet die Verbindung zu deinen CRCON Servern
 * Führe dieses Script aus bevor du den Bot startest
 * 
 * Usage: node test-crcon-api.js
 */

require('dotenv').config();
const https = require('https');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testCRCONServer(name, apiUrl, apiToken) {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`Testing: ${name}`, 'cyan');
    log(`URL: ${apiUrl}`, 'cyan');
    log('='.repeat(60), 'cyan');

    const tests = [
        { name: 'Connection', endpoint: '/api/get_gamestate' },
        { name: 'Live Scoreboard', endpoint: '/api/get_live_scoreboard' },
        { name: 'Players', endpoint: '/api/get_players' },
        { name: 'Blacklists', endpoint: '/api/get_blacklists' }
    ];

    let successCount = 0;

    for (const test of tests) {
        try {
            log(`\n🔍 Testing ${test.name}...`, 'yellow');
            
            const result = await makeRequest(apiUrl, test.endpoint, apiToken);
            
            if (result) {
                log(`✅ ${test.name}: SUCCESS`, 'green');
                successCount++;
                
                // Show some data
                if (test.endpoint === '/api/get_gamestate' && result) {
                    log(`   Map: ${result.current_map?.human_name || 'Unknown'}`, 'blue');
                    log(`   Players: ${(result.num_allied_players || 0) + (result.num_axis_players || 0)}`, 'blue');
                }
                
                if (test.endpoint === '/api/get_live_scoreboard' && result?.players) {
                    log(`   Players in scoreboard: ${result.players.length}`, 'blue');
                    if (result.players.length > 0) {
                        const topPlayer = result.players[0];
                        log(`   Top player: ${topPlayer.player || topPlayer.name} (${topPlayer.kills || 0} kills)`, 'blue');
                    }
                }
                
                if (test.endpoint === '/api/get_blacklists' && Array.isArray(result)) {
                    log(`   Available blacklists: ${result.length}`, 'blue');
                    if (result.length > 0) {
                        result.forEach(bl => {
                            log(`   - ID ${bl.id}: ${bl.name} (${bl.sync || 'unknown'} sync)`, 'blue');
                        });
                        log(`   ℹ️  Use BLACKLIST_ID=${result[0].id} in .env`, 'cyan');
                    }
                }
            } else {
                log(`❌ ${test.name}: FAILED - No data returned`, 'red');
            }
        } catch (error) {
            log(`❌ ${test.name}: FAILED`, 'red');
            log(`   Error: ${error.message}`, 'red');
        }
    }

    log(`\n📊 Results: ${successCount}/${tests.length} tests passed`, successCount === tests.length ? 'green' : 'yellow');
    
    return successCount === tests.length;
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
            rejectUnauthorized: false // Ignore self-signed certs
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

        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout after 10 seconds'));
        });

        req.end();
    });
}

async function main() {
    log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
    log('║        CRCON API Connection Test                      ║', 'cyan');
    log('╚════════════════════════════════════════════════════════╝', 'cyan');

    // Check if .env exists
    if (!process.env.SERVER1_API_URL) {
        log('\n❌ ERROR: .env file not found or not configured!', 'red');
        log('Please create a .env file based on .env.example', 'red');
        process.exit(1);
    }

    const servers = [];
    let allPassed = true;

    // Collect all configured servers
    for (let i = 1; i <= 3; i++) {
        const name = process.env[`SERVER${i}_NAME`];
        const apiUrl = process.env[`SERVER${i}_API_URL`];
        const apiToken = process.env[`SERVER${i}_API_TOKEN`];

        if (name && apiUrl && apiToken) {
            servers.push({ name, apiUrl, apiToken });
        }
    }

    if (servers.length === 0) {
        log('\n❌ ERROR: No servers configured in .env!', 'red');
        log('Please configure at least SERVER1_* variables', 'red');
        process.exit(1);
    }

    log(`\nFound ${servers.length} server(s) to test\n`, 'yellow');

    // Test each server
    for (const server of servers) {
        const passed = await testCRCONServer(
            server.name,
            server.apiUrl,
            server.apiToken
        );
        Next steps:', 'green');
        log('1. Check your BLACKLIST_ID in .env (see blacklists above)', 'yellow');
        log('2. 
        if (!passed) {
            allPassed = false;
        }
    }

    // Final summary
    log('\n' + '='.repeat(60), 'cyan');
    if (allPassed) {
        log('✅ ALL TESTS PASSED! You\'re ready to start the bot!', 'green');
        log('\nStart the bot with: pm2 start ecosystem.config.js', 'green');
    } else {
        log('❌ SOME TESTS FAILED! Please check your configuration.', 'red');
        log('\nCommon issues:', 'yellow');
        log('• Wrong API URL (check https:// and port)', 'yellow');
        log('• Wrong or expired API token', 'yellow');
        log('• Missing API permissions for the token', 'yellow');
        log('• Server is offline or unreachable', 'yellow');
    }
    log('='.repeat(60), 'cyan');
}

// Run the tests
main().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
});
