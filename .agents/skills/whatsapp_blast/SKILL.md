---
name: whatsapp-blast
description: Proyek manajemen WhatsApp Blast Terjadwal menggunakan Node.js, Express, Puppeteer, whatsapp-web.js, MongoDB, dan C# Launcher dengan desain UI/UX bertema Spotify/Obsidian.
---

---

## 0. Ringkasan Eksekutif untuk AI Marketing & Evaluasi Produk

Aplikasi ini adalah **WA Blast Desktop & Automated Scheduler** bertema **Modern Obsidian & Emerald Dark Mode**, yang dirancang khusus untuk pelaku UMKM, profesional pemasaran, dan pemilik bisnis yang membutuhkan alat promosi WhatsApp otomatis, aman, dan berestetika tinggi.

### Value Propositions & Unique Selling Points (USP):
1. **AI Copywriting Interview (Tanya-Jawab Interaktif 0-Token)**:
   - Fitur unggulan di mana Asisten AI membimbing pengguna awam melalui 5 pertanyaan interaktif untuk menyusun draf promosi WhatsApp tanpa perlu paham *prompt engineering*.
   - Obrolan berjalan 100% lokal di browser (0 biaya token) dan secara dinamis mengutip jawaban pengguna sebelumnya sebelum menembak API Gemini di akhir sesi.
2. **Multi-Account Sender & Round-Robin Anti-Ban**:
   - Mendukung multiple profil WhatsApp yang dapat melakukan rotasi pengiriman bergantian (*Round-Robin*) demi mencegah algoritma pembatasan/blokir dari WhatsApp.
   - **Smart Anti-Ban Guard & Emergency Auto-Pause**: Melacak tingkat kegagalan pengiriman beruntun (*consecutive failures*). Jika terdeteksi 3 kegagalan pesan berturut-turut (akibat diskoneksi socket, nomor diblokir, atau pembatasan sistem), kampanye akan **otomatis di-PAUSE secara darurat** dan mengirim notifikasi SSE real-time untuk melindungi nomor WhatsApp pengguna dari risiko blokir masal.
3. **Proteksi RAM Komputer & Safelist Profil Aktif**:
   - Deteksi kapasitas RAM fisik sistem (*hardware total RAM*) via modul OS Node.js dengan kalkulasi batas aman otomatis (misal: RAM <= 4GB maks 2 profil aktif, RAM <= 8GB maks 4 profil).
   - Dilengkapi panel indikator RAM Health di tab profil dan dialog konfirmasi keselamatan sebelum mengaktifkan profil baru guna mencegah laptop berisiko *lag* berat atau *crash* kehabisan memori.
4. **A/B Testing & Sequential Follow-up Timeline**:
   - Fitur pengujian pesan A/B dengan pembobotan probabilitas, penyertaan tombol aksi (CTA / Quick Reply), serta visualisasi timeline pesan follow-up berantai dengan skema pewarnaan sekuensial yang elegan.
4. **Mode Fokus Gen-Z (Anti Distraksi Visual)**:
   - Inovasi antarmuka yang meredupkan elemen pasif secara otomatis untuk mereduksi beban membaca (*cognitive load*) dan meningkatkan fokus pengguna muda.
5. **Mekanisme Version Check & Auto-Patch**:
   - Dilengkapi API `/api/system/version` yang membandingkan versi aplikasi lokal (`v1.0.0`) dengan rilis publik secara otomatis saat aplikasi dibuka.
   - Menyediakan badge versi dan indikator visual di header top bar yang berubah menjadi tombol update berwarna emerald neon saat versi baru/patch perbaikan WhatsApp Web tersedia.
6. **Lisensi Terpusat & Kontrol HWID**:
   - Verifikasi lisensi terpusat berbasis Google Sheets yang mengunci lisensi ke *Hardware ID* (motherboard UUID) PC pengguna dengan batas kuota multi-perangkat.
6. **Privacy-First & Offline Storage**:
   - Menggunakan basis data MongoDB lokal dan launcher desktop tanpa memerlukan server cloud pihak ketiga yang mahal.

---

