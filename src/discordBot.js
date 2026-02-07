const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');

class DiscordBot {
    constructor(token, channelId) {
        this.token = token;
        this.channelId = channelId;
        this.client = new Client({ 
            intents: [GatewayIntentBits.Guilds] 
        });
        
        this.activeMessages = new Map(); // key -> messageId
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            console.log(`Discord Bot eingeloggt als ${this.client.user.tag}`);
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;

            const [action, steamId, serverName] = interaction.customId.split('_');
            
            if (action === 'ban') {
                await this.handleBan(interaction, steamId, serverName);
            } else if (action === 'false') {
                await this.handleFalsePositive(interaction, steamId, serverName);
            }
        });
    }

    async login() {
        await this.client.login(this.token);
    }

    createSuspiciousPlayerEmbed(stats, gameState) {
        const embed = new EmbedBuilder()
            .setColor(this.getColorByKPM(parseFloat(stats.overallKPM)))
            .setTitle('⚠️ CRCON Watch KillRate Alert')
            .setDescription(`\`\`\`Current Match\n${gameState.map}\`\`\``)
            .addFields(
                { 
                    name: '🖥️ Server', 
                    value: `\`\`\`${stats.serverName}\`\`\``, 
                    inline: true 
                },
                { 
                    name: '👤 Player', 
                    value: `\`\`\`${stats.playerName}\`\`\``, 
                    inline: true 
                },
                { 
                    name: '🆔 Player ID', 
                    value: `\`\`\`${stats.steamId}\`\`\``, 
                    inline: true 
                },
                { 
                    name: '📊 Player Level', 
                    value: `\`\`\`${stats.level}\`\`\``, 
                    inline: true 
                },
                { 
                    name: '🎖️ Class', 
                    value: `\`\`\`${stats.role || 'Unknown'}\`\`\``, 
                    inline: true 
                },
                { 
                    name: '⏱️ Playtime', 
                    value: `\`\`\`${stats.playtimeFormatted}\`\`\``, 
                    inline: true 
                },
                { 
                    name: '💀 Kills', 
                    value: `\`\`\`${stats.sessionKills}\`\`\``, 
                    inline: true 
                },
                { 
                    name: '📈 Session KPM', 
                    value: `\`\`\`${stats.overallKPM}\`\`\``, 
                    inline: true 
                },
                { 
                    name: '📊 Rolling KPM (5min)', 
                    value: `\`\`\`${stats.rollingKPM}\`\`\``, 
                    inline: true 
                },
                { 
                    name: '☠️ Deaths', 
                    value: `\`\`\`${stats.sessionDeaths}\`\`\``, 
                    inline: true 
                },
                { 
                    name: '🎯 K/D Ratio', 
                    value: `\`\`\`${stats.kdRatio}\`\`\``, 
                    inline: true 
                }
            )
            .setTimestamp()
            .setFooter({ text: 'HLL Anti-Cheat Monitor' });

        // Waffen-Stats hinzufügen (aus CRCON Live Scoreboard)
        if (stats.weapons && Object.keys(stats.weapons).length > 0) {
            const weaponsText = Object.entries(stats.weapons)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10) // Nur die Top 10 Waffen
                .map(([weapon, kills]) => `${weapon.toUpperCase()}: ${kills}`)
                .join('\n');
            
            if (weaponsText) {
                embed.addFields({ 
                    name: '🔫 Weapons', 
                    value: `\`\`\`${weaponsText}\`\`\``, 
                    inline: false 
                });
            }
        }
        

    createActionButtons(steamId, serverName) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`ban_${steamId}_${serverName.replace(/\s/g, '_')}`)
                    .setLabel('🔨 Ban Player')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`false_${steamId}_${serverName.replace(/\s/g, '_')}`)
                    .setLabel('✅ False Positive')
                    .setStyle(ButtonStyle.Success)
            );

        return row;
    }

    getColorByKPM(kpm) {
        if (kpm >= 4.0) return 0xFF0000; // Rot - sehr verdächtig
        if (kpm >= 3.0) return 0xFF6600; // Orange - verdächtig
        if (kpm >= 2.5) return 0xFFAA00; // Gelb - fragwürdig
        return 0x00FF00; // Grün - normal
    }

    async sendSuspiciousPlayerAlert(key, stats, gameState) {
        try {
            const channel = await this.client.channels.fetch(this.channelId);
            
            if (!channel) {
                console.error('Discord Channel nicht gefunden!');
                return null;
            }

            const embed = this.createSuspiciousPlayerEmbed(stats, gameState);
            const buttons = this.createActionButtons(stats.steamId, stats.serverName);

            const message = await channel.send({
                embeds: [embed],
                components: [buttons]
            });

            this.activeMessages.set(key, message.id);
            console.log(`Verdächtiger Spieler gemeldet: ${stats.playerName} in ${channel.name}`);

            return message.id;
        } catch (error) {
            console.error('Fehler beim Senden der Discord-Nachricht:', error);
            return null;
        }
    }

    async updateSuspiciousPlayerAlert(key, stats, gameState) {
        try {
            const messageId = this.activeMessages.get(key);
            if (!messageId) return false;

            const channel = await this.client.channels.fetch(this.channelId);
            const message = await channel.messages.fetch(messageId);

            const embed = this.createSuspiciousPlayerEmbed(stats, gameState);
            const buttons = this.createActionButtons(stats.steamId, stats.serverName);

            await message.edit({
                embeds: [embed],
                components: [buttons]
            });

            return true;
        } catch (error) {
            console.error('Fehler beim Aktualisieren der Discord-Nachricht:', error);
            return false;
        }
    }

    async handleBan(interaction, steamId, serverName) {
        await interaction.deferUpdate();

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0x000000)
            .setTitle('🔨 Player Banned')
            .addFields({ 
                name: '⚖️ Status', 
                value: `\`\`\`Banned by ${interaction.user.tag}\`\`\``, 
                inline: false 
            });

        await interaction.message.edit({
            embeds: [embed],
            components: [] // Entferne Buttons
        });

        // Callback für Ban-Handler
        if (this.onBanCallback) {
            this.onBanCallback(steamId, serverName.replace(/_/g, ' '), interaction.user.tag);
        }

        console.log(`Spieler ${steamId} wurde von ${interaction.user.tag} gebannt`);
    }

    async handleFalsePositive(interaction, steamId, serverName) {
        await interaction.deferUpdate();

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0x00FF00)
            .setTitle('✅ Marked as False Positive')
            .addFields({ 
                name: '⚖️ Status', 
                value: `\`\`\`False Positive by ${interaction.user.tag}\`\`\``, 
                inline: false 
            });

        await interaction.message.edit({
            embeds: [embed],
            components: [] // Entferne Buttons
        });

        // Callback für False Positive Handler
        if (this.onFalsePositiveCallback) {
            this.onFalsePositiveCallback(steamId, serverName.replace(/_/g, ' '), interaction.user.tag);
        }

        console.log(`Spieler ${steamId} als Fehlmeldung markiert von ${interaction.user.tag}`);
    }

    onBan(callback) {
        this.onBanCallback = callback;
    }

    onFalsePositive(callback) {
        this.onFalsePositiveCallback = callback;
    }

    removeMessage(key) {
        this.activeMessages.delete(key);
    }

    async shutdown() {
        await this.client.destroy();
    }
}

module.exports = DiscordBot;
