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

echo "⚡ [3/4] Memperbarui yt-dlp ke versi rilis terbaru..."
if command -v yt-dlp &> /dev/null; then
    yt-dlp -U || true
fi

echo "🔄 [4/4] Memuat ulang service aplikasi..."
SUDO_CMD=""
if [ "$(id -u)" -ne 0 ] && command -v sudo &> /dev/null; then
    SUDO_CMD="sudo"
fi

if command -v pm2 &> /dev/null && pm2 list | grep -q "youtube-download"; then
    pm2 restart youtube-download
    echo "✅ Berhasil restart via PM2!"
elif systemctl is-active --quiet youtube-download 2>/dev/null; then
    $SUDO_CMD systemctl restart youtube-download
    echo "✅ Berhasil restart via Systemd!"
else
    # Jika service belum aktif, coba start langsung
    $SUDO_CMD systemctl restart youtube-download 2>/dev/null || true
    echo "✅ Perintah restart service telah dijalankan!"
fi

echo "🎉 Pembaruan selesai dan aplikasi berjalan dengan versi terbaru!"