## 1. Struktur Proyek
- `server.js`: Server utama Node.js (Express) yang menangani REST API, koneksi WhatsApp (multi-account), background queue scheduler, dan SSE (Server-Sent Events) untuk data status real-time.
- `db.js`: Skema Mongoose (MongoDB) untuk profil WhatsApp (`WAProfile`), kampanye (`Campaign`), dan log pengiriman (`MessageLog`).
- `Launcher.cs` / `Launcher.exe`: Launcher Windows berbasis C# yang memulai `node server.js` secara otomatis dan membuka antarmuka browser.
- `google-apps-script-fix.gs`: Skrip Google Apps Script untuk server validasi lisensi berbasis Google Sheets yang telah disesuaikan dengan kolom spreadsheet asli pengguna.
- `public/`:
  - `index.html`: Antarmuka visual glassmorphism single-page app (SPA).
  - `app.css`: Desain sistem styling dengan token warna gelap bertema **Modern Obsidian & Emerald**.
  - `app.js`: Logika interaksi frontend, pembuatan form dinamis, pratinjau chat WhatsApp, dan sinkronisasi data SSE.

---

## 2. Desain Visual & Estetika (Obsidian & Emerald Theme)
Dashboard dirancang menggunakan pedoman visual bertema **Modern Obsidian & Emerald Dark Mode** untuk memberikan pengalaman premium, kokoh, minimalis, dan modern:
- **Skema Warna Utama**:
  - Latar Belakang Global / Utama: Hitam Obsidian Legam (`#0a0a0a`)
  - Panel, Card, & Kontainer: Abu Gelap Grafit (`#171717`)
  - Aksen Warna Utama (Tombol & Status Aktif): **Hijau Emerald / Mint (`#10b981`)**
  - Warna Teks: Putih Terang (`#f5f5f5`) untuk judul, Abu Redup (`#a3a3a3`) untuk deskripsi/label.
  - Warna Pembatas (Borders): Abu Gelap Presisi (`#262626`)
- **Layout & Tipografi**:
  - Menggunakan font Sans-Serif modern (Inter atau Outfit).
  - Sudut elemen membulat besar dengan Border Radius **20px s.d 24px** (setara `rounded-3xl`).
- **Sidebar Collapsible**:
  - Bilah samping (sidebar) dapat disembunyikan/diciutkan (*collapsed*) menggunakan tombol hamburger di pojok kiri atas.
  - Status ciut/lebar disimpan secara otomatis di `LocalStorage` browser agar pilihan visual pengguna bertahan saat halaman dimuat ulang.

---

## 3. Skema & Model Database (db.js & server.js)

### Model: WAProfile (Multi-Account Support)
Menyimpan kredensial sesi multi-akun WhatsApp:
- `profileId` (String, unik): ID unik profil (misal `profile_1`).
- `name` (String): Nama alias profil.
{{ ... }}
### Model: MessageLog
Pencatatan aktivitas pengiriman detail per kontak (analisis respon):
- `campaignId` (ObjectId): Referensi ke Campaign.
- `senderProfileId` (String): ID pengirim yang digunakan.
- `phone` / `name` (String): Kontak penerima.
- `messageText` (String): Teks akhir dengan variabel personalisasi terpasang.
- `status` (String): `pending`, `sent`, atau `failed`.
- `feedbackStatus` (String): Status keterbacaan (`pending`, `sent`, `read`, `replied`).
- `replyText` (String): Balasan teks masuk dari pelanggan (untuk A/B Testing).

---

## 4. Alur Kerja Modul AI Blaster & Copywriting

### A. Campaign Massal (2-Kolom Seimbang)
- **Kiri**: Konfigurasi parameter umum (Nama kampanye, WhatsApp pengirim dengan fitur *Round-Robin*, Importer CSV, dan pengaturan jeda pengiriman).
- **Kanan**: Pembangun template A/B Testing dengan tombol pintas pembantu AI Copywriting. Tombol aksi (CTA/Quick Reply) tersemat secara khusus di dasar masing-masing kartu variasi pesan.
- **Pelebaran Workspace**: Container dilebarkan penuh (`max-width: 100%`) agar pengisian data terasa lapang.

