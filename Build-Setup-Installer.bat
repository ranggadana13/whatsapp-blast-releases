@echo off
title Kompilasi Installer 1-Click REPLIX AI Desktop
cd /d "%~dp0"

echo =======================================================
echo     KOMPILASI INSTALLER 1-CLICK REPLIX AI DESKTOP
echo =======================================================
echo.

echo [1/3] Memeriksa Kompiler Launcher (Launcher.exe)...
set CSC_PATH=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if exist "%CSC_PATH%" (
    "%CSC_PATH%" /target:winexe /win32icon:build\icon.ico /out:Launcher.exe Launcher.cs
    echo Launcher.exe berhasil dikompilasi dengan Icon REPLIX AI.
)
echo.

echo [2/3] Membuat Folder Output (dist)...
if not exist "dist" mkdir dist
echo.

echo [3/3] Memeriksa Kompiler Inno Setup Compiler (ISCC.exe)...
set ISCC_PATH=C:\Program Files (x86)\Inno Setup 7\ISCC.exe
if not exist "%ISCC_PATH%" set ISCC_PATH=C:\Program Files\Inno Setup 7\ISCC.exe
if not exist "%ISCC_PATH%" set ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe
if not exist "%ISCC_PATH%" set ISCC_PATH=C:\Program Files\Inno Setup 6\ISCC.exe

if exist "%ISCC_PATH%" (
    echo Mengompilasi Installer Setup via Inno Setup...
    "%ISCC_PATH%" installer-config.iss
    echo.
    echo =======================================================
    echo BERHASIL! File Setup-REPLIX-AI-v1.0.2.exe tersimpan di folder dist\
    echo =======================================================
) else (
    echo.
    echo ℹ️ Inno Setup Compiler tidak ditemukan di lokasi standar.
    echo Anda dapat mendownload Inno Setup gratis dari: https://jrsoftware.org/isdl.php
    echo Atau kompilasi file installer-config.iss langsung di Inno Setup.
)

echo.
pause
