#!/bin/bash

echo "==================================="
echo "HLL Anti-Cheat Monitor - Installation"
echo "==================================="
echo ""

# Prüfe ob Node.js installiert ist
if ! command -v node &> /dev/null; then
    echo "❌ Node.js ist nicht installiert!"
    echo "Installiere Node.js 18+:"
    echo "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "sudo apt-get install -y nodejs"
    exit 1
fi

echo "✅ Node.js Version: $(node --version)"

# Prüfe ob npm installiert ist
if ! command -v npm &> /dev/null; then
    echo "❌ npm ist nicht installiert!"
    exit 1
fi

echo "✅ npm Version: $(npm --version)"

# Installiere Dependencies
echo ""
echo "📦 Installiere Dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Fehler bei der Installation der Dependencies!"
    exit 1
fi

echo "✅ Dependencies installiert"

# Prüfe ob PM2 installiert ist
if ! command -v pm2 &> /dev/null; then
    echo ""
    echo "⚠️  PM2 ist nicht installiert!"
    echo "Möchtest du PM2 global installieren? (j/n)"
    read -r response
    if [[ "$response" =~ ^([jJ][aA]|[jJ])$ ]]; then
        sudo npm install -g pm2
        echo "✅ PM2 installiert"
    else
        echo "⚠️  PM2 wird empfohlen für den Produktivbetrieb"
    fi
else
    echo "✅ PM2 Version: $(pm2 --version)"
fi

# Erstelle .env falls nicht vorhanden
if [ ! -f .env ]; then
    echo ""
    echo "📝 Erstelle .env Datei aus Template..."
    cp .env.example .env
    echo "✅ .env Datei erstellt"
    echo "⚠️  WICHTIG: Bearbeite die .env Datei mit deinen Zugangsdaten!"
    echo "   nano .env"
else
    echo "✅ .env Datei existiert bereits"
fi

# Erstelle logs Verzeichnis
mkdir -p logs
echo "✅ Logs Verzeichnis erstellt"

# Setze Berechtigungen
chmod 600 .env 2>/dev/null
echo "✅ Berechtigungen gesetzt"

echo ""
echo "==================================="
echo "✅ Installation abgeschlossen!"
echo "==================================="
echo ""
echo "Nächste Schritte:"
echo "1. Bearbeite die .env Datei: nano .env"
echo "2. Starte den Bot: pm2 start ecosystem.config.js"
echo "3. Prüfe Status: pm2 status"
echo "4. Zeige Logs: pm2 logs hll-anticheat-monitor"
echo ""