### B. Blast Individu (1-Kolom Vertikal Atas-Bawah)
- **Atas**: Panel Setup Penerima & Pengirim (Nomor HP, Nama, dan Dropdown Pengirim) disusun secara horizontal rapat.
- **Bawah**: Timeline draf pesan follow-up berantai lebar penuh.
  - **Dynamic Sequential Colors**: Setiap kotak pesan follow-up diwarnai dengan aksen latar belakang redup, border kiri tebal, dan avatar pendaran neon yang berbeda secara sekuensial (Emerald Hijau, Cyan Biru, Violet Ungu, Jingga Orange).
  - Jika salah satu pesan di tengah dihapus, sistem secara otomatis mengindeks ulang (*reindexed*) nomor dan warna latar belakang kartu agar visualnya tetap berurutan rapi.
  - Tombol tag variabel instan (`{Nama}`, `{Nomor}`) di bagian bawah kartu otomatis menyisipkan kode variabel ke posisi kursor textarea saat diklik.

### C. Proteksi Asisten AI Copywriter
- Setiap kali pengguna mencoba menerapkan teks hasil generate AI ke dalam kotak template/pesan yang sudah ada isinya, sistem akan memicu dialog konfirmasi browser terlebih dahulu demi mencegah hilangnya draf pesan lama secara tidak sengaja.

---

## 5. Fitur Penonjolan AI & Sesi Wawancara (AI Interview)
Untuk mempermudah pengguna awam dalam membuat pesan pemasaran yang efektif, sistem dilengkapi modul AI Generator interaktif:
- **Neon Highlight Button**: Tombol **"Tulis Pesan dengan AI"** dihias menggunakan gradien emerald neon bersinar (`linear-gradient(135deg, #10b981, #059669)`) dengan bayangan bersinar dan efek perbesaran hover scale (`1.04`).
- **AI Interview (Tanya-Jawab)**: Menjadi tab utama (default active) saat modal dibuka:
  - Berjalan secara lokal (0 token, instan) menggunakan state machine di browser.
  - AI memandu pengguna menjawab 5 pertanyaan dasar (Nama Produk, Diskon/Promo, Gaya Bahasa, CTA, Emoji) lengkap dengan penjelasan istilah pemasaran (misal menjelaskan apa itu CTA) dan contoh nyata untuk pemula.
  - **Dynamic Connecting Responses**: Balon obrolan AI secara dinamis mengutip balik jawaban produk/promosi pengguna sebelumnya agar obrolan terasa menyambung dan hidup (misal: *"Promo **[Jawaban Promo]** pasti sangat disukai pembeli! Selanjutnya..."*).
  - Menampilkan rangkuman final di akhir wawancara sebelum menampilkan tombol **"Buat Copywriting!"** untuk memicu panggilan API.
- **Formulir Instan**: Menjadi tab kedua sebagai opsi pengisian formulir terstruktur tradisional. Tombol tab tidak aktif dihias dengan teks abu-abu terang (`#a3a3a3`) dengan latar belakang transparan demi menghindari visual kotak hitam kosong.
- **Fit Screen Modal**: Dimensi vertikal modal disesuaikan agar pas di layar laptop/PC tanpa terpotong (tinggi obrolan `300px` dan hasil output `210px`).

---

## 6. Mode Fokus Gen-Z (Dimming Elemen Pasif)
Untuk mengurangi distraksi visual bagi pengguna (khususnya generasi muda dengan tingkat fokus singkat):
- **Logika CSS Transition**:
  - Diaktifkan/dinonaktifkan melalui toggle switch **"Mode Fokus Gen-Z"** di menu Pengaturan Aplikasi. Status toggle disimpan di `LocalStorage`.
  - Saat aktif (`body.focus-mode-active`):
    - **Obrolan AI Copywriting**: Semua balon chat lama otomatis meredup (`opacity: 0.35` & blur `0.3px`). Hanya balon pertanyaan aktif paling bawah yang bersinar penuh (`opacity: 1.0`). Mengarahkan mouse ke balon lama akan menyalakan kembali kecerahannya.
    - **Daftar Pesan Follow-Up**: Semua kartu pesan follow-up pasif meredup kecuali kartu yang sedang disorot kursor mouse (hover) atau kartu yang sedang diedit/diketik oleh pengguna (menggunakan selector CSS `:focus-within`).

---

