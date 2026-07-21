@echo off
title Setup & Install WhatsApp Blast Terjadwal
cd /d "%~dp0"

echo =======================================================
echo     SETUP & INSTALL WHATSAPP BLAST TERJADWAL
echo =======================================================
echo.

echo [1/3] Menginstal dependensi Node.js (npm install)...
echo Harap tunggu, proses ini memerlukan beberapa menit...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Gagal menginstal dependensi. Pastikan Node.js sudah terinstal di PC ini!
    pause
    exit /b %errorlevel%
)
echo Instalasi dependensi selesai.
echo.

echo [2/3] Mengompilasi Ulang Launcher Desktop (Launcher.exe)...
set CSC_PATH=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC_PATH%" (
    echo ERROR: Kompiler C# (csc.exe) tidak ditemukan. Pastikan .NET Framework terinstal!
    pause
    exit /b 1
)
"%CSC_PATH%" /target:winexe /out:Launcher.exe Launcher.cs
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Gagal mengompilasi Launcher.exe!
    pause
    exit /b %errorlevel%
)
echo Kompilasi Launcher.exe selesai sukses.
echo.

echo [3/3] Inisialisasi Selesai...
echo.
echo =======================================================
echo Setup Selesai!
echo Anda sekarang bisa memulai aplikasi dengan mengklik dua kali "Launcher.exe".
echo =======================================================
echo.
pause
