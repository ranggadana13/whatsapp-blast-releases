// ====================================================================================================
// VERSI TERKOREKSI - GOOGLE APPS SCRIPT LICENSE SERVER
// ====================================================================================================
// Skrip ini telah disesuaikan agar cocok 100% dengan struktur tangkapan layar Google Sheets Anda:
// - Kolom A (Index 0): License Key
// - Kolom B (Index 1): Nama Pembeli
// - Kolom C (Index 2): Tanggal Beli
// - Kolom D (Index 3): Durasi Beli
// - Kolom E (Index 4): Masa Berlaku (Expiry Date) -> Format: YYYY-MM-DD atau Date Object
// - Kolom F (Index 5): Status (Actived / Suspended)
// - Kolom G (Index 6): Hardware ID (HWID terdaftar)
// - Kolom H (Index 7): Max Device
// ====================================================================================================

// CONFIGURATION: 
// 1. Jika skrip dipasang langsung via menu (Ekstensi -> Apps Script) di sheet utama, biarkan SPREADSHEET_ID kosong ("").
// 2. Jika dipasang di Akun Google lain (Multi-Server GAS #2 & #3), isikan ID Spreadsheet Utama Anda di bawah ini:
const SPREADSHEET_ID = ""; // Contoh: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"

function getTargetSheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim().length > 0) {
    return SpreadsheetApp.openById(SPREADSHEET_ID.trim()).getActiveSheet();
  }
  return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
}

// 1. Fungsi GET untuk memastikan Apps Script aktif saat diakses browser web
function doGet(e) {
  return HtmlService.createHtmlOutput(
    "<html>" +
    "<head><title>WA Blast License API</title></head>" +
    "<body style='font-family: Arial, sans-serif; text-align: center; padding-top: 50px; background-color: #0a0a0a; color: #f5f5f5;'>" +
    "<div style='display: inline-block; padding: 40px; background: #171717; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); border: 1px solid #262626;'>" +
    "<h2 style='color: #10b981; margin-bottom: 10px;'>🟢 WA Blast License Server Active</h2>" +
    "<p style='color: #a3a3a3; margin: 0;'>API verifikasi lisensi berjalan dengan aktif dan normal.</p>" +
    "</div>" +
    "</body>" +
    "</html>"
  );
}

// 2. Fungsi POST untuk validasi lisensi dari aplikasi WhatsApp Blast desktop/server
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const licenseKey = params.licenseKey;
    const hwid = params.hwid;
    
    if (!licenseKey || !hwid) {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: false, 
        message: "License Key dan Hardware ID diperlukan." 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const sheet = getTargetSheet();
    const data = sheet.getDataRange().getValues();
    
    // Cari baris berdasarkan License Key (mulai dari baris ke-2 / Index 1 untuk melompati Header)
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === licenseKey.toString().trim()) {
        rowIndex = i + 1; // 1-based index untuk keperluan penulisan getRange()
        break;
      }
    }
    
    if (rowIndex === -1) {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: false, 
        message: "Lisensi tidak ditemukan." 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const rowValues = data[rowIndex - 1];
    const buyerName = rowValues[1];          // Kolom B (Index 1) - Nama Pembeli
    const purchaseDate = rowValues[2];       // Kolom C (Index 2) - Tanggal Beli
    const purchaseDuration = rowValues[3];   // Kolom D (Index 3) - Durasi Beli
    const expiryDateVal = rowValues[4];      // Kolom E (Index 4) - Masa Berlaku (Masa Aktif)
    const status = rowValues[5] ? rowValues[5].toString().trim() : "Actived"; // Kolom F (Index 5) - Status
    const storedHwidStr = rowValues[6] ? rowValues[6].toString().trim() : ""; // Kolom G (Index 6) - Hardware ID
    const maxDevicesVal = rowValues[7];      // Kolom H (Index 7) - Max Device
    const maxProfilesVal = rowValues[9];     // Kolom J (Index 9) - Max WA Profiles
    
    // Default Max Devices ke 1 jika kolom H kosong
    const maxDevices = maxDevicesVal ? parseInt(maxDevicesVal, 10) : 1;
    // Default Max WA Profiles ke 5 jika kolom J kosong
    const maxProfiles = maxProfilesVal ? parseInt(maxProfilesVal, 10) : 5;
    
    // Format Tanggal Kedaluwarsa ke YYYY-MM-DD
    let formattedExpiry = "";
    if (expiryDateVal) {
      const expiryDateObj = new Date(expiryDateVal);
      if (!isNaN(expiryDateObj.getTime())) {
        formattedExpiry = Utilities.formatDate(expiryDateObj, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd");
      }
    }
    
    // A. Validasi Status Suspended / Nonaktif
    if (status.toLowerCase() === 'suspended') {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: false, 
        message: "Lisensi ini telah dinonaktifkan (suspended)." 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // B. Validasi Tanggal Kedaluwarsa
    if (expiryDateVal) {
      const expiryDate = new Date(expiryDateVal);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expiryDate < today) {
        return ContentService.createTextOutput(JSON.stringify({ 
          success: false, 
          message: "Lisensi Anda telah kedaluwarsa." 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // C. Validasi / Kunci Multi-Device HWID
    let registeredHwids = [];
    if (storedHwidStr) {
      registeredHwids = storedHwidStr.split(',').map(id => id.trim()).filter(id => id.length > 0);
    }
    
    const isAlreadyRegistered = registeredHwids.includes(hwid);
    
    const usageText = registeredHwids.length + "/" + maxDevices;
    // Selalu perbarui Kolom I (Kolom ke-9: Device Terpakai)
    sheet.getRange(rowIndex, 9).setValue(usageText);
    
    if (isAlreadyRegistered) {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: true, 
        message: "Lisensi aktif.",
        expiryDate: formattedExpiry,
        devicesUsed: registeredHwids.length,
        maxDevices: maxDevices,
        maxProfiles: maxProfiles
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Cek kuota kapasitas perangkat terdaftar
    if (registeredHwids.length >= maxDevices) {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: false, 
        message: "Batas jumlah perangkat (maksimum " + maxDevices + " PC) telah tercapai." 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Kuota masih ada, daftarkan HWID baru
    registeredHwids.push(hwid);
    const newHwidStr = registeredHwids.join(',');
    const newUsageText = registeredHwids.length + "/" + maxDevices;
    
    // TULIS KE SPREADSHEET:
    // Tulis ke Kolom G (Kolom ke-7: Hardware ID) & Kolom I (Kolom ke-9: Device Terpakai)
    sheet.getRange(rowIndex, 7).setValue(newHwidStr);
    sheet.getRange(rowIndex, 9).setValue(newUsageText);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      message: "Aktivasi berhasil! Perangkat terdaftar (" + registeredHwids.length + "/" + maxDevices + " PC).",
      expiryDate: formattedExpiry,
      devicesUsed: registeredHwids.length,
      maxDevices: maxDevices,
      maxProfiles: maxProfiles
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      message: "Terjadi kesalahan server Apps Script: " + error.message 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