## 7. Dashboard Analytics & Empty State Blur
- **Analytics Chart**: Visualisasi statistik performa harian berupa grafik kurva SVG yang bersinar hijau neon dengan area pendaran gradien di dasarnya.
- **Empty State Overlay**: Jika logs database kosong (0 log pengiriman), grafik analitik akan rata di sumbu dasar Y dan tertutupi oleh lapisan kaca buram (blur) Obsidian yang menampilkan pesan bantuan petunjuk langkah awal bagi pengguna baru.
- **Penyembunyian WhatsApp Connection**: Panel koneksi WhatsApp di dashboard dihilangkan (`display: none;`) dan tabel log aktivitas diperluas hingga 100% lebar layar (`grid-template-columns: 1fr`) agar visual log aktivitas pengiriman terlihat luas dan rapi.

---

## 8. Sandbox & Database Management
Di halaman pengaturan aplikasi (Kolom Kiri), disediakan sistem Sandbox Data Uji Coba:
- **Isi Data Dummy (`/api/dummy/seed`)**: Tombol untuk mempopulasikan database MongoDB secara instan dengan data uji coba profesional (termasuk riwayat log pengiriman, statistik performa bulanan, dan data respon pesan masuk pelanggan) agar dashboard terlihat hidup dan siap diuji coba.
- **Reset Database (`/api/dummy/reset`)**: Tombol untuk mereset seluruh database Sandbox menjadi kosong bersih kembali.

---

## 9. Sistem Lisensi Perangkat & GAS Router Multi-Server
Sistem memiliki pengaman lisensi multi-device yang dikendalikan secara redundan (*High Availability*) oleh 3 Server Google Apps Script yang terhubung ke 1 Google Sheet terpusat:
- **Informasi Lisensi Perangkat (Settings)**:
  - Menampilkan Status Lisensi (Aktif/Tidak Aktif), Tanggal Kedaluwarsa, kuota Perangkat Terdaftar (`devicesUsed / maxDevices` PC), HWID asli komputer, dan License Key yang disembunyikan default (`••••••••••••••••`) dengan ikon mata toggle intip.
- **GAS Multi-Server Router (`fetchWithGASFailover`)**:
  - Aplikasi secara otomatis mengacak dan merotasi (*Load Balancing*) pengecekan ke 3 Server GAS (Server 1 Utama, Server 2 Cadangan, Server 3 Cadangan). Jika salah satu server mengalami *rate limit* (HTTP 429) atau *timeout*, aplikasi secara otomatis beralih (*failover*) ke server berikutnya tanpa gangguan pada pengguna.
- **Google Apps Script (`google-apps-script-fix.gs`)**:
  - Menangani komunikasi verifikasi lisensi aman (`doPost`) dan verifikasi status aktif (`doGet`).
  - Pemetaan Kolom Spreadsheet: Kolom A (`License Key`), B (`Nama Pembeli`), C (`Tanggal Beli`), D (`Durasi Beli`), E (`Masa Berlaku` / Expiry), F (`Status` - Actived/Suspended), G (`Hardware ID`), H (`Max Device`).
  - **Auto-Targeting Spreadsheet ID**: Mendukung fungsi `getTargetSheet()` sehingga dapat dijalankan baik sebagai *Bound Script* maupun *Standalone Script* menggunakan ID Spreadsheet terpusat.
  - **Auto-Calculation Expiry Date**: Jika kolom E (Masa Berlaku) kosong saat pertama kali diaktivasi dari aplikasi, GAS akan otomatis menghitung tanggal kedaluwarsa berdasarkan Tanggal Beli (Kolom C) dan Durasi Beli (Kolom D) (misal: +1 bulan untuk "1 Bulan", kecuali berdurasi "Lifetime").
  - Menulis pendaftaran HWID PC baru secara aman ke Kolom G (Kolom ke-7) tanpa menimpa data tanggal masa berlaku di Kolom E.Launcher.exe**: Mengompilasi `Launcher.cs` dengan CLI .NET Framework `csc.exe` untuk menjalankan `server.js` Node.js di latar belakang dan meluncurkan browser secara instan.
- **Autostart**: Di halaman pengaturan, toggle autostart memicu pembuatan file pintasan `.lnk` ke folder Windows Startup (`shell:startup`) via modul internal.
