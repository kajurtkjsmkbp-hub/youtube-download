#!/usr/bin/env bash
# ==============================================================================
# Script Pembaruan Otomatis (Update Script) - Khanza.NET YT Downloader Pro
# Untuk Server / LXC Proxmox
# ==============================================================================

set -e

echo "🚀 [1/4] Menarik perubahan terbaru dari GitHub..."
git pull origin main || git pull origin master

echo "📦 [2/4] Memeriksa & menginstal dependensi npm..."
npm install --omit=dev
npm rebuild better-sqlite3 --build-from-source

echo "⚡ [3/4] Memperbarui yt-dlp ke versi rilis terbaru..."
if command -v yt-dlp &> /dev/null; then
    yt-dlp -U || true
fi

echo "🔄 [4/4] Memuat ulang service aplikasi..."
if command -v pm2 &> /dev/null && pm2 list | grep -q "youtube-download"; then
    pm2 restart youtube-download
    echo "✅ Berhasil restart via PM2!"
elif systemctl is-active --quiet youtube-download 2>/dev/null; then
    sudo systemctl restart youtube-download
    echo "✅ Berhasil restart via Systemd!"
else
    echo "ℹ️ Service belum didaftarkan di PM2/Systemd. Silakan restart proses server secara manual."
fi

echo "🎉 Pembaruan selesai dan aplikasi berjalan dengan versi terbaru!"
