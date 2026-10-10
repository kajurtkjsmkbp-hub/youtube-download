# 🎵 Khanza.NET - YT Downloader Pro
> **A Product of PT Khanza Digital Nusantara**  
> Solusi Downloader, Converter & Zero-Disk Live Music Streaming Server Multi-Platform Berperforma Tinggi.

---

## 🌟 Fitur Unggulan

- **🌐 Multi-Platform Engine**: Unduh video & audio tanpa watermark dari YouTube, TikTok, Instagram Reels, Facebook Watch, X/Twitter, dan SoundCloud.
- **⚡ Winamp Live Player (Zero-Disk Streaming)**: Putar audio YouTube secara live streaming langsung dari browser tanpa makan ruang harddisk (0 MB disk usage), hemat kuota >90%, dilengkapi 16-Band Spectrum Analyzer dan desain sasis retro Winamp.
- **🎤 Real-Time Karaoke & Live Synced Lyrics**: Sinkronisasi lirik kata per kata otomatis dengan vokal penyanyi (LRCLIB + YouTube Subtitle Fallback) presisi interval 30ms dan auto intro-offset compensation.
- **🎙️ Web Audio API Vocal Removal**: Fitur Karaoke instrumental instan di browser dengan penghilangan vokal center-channel tanpa memutus koneksi audio (0-restart).
- **🎛️ Studio Remaster & Dynamic HQ Enhancer**: Filter audio DSP (EBU R128 Loudnorm -14 LUFS, High-Pass 35Hz mud cut, Vocal presence boost, Crystal Treble sparkle, dan SoX 48kHz upsampling).
- **📻 Smart Radio Mix & Multi-Band Diversity**: Rekomendasi lagu beraneka ragam anti-monoton & anti-judul kembar memanfaatkan algoritma YouTube Radio Mix (`RD<videoId>`).
- **📲 Progressive Web App (PWA) Android Ready**: Dapat langsung dipasang (*install*) ke smartphone Android cukup dengan 1 klik, tampil di Home Screen dan berjalan *fullscreen standalone* seperti aplikasi native tanpa address bar browser.
- **🛡️ Zero-Crash Pure JS Storage**: Penyimpanan database atomic murni JavaScript yang super cepat, tahan korupsi, dan 100% bebas dari risiko *segmentation fault*.
- **📦 Multi-Threading & 1-Click ZIP**: Download hingga 8 thread paralel (`-N 8`) dan fitur paket ZIP otomatis.

---

## 🖥️ Panduan Instalasi Manual di LXC Proxmox VE

Panduan ini ditujukan untuk deployment pada **LXC Container** di **Proxmox Virtual Environment (PVE)** berbasis **Debian 12 (Bookworm)** atau **Ubuntu 22.04 / 24.04 LTS**.

### 1. Spesifikasi Rekomendasi Container LXC
- **OS Template**: Debian 12 Standard / Ubuntu 22.04/24.04 LTS
- **Cores**: 2 vCPU (disarankan untuk rendering/transcoding audio FFmpeg)
- **Memory**: 1024 MB – 2048 MB RAM
- **Swap**: 512 MB
- **Disk**: 10 GB – 20 GB (atau mount storage NAS/HDD terpisah untuk folder `downloads/`)
- **Network**: DHCP atau Static IP (Bridge `vmbr0`)

---

### 2. Langkah-Langkah Instalasi di LXC Proxmox

Buka **Proxmox Web UI** > Pilih LXC Anda > Buka menu **Console**, lalu jalankan langkah berikut:

#### Langkah 2.1: Refresh Index APT & Install Paket Pendukung
> 💡 **Tips Proxmox LXC**: Jika menemui error `404 Not Found` atau masalah koneksi IPv6 saat fetch package, paksa APT menggunakan IPv4 terlebih dahulu:
```bash
# Paksa APT menggunakan IPv4 (opsional jika jaringan Proxmox tidak memiliki IPv6)
echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4

# Bersihkan cache dan perbarui daftar paket repositori
apt clean
apt update
apt install -y curl wget git ffmpeg python3 python3-pip build-essential zip unzip tar
```

#### Langkah 2.2: Install Node.js v20+ (LTS)
Kita gunakan repositori resmi NodeSource:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verifikasi versi Node.js & npm
node -v
npm -v
```

#### Langkah 2.3: Install yt-dlp Versi Resmi Terbaru
Gunakan binary standalone resmi agar selalu mendapatkan update rilis terkini:
```bash
wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

