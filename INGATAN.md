# 🧠 INGATAN & DOKUMENTASI LENGKAP PROYEK
# Khanza.NET - YT Downloader Pro
> **A Product of PT Khanza Digital Nusantara**  
> Terakhir diperbarui: 2026-10-10  
> Repositori GitHub: [https://github.com/kajurtkjsmkbp-hub/youtube-download](https://github.com/kajurtkjsmkbp-hub/youtube-download)  
> Dokumen ini memuat seluruh rekam jejak arsitektur, konfigurasi sistem, aturan branding, dan daftar lengkap fitur yang telah diimplementasikan.

---

## 1. Identitas & Aturan Branding Produk

- **Nama Aplikasi:** `Khanza.NET - YT Downloader Pro`
- **Pemilik Hak Cipta / Footer:**  
  `© 2026 Khanza.NET YT Downloader Pro — A Product of PT Khanza Digital Nusantara`
- **Aturan Tegas:**
  - **DILARANG** mencantumkan frasa *"For personal use only. Powered by yt-dlp & FFmpeg."* (telah dihapus secara permanen).
  - Tampilan, teks tombol, toast notification, dan dokumentasi menggunakan Bahasa Indonesia yang profesional dan ramah pengguna.

---

## 2. Arsitektur & Teknologi (Tech Stack)

| Komponen | Teknologi | Keterangan |
|---|---|---|
| **Runtime** | Node.js (v20+) | Backend REST API berkecepatan tinggi |
| **Framework** | Express.js 4.18 | Routing API & static web serving |
| **Database** | Pure JavaScript Atomic Store (`database.json`) | 100% Zero-Crash & Zero-Segfault. Bebas dari ketergantungan binary C++ native (pengganti `better-sqlite3`), aman di semua kernel LXC Proxmox & OS |
| **Core Downloader** | `yt-dlp` (Versi Rilis Resmi) | Engine ekstraksi streaming video & audio |
| **Core Converter** | `FFmpeg` & `FFprobe` | Transcoding audio/video, normalisasi suara, & trimming |
| **QR Code Engine** | `qrcode` (npm) | Menghasilkan QR DataURL secara dinamis untuk transfer file via WiFi lokal |
| **Zip Archiver** | Native Windows `tar -a` & Linux `zip`/`python3 zipfile` | Pembuatan file ZIP super cepat lintas platform |
| **Frontend UI** | HTML5, CSS3 Glassmorphism, Vanilla JS | Desain dark neon modern, responsif desktop & mobile |
| **Ikon & Tipografi**| Font Awesome 6.5.1 & Google Font 'Inter' | Tampilan tajam dan estetis |

---

## 3. Struktur Berkas & Direktori

```text
YOUTUBE-DOWNLOAD/
├── downloads/                  # Folder penyimpanan hasil konversi & file unduhan (.gitkeep)
├── public/
│   └── index.html              # Antarmuka web utama (UI, Player, Search, Batch, QR Modal)
├── database.json               # File database JSON aktif (Atomic persist, Zero-Segfault)
├── db.js                       # Driver database Pure JavaScript (CRUD jobs & files)
├── INGATAN.md                  # File memori & dokumentasi ini
├── package.json                # Dependensi proyek murni JS (express, cors, qrcode, uuid)
├── package-lock.json           # Lockfile dependensi
├── README.md                   # Dokumentasi publik GitHub & panduan deployment Proxmox LXC
├── server.js                   # Server backend utama (Express, yt-dlp spawn, REST API)
├── update.sh                   # Script update otomatis 1-baris untuk server Linux/Proxmox
└── youtube-download.service    # Template Systemd background service untuk Proxmox LXC
```

---

## 4. Seluruh Fitur Utama yang Telah Diimplementasikan

### 1. 🌐 Dukungan Multi-Platform
Bukan hanya YouTube, sistem mampu mengekstrak konten tanpa watermark dari:
- **YouTube** (Video tunggal, Shorts, Playlist, Radio Mix dinamis)
- **TikTok** (Video HD tanpa watermark)
- **Instagram** (Reels & Video postingan)
- **Facebook Watch**
- **Twitter / X**
- **SoundCloud & platform media lainnya**

### 2. 🎚️ Format & Kualitas Audio/Video Lengkap
- **Audio:** MP3 (320 kbps Studio, 256 kbps High, 192 kbps Standard, 128 kbps, 64 kbps).
- **Video:** MP4 (4K 2160p, Full HD 1080p, HD 720p, SD 480p, Low 360p).
- **Subtitle:** Format khusus `.SRT` untuk teks terjemahan saja.
- **Auto-Embedding:** Otomatis menanamkan Thumbnail asli (Cover Art) dan Metadata ID3 (Judul, Artis) ke file MP3.

### 3. 🛡️ Suite Anti-Bot & Bypass Google Tingkat Tinggi
Untuk menjamin keamanan pemakaian jangka panjang dan bebas blokir IP:
1. **Ambil Sesi Cookies Browser (`--cookies-from-browser`):**
   - Mendukung Google Chrome, Microsoft Edge, Mozilla Firefox, dan Brave.
   - Mengambil token login lokal sehingga Google mendeteksi request sebagai manusia sah (menghilangkan pesan *"Sign in to confirm you're not a bot"* & membuka video berbatas umur).
2. **Auto-Fallback Client Rotation:**
   - Jika satu client terkena respon HTTP 403 atau throttle, server otomatis memutar profil extractor: `android,web` ➔ `ios,web` ➔ `tv,web` ➔ `mweb,web` ➔ `web` tanpa interupsi.
3. **Smart Human Delay:**
   - Menyisipkan jeda mikro (0.5 – 2.5 detik) acak antar item pada playlist skala besar agar tidak dicurigai sebagai bot scraping.
4. **Turbo Acceleration Mode:**
   - Unduhan multi-threading 8 chunk paralel (`-N 8`, `--http-chunk-size 10M`, FFmpeg `-threads 4`).
5. **1-Click Engine Update:**
   - Tombol pembaruan langsung dari GUI untuk mendownload versi yt-dlp rilis terbaru saat YouTube merubah algoritma.

### 4. 🔍 Pencarian YouTube Langsung (In-App Search)
- Pengguna tidak perlu membuka tab youtube.com.
- Cukup ketik judul lagu/artis di tab **"Cari di YouTube"**.
- Menampilkan grid hasil (thumbnail, durasi, views, channel) dengan tombol cepat **"⚡ MP3"** atau **"🎬 Video"** untuk langsung mendownload dalam 1 klik.

### 5. 📋 Auto-Paste Clipboard
- Tombol **"📋 Tempel Cepat"** di samping kolom URL.
- Membaca clipboard menggunakan `navigator.clipboard.readText()`, mengisi input, dan langsung mengeksekusi analisis link secara instan.

### 6. 🔊 Normalisasi Audio Studio (Loudnorm EBU R128)
- Filter FFmpeg terintegrasi: `-af loudnorm=I=-14:TP=-1.5:LRA=11`.
- Menyeimbangkan desibel suara lagu agar seragam, tidak mendadak pelan atau memekakkan telinga saat diputar di sound system mobil atau headphone.

### 7. 📝 Ekstraksi & Embed Subtitle (.SRT / Terjemahan)
- Pilihan download teks subtitle saja (`.srt`).
- Pilihan penggabungan subtitle Bahasa Indonesia & Inggris (*soft-subs embedding*) ke dalam file video MP4.

### 8. 📱 Share File ke Smartphone via QR Code (Local Wi-Fi)
- Tombol **"📱 Share ke HP"** pada setiap unduhan dan baris riwayat.
- Mendeteksi IP LAN lokal mesin secara otomatis (misal: `192.168.x.x`).
- Memunculkan popup QR code yang dapat di-scan langsung oleh kamera smartphone di jaringan Wi-Fi yang sama untuk transfer file nirkabel.

### 9. 📂 Export Playlist (.M3U) untuk Mobil / Player Offline
- Tombol **"📂 Export .M3U"** pada tab Riwayat Unduhan.
- Endpoint `/api/export-m3u` menghasilkan berkas standar `#EXTM3U` berisi daftar seluruh lagu yang telah diunduh, siap disalin ke flashdisk untuk pemutar musik mobil, VLC, Winamp, atau AIMP.

### 10. 📑 Batch Multi-Link Downloader
- Tab **"Batch Multi-Link"** dengan textarea multi-baris.
- Pengguna dapat memasukkan 10–50 link sekaligus.
- Antrian diproses berurutan secara otomatis dengan indikator status (*Antrian*, *Mengunduh*, *Selesai*, *Gagal*) dan tautan download per file.

### 11. 🎵 In-Browser Media Player (Floating Drawer)
- Pemutar audio & video bawaan yang melayang di bagian bawah halaman.
- Mendukung HTTP 206 Partial Content (seeking bar & preview instan tanpa harus mengunduh file ke disk lokal).

### 12. ✂️ Audio & Video Trimmer (Potong Durasi)
- Pengguna bisa memasukkan waktu potong (misal mulai `00:30` hingga `01:45`).
- Menggunakan `--download-sections` yt-dlp sehingga hanya bagian lagu yang diinginkan (reff/ringtone) yang diunduh.

### 13. 📦 Seleksi Playlist Fleksibel & 1-Click ZIP
- Daftar video playlist dilengkapi checkbox untuk memilih lagu mana saja yang ingin diunduh.
- Opsi batasan jumlah (15, 30, 50, 100, atau semua).
- Tombol **"Unduh Semua Sekaligus (.ZIP)"** menggunakan native Windows `tar` berkecepatan tinggi.

### 14. 📂 Integrasi Windows File Explorer
- Tombol **"Buka Folder di PC"** di antarmuka web.
- Endpoint `/api/open-folder` yang langsung mengeksekusi `start "" "<path>"` untuk membuka folder Windows Explorer secara otomatis di komputer pengguna.

### 15. 🗄️ Database SQLite WAL Mode
- Menyimpan histori unduhan, metadata file, ukuran byte, format, dan status job.
- Skema tabel: `jobs` dan `downloaded_files` dengan foreign key cascade dan indexing.

### 16. 📊 Indikator Persentase & Kecepatan Unduhan Real-Time
- Bar kemajuan unduhan kini bergerak dinamis dari **0% hingga 100%**.
- Menampilkan rincian transparan: persentase angka (misal: `45.2%`), kecepatan unduh stream (misal: `14.5 MiB/s`), sisa waktu (ETA), dan fase konversi audio FFmpeg (`98%`). Pengguna tidak lagi bingung apakah proses sedang berjalan atau macet.

### 17. 🏷️ Penamaan Berkas Otomatis Sesuai Judul & Kustomisasi Judul
- **Solusi Masalah "Single Video":** Riwayat unduhan sebelumnya menampilkan label generik *"Single Video"*. Kini telah diperbaiki sehingga judul riwayat selalu mengikuti judul video/lagu asli yang diunduh (misalnya: *"Ebiet G. Ade - Camelia 1 (Full Album)"* atau *"Peterpan - Kumpulan Lagu Peterpan Terbaik"*).
- **Auto-Migrasi Database:** Seluruh rekaman lama di SQLite yang masih berlabel *"Single Video"* otomatis dimigrasikan ke judul berkas aslinya saat sistem dihidupkan.
- **Kustomisasi Judul (Edit/Rename):** Ditambahkan tombol pensil (Edit) di setiap item riwayat unduhan sehingga pengguna dapat menyesuaikan atau mengubah nama judul lagu secara langsung di UI.
- **Endpoint Rename:** Didukung oleh endpoint `POST /api/history/rename` yang langsung memperbarui SQLite dan memori cache.

### 18. 🎛️ Studio Remaster & Crystal Clear HQ Audio Enhancer (DSP EQ + EBU R128)
- **Tujuan:** Mengatasi video YouTube lama/jadul yang audionya tidak HQ, terkompresi kusam/mendem, atau suaranya terlalu pelan.
- **Filter Chain Canggih (FFmpeg DSP):**
  1. `highpass=f=35`: Memangkas *sub-bass mud rumble* & noise dengung di bawah 35 Hz.
  2. `equalizer=f=3200:t=q:w=1.5:g=2.8`: Mendongkrak *clarity & vocal presence* (+2.8 dB) agar suara penyanyi & instrumen jernih di depan.
  3. `equalizer=f=11000:t=q:w=1.8:g=3.2`: Mengembalikan *treble air sparkle* (+3.2 dB) yang hilang akibat kompresi lawas YouTube.
  4. `loudnorm=I=-14:TP=-1.5:LRA=11`: Normalisasi volume siaran dunia standar **EBU R128** (standar yang sama dengan Spotify & Apple Music). Lagu yang suaranya pelan otomatis diangkat hingga standar yang nyaman dan stabil tanpa sember (*brickwall True-Peak limiter*).
  5. `aresample=48000:resampler=soxr`: Up-sampling studio resolusi tinggi ke 48.000 Hz dengan *SoX Resampler*.
  6. Encoding ke format **MP3 320 kbps CBR High Quality** dengan cover art ID3v2.
- **UI & Persistensi:** Opsi ini dilengkapi switch toggle interaktif ungu bercahaya (`HQ AUDIO PRO`) dan preferensinya otomatis diingat di `localStorage`.

### 19. ⚡ Winamp Live Player (Zero-Disk / Streaming Audio Langsung Hemat Kuota)
- **Konsep:** Memutar musik YouTube secara live murni audio (tanpa gambar/video), langsung dari browser tanpa diunduh ke komputer (0 MB penggunaan disk lokal), menghemat 90%+ kuota bandwidth internet.
- **Tampilan Retro Winamp Ikonik:**
  - Tampilan sasis metalik retro dengan aksen baut dan titlebar klasik Winamp.
  - Layar LCD hijau digital neon dengan **LED Timer 7-Segment**, badge teknis (`160 KBPS`, `48 KHZ`, `STEREO`, `LIVE OPUS`).
  - **Teks Berjalan Marquee:** Menampilkan judul lagu yang sedang berputar secara estetik.
  - **Visualizer / Spectrum Analyzer 16-Band:** Grafik batang equalizer neon hijau-kuning-merah dengan *falling peak dots* yang bergoyang dinamis 60 FPS mengikuti alunan musik.
  - **Tombol Kontrol Klasik:** Prev, Play, Pause, Stop, Next, Eject, Seek Bar, dan Volume Slider.
  - **Winamp Playlist Editor:** Menampilkan daftar lagu antrian lengkap dengan nomor trek, judul, uploader, dan durasi.
  - **Pencarian YouTube Langsung di Winamp:** Pengguna cukup mengetik judul lagu atau menempel link untuk langsung memutar dan menambahkannya ke antrian.
  - **Tombol Konversi Cepat:** Tersedia tombol unduh di setiap item jika pengguna sewaktu-waktu ingin mendownloadnya secara offline.

### 20. 📻 Solusi Anti-Monoton, Shuffle, Repeat & Smart Radio Mix (YouTube RD Integration)
- **Latar Belakang Masalah:** Jika pengguna mencari lagu spesifik seperti *"peterpan yang terdalam"*, YouTube secara default menampilkan 8+ video berisi lagu yang sama (versi official, cover, karaoke, chord). Ini membuat playlist monoton dan berulang-ulang lagu yang sama.
- **Solusi Komprehensif yang Diimplementasikan:**
  1. **Mode Acak (`🔀 SHUFFLE`):** Tombol klasik Winamp dengan glow hijau aktif yang mengacak urutan pemutaran lagu di playlist secara non-deterministik.
  2. **Mode Ulang (`🔁 REPEAT`):** Opsi untuk mengulang lagu favorit secara terus menerus bila diinginkan.
  3. **Tombol "📻 Smart Radio Mix":**
     - Tersedia di sebelah tombol Cari pada Winamp.
     - Menggunakan algoritma **YouTube Radio Mix (`list=RD<videoId>`)** dan pencarian relasional multi-artis (`ytsearch12:... lagu hits terbaik mix`).
     - Menyaring & mendeduplikasi judul-judul serupa sehingga menghasilkan variasi lagu-lagu hits sejenis yang beragam (misal: mencari *Peterpan Yang Terdalam* akan menghasilkan variasi hits terbaik: *Menghapus Jejakmu, Ada Apa Denganmu, Mungkin Nanti, Ku Katakan Dengan Indah, Menunggumu, Separuh Aku, Doy*).
  4. **Tombol Radio Mix per Baris Lagu (`[📻]`):** Di setiap item lagu playlist Winamp, terdapat tombol radio berwarna ungu-pink untuk langsung meracik lagu variasi yang segenre dengan lagu tersebut dalam 1 kali klik.
  5. **Auto Continuous Discovery:** Ketika playlist mencapai akhir lagu, Winamp secara cerdas otomatis mengambil rekomendasi lanjutan dari YouTube sehingga musik terus mengalir tanpa henti dan tidak pernah monoton.

### 21. 🎸 Smart Multi-Band Diversity Engine & Strict Anti-Judul Kembar
- **Masalah Utama yang Diselesaikan:** Ketika pengguna mencari lagu spesifik (seperti *"cinta yang sempurna"*), YouTube cenderung menampilkan 5-8 variasi judul yang persis sama (versi cover, DJ slow remix, versi dangdut, versi band lain). Pengguna ingin alur musik yang cerdas dan mengalir otomatis ke band-band legendaris lain (misal setelah lagu tersebut, lanjut ke Peterpan, lanjut ke Boomerang, Dewa 19, dll.).
- **Solusi yang Diterapkan:**
  1. **Resolusi Seed Video:** Kata kunci pencarian pertama-tama di-resolve menjadi 1 video premier resmi (misal `Kangen Band - Cinta Yang Sempurna`).
  2. **YouTube Radio Mix Extraction (`list=RD<vid>`):** Memanfaatkan algoritma rekomendasi YouTube Radio Mix yang mengetahui kecocokan lagu-lagu hits sejenis.
  3. **Strict Title Keyword Deduplication:** Menyaring ketat kata kunci judul inti (`cinta`, `sempurna`). Hanya versi pertama yang diizinkan masuk. Seluruh versi lain (DJ remix, cover, uploader lain) **langsung diblokir/dibuang**.
  4. **Artist Frequency Balancing:** Membatasi maksimal 1 lagu per artis/channel agar artis yang sama tidak mendominasi playlist.
  5. **Injeksi Band Legendaris (Peterpan, Boomerang, Dewa 19):** Jika pencarian bertema pop/rock Indonesia, sistem secara dinamis memastikan ada lagu hits terbaik dari band-band ikonik seperti **Peterpan / NOAH**, **Boomerang**, **Dewa 19**, **Sheila On 7**, **ST12**, **Ungu**, **Samsons**, **Jamrud**.
  6. **Rute Otomatis Tombol "Cari":** Di pemutar Winamp, tombol **"Cari & Putar"** maupun tombol Enter otomatis diarahkan ke Smart Multi-Band Engine ini sehingga pengguna tidak akan pernah lagi mendapati daftar lagu kembar.

### 22. 🎧 Engine "Aliran Selera Saya" (`/api/taste-mix`)
- **Konsep:** Memutar musik yang disesuaikan secara otomatis dengan histori tontonan/unduhan dan preferensi musik yang sering didengarkan pengguna.
- **Cara Kerja:**
  - Mengambil data artis/lagu yang sering diunduh dari database SQLite (`database.sqlite`).
  - Mendukung input URL histori atau playlist YouTube pengguna langsung.
  - Memadukan artis favorit pengguna (misal: *Ebiet G. Ade*, *Peterpan*, *Boomerang*, *Dewa 19*, *Sheila On 7*, *Iwan Fals*, *Jamrud*) secara paralel (`Promise.all`) dalam 3-4 detik.
### 23. 🎛️ Real-Time HQ Audio Stabilizer & Dynamic Loudness Normalizer (Live Stream)
- **Latar Belakang Permintaan:** Saat memutar musik secara live langsung dari YouTube, kualitas dan tingkat kekerasan suara antar video sangat tidak stabil (ada video jadul tahun 2000-an suaranya sangat pelan/tenggelam, dan ada video remix modern yang suaranya terlalu keras/meledak dan pecah). Pengguna menginginkan suara yang pelan otomatis distabilkan naik, yang terlalu keras distabilkan agar tidak memekakkan telinga, serta kualitas audio disempurnakan menjadi jernih berstandar HQ Studio.
- **Teknologi Pemrosesan Real-Time yang Diterapkan di `/api/stream-live-play`:**
  1. **Dynamic Zero-Delay Compander (`compand=attacks=0.02:decays=0.25:points=-80/-80|-45/-28|-20/-14|0/-6:gain=3.5`):**
     - Lagu/bagian yang terlalu pelan (< -45 dB) otomatis diangkat naik hingga +17 dB secara musikal.
     - Suara diratakan ke standar broadcast **-14 LUFS**.
     - Puncak suara keras di atas -6 dB otomatis diredam (*peak compression*) sehingga tidak pecah atau menusuk telinga.
  2. **Vocal Clarity & Presence Equalizer (`equalizer=f=3200:t=q:w=1.5:g=2.8`):**
     - Meningkatkan frekuensi vokal 3.2 kHz sebesar +2.8 dB sehingga suara penyanyi pada rekaman lama (seperti Peterpan, Boomerang, Ebiet G. Ade, Ahmad Dhani) terdengar maju, jernih, dan tidak tertutup musik latar.
  3. **Crystal Treble Air Sparkle (`equalizer=f=10000:t=q:w=1.8:g=3.0`):**
     - Memberikan kilau treble frekuensi tinggi yang renyah dan transparan khas mastering studio modern (HQ Audio).
  4. **Sub-Bass DC Mud Filter (`highpass=f=35`):**
     - Memotong dengung dan getaran liar di bawah 35 Hz agar bass tetap bulat, padat, dan tidak berdengung kotor di speaker/headphone.
  5. **Tampilan & Kontrol di Deck Winamp:**
     - Badge neon aktif di layar LCD Winamp: `HQ STABILIZER` (hijau), `192 KBPS`, `48 KHZ`, `AUTO-NORM (-14 LUFS)` (emas).
     - Tombol toggle `[HQ AUDIO]` di barisan tombol kontrol Winamp untuk mengaktifkan/menonaktifkan filter secara instan.
     - Marquee LCD menampilkan status: `✨ HQ STABILIZER ACTIVE (-14 LUFS)` saat lagu diputar.

### 24. 🎤 Winamp Karaoke & Live Synced Lyrics (LRCLIB + YouTube Subtitles Fallback)
- **Latar Belakang Permintaan:** Pengguna menginginkan lirik lagu muncul dan bergulir otomatis menyesuaikan vokal penyanyi yang sedang dinyanyikan secara real-time pada setiap lagu yang diputar di Winamp, dengan penataan tata letak (layout) yang tetap estetik berdampingan dengan playlist.
- **Implementasi Komprehensif:**
  1. **Dual Engine Sumber Lirik Berbasis API:**
     - **LRCLIB Database:** Mengakses database lirik tersinkronisasi global (`https://lrclib.net/api/search`) dengan format timestamp presisi milidetik (`[mm:ss.xx]`).
     - **Intelligent Noise Cleaner & Multi-Query Permutations:** Membersihkan secara otomatis segala imbuhan judul video YouTube (`(OFFICIAL MUSIC VIDEO)`, `[Official Lyric Video]`, `- LIRIK`, `VIRAL TIKTOK`, dll.) dan mencoba kombinasi pencarian cerdas (`Artist Title`, `Title Artist`, `Title saja`, `Channel Title`) agar lirik lagu selalu ditemukan 100%.
     - **YouTube Auto-Captions / Subtitles & Description Fallback:** Jika lagu belum terindeks di database lirik, sistem mengekstrak transkrip/subtitle YouTube atau bait lirik pada deskripsi video YouTube dan mengonversinya menjadi lirik ber-timestamp.
     - **In-Memory Cache:** Lirik yang pernah dimuat disimpan dalam memori agar saat diputar kembali langsung keluar seketika (0 ms latency).
  2. **Jendela Karaoke Estetik & Layar LCD Live:**
     - **Baris Lirik Vokal Live di Layar LCD Winamp (`.winamp-lcd-karaoke`):** Di dalam layar LCD sasis Winamp tepat di bawah judul lagu, terdapat baris display karaoke neon hijau yang langsung menampilkan vokal yang sedang dinyanyikan secara real-time.
     - **Jendela Karaoke Besar (`.winamp-lyrics-window`):** Ditempatkan berdampingan secara presisi dengan jendela playlist (`.winamp-bottom-grid`), dengan latar CRT glassmorphism gelap dan pendar ungu.
     - **Mode Tampilan Tab Switcher:** Tersedia 3 tombol pilihan tampilan di atas playlist: `[🔀 Split (Berdampingan)]`, `[🎤 Fokus Lirik Karaoke]`, dan `[📋 Playlist Saja]`.
     - **Auto Container Expansion:** Saat mode Winamp aktif, lebar kontainer otomatis melebar hingga `1160px` sehingga Playlist dan Lirik tampil leluasa berdampingan tanpa terdorong ke bawah.
  3. **Sinkronisasi Vokal Real-Time & Auto-Scroll:**
     - Baris vokal yang sedang dinyanyikan menyala terang dalam warna neon hijau (`#00ff66`) dengan border aksen hijau, efek glow, dan pembesaran halus (`scale(1.05)`).
     - Baris yang sudah lewat otomatis memudar halus (`opacity: 0.6`, warna abu-abu gelap).
     - Tampilan otomatis bergulir (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) menjaga baris aktif selalu berada tepat di tengah layar pengguna tanpa perlu digulir manual.
  4. **Interaktif & Click-to-Seek:**
     - Pengguna dapat mengklik baris lirik mana pun untuk langsung melompat (*seek*) memutar lagu tepat di bagian vokal tersebut.
     - Dilengkapi tombol salin lirik (`[📋]`) pada titlebar untuk menyalin seluruh teks lirik lagu ke clipboard hanya dalam 1 klik.

---

### 25. ⏱️ Vocal Timing Synchronization Engine & Kalibrasi Presisi Tinggi (Anti-Lag & Auto-Intro Offset)
- **Tantangan Masalah:** 
  1. Event standar browser `audio.ontimeupdate` hanya menyala ~4 kali per detik (setiap 250ms), menyebabkan lirik sering terasa sedikit terlambat dibandingkan vokal penyanyi asli.
  2. Klip video resmi YouTube sering memiliki adegan pembuka / intro video (misal 5–8 detik percakapan atau hening sebelum musik dimulai, seperti pada video klip *Peterpan - Yang Terdalam*), sementara lirik di database album studio berpatokan dari detik `00:00`.
- **Solusi Rekayasa Presisi Tinggi:**
  1. **High-Frequency 30ms Micro-Timer Loop (~33 FPS):**
     - Menggantikan polling HTML5 `timeupdate` dengan timer interval presisi tinggi 30ms (`startLyricsSyncTimer`).
     - Sinkronisasi vokal diperiksa 33 kali per detik, menghasilkan transisi highlight vokal yang instan dan mulus tepat pada ketukan suku kata pertama penyanyi.
  2. **Automatic Intro-Offset Compensation (`autoOffset`):**
     - Endpoint `/api/lyrics` membandingkan durasi video YouTube (`ytDuration`) dengan durasi resmi lagu di studio album (`albumDuration`).
     - Jika terdeteksi selisih jeda intro klip (misal 8 detik pada *Peterpan - Yang Terdalam*), backend otomatis menghitung dan menyertakan `autoOffset: 8.0` pada metadata lirik.
     - Frontend otomatis menggeser trigger lirik sesuai jeda intro tersebut sehingga pengguna tidak perlu repot mengatur sendiri.
     - Layar menampilkan badge status hijau: `⚡ AUTO-SYNC: +8.0s (Intro Video Kompensasi)`.
  3. **Toolbar Kalibrasi Timing Interaktif (Real-Time Vocal Offset Buttons):**
     - Tepat di atas lirik karaoke, disediakan baris tombol kalibrasi mikro:
       - `[-0.5s]` & `[-0.2s]` : Memajukan lirik lebih awal jika vokal terdengar mendahului lirik.
       - `[SYNC: 0.0s]` : Tombol reset kembali ke posisi awal.
       - `[+0.2s]` & `[+0.5s]` : Mengulur / menunda lirik jika lirik muncul terlalu cepat sebelum penyanyi bernyanyi.
     - **Penyimpanan Permanen (Per-Song Memory):** Kalibrasi yang disetel pengguna otomatis tersimpan di `localStorage` per lagu (`lyric_offset_<title>`), sehingga saat lagu tersebut diputar kembali di kemudian hari, timing yang sudah disesuaikan langsung aktif otomatis.

---


### 26. 🎤 Web Audio API Real-Time Vocal Removal Engine (Karaoke Mode / Instrumental Only)
- **Konsep & Masalah Sebelumnya:** 
  1. Pada versi awal backend stream reload, saat tombol ditekan di tengah lagu, stream koneksi YouTube terputus dan memuat ulang dari awal sehingga lagu melompat kasar.
  2. Vokal masih sedikit bocor akibat reverb stereo dan pantulan vokal frekuensi tengah.
- **Penyempurnaan Total (Browser-Native Web Audio API DSP Graph):**
  1. **Zero Stream Restart (Lagu Terus Berjalan Mulus):**
     - Aliran stream audio tidak pernah di-reload atau diputus (`winampAudio.src` tetap utuh).
     - Lagu tetap berada di menit dan detik yang sama secara presisi milidetik tanpa melompat ke awal.
  2. **Silky-Smooth 200ms Crossfade (Perpindahan Sangat Halus):**
     - Menggunakan `linearRampToValueAtTime` antara node `dryGain` (audio normal) dan `wetGain` (vokal dihapus).
     - Transisi berlangsung selama 200 milidetik sehingga pergantian suara terdengar sangat musikal, mulus, tanpa letupan (*pop/click*), dan tanpa hening sesaat (*zero gap*).
  3. **Stereo Phase-Inversion Center-Channel Cancellation ($L - R$ & $R - L$):**
     - Sinyal vokal utama penyanyi yang berada tepat di tengah (*center panned*) dibatalkan secara matematis di memori browser secara instan.
  4. **Bass & Kick Drum Preservation (< 180 Hz Lowpass):**
     - Frekuensi instrumen bass di bawah 180 Hz dipisahkan dan dijaga utuh, lalu digabungkan kembali sehingga ketukan drum dan dentuman bass tetap bulat, bertenaga, dan tidak menjadi cempreng.
  5. **Dual Surgical Vocal Notch Filters (1.5 kHz & 2.8 kHz):**
     - Ditambahkan dua filter pemotong formant vokal:
       - 1.500 Hz (resonansi tubuh vokal): dipotong -12 dB.
       - 2.800 Hz (artikulasi & kejelasan vokal): dipotong -14 dB.
     - Residu gema / reverb vokal yang biasanya masih bocor kini dipangkas habis sehingga vokal benar-benar tenggelam dan hanya menyisakan musik pengiring.
- **Visual & UI Indicator:**
  - Tombol `[🎤 KARAOKE]` di deck Winamp menyala ungu-pink (`#ec4899`) dengan animasi pulse berkilau.
  - Badge neon `🎤 VOCAL OFF` di layar LCD sasis Winamp.
  - Marquee ticker menampilkan status `🎤 KARAOKE (VOCAL OFF)`.

---

### 27. 🛡️ Pure JavaScript Zero-Crash Storage & Cross-Platform Engine (Anti-Segfault LXC Proxmox)
- **Latar Belakang Permasalahan:**
  - Pada saat dideploy ke lingkungan container Linux (LXC Proxmox VE), penggunaan modul C++ native `better-sqlite3` rentan mengalami crash fatal: `Process ExecStart=/usr/bin/node server.js (code=killed, signal=SEGV)`.
  - Hal ini disebabkan oleh inkonsistensi binary prebuild C++ terhadap kernel, CPU instruction set, atau library glibc di Linux container.
- **Solusi & Rekayasa Arsitektur Baru:**
  1. **Zero Native Dependencies:** Modul `better-sqlite3` dan kompilasi `node-gyp` dilepas secara permanen. Seluruh dependensi proyek (`express`, `cors`, `qrcode`, `uuid`) kini 100% Pure JavaScript.
  2. **Atomic JSON Storage (`database.json`):**
     - Penyimpanan data riwayat unduhan, metadata judul, dan status job dialihkan ke driver penyimpanan murni JS di `db.js`.
     - Menggunakan mekanisme **Atomic Write**: data ditulis terlebih dahulu ke berkas sementara (`database.json.tmp`) sebelum di-rename ke `database.json`, menjamin integritas data (ACID safety) dan mencegah korupsi file saat listrik padam atau container restart mendadak.
     - Operasi pembacaan (read) berlangsung di memori (in-memory) dengan latensi 0 ms.
  3. **Cross-Platform OS Handling di `server.js`:**
     - **Folder Explorer:** Pada Windows memanggil `cmd /c start`, pada macOS memanggil `open`, dan pada Linux/LXC memanggil `xdg-open` dengan penanganan silent fallback pada lingkungan headless server.
     - **Bundling ZIP Playlist:** Pada Windows menggunakan native Windows `tar -a -c -f`, sedangkan pada Linux/Proxmox otomatis menggunakan perintah `zip -r` atau modul standar Python 3 (`python3 -m zipfile`).
  4. **Hasil:** Server dijamin **100% bebas dari risiko `Segmentation fault`** dan langsung hidup seketika dalam 1 kali eksekusi (`node server.js`) di platform apa pun.

---

### 28. 📱💻 Adaptive Mobile (HP) & Desktop/Laptop Responsive Design Engine
- **Tujuan:** Memastikan aplikasi tampil sempurna, proporsional, dan nyaman digunakan baik di layar smartphone (HP Android/iPhone), tablet, maupun PC/laptop monitor besar.
- **Implementasi Desain Responsif Komprehensif:**
  1. **Mode PC / Laptop (Desktop View):**
     - Layout melebar otomatis hingga `1160px` saat mode Winamp aktif (`.container.winamp-expanded`), menampilkan jendela Playlist dan Lirik Lagu Karaoke berdampingan (*split view*) secara proporsional.
     - Navigasi tab horizontal elegan, grid kartu pencarian YouTube dengan thumbnail di kiri dan tombol aksi cepat (*⚡ MP3 / 🎬 Video*) di kanan.
  2. **Mode HP / Smartphone (Mobile View - Breakpoint <= 768px & <= 600px):**
     - **Mode Navigation Switcher:** Otomatis ditata menjadi **Grid 2x2** yang proporsional dan mudah ditekan (*touch-friendly*) dengan jempol pada layar sentuh ponsel.
     - **Top Action Bar:** Menjadi vertikal terpusat sehingga tag status engine dan tombol pengaturan tidak bertumpuk atau terpotong.
     - **Hasil Pencarian YouTube:** Menyesuaikan ke tata letak vertikal (thumbnail 16:9 penuh, informasi durasi/views, dan tombol unduh berukuran penuh di bawahnya).
     - **Sasis Pemutar Winamp:**
       - Spectrum analyzer visualizer responsif `100%` mengikuti lebar layar ponsel.
       - Barisan tombol pemutar (Prev, Play, Pause, Stop, Next, Shuffle, Repeat, Karaoke, HQ) tertata seimbang di tengah dengan touch-target nyaman.
       - Slider volume memenuhi lebar kontrol di bawah tombol.
     - **Jendela Lirik Karaoke & Playlist:** Otomatis beralih menjadi 1 kolom vertikal (stack) atau dapat dialihkan dengan tab switcher (*Lirik Saja / Playlist Saja*) dengan ketinggian viewport yang pas (`380px`).
     - **Riwayat Unduhan (`.bf-item`):** Membungkus judul secara rapi (2 baris teks elipsis) dan deretan tombol aksi (Play, Edit Judul, QR HP, Unduh) tetap leluasa tanpa keluar layar.
     - **Floating Media Player Drawer & Modal:** Lebar adaptif `95%` layar ponsel dengan posisi floating yang aman dari navigasi browser HP.

---

## 5. Ringkasan Endpoint API Backend

| Metode | Rute Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/health` | Status kesehatan server, binary FFmpeg, yt-dlp, dan status DB |
| `GET` | `/api/system-status` | Konfigurasi engine bypass, profil aktif, opsi cookies browser |
| `POST`| `/api/bypass-config` | Update preferensi bypass (client, browser cookies, turbo, delay) |
| `GET` | `/api/search?q=...` | Pencarian video YouTube via `ytsearch8` |
| `GET` | `/api/radio-mix?q=...&url=...` | Smart Multi-Band YouTube Radio Mix (anti-duplikat & beragam band) |
| `GET` | `/api/taste-mix` | Aliran musik cerdas berbasis histori & preferensi selera pengguna |
| `GET` | `/api/lyrics?title=...&artist=...&url=...` | Ekstraksi lirik sinkron vokal per detik (LRCLIB + YouTube Subtitles) |
| `GET` | `/api/stream-live?url=...` | Ekstraksi URL audio live YouTube langsung (JSON response) |
| `GET` | `/api/stream-live-play?url=...&hq=1` | Stream audio live YouTube dengan Real-Time Loudness Normalizer & HQ Studio Enhancer |
| `POST`| `/api/info` | Ekstraksi informasi video atau playlist (JSON metadata) |
| `POST`| `/api/convert` | Konversi unduhan single (MP3/MP4/SRT, loudnorm, trim, subs, real title) |
| `POST`| `/api/convert-batch` | Konversi unduhan playlist/channel dengan seleksi item & playlist title |
| `GET` | `/api/progress/:jobId` | Polling status persentase unduhan real-time |
| `GET` | `/api/batch-files/:jobId` | Mengambil daftar berkas hasil unduhan playlist |
| `GET` | `/api/download/:jobId/:file`| Mengunduh file hasil konversi ke komputer |
| `GET` | `/api/stream/:jobId/:file` | Streaming audio/video ke pemutar web (HTTP 206) |
| `GET` | `/api/download-zip/:jobId` | Mengunduh seluruh berkas playlist dalam paket `.ZIP` (Cross-Platform) |
| `POST`| `/api/open-folder` | Membuka folder downloads di Windows/Linux File Manager |
| `GET` | `/api/qr-share` | Menghasilkan QR Code dan direct link untuk HP |
| `GET` | `/api/export-m3u` | Mengekspor daftar riwayat musik ke berkas playlist `.m3u` |
| `GET` | `/api/history` | Mengambil 50 riwayat unduhan terbaru dari database JSON |
| `POST`| `/api/history/rename` | Mengubah/menyesuaikan judul item riwayat unduhan |
| `POST`| `/api/clear-history` | Menghapus seluruh riwayat unduhan |
| `POST`| `/api/update-engine` | Melakukan update yt-dlp 1-klik ke versi terbaru |
| `GET` | `/api/test-bypass` | Uji latensi dan keberhasilan koneksi bypass ke YouTube |

---

## 6. Panduan Menjalankan & Perawatan

1. **Menjalankan Server di Windows (Lokal):**
   ```powershell
   node server.js
   ```
   Aplikasi aktif di `http://localhost:3000`.

2. **Menjalankan Server di Linux / LXC Proxmox:**
   Menggunakan unit Systemd otomatis:
   ```bash
   systemctl start youtube-download
   systemctl status youtube-download
   ```

3. **Pembersihan Berkas Otomatis:**
   - Server menjalankan fungsi `cleanupOldDownloads()` setiap 30 menit.
   - File sementara yang berusia lebih dari 1 jam akan dibersihkan dari folder `downloads/` untuk menghemat ruang disk.

4. **Cadangan Data:**
   - Cukup salin berkas `database.json` ke lokasi cadangan.

---

## 7. Panduan Deployment Manual di LXC Proxmox VE (Debian / Ubuntu)

1. **Paksa IPv4 & Update Paket Sistem:**
   ```bash
   echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4
   apt clean && apt update
   apt install -y curl wget git ffmpeg python3 python3-pip zip unzip tar
   ```
2. **Pasang Node.js v20 (LTS):**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs
   ```
3. **Pasang yt-dlp Versi Resmi Terbaru:**
   ```bash
   wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
   chmod a+rx /usr/local/bin/yt-dlp
   ```
4. **Clone Repositori & Pasang Dependensi:**
   ```bash
   git clone https://github.com/kajurtkjsmkbp-hub/youtube-download.git /opt/youtube-download
   cd /opt/youtube-download
   npm install --omit=dev
   chmod +x update.sh
   ```
5. **Daftarkan Service Systemd Auto-Start on Boot:**
   ```bash
   cp /opt/youtube-download/youtube-download.service /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable --now youtube-download
   ```
   Aplikasi aktif di port `3000`: `http://<IP-LXC-PROXMOX>:3000`.

---

## 8. Alur Sinkronisasi Pembaruan Otomatis (Local -> GitHub -> LXC Proxmox)

Setiap ada perubahan atau penambahan fitur di komputer lokal, alur sinkronisasinya adalah:

1. **Di Komputer Lokal (Pengembangan):**
   ```powershell
   git add .
   git commit -m "Deskripsi perubahan"
   git push origin main
   ```
2. **Di Server LXC Proxmox (Penerapan):**
   Cukup jalankan script update 1 baris yang telah disediakan:
   ```bash
   cd /opt/youtube-download
   ./update.sh
   ```
   Atau baris perintah cepat:
   ```bash
   cd /opt/youtube-download && git pull origin main && npm prune && systemctl restart youtube-download
   ```
   Aplikasi di Proxmox akan langsung terbarukan dan kembali berjalan dengan versi terbaru secara otomatis tanpa interupsi.