# Verifikasi yt-dlp
yt-dlp --version
```

#### Langkah 2.4: Clone Proyek dari GitHub
Clone repositori ke direktori `/opt/youtube-download`:
```bash
git clone https://github.com/kajurtkjsmkbp-hub/youtube-download.git /opt/youtube-download
cd /opt/youtube-download
```

#### Langkah 2.5: Install Dependensi Node.js
```bash
npm install --omit=dev
```
> *Catatan:* Aplikasi menggunakan arsitektur penyimpanan Pure JavaScript Atomic Store (Zero-Native C++), sehingga bebas dari resiko `Segmentation fault` dan langsung terpasang instan dalam beberapa detik.

#### Langkah 2.6: Berikan Hak Akses Eksekusi pada Script
```bash
chmod +x update.sh
```

---

### 3. Menjalankan Aplikasi Sebagai Background Service

Agar aplikasi berjalan otomatis di latar belakang dan selalu hidup saat LXC dinyalakan ulang (auto-start on boot), gunakan salah satu metode berikut:

#### Pilihan A: Menggunakan Systemd (Rekomendasi Standar Linux)

1. Pasang file service yang sudah disediakan:
```bash
cp /opt/youtube-download/youtube-download.service /etc/systemd/system/
```

2. Reload daemon dan aktifkan service:
```bash
systemctl daemon-reload
systemctl enable youtube-download
systemctl start youtube-download
```

3. Cek status service:
```bash
systemctl status youtube-download
```

#### Pilihan B: Menggunakan PM2 (Process Manager)

1. Install PM2 secara global:
```bash
npm install -g pm2
```

2. Jalankan aplikasi:
```bash
cd /opt/youtube-download
pm2 start server.js --name "youtube-download"
pm2 save
pm2 startup
# (Jalankan perintah env yang dimunculkan oleh pm2 startup jika ada)
```

---

### 4. Akses Aplikasi
Buka peramban (browser) di komputer atau smartphone Anda pada jaringan yang sama:
```text
http://<IP-LXC-PROXMOX>:3000
```
*(Contoh: `http://192.168.1.150:3000`)*

---

### 5. (Opsional) Konfigurasi Nginx Reverse Proxy & Port 80
Jika ingin mengakses tanpa mengetik port `:3000`:

```bash
apt install -y nginx
```

Buat konfigurasi `/etc/nginx/sites-available/youtube-download`:
```nginx
server {
    listen 80;
    server_name _; # Ganti dengan domain atau IP LXC

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Aktifkan konfigurasi & restart Nginx:
```bash
ln -s /etc/nginx/sites-available/youtube-download /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

---

## 🔄 Panduan Sinkronisasi & Alur Pembaruan (Update Workflow)

Alur kerja sinkronisasi kode dari komputer lokal pengembangan ke GitHub, lalu diterapkan ke Proxmox LXC:

```text
  [ Komputer Lokal ]
    │ (Edit Kode)
    ▼
  git add .
  git commit -m "Pembaruan fitur..."
  git push origin main
    │
    ▼
  [ GitHub Repository ]
  (https://github.com/kajurtkjsmkbp-hub/youtube-download)
    │
    ▼ (Tarik Pembaruan di Proxmox)
  [ LXC Proxmox Server ]
  cd /opt/youtube-download
  ./update.sh
```

---

### A. Jika Ada Perubahan di Komputer Lokal

Setiap kali Anda selesai memodifikasi kode di komputer lokal, jalankan perintah ini di terminal proyek:

```powershell
# 1. Periksa file yang diubah
git status

# 2. Tambahkan semua perubahan
git add .

# 3. Buat commit pesan perubahan
git commit -m "Update: perbaikan dan penambahan fitur terbaru"

# 4. Kirim ke GitHub
git push origin main
```

---

### B. Menerapkan Update di LXC Proxmox

Setelah perubahan berhasil di-push ke GitHub, buka Console LXC Proxmox dan lakukan update cukup dengan **1 perintah**:

```bash
cd /opt/youtube-download
./update.sh
```

> **Apa yang dilakukan oleh `update.sh` secara otomatis?**
> 1. Melakukan `git pull origin main` untuk mengunduh kode terbaru.
> 2. Menjalankan `npm install --omit=dev` jika ada dependensi baru.
> 3. Memperbarui engine `yt-dlp` ke versi rilis YouTube terbaru (`yt-dlp -U`).
> 4. Me-restart service background (`systemctl restart youtube-download` atau `pm2 restart`).

#### Atau Update Manual (Tanpa script):
```bash
cd /opt/youtube-download
git pull origin main
npm install --omit=dev
yt-dlp -U
systemctl restart youtube-download
```

---

## 🛠️ Pemeliharaan & Tips Tambahan

1. **Update yt-dlp Berkala**:
   YouTube secara rutin memperbarui mekanisme streaming. Anda bisa mengupdate engine yt-dlp kapan saja langsung dari menu web GUI tombol *"⚡ Update Engine"* atau dari console Proxmox:
   ```bash
   yt-dlp -U
   ```

2. **Melihat Log Aplikasi di LXC**:
   - Jika menggunakan Systemd:
     ```bash
     journalctl -u youtube-download -f
     ```
   - Jika menggunakan PM2:
     ```bash
     pm2 logs youtube-download
     ```

3. **Backup Riwayat Database**:
   Database tersimpan di berkas `/opt/youtube-download/database.sqlite`. Cukup salin berkas tersebut untuk membuat cadangan.

---

## 📄 Lisensi & Hak Cipta

© 2026 **Khanza.NET YT Downloader Pro** — A Product of **PT Khanza Digital Nusantara**. Seluruh hak cipta dilindungi undang-undang.
