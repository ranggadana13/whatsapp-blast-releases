// State Variables
let parsedContacts = [];
let sseSource = null;
let campImageBase64 = null;
let indivImageBase64 = null;

// DOM Elements
const clockDisplay = document.getElementById('clock-display');
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const pageTitle = document.getElementById('page-title');

// Connection Pill Elements
const pillIndicator = document.getElementById('pill-indicator');
const pillText = document.getElementById('pill-text');

// Connection Panel Elements
const connDisconnected = document.getElementById('status-disconnected');
const connConnecting = document.getElementById('status-connecting');
const connScanning = document.getElementById('status-scanning');
const connConnected = document.getElementById('status-connected');
const qrImage = document.getElementById('qr-image');
const btnConnect = document.getElementById('btn-connect');
const btnDisconnect = document.getElementById('btn-disconnect');

// Activity Log Elements
const logTableBody = document.getElementById('log-table-body');

// Stats Elements
const statTotalCampaigns = document.getElementById('stat-total-campaigns');
const statSent = document.getElementById('stat-sent');
const statFailed = document.getElementById('stat-failed');
const statPending = document.getElementById('stat-pending');

// Form Elements
const formCreateCampaign = document.getElementById('form-create-campaign-ai');
const txtCampaignName = document.getElementById('campaign-name');
const txtMessageTemplate = document.getElementById('message-template');
const txtScheduledTime = document.getElementById('scheduled-time');
const txtDelayMin = document.getElementById('delay-min');
const txtDelayMax = document.getElementById('delay-max');
const btnVarPills = document.querySelectorAll('.btn-var-pill');

// Importer Elements
const importTabBtns = document.querySelectorAll('.import-tab-btn');
const importMethodBoxes = document.querySelectorAll('.import-method-box');
const fileDropZone = document.getElementById('csv-drop-zone');
const fileInput = document.getElementById('csv-file-input');
const fileNameLabel = document.getElementById('file-name-display');
const csvPasteArea = document.getElementById('csv-paste-input');
const parsedContactsSection = document.getElementById('parsed-contacts-section');
const parsedCountLabel = document.getElementById('parsed-count');
const btnClearContacts = document.getElementById('btn-clear-contacts');
const previewTableHead = document.getElementById('preview-table-head');
const previewTableBody = document.getElementById('preview-table-body');

// Campaign List Elements
const campaignTableBody = document.getElementById('campaign-table-body');

// Modal Elements
const detailModal = document.getElementById('campaign-detail-modal');
const closeModalBtn = document.getElementById('close-modal');
const modalCampaignTitle = document.getElementById('modal-campaign-title');
const modalStatusBadge = document.getElementById('modal-status-badge');
const modalScheduledTime = document.getElementById('modal-scheduled-time');
const modalMessageTemplate = document.getElementById('modal-message-template');
const modalLogTableBody = document.getElementById('modal-log-table-body');

// Set default datetime to today + 5 mins
function setDefaultDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  const tzOffset = now.getTimezoneOffset() * 60000; // in milliseconds
  const localISOTime = (new Date(now - tzOffset)).toISOString().slice(0, 16);
  txtScheduledTime.value = localISOTime;
}

// Clock Utility
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID');
  clockDisplay.innerHTML = `<i class="far fa-clock" style="color:var(--accent-info); margin-right:6px;"></i> Waktu Sistem: <strong style="color:#fff;">${timeStr}</strong>`;
}
setInterval(updateClock, 1000);
updateClock();

// ==========================================================================
// NAVIGATION TAB SWITCHING
// ==========================================================================
navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const targetTab = item.getAttribute('data-tab');
    
    // Update active nav item
    navItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    
    // Update active tab content
    tabContents.forEach(tab => {
      if (tab.id === `tab-${targetTab}`) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Update Topbar Title and fetch corresponding data
    switch (targetTab) {
      case 'dashboard':
        pageTitle.textContent = 'Dashboard';
        loadStats();
        loadLogs();
        break;
      case 'ai-blaster-tab':
        pageTitle.textContent = 'AI Blaster & Copywriting';
        setDefaultDateTime();
        initIndivCards();
        loadProfiles();
        break;
      case 'profiles-tab':
        pageTitle.textContent = 'Manajemen Profil WhatsApp';
        loadProfiles();
        break;
      case 'campaign-list':
        pageTitle.textContent = 'Daftar WhatsApp Blast';
        loadCampaigns();
        break;
      case 'reports':
        pageTitle.textContent = 'Analisis & Rekap Laporan';
        loadReportsSummary();
        break;
      case 'feedbacks-tab':
        pageTitle.textContent = 'Respon & Feedback Pelanggan';
        loadFeedbacks();
        break;
      case 'bot-autoreply':
        pageTitle.textContent = 'CRM Bot Auto-Reply';
        loadBotRules();
        break;
      case 'settings-tab':
        pageTitle.textContent = 'Pengaturan Aplikasi';
        break;
    }
  });
});

// ==========================================================================
// SERVER-SENT EVENTS (SSE) & CONNECTION MANAGEMENT
// ==========================================================================
function startSSE() {
  if (sseSource) {
    sseSource.close();
  }

  sseSource = new EventSource('/api/connection-status');

  sseSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('SSE message received:', data);

      if (data.type === 'status') {
        updateConnectionUI(data.connectionState, data.qrData);
      } else if (data.type === 'profile-status') {
        updateProfileStatusUI(data.profileId, data.status, data.qrData, data.phone);
      } else if (
        data.type === 'message-sent' || 
        data.type === 'message-failed' ||
        data.type === 'message-replied' ||
        data.type === 'message-read' ||
        data.type === 'campaign-started' || 
        data.type === 'campaign-completed' ||
        data.type === 'campaign-cancelled' ||
        data.type === 'campaign-paused' ||
        data.type === 'campaign-resumed'
      ) {
        // Refresh active views
        const activeTab = document.querySelector('.nav-item.active').getAttribute('data-tab');
        if (activeTab === 'dashboard') {
          loadStats();
          loadLogs();
        } else if (activeTab === 'feedbacks-tab') {
          loadFeedbacks();
        } else if (activeTab === 'campaign-list') {
          loadCampaigns();
        } else if (activeTab === 'reports') {
          loadReportsSummary();
        }

        // If detail modal is active, reload its contents if it belongs to the affected campaign
        if (detailModal.classList.contains('active') && detailModal.dataset.campaignId === data.campaignId) {
          loadCampaignDetails(data.campaignId);
        }
      } else if (data.type === 'campaign-auto-paused') {
        alert(data.reason || '🛡️ Anti-Ban Guard: Kampanye otomatis di-pause secara darurat untuk keamanan nomor WhatsApp Anda.');
        loadCampaigns();
        if (detailModal.classList.contains('active') && detailModal.dataset.campaignId === data.campaignId) {
          loadCampaignDetails(data.campaignId);
        }
      } else if (data.type === 'license-revoked') {
        alert(data.reason || '🛡️ Lisensi Anda telah dinonaktifkan atau dihapus oleh Admin. Akses aplikasi dihentikan.');
        window.location.reload();
      }
    } catch (err) {
      console.error('Error parsing SSE data:', err);
    }
  };

  sseSource.onerror = (err) => {
    console.error('SSE connection error, retrying...', err);
    updateConnectionUI('disconnected', null);
  };
}

function updateConnectionUI(state, qrData) {
  // Update Connection Pill if exists
  if (pillIndicator) {
    pillIndicator.className = `status-indicator ${state}`;
  }
  
  let readableState = 'Terputus';
  if (state === 'connecting') readableState = 'Menghubungkan';
  if (state === 'scanning') readableState = 'Scan QR Code';
  if (state === 'connected') readableState = 'Terhubung';
  
  if (pillText) {
    pillText.textContent = `WA: ${readableState}`;
  }

  // Hide all panels in Status Box if they exist
  [connDisconnected, connConnecting, connScanning, connConnected].forEach(panel => {
    if (panel) panel.classList.remove('active');
  });

  // Show appropriate panel
  if (state === 'disconnected' && connDisconnected) {
    connDisconnected.classList.add('active');
  } else if (state === 'connecting' && connConnecting) {
    connConnecting.classList.add('active');
  } else if (state === 'scanning' && connScanning) {
    if (connScanning) connScanning.classList.add('active');
    if (qrData && qrImage) {
      qrImage.src = qrData;
    }
  } else if (state === 'connected' && connConnected) {
    connConnected.classList.add('active');
  }
}

// Connect WA (Redirect to WhatsApp Profiles management tab)
if (btnConnect) {
  btnConnect.addEventListener('click', () => {
    const profilesTabItem = Array.from(navItems).find(item => item.getAttribute('data-tab') === 'profiles-tab');
    if (profilesTabItem) {
      profilesTabItem.click();
    }
  });
}

// Disconnect WA
if (btnDisconnect) {
  btnDisconnect.addEventListener('click', async () => {
    if (confirm('Apakah Anda yakin ingin memutuskan koneksi WhatsApp dan menghapus sesi ini?')) {
      try {
        const res = await fetch('/api/disconnect', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      } catch (error) {
        alert('Gagal memutuskan koneksi: ' + error.message);
      }
    }
  });
}

// ==========================================================================
// DASHBOARD STATS & LOGS LOADER
// ==========================================================================
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (res.ok) {
      statTotalCampaigns.textContent = data.totalCampaigns;
      statSent.textContent = data.sent;
      statFailed.textContent = data.failed;
      statPending.textContent = data.pending;
    }
  } catch (error) {
    console.error('Error fetching stats:', error);
  }
}

async function loadLogs() {
  try {
    const res = await fetch('/api/logs');
    const logs = await res.json();
    if (res.ok) {
      if (typeof drawDashboardChart === 'function') {
        drawDashboardChart(logs);
      }
      logTableBody.innerHTML = '';
      if (logs.length === 0) {
        logTableBody.innerHTML = `<tr><td colspan="5" class="empty-state">Belum ada riwayat aktivitas pengiriman.</td></tr>`;
        return;
      }
      
      logs.forEach(log => {
        const tr = document.createElement('tr');
        const formattedDate = new Date(log.sentAt || log.createdAt).toLocaleString('id-ID');
        
        let statusBadge = `<span class="badge pending">Menunggu</span>`;
        if (log.status === 'sent') {
          statusBadge = `<span class="badge completed">Terkirim</span>`;
        } else if (log.status === 'failed') {
          statusBadge = `<span class="badge failed" title="${log.error || ''}">Gagal</span>`;
        }

        tr.innerHTML = `
          <td>${formattedDate}</td>
          <td><strong>${log.campaignName}</strong></td>
          <td>${log.name}</td>
          <td><code>${log.phone}</code></td>
          <td>${statusBadge}</td>
        `;
        logTableBody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error fetching logs:', error);
  }
}

// ==========================================================================
// CSV / CONTACTS IMPORTER LOGIC
// ==========================================================================

// Importer Method Tabs
importTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    importTabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const method = btn.getAttribute('data-import-method');
    importMethodBoxes.forEach(box => {
      if (box.id === `import-box-${method}`) {
        box.classList.add('active');
      } else {
        box.classList.remove('active');
      }
    });
  });
});

// File Drag & Drop
['dragenter', 'dragover'].forEach(eventName => {
  fileDropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    fileDropZone.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  fileDropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    fileDropZone.classList.remove('dragover');
  }, false);
});

fileDropZone.addEventListener('click', () => {
  fileInput.click();
});

fileDropZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files.length) {
    fileInput.files = files;
    handleFileSelect(files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (fileInput.files.length) {
    handleFileSelect(fileInput.files[0]);
  }
});

function handleFileSelect(file) {
  fileNameLabel.textContent = file.name;
  
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      processParsedData(results.data);
    },
    error: function(err) {
      alert('Error parsing CSV: ' + err.message);
    }
  });
}

// Paste Area Change
csvPasteArea.addEventListener('input', () => {
  const text = csvPasteArea.value.trim();
  if (text.length === 0) {
    clearContacts();
    return;
  }

  Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      processParsedData(results.data);
    }
  });
});

// Process Parsed CSV Array
function processParsedData(data) {
  if (data.length === 0) {
    clearContacts();
    return;
  }

  // Find target headers (case-insensitive matcher)
  const headers = Object.keys(data[0]);
  const phoneHeader = headers.find(h => /phone|telp|no|hp|wa/i.test(h));
  const nameHeader = headers.find(h => /name|nama/i.test(h));

  if (!phoneHeader) {
    alert('Format tidak valid. Kolom nomor telepon (Phone/No HP) wajib ada di dalam baris header CSV.');
    return;
  }

  parsedContacts = data.map(row => {
    const rawPhone = row[phoneHeader];
    const rawName = nameHeader ? row[nameHeader] : 'Pelanggan';

    // Extract other keys as custom variables
    const variables = {};
    headers.forEach(h => {
      if (h !== phoneHeader && h !== nameHeader) {
        variables[h] = row[h];
      }
    });

    return {
      phone: rawPhone ? rawPhone.toString().trim() : '',
      name: rawName ? rawName.toString().trim() : 'Pelanggan',
      variables
    };
  }).filter(c => c.phone.length > 0); // exclude empty rows

  renderPreviewTable(headers, phoneHeader, nameHeader);
}

function renderPreviewTable(headers, phoneHeader, nameHeader) {
  parsedCountLabel.textContent = parsedContacts.length;
  parsedContactsSection.style.display = 'block';

  // Build Headers
  previewTableHead.innerHTML = '';
  const trHead = document.createElement('tr');
  trHead.innerHTML = `<th>No</th><th>No. HP (${phoneHeader})</th><th>Nama (${nameHeader || 'Default'})</th>`;
  
  // Add custom variable headers
  headers.forEach(h => {
    if (h !== phoneHeader && h !== nameHeader) {
      const th = document.createElement('th');
      th.textContent = h;
      trHead.appendChild(th);
    }
  });
  previewTableHead.appendChild(trHead);

  // Build Body (limit to 50 rows for performance preview)
  previewTableBody.innerHTML = '';
  const previewRows = parsedContacts.slice(0, 50);
  
  previewRows.forEach((c, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${idx + 1}</td><td><code>${c.phone}</code></td><td>${c.name}</td>`;
    
    // Add custom variables cells
    headers.forEach(h => {
      if (h !== phoneHeader && h !== nameHeader) {
        const td = document.createElement('td');
        td.textContent = c.variables[h] || '';
        tr.appendChild(td);
      }
    });
    previewTableBody.appendChild(tr);
  });

  if (parsedContacts.length > 50) {
    const trMore = document.createElement('tr');
    trMore.innerHTML = `<td colspan="${headers.length + 1}" style="text-align:center; color:var(--color-text-muted); font-style:italic;">...dan ${parsedContacts.length - 50} kontak lainnya.</td>`;
    previewTableBody.appendChild(trMore);
  }
  updateDeliveryEstimation();
}

function updateDeliveryEstimation() {
  const calcBox = document.getElementById('delivery-calc-box');
  if (!calcBox) return;

  const totalContacts = parsedContacts.length;
  if (totalContacts === 0) {
    calcBox.style.display = 'none';
    return;
  }

  const delayMinInput = document.getElementById('delay-min');
  const delayMaxInput = document.getElementById('delay-max');
  const scheduledTimeInput = document.getElementById('scheduled-time');

  const delayMin = parseInt(delayMinInput ? delayMinInput.value : 5) || 5;
  const delayMax = parseInt(delayMaxInput ? delayMaxInput.value : 15) || 15;
  const avgDelay = (delayMin + delayMax) / 2;

  // Calculate batch breaks: 250 messages per batch, 15 minutes break in between
  const BATCH_SIZE = 250;
  const BREAK_MINUTES = 15;
  const numBreaks = Math.max(0, Math.ceil(totalContacts / BATCH_SIZE) - 1);
  const totalBreakSeconds = numBreaks * BREAK_MINUTES * 60;
  
  const messageSeconds = totalContacts * avgDelay;
  const totalSeconds = messageSeconds + totalBreakSeconds;

  let durationStr = '';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) durationStr += `${hours} jam `;
  if (minutes > 0 || hours > 0) durationStr += `${minutes} menit `;
  durationStr += `${seconds} detik`;

  if (numBreaks > 0) {
    durationStr += ` (Termasuk ${numBreaks}x jeda rehat)`;
  }

  const scheduledInput = scheduledTimeInput ? scheduledTimeInput.value : '';
  let startTime = new Date();
  if (scheduledInput) {
    const parsedStart = new Date(scheduledInput);
    if (parsedStart > startTime) {
      startTime = parsedStart;
    }
  }

  const endTime = new Date(startTime.getTime() + totalSeconds * 1000);
  
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  };
  const endTimeStr = endTime.toLocaleDateString('id-ID', options);

  document.getElementById('calc-total-contacts').textContent = totalContacts.toLocaleString('id-ID');
  document.getElementById('calc-avg-delay').textContent = avgDelay;
  document.getElementById('calc-duration').textContent = durationStr;
  document.getElementById('calc-end-time').textContent = endTimeStr;
  
  calcBox.style.display = 'block';
}

function clearContacts() {
  parsedContacts = [];
  parsedCountLabel.textContent = '0';
  parsedContactsSection.style.display = 'none';
  fileNameLabel.textContent = 'Belum ada file terpilih';
  fileInput.value = '';
  csvPasteArea.value = '';
  previewTableBody.innerHTML = '<tr><td colspan="3" class="empty-state">Silakan masukkan / unggah kontak terlebih dahulu.</td></tr>';
  
  const btnExport = document.getElementById('btn-scraper-export-csv');
  if (btnExport) btnExport.style.display = 'none';
  
  updateDeliveryEstimation();
}

if (btnClearContacts) {
  btnClearContacts.addEventListener('click', clearContacts);
}

// Bind input event listeners for dynamic calculator updates
const delayMinEl = document.getElementById('delay-min');
const delayMaxEl = document.getElementById('delay-max');
const scheduledTimeEl = document.getElementById('scheduled-time');

if (delayMinEl) delayMinEl.addEventListener('input', updateDeliveryEstimation);
if (delayMaxEl) delayMaxEl.addEventListener('input', updateDeliveryEstimation);
if (scheduledTimeEl) {
  scheduledTimeEl.addEventListener('input', updateDeliveryEstimation);
  scheduledTimeEl.addEventListener('change', updateDeliveryEstimation);
}

// Insert variables on textarea helper
if (btnVarPills && btnVarPills.length > 0 && txtMessageTemplate) {
  btnVarPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const variable = pill.getAttribute('data-var');
      const start = txtMessageTemplate.selectionStart;
      const end = txtMessageTemplate.selectionEnd;
      const text = txtMessageTemplate.value;
      const before = text.substring(0, start);
      const after  = text.substring(end, text.length);
      
      txtMessageTemplate.value = before + variable + after;
      txtMessageTemplate.focus();
      txtMessageTemplate.selectionStart = txtMessageTemplate.selectionEnd = start + variable.length;
    });
  });
}

// ==========================================================================
// CAMPAIGN CREATION FORM SUBMISSION
// ==========================================================================
formCreateCampaign.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (parsedContacts.length === 0) {
    alert('Silakan unggah atau tempel kontak penerima sebelum menjadwalkan.');
    return;
  }

  const name = txtCampaignName.value.trim();
  if (!name) {
    alert('Silakan isi Nama Campaign!');
    return;
  }
  
  // Read dynamic templates
  const templateCards = document.querySelectorAll('.ab-template-card');
  const messageTemplates = [];
  templateCards.forEach((card, idx) => {
    const text = card.querySelector('.camp-template-text').value.trim();
    const weight = parseInt(card.querySelector('.camp-template-weight').value) || 0;
    const imageBase64 = card.dataset.imageBase64 || null;
    
    let cardButtons = [];
    if (card.getButtons) {
      cardButtons = card.getButtons();
    }

    if (text) {
      messageTemplates.push({ id: `var_${idx + 1}`, text, weight, imageBase64, buttons: cardButtons });
    }
  });

  if (messageTemplates.length === 0) {
    alert('Silakan masukkan minimal 1 template pesan!');
    return;
  }

  const scheduledTime = txtScheduledTime.value;
  if (!scheduledTime) {
    alert('Silakan tentukan Waktu Pengiriman terlebih dahulu!');
    return;
  }

  const delayMinStr = txtDelayMin.value.trim();
  const delayMaxStr = txtDelayMax.value.trim();
  if (!delayMinStr || !delayMaxStr) {
    alert('Silakan isi Jeda Minimum dan Jeda Maksimum pengiriman!');
    return;
  }

  const delayMin = parseInt(delayMinStr);
  const delayMax = parseInt(delayMaxStr);

  if (delayMin > delayMax) {
    alert('Jeda Minimum tidak boleh lebih besar dari Jeda Maksimum!');
    return;
  }

  const checkedProfiles = Array.from(document.querySelectorAll('input[name="camp-sender-profiles"]:checked')).map(cb => cb.value);
  if (checkedProfiles.length === 0) {
    alert('Silakan pilih minimal 1 profil pengirim yang terhubung.');
    return;
  }

  // Fallback buttons for legacy schemas: use buttons from first variation if defined
  const legacyButtons = messageTemplates[0]?.buttons || [];

  const payload = {
    name,
    messageTemplate: messageTemplates[0].text, // fallback
    messageTemplates,
    senderProfiles: checkedProfiles,
    scheduledTime,
    delayMin,
    delayMax,
    contacts: parsedContacts,
    imageBase64: null, // images are now variation-specific
    buttons: legacyButtons
  };

  try {
    const btnSubmit = document.getElementById('btn-submit-campaign');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fas fa-spinner spin"></i> Menjadwalkan Campaign...`;

    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<i class="fas fa-calendar-check"></i> Jadwalkan WhatsApp Blast`;

    if (!res.ok) throw new Error(data.error);

    alert('Campaign WhatsApp Blast berhasil dijadwalkan!');
    
    // Reset Form
    txtCampaignName.value = '';
    if (campTemplatesContainer) {
      campTemplatesContainer.innerHTML = `
        <div class="panel glass ab-template-card" style="background: rgba(0,0,0,0.15); border: 1px solid var(--border-glass); padding: 16px; border-radius: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px; font-weight:600; color:var(--accent-primary);">Variasi Pesan #1 (Default)</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="font-size:12px; color:var(--color-text-muted);">Peluang/Bobot (%):</label>
              <input type="number" class="camp-template-weight" value="100" min="1" max="100" style="width:70px; padding:4px 8px; font-size:12px;" required>
            </div>
          </div>
          <textarea class="camp-template-text" required rows="4" placeholder="Halo {Nama}, kami ingin menginfokan produk {Produk} Anda sudah dikirim..."></textarea>
          <div class="template-variables-helper">
            <span class="helper-label">Dapat menggunakan variabel:</span>
            <button type="button" class="btn-var-pill-dynamic" data-var="{Nama}">{Nama}</button>
            <button type="button" class="btn-var-pill-dynamic" data-var="{Nomor}">{Nomor}</button>
          </div>
        </div>
      `;
      campTemplateCount = 1;
    }
    clearContacts();
    
    const btnRemoveCampImage = document.getElementById('btn-remove-image-camp');
    if (btnRemoveCampImage) btnRemoveCampImage.click();
    
    const toggleCheckboxes = document.querySelectorAll('.camp-template-toggle-buttons');
    toggleCheckboxes.forEach(cb => {
      cb.checked = false;
      cb.dispatchEvent(new Event('change'));
    });
    const campButtonsList = document.getElementById('camp-buttons-list');
    if (campButtonsList) campButtonsList.innerHTML = '';

    // Redirect to list
    document.querySelector('.nav-item[data-tab="campaign-list"]').click();

  } catch (error) {
    alert('Gagal menjadwalkan: ' + error.message);
  }
});

// ==========================================================================
// CAMPAIGNS LIST & INTERACTIONS
// ==========================================================================
async function loadCampaigns() {
  try {
    const res = await fetch('/api/campaigns');
    const campaigns = await res.json();
    if (res.ok) {
      campaignTableBody.innerHTML = '';
      if (campaigns.length === 0) {
        campaignTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">Belum ada campaign yang dijadwalkan.</td></tr>`;
        return;
      }

      campaigns.forEach(c => {
        const tr = document.createElement('tr');
        const createdDate = new Date(c.createdAt).toLocaleString('id-ID');
        const scheduledDate = new Date(c.scheduledTime).toLocaleString('id-ID');

        let statusBadge = `<span class="badge pending">Menunggu</span>`;
        if (c.status === 'running') statusBadge = `<span class="badge running">Berjalan</span>`;
        if (c.status === 'completed') statusBadge = `<span class="badge completed">Selesai</span>`;
        if (c.status === 'cancelled') statusBadge = `<span class="badge cancelled">Dibatalkan</span>`;

        // Action buttons
        let actionsHtml = `<button class="btn btn-secondary btn-small btn-detail" data-id="${c._id}"><i class="fas fa-eye"></i> Detail</button>`;
        actionsHtml += ` <button class="btn btn-secondary btn-small btn-duplicate" data-id="${c._id}"><i class="fas fa-copy"></i> Duplikat</button>`;
        
        if (c.status === 'pending') {
          actionsHtml += ` <button class="btn btn-secondary btn-small btn-edit-time" data-id="${c._id}" style="background-color: var(--color-warning, #f59e0b); border-color: var(--color-warning, #f59e0b); color: #000;"><i class="fas fa-edit"></i> Edit</button>`;
        }
        if (c.status === 'pending' || c.status === 'running') {
          actionsHtml += ` <button class="btn btn-danger btn-small btn-cancel" data-id="${c._id}"><i class="fas fa-times-circle"></i> Batal</button>`;
        }

        tr.innerHTML = `
          <td>${createdDate}</td>
          <td><strong>${c.name}</strong></td>
          <td>${scheduledDate}</td>
          <td>${statusBadge}</td>
          <td>
            <div class="campaign-stats-pill">
              <span class="stat-pill-item total" title="Total Kontak">T:${c.stats.total}</span>
              <span class="stat-pill-item sent" title="Terkirim">S:${c.stats.sent}</span>
              <span class="stat-pill-item failed" title="Gagal">G:${c.stats.failed}</span>
              <span class="stat-pill-item pending" title="Menunggu Antrean">M:${c.stats.pending}</span>
            </div>
          </td>
          <td>${actionsHtml}</td>
        `;
        campaignTableBody.appendChild(tr);
      });

      // Hook click events
      document.querySelectorAll('.btn-detail').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          openCampaignModal(id);
        });
      });

      document.querySelectorAll('.btn-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          cancelCampaign(id);
        });
      });

      document.querySelectorAll('.btn-edit-time').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          openEditTimeModal(id);
        });
      });

      document.querySelectorAll('.btn-duplicate').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          duplicateCampaignContent(id);
        });
      });
    }
  } catch (error) {
    console.error('Error fetching campaigns:', error);
  }
}

async function cancelCampaign(id) {
  if (confirm('Apakah Anda yakin ingin membatalkan kampanye blast ini? Pesan yang belum terkirim akan dibatalkan.')) {
    try {
      const res = await fetch(`/api/campaigns/${id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('Kampanye dibatalkan.');
      loadCampaigns();
    } catch (error) {
      alert('Gagal membatalkan: ' + error.message);
    }
  }
}

// ==========================================================================
// DETAIL MODAL LOGIC
// ==========================================================================
async function openCampaignModal(id) {
  detailModal.dataset.campaignId = id;
  detailModal.classList.add('active');
  modalLogTableBody.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fas fa-spinner spin"></i> Memuat detail data...</td></tr>`;

  await loadCampaignDetails(id);
}

async function loadCampaignDetails(id) {
  try {
    const res = await fetch(`/api/campaigns/${id}`);
    const data = await res.json();
    if (res.ok) {
      const { campaign, logs } = data;
      modalCampaignTitle.textContent = campaign.name;
      modalScheduledTime.textContent = new Date(campaign.scheduledTime).toLocaleString('id-ID');
      modalMessageTemplate.textContent = campaign.messageTemplate;

      let statusBadgeText = `<span class="badge pending">Menunggu</span>`;
      if (campaign.status === 'running') statusBadgeText = `<span class="badge running">Berjalan</span>`;
      if (campaign.status === 'completed') statusBadgeText = `<span class="badge completed">Selesai</span>`;
      if (campaign.status === 'cancelled') statusBadgeText = `<span class="badge cancelled">Dibatalkan</span>`;
      modalStatusBadge.innerHTML = statusBadgeText;

      // Fetch A/B testing stats
      const abStatsSection = document.getElementById('modal-ab-stats-section');
      const abStatsTableBody = document.getElementById('modal-ab-stats-table-body');
      
      if (abStatsSection && abStatsTableBody) {
        abStatsSection.style.display = 'none';
        abStatsTableBody.innerHTML = '';
        
        if (campaign.messageTemplates && campaign.messageTemplates.length > 0) {
          try {
            const statsRes = await fetch(`/api/campaigns/${id}/ab-stats`);
            const statsData = await statsRes.json();
            if (statsRes.ok && statsData.variations && statsData.variations.length > 0) {
              abStatsSection.style.display = 'block';
              statsData.variations.forEach(v => {
                const tr = document.createElement('tr');
                
                const readPct = (v.overallReadRate * 100).toFixed(1) + '%';
                const replyPct = (v.overallReplyRate * 100).toFixed(1) + '%';
                const staleBadge = v.isStale 
                  ? `<span class="badge failed" style="background-color:rgba(255, 23, 68, 0.15); color:var(--accent-danger); border:1px solid rgba(255,23,68,0.3);"><i class="fas fa-exclamation-triangle"></i> Usang (Stale)</span>`
                  : `<span class="badge completed" style="background-color:rgba(0, 230, 118, 0.12); color:var(--accent-secondary); border:1px solid rgba(0,230,118,0.2);"><i class="fas fa-check"></i> Efektif</span>`;

                tr.innerHTML = `
                  <td title="${v.text}" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><strong>${v.templateId}</strong>: ${v.text}</td>
                  <td><code>${v.weight}%</code></td>
                  <td><code>${v.totalSent}</code></td>
                  <td><code>${readPct}</code> (${v.totalRead})</td>
                  <td><code>${replyPct}</code> (${v.totalReplied})</td>
                  <td>${staleBadge}</td>
                `;
                abStatsTableBody.appendChild(tr);
              });
            }
          } catch (statsErr) {
            console.error('Error loading A/B testing stats for modal:', statsErr);
          }
        }
      }

      modalLogTableBody.innerHTML = '';
      if (logs.length === 0) {
        modalLogTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">Tidak ada logs data kontak ditemukan.</td></tr>`;
        return;
      }

      logs.forEach((log, idx) => {
        const tr = document.createElement('tr');
        const sentTime = log.sentAt ? new Date(log.sentAt).toLocaleString('id-ID') : '-';
        
        let statText = `<span class="badge pending">Menunggu</span>`;
        let errorDetails = log.messageText || '-';
        if (log.status === 'sent') {
          statText = `<span class="badge completed">Terkirim</span>`;
        } else if (log.status === 'failed') {
          statText = `<span class="badge failed">Gagal</span>`;
          errorDetails = `<span style="color:var(--accent-danger)">Error: ${log.error || ''}</span><br><small style="color:var(--color-text-muted)">Msg: ${log.messageText}</small>`;
        }

        let feedbackHtml = `<span style="color:var(--color-text-muted); font-size:12px;">-</span>`;
        if (log.status === 'sent') {
          if (log.feedbackStatus === 'replied') {
            const cleanReply = log.replyText ? log.replyText.replace(/"/g, '&quot;') : '';
            feedbackHtml = `
              <span class="badge" style="background-color:rgba(124, 77, 255, 0.15); color:var(--accent-primary-hover); border:1px solid rgba(124,77,255,0.3); margin-bottom: 4px;" title="User membalas pesan">💬 Dibalas</span>
              <div style="font-size:11.5px; color:#c084fc; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${cleanReply}">
                "${cleanReply || 'Balasan diterima'}"
              </div>
            `;
          } else if (log.feedbackStatus === 'read') {
            feedbackHtml = `<span class="badge" style="background-color:rgba(0, 176, 255, 0.12); color:var(--accent-info); border:1px solid rgba(0,176,255,0.2);">👁️ Dibaca</span>`;
          } else {
            feedbackHtml = `<span class="badge" style="background-color:rgba(255,255,255,0.05); color:var(--color-text-muted); border:1px solid rgba(255,255,255,0.1);">Terkirim</span>`;
          }
        }

        tr.innerHTML = `
          <td>${idx + 1}</td>
          <td><strong>${log.name}</strong></td>
          <td><code>${log.phone}</code></td>
          <td>${statText}</td>
          <td>${feedbackHtml}</td>
          <td>${sentTime}</td>
          <td>${errorDetails}</td>
        `;
        modalLogTableBody.appendChild(tr);
      });
    }
  } catch (error) {
    modalLogTableBody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--accent-danger)">Gagal memuat detail data kampanye.</td></tr>`;
    console.error('Error loading campaign details:', error);
  }
}

// Close Modal
closeModalBtn.addEventListener('click', () => {
  detailModal.classList.remove('active');
  detailModal.dataset.campaignId = '';
});

// ==========================================================================
// EDIT SCHEDULED TIME MODAL LOGIC
// ==========================================================================
const editTimeModal = document.getElementById('edit-time-modal');
const closeEditTimeBtn = document.getElementById('close-edit-time-modal');
const btnCancelEditTime = document.getElementById('btn-cancel-edit-time');
const btnSaveEditTime = document.getElementById('btn-save-edit-time');
const newScheduledTimeInput = document.getElementById('new-scheduled-time');

let editTimeCampaignId = null;

function closeEditTimeModal() {
  if (editTimeModal) {
    editTimeModal.classList.remove('active');
  }
  editTimeCampaignId = null;
}

if (closeEditTimeBtn) closeEditTimeBtn.onclick = closeEditTimeModal;
if (btnCancelEditTime) btnCancelEditTime.onclick = closeEditTimeModal;

if (btnSaveEditTime) {
  btnSaveEditTime.onclick = async () => {
    if (!editTimeCampaignId) return;
    const newTime = newScheduledTimeInput.value;
    if (!newTime) {
      alert('Silakan pilih waktu pengiriman baru!');
      return;
    }

    try {
      btnSaveEditTime.disabled = true;
      btnSaveEditTime.innerHTML = `<i class="fas fa-spinner spin"></i> Menyimpan...`;

      const res = await fetch(`/api/campaigns/${editTimeCampaignId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledTime: newTime })
      });

      const data = await res.json();
      btnSaveEditTime.disabled = false;
      btnSaveEditTime.innerHTML = `<i class="fas fa-save"></i> Simpan Perubahan`;

      if (!res.ok) throw new Error(data.error);

      alert('Waktu pengiriman berhasil diubah!');
      closeEditTimeModal();
      loadCampaigns(); // reload table

    } catch (error) {
      alert('Gagal mengubah waktu pengiriman: ' + error.message);
      btnSaveEditTime.disabled = false;
      btnSaveEditTime.innerHTML = `<i class="fas fa-save"></i> Simpan Perubahan`;
    }
  };
}

function openEditTimeModal(id) {
  editTimeCampaignId = id;
  
  // Set default datetime to now + 5 mins
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  const tzOffset = now.getTimezoneOffset() * 60000;
  newScheduledTimeInput.value = (new Date(now - tzOffset)).toISOString().slice(0, 16);

  if (editTimeModal) {
    editTimeModal.classList.add('active');
  }
}

// ==========================================================================
// DUPLICATE CAMPAIGN LOGIC
// ==========================================================================
async function duplicateCampaignContent(id) {
  try {
    const res = await fetch(`/api/campaigns/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const { campaign } = data;
    if (!campaign) throw new Error('Data campaign tidak ditemukan.');

    // Switch tab to individual-blast
    document.querySelector('.nav-item[data-tab="individual-blast"]').click();

    // Clear and initialize container
    const container = document.getElementById('indiv-messages-container');
    if (!container) return;
    container.innerHTML = '';
    indivCardCount = 0;

    // Create a new card
    const card = createIndivMessageCard();
    container.appendChild(card);

    // Populate card fields with campaign data
    const textarea = card.querySelector('.indiv-msg-text');
    if (textarea) textarea.value = campaign.messageTemplate;

    // Default to scheduled (checked = false)
    const instantCheck = card.querySelector('.indiv-msg-instant');
    if (instantCheck) {
      instantCheck.checked = false;
      instantCheck.dispatchEvent(new Event('change'));
    }

    // Populate image if exists
    if (campaign.imageBase64) {
      card.setImageBase64(campaign.imageBase64);
      const nameLabel = card.querySelector('.image-name-label');
      const previewImg = card.querySelector('.image-preview');
      const previewContainer = card.querySelector('.image-preview-container');
      
      if (nameLabel) nameLabel.textContent = 'Salinan_Gambar.png';
      if (previewImg) previewImg.src = campaign.imageBase64;
      if (previewContainer) previewContainer.style.display = 'flex';
    }

    // Populate buttons if exists
    if (campaign.buttons && campaign.buttons.length > 0) {
      const toggleButtonsCheckbox = card.querySelector('input[type="checkbox"]');
      const builderArea = card.querySelector('.buttons-builder-area');
      const buttonsList = card.querySelector('.buttons-list');
      const addBtn = card.querySelector('.buttons-builder-area button');

      if (toggleButtonsCheckbox && builderArea && buttonsList && addBtn) {
        toggleButtonsCheckbox.checked = true;
        builderArea.style.display = 'block';
        buttonsList.innerHTML = ''; // Clear empty initial rows
        
        // Add each button row
        const prefix = `indiv-card-${indivCardCount}`;
        campaign.buttons.forEach(btn => {
          // Re-create addButtonRow manually to pre-populate values
          const count = buttonsList.children.length;
          if (count >= 3) return;

          const row = document.createElement('div');
          row.className = 'button-builder-row';

          // Top Controls
          const topControls = document.createElement('div');
          topControls.className = 'button-builder-row-controls';

          const select = document.createElement('select');
          select.className = `${prefix}-btn-type`;
          select.innerHTML = `
            <option value="quick_reply" ${btn.type === 'quick_reply' ? 'selected' : ''}>Quick Reply</option>
            <option value="cta_url" ${btn.type === 'cta_url' ? 'selected' : ''}>URL Link</option>
          `;

          const inputLabel = document.createElement('input');
          inputLabel.type = 'text';
          inputLabel.className = `${prefix}-btn-label`;
          inputLabel.placeholder = 'Label Tombol (cth: Saya Mau)';
          inputLabel.value = btn.text || '';
          inputLabel.required = true;

          const inputValue = document.createElement('input');
          inputValue.type = 'text';
          inputValue.className = `${prefix}-btn-value`;
          inputValue.placeholder = btn.type === 'cta_url' ? 'URL Link (https://...)' : 'Kata Kunci Trigger (cth: hh)';
          inputValue.value = btn.value || '';
          inputValue.required = true;

          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'btn btn-danger btn-small';
          deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
          deleteBtn.addEventListener('click', () => {
            row.remove();
            addBtn.disabled = false;
            addBtn.innerHTML = '<i class="fas fa-plus"></i> Tambah Tombol';
          });

          topControls.appendChild(select);
          topControls.appendChild(inputLabel);
          topControls.appendChild(inputValue);
          topControls.appendChild(deleteBtn);

          // Reply Text Area
          const replyArea = document.createElement('div');
          replyArea.className = 'button-builder-reply-area';
          replyArea.style.width = '100%';
          replyArea.style.display = btn.type === 'quick_reply' ? 'block' : 'none';

          const inputReplyText = document.createElement('input');
          inputReplyText.type = 'text';
          inputReplyText.className = `${prefix}-btn-reply-text`;
          inputReplyText.placeholder = 'Pesan Balasan Otomatis dari Bot (cth: Halo! Terima kasih telah mengklik...)';
          inputReplyText.value = btn.replyText || '';
          inputReplyText.required = btn.type === 'quick_reply';

          replyArea.appendChild(inputReplyText);

          select.addEventListener('change', () => {
            if (select.value === 'cta_url') {
              inputValue.placeholder = 'URL Link (https://...)';
              replyArea.style.display = 'none';
              inputReplyText.required = false;
              inputReplyText.value = '';
            } else {
              inputValue.placeholder = 'Kata Kunci Trigger (cth: hh)';
              replyArea.style.display = 'block';
              inputReplyText.required = true;
            }
          });

          row.appendChild(topControls);
          row.appendChild(replyArea);
          buttonsList.appendChild(row);

          if (buttonsList.children.length >= 3) {
            addBtn.disabled = true;
            addBtn.innerHTML = '<i class="fas fa-ban"></i> Maks 3 Tombol';
          }
        });
      }
    }

    alert('Pesan berhasil diduplikasi ke tab Blast Individu. Silakan isi nomor HP dan Nama penerima baru!');

  } catch (error) {
    alert('Gagal menduplikasi pesan: ' + error.message);
  }
}

window.addEventListener('click', (e) => {
  if (e.target === detailModal) {
    detailModal.classList.remove('active');
    detailModal.dataset.campaignId = '';
  }
});

// ==========================================================================
// INITIALIZATION
// ==========================================================================
startSSE();
loadStats();
loadLogs();
setDefaultDateTime();

// ==========================================================================
// IMAGE UPLOAD & BUTTONS BUILDER HELPERS
// ==========================================================================

function setupImageUpload(triggerBtnId, fileInputId, nameLabelId, previewContainerId, previewImgId, removeBtnId, onImageLoaded, onImageCleared) {
  const triggerBtn = document.getElementById(triggerBtnId);
  const fileInput = document.getElementById(fileInputId);
  const nameLabel = document.getElementById(nameLabelId);
  const previewContainer = document.getElementById(previewContainerId);
  const previewImg = document.getElementById(previewImgId);
  const removeBtn = document.getElementById(removeBtnId);

  if (!triggerBtn || !fileInput) return;

  triggerBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      nameLabel.textContent = file.name;

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        previewImg.src = base64;
        previewContainer.style.display = 'flex';
        onImageLoaded(base64);
      };
      reader.readAsDataURL(file);
    }
  });

  removeBtn.addEventListener('click', () => {
    fileInput.value = '';
    nameLabel.textContent = 'Belum ada gambar terpilih';
    previewContainer.style.display = 'none';
    previewImg.src = '';
    onImageCleared();
  });
}

function setupButtonsBuilder(toggleCheckboxId, builderAreaId, buttonsListId, addBtnId, formPrefix) {
  const toggle = document.getElementById(toggleCheckboxId);
  const area = document.getElementById(builderAreaId);
  const list = document.getElementById(buttonsListId);
  const addBtn = document.getElementById(addBtnId);

  if (!toggle || !area || !list || !addBtn) return;

  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      area.style.display = 'block';
      if (list.children.length === 0) {
        addButtonRow(list, addBtn, formPrefix);
      }
    } else {
      area.style.display = 'none';
    }
  });

  addBtn.addEventListener('click', () => {
    addButtonRow(list, addBtn, formPrefix);
  });
}

function addButtonRow(list, addBtn, formPrefix) {
  const count = list.children.length;
  if (count >= 3) return;

  const row = document.createElement('div');
  row.className = 'button-builder-row';

  // Top Controls
  const topControls = document.createElement('div');
  topControls.className = 'button-builder-row-controls';

  const select = document.createElement('select');
  select.className = `${formPrefix}-btn-type`;
  select.innerHTML = `
    <option value="quick_reply">Quick Reply</option>
    <option value="cta_url">URL Link</option>
  `;

  const inputLabel = document.createElement('input');
  inputLabel.type = 'text';
  inputLabel.className = `${formPrefix}-btn-label`;
  inputLabel.placeholder = 'Label Tombol (cth: Saya Mau)';
  inputLabel.required = true;

  const inputValue = document.createElement('input');
  inputValue.type = 'text';
  inputValue.className = `${formPrefix}-btn-value`;
  inputValue.placeholder = 'Kata Kunci Trigger (cth: hh)';
  inputValue.required = true;

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-danger btn-small';
  deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
  deleteBtn.addEventListener('click', () => {
    row.remove();
    addBtn.disabled = false;
    addBtn.innerHTML = '<i class="fas fa-plus"></i> Tambah Tombol';
  });

  topControls.appendChild(select);
  topControls.appendChild(inputLabel);
  topControls.appendChild(inputValue);
  topControls.appendChild(deleteBtn);

  // Reply Text Area
  const replyArea = document.createElement('div');
  replyArea.className = 'button-builder-reply-area';
  replyArea.style.width = '100%';

  const inputReplyText = document.createElement('input');
  inputReplyText.type = 'text';
  inputReplyText.className = `${formPrefix}-btn-reply-text`;
  inputReplyText.placeholder = 'Pesan Balasan Otomatis dari Bot (cth: Halo! Terima kasih telah mengklik...)';
  inputReplyText.required = true;

  replyArea.appendChild(inputReplyText);

  select.addEventListener('change', () => {
    if (select.value === 'cta_url') {
      inputValue.placeholder = 'URL Link (https://...)';
      replyArea.style.display = 'none';
      inputReplyText.required = false;
      inputReplyText.value = '';
    } else {
      inputValue.placeholder = 'Kata Kunci Trigger (cth: hh)';
      replyArea.style.display = 'block';
      inputReplyText.required = true;
    }
  });

  row.appendChild(topControls);
  row.appendChild(replyArea);
  list.appendChild(row);

  if (list.children.length >= 3) {
    addBtn.disabled = true;
    addBtn.innerHTML = '<i class="fas fa-ban"></i> Maks 3 Tombol';
  }
}

function getBuilderButtons(listId, formPrefix) {
  const list = typeof listId === 'string' ? document.getElementById(listId) : listId;
  const buttons = [];
  if (!list) return buttons;
  
  const rows = list.querySelectorAll('.button-builder-row');
  rows.forEach(row => {
    const type = row.querySelector(`.${formPrefix}-btn-type`).value;
    const text = row.querySelector(`.${formPrefix}-btn-label`).value.trim();
    const value = row.querySelector(`.${formPrefix}-btn-value`).value.trim();
    
    let replyText = null;
    if (type === 'quick_reply') {
      const replyInput = row.querySelector(`.${formPrefix}-btn-reply-text`);
      if (replyInput) {
        replyText = replyInput.value.trim();
      }
    }
    
    if (text.length > 0 && value.length > 0) {
      buttons.push({ type, text, value, replyText });
    }
  });
  
  return buttons;
}

// Bind image uploader logic to a template variation card
function bindCampTemplateImageUploader(card) {
  const uploadBtn = card.querySelector('.btn-camp-upload-img');
  const removeBtn = card.querySelector('.btn-camp-remove-img');
  const fileInput = card.querySelector('.camp-img-file-input');
  const nameLabel = card.querySelector('.camp-img-name-label');
  const previewContainer = card.querySelector('.camp-img-preview-container');
  const previewImg = card.querySelector('.camp-img-preview');

  if (!uploadBtn || !fileInput) return;

  uploadBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      if (nameLabel) nameLabel.textContent = file.name;

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        if (previewImg) previewImg.src = base64;
        if (previewContainer) previewContainer.style.display = 'block';
        card.dataset.imageBase64 = base64;
      };
      reader.readAsDataURL(file);
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      fileInput.value = '';
      if (nameLabel) nameLabel.textContent = '';
      if (previewContainer) previewContainer.style.display = 'none';
      if (previewImg) previewImg.src = '';
      delete card.dataset.imageBase64;
    });
  }
}

// Bind emoji popover bar inside a card composer
function bindEmojiPicker(card) {
  const emojiBtn = card.querySelector('.btn-emoji');
  const emojisBar = card.querySelector('.sm-composer-emojis-bar');
  const textarea = card.querySelector('.camp-template-text');

  if (!emojiBtn || !emojisBar || !textarea) return;

  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = emojisBar.style.display === 'flex';
    emojisBar.style.display = isVisible ? 'none' : 'flex';
  });

  emojisBar.addEventListener('click', (e) => {
    if (e.target.classList.contains('sm-emoji-btn')) {
      const emoji = e.target.getAttribute('data-emoji');
      if (emoji) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + emoji + text.substring(end);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      }
    }
  });
  
  // Close emoji bar on clicking outside card
  document.addEventListener('click', (e) => {
    if (!card.contains(e.target)) {
      emojisBar.style.display = 'none';
    }
  });
}

// Bind buttons builder to a campaign template card
function bindCampTemplateButtonsBuilder(card, index) {
  const toggle = card.querySelector('.camp-template-toggle-buttons');
  const area = card.querySelector('.camp-template-buttons-builder');
  const list = card.querySelector('.camp-template-buttons-list');
  const addBtn = card.querySelector('.btn-camp-add-button-row');

  if (!toggle || !area || !list || !addBtn) return;

  const formPrefix = `camp-var-${index}`;

  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      area.style.display = 'flex';
      if (list.children.length === 0) {
        addButtonRow(list, addBtn, formPrefix);
      }
    } else {
      area.style.display = 'none';
    }
  });

  addBtn.addEventListener('click', () => {
    addButtonRow(list, addBtn, formPrefix);
  });

  card.getButtons = () => {
    if (toggle.checked) {
      return getBuilderButtons(list, formPrefix);
    }
    return [];
  };
}

// Bind primary template card on startup
document.addEventListener('DOMContentLoaded', () => {
  const primaryCard = document.querySelector('#camp-templates-container .ab-template-card');
  if (primaryCard) {
    bindCampTemplateImageUploader(primaryCard);
    bindEmojiPicker(primaryCard);
    bindCampTemplateButtonsBuilder(primaryCard, 1);
  }
});

// Dynamic A/B Testing Message Templates builder
const campTemplatesContainer = document.getElementById('camp-templates-container');
const btnAddCampTemplate = document.getElementById('btn-add-camp-template');
let campTemplateCount = 1;

if (btnAddCampTemplate && campTemplatesContainer) {
  btnAddCampTemplate.addEventListener('click', () => {
    campTemplateCount++;
    const card = document.createElement('div');
    card.className = 'sm-composer-card ab-template-card';
    card.style.background = 'rgba(15, 23, 42, 0.45)';
    card.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    card.style.padding = '16px';
    card.style.borderRadius = '16px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '12px';

    card.innerHTML = `
      <!-- Composer Header -->
      <div class="sm-composer-header">
        <div class="sm-composer-profile">
          <div class="sm-composer-avatar">
            <i class="fas fa-bullhorn"></i>
          </div>
          <div class="sm-composer-info">
            <span class="sm-composer-title">Variasi Pesan #${campTemplateCount}</span>
            <span class="sm-composer-subtitle">Variasi (A/B Test)</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="sm-composer-weight-container">
            <span class="sm-composer-weight-label">Peluang:</span>
            <input type="number" class="camp-template-weight sm-composer-weight-input" value="50" min="1" max="100" required>
            <span style="font-size: 11px; color: var(--accent-secondary); font-weight: 700; margin-left: -2px;">%</span>
          </div>
          <button type="button" class="btn btn-danger btn-small btn-remove-template" style="padding: 6px 10px; border-radius: 20px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.2); color: #ef4444;" title="Hapus variasi ini">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>

      <!-- Textarea (spaciously styled) -->
      <textarea class="camp-template-text sm-composer-textarea" required rows="4" placeholder="Tulis penawaran menarik Anda di sini... (cth: Halo {Nama}, kami punya promo khusus untuk Anda!)"></textarea>

      <!-- Image Preview container -->
      <div class="sm-composer-media-box camp-img-preview-container" style="display: none;">
        <img class="sm-composer-media-img camp-img-preview" src="">
        <div class="sm-composer-media-remove btn-camp-remove-img" title="Hapus gambar">
          <i class="fas fa-times"></i>
        </div>
      </div>

      <!-- Emojis Bar (toggled by Emoji button) -->
      <div class="sm-composer-emojis-bar" style="display: none;">
        <button type="button" class="sm-emoji-btn" data-emoji="😀">😀</button>
        <button type="button" class="sm-emoji-btn" data-emoji="🔥">🔥</button>
        <button type="button" class="sm-emoji-btn" data-emoji="🚀">🚀</button>
        <button type="button" class="sm-emoji-btn" data-emoji="🎁">🎁</button>
        <button type="button" class="sm-emoji-btn" data-emoji="👉">👉</button>
        <button type="button" class="sm-emoji-btn" data-emoji="✅">✅</button>
        <button type="button" class="sm-emoji-btn" data-emoji="💯">💯</button>
        <button type="button" class="sm-emoji-btn" data-emoji="📞">📞</button>
        <button type="button" class="sm-emoji-btn" data-emoji="💬">💬</button>
        <button type="button" class="sm-emoji-btn" data-emoji="⭐">⭐</button>
      </div>

      <!-- Composer Toolbar -->
      <div class="sm-composer-toolbar">
        <div class="sm-composer-toolbar-left">
          <span class="sm-composer-toolbar-title">Tambahkan:</span>
          <button type="button" class="sm-composer-action-btn btn-image btn-camp-upload-img" title="Tambahkan Gambar">
            <i class="fas fa-image"></i>
          </button>
          <button type="button" class="sm-composer-action-btn btn-emoji" title="Masukkan Emoji">
            <i class="far fa-smile"></i>
          </button>
          <span class="camp-img-name-label" style="font-size: 11px; color: var(--color-text-muted); display: none;"></span>
          <input type="file" class="camp-img-file-input" accept="image/*" style="display: none;">
        </div>

        <!-- Variables tags on the right -->
        <div class="sm-composer-variables">
          <button type="button" class="sm-var-badge btn-var-pill-dynamic" data-var="{Nama}">{Nama}</button>
          <button type="button" class="sm-var-badge btn-var-pill-dynamic" data-var="{Nomor}">{Nomor}</button>
        </div>
      </div>

      <!-- Individual Template Button Builder -->
      <div class="sm-composer-buttons-area" style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px;">
        <label class="switch-container" style="padding: 4px 0; margin-bottom: 8px;">
          <div class="switch-label-area">
            <span class="switch-label-title" style="font-size:12px; font-weight:600; color:#ccc;"><i class="fas fa-link"></i> Lampirkan Tombol Aksi (Link / Quick Reply)</span>
          </div>
          <div class="switch-control">
            <input type="checkbox" class="camp-template-toggle-buttons">
            <span class="switch-slider"></span>
          </div>
        </label>
        
        <div class="camp-template-buttons-builder" style="display: none; flex-direction: column; gap: 8px; background: rgba(0,0,0,0.15); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
          <div class="camp-template-buttons-list" style="display: flex; flex-direction: column; gap: 6px;">
            <!-- Dynamic button builder rows will be rendered here by JS -->
          </div>
          <button type="button" class="btn btn-secondary btn-small btn-camp-add-button-row" style="padding: 5px 10px; font-size:11px; align-self: flex-start; display: flex; align-items: center; gap: 4px;">
            <i class="fas fa-plus"></i> Tambah Tombol Aksi
          </button>
        </div>
      </div>
    `;

    campTemplatesContainer.appendChild(card);
    bindCampTemplateImageUploader(card);
    bindEmojiPicker(card);
    bindCampTemplateButtonsBuilder(card, campTemplateCount);
    redistributeCampWeights();

    // Bind delete button listener
    card.querySelector('.btn-remove-template').addEventListener('click', () => {
      card.remove();
      reindexCampTemplates();
      redistributeCampWeights();
    });
  });

  // Variable pill click handler for dynamic templates
  campTemplatesContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-var-pill-dynamic')) {
      const card = e.target.closest('.ab-template-card');
      if (card) {
        const textarea = card.querySelector('.camp-template-text');
        const variable = e.target.getAttribute('data-var');
        if (textarea && variable) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const text = textarea.value;
          const before = text.substring(0, start);
          const after  = text.substring(end, text.length);
          
          textarea.value = before + variable + after;
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = start + variable.length;
        }
      }
    }
  });

  // Manual weight change trigger to balance total to 100%
  campTemplatesContainer.addEventListener('input', (e) => {
    if (e.target.classList.contains('camp-template-weight')) {
      adjustCampWeightsOnManualChange(e.target);
    }
  });
}

function reindexCampTemplates() {
  const cards = campTemplatesContainer.querySelectorAll('.ab-template-card');
  campTemplateCount = 0;
  cards.forEach(card => {
    campTemplateCount++;
    const title = card.querySelector('.sm-composer-title');
    if (title) {
      title.textContent = `Variasi Pesan #${campTemplateCount}`;
    }
    const subtitle = card.querySelector('.sm-composer-subtitle');
    if (subtitle) {
      subtitle.textContent = campTemplateCount === 1 ? 'Default (A/B Test)' : 'Variasi (A/B Test)';
    }
  });
}

// Redistribute weights equally across all variations so total is 100%
function redistributeCampWeights() {
  const cards = campTemplatesContainer.querySelectorAll('.ab-template-card');
  const N = cards.length;
  if (N === 0) return;

  const baseWeight = Math.floor(100 / N);
  const remainder = 100 % N;

  cards.forEach((card, idx) => {
    const weightInput = card.querySelector('.camp-template-weight');
    if (weightInput) {
      const weight = baseWeight + (idx < remainder ? 1 : 0);
      weightInput.value = weight;
    }
  });
}

// Adjust weights when one is manually changed, ensuring total is exactly 100%
function adjustCampWeightsOnManualChange(changedInput) {
  const cards = Array.from(campTemplatesContainer.querySelectorAll('.ab-template-card'));
  const N = cards.length;
  if (N <= 1) {
    if (changedInput) changedInput.value = 100;
    return;
  }

  const maxAllowed = 100 - (N - 1);
  const minAllowed = 1;
  let newWeight = parseInt(changedInput.value) || 0;
  
  if (newWeight < minAllowed) newWeight = minAllowed;
  if (newWeight > maxAllowed) newWeight = maxAllowed;
  changedInput.value = newWeight;

  const changedCard = changedInput.closest('.ab-template-card');
  const otherCards = cards.filter(card => card !== changedCard);

  const remainderSum = 100 - newWeight;
  const baseWeight = Math.floor(remainderSum / otherCards.length);
  const remainder = remainderSum % otherCards.length;

  otherCards.forEach((card, idx) => {
    const weightInput = card.querySelector('.camp-template-weight');
    if (weightInput) {
      const weight = baseWeight + (idx < remainder ? 1 : 0);
      weightInput.value = weight;
    }
  });
}

// ==========================================================================
// DYNAMIC CARDS SYSTEM FOR MULTIPLE FOLLOW-UP INDIVIDUAL BLAST
// ==========================================================================
function createIndivMessageCard() {
  const container = document.getElementById('indiv-messages-container');
  const index = container ? container.querySelectorAll('.message-card').length + 1 : 1;
  const cardId = `indiv-card-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const card = document.createElement('div');
  card.className = 'sm-composer-card message-card';
  card.id = cardId;

  // Premium dynamic color tints for sequence cards
  const tints = [
    { bg: 'rgba(16, 185, 129, 0.03)', borderLeft: '4px solid #10b981', avatarBg: 'linear-gradient(135deg, #10b981, #064e3b)', shadow: '0 2px 8px rgba(16, 185, 129, 0.25)' }, // Emerald
    { bg: 'rgba(6, 182, 212, 0.03)', borderLeft: '4px solid #06b6d4', avatarBg: 'linear-gradient(135deg, #06b6d4, #083344)', shadow: '0 2px 8px rgba(6, 182, 212, 0.25)' },  // Cyan
    { bg: 'rgba(139, 92, 246, 0.03)', borderLeft: '4px solid #8b5cf6', avatarBg: 'linear-gradient(135deg, #8b5cf6, #2e1065)', shadow: '0 2px 8px rgba(139, 92, 246, 0.25)' }, // Violet
    { bg: 'rgba(249, 115, 22, 0.03)', borderLeft: '4px solid #f97316', avatarBg: 'linear-gradient(135deg, #f97316, #431407)', shadow: '0 2px 8px rgba(249, 115, 22, 0.25)' }   // Orange
  ];
  const tint = tints[(index - 1) % tints.length];

  card.style.background = tint.bg;
  card.style.border = '1px solid rgba(255, 255, 255, 0.08)';
  card.style.borderLeft = tint.borderLeft;
  card.style.padding = '16px';
  card.style.borderRadius = '16px';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '12px';
  card.style.marginBottom = '15px';
  card.style.transition = 'all 0.3s ease';

  card.innerHTML = `
    <!-- Composer Header -->
    <div class="sm-composer-header" style="display: flex; align-items: center; justify-content: space-between;">
      <div class="sm-composer-profile" style="display: flex; align-items: center; gap: 10px;">
        <div class="sm-composer-avatar" style="width: 38px; height: 38px; border-radius: 50%; background: ${tint.avatarBg}; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 15px; font-weight: bold; box-shadow: ${tint.shadow}; transition: all 0.3s ease;">
          <i class="fas fa-clock"></i>
        </div>
        <div class="sm-composer-info" style="display: flex; flex-direction: column;">
          <span class="sm-composer-title" style="font-size: 13.5px; font-weight: 600; color: #fff;">Pesan Follow-up #${index}</span>
          <span class="sm-composer-subtitle" style="font-size: 11px; color: var(--color-text-muted);">Urutan Follow-up</span>
        </div>
      </div>
      ${index > 1 ? `
        <button type="button" class="btn btn-danger btn-small btn-remove-followup" style="padding: 6px 10px; border-radius: 20px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.2); color: #ef4444;" title="Hapus pesan ini">
          <i class="fas fa-trash"></i>
        </button>
      ` : ''}
    </div>

    <!-- Scheduler Tray (Premium compact scheduler layout) -->
    <div class="indiv-msg-scheduler-tray" style="display: flex; flex-direction: column; gap: 8px; padding: 12px; background: rgba(0, 0, 0, 0.20); border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.04);">
      ${index === 1 ? `
        <label class="switch-container" style="padding: 4px 0;">
          <div class="switch-label-area">
            <span class="switch-label-title" style="font-size: 12px; font-weight: 600; color: #ccc;"><i class="fas fa-bolt"></i> Kirim Sekarang (Instan)</span>
            <span class="switch-label-desc" style="font-size: 10.5px; color: var(--color-text-muted);">Kirim pesan pertama secara langsung</span>
          </div>
          <div class="switch-control">
            <input type="checkbox" class="indiv-msg-instant">
            <span class="switch-slider"></span>
          </div>
        </label>
      ` : ''}
      <div class="indiv-msg-schedule-area" style="display: flex; flex-direction: column; gap: 4px;">
        <span style="font-size: 11px; font-weight: 600; color: #aaa;"><i class="far fa-calendar-alt"></i> Waktu Pengiriman</span>
        <input type="datetime-local" class="indiv-msg-time" required style="padding: 8px 12px; font-size: 12.5px; background: #0c0c0c; border: 1px solid #292929; border-radius: 6px; color: #fff;">
      </div>
    </div>

    <!-- Textarea (spaciously styled) -->
    <textarea class="indiv-msg-text sm-composer-textarea" required rows="4" placeholder="Tulis pesan follow-up menarik Anda di sini... (cth: Halo {Nama}, apakah Anda tertarik dengan penawaran kami?)" style="min-height: 100px; margin-top: 4px;"></textarea>

    <!-- Image Preview container -->
    <div class="sm-composer-media-box indiv-img-preview-container" style="display: none; position: relative; width: 100%; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(0, 0, 0, 0.3); margin-top: 4px;">
      <img class="sm-composer-media-img indiv-img-preview" src="" style="width: 100%; max-height: 200px; object-fit: cover; display: block;">
      <div class="sm-composer-media-remove btn-indiv-remove-img" title="Hapus gambar" style="position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; border-radius: 50%; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.15); color: #ef4444; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px;">
        <i class="fas fa-times"></i>
      </div>
    </div>

    <!-- Emojis Bar (toggled by Emoji button) -->
    <div class="sm-composer-emojis-bar" style="display: none;">
      <button type="button" class="sm-emoji-btn" data-emoji="😀">😀</button>
      <button type="button" class="sm-emoji-btn" data-emoji="🔥">🔥</button>
      <button type="button" class="sm-emoji-btn" data-emoji="🚀">🚀</button>
      <button type="button" class="sm-emoji-btn" data-emoji="🎁">🎁</button>
      <button type="button" class="sm-emoji-btn" data-emoji="👉">👉</button>
      <button type="button" class="sm-emoji-btn" data-emoji="✅">✅</button>
      <button type="button" class="sm-emoji-btn" data-emoji="💯">💯</button>
      <button type="button" class="sm-emoji-btn" data-emoji="📞">📞</button>
      <button type="button" class="sm-emoji-btn" data-emoji="💬">💬</button>
      <button type="button" class="sm-emoji-btn" data-emoji="⭐">⭐</button>
    </div>

    <!-- Composer Toolbar -->
    <div class="sm-composer-toolbar" style="display: flex; align-items: center; justify-content: space-between; background: rgba(11, 14, 27, 0.6); border: 1px solid rgba(255, 255, 255, 0.05); padding: 8px 12px; border-radius: 10px; margin-top: 4px;">
      <div class="sm-composer-toolbar-left" style="display: flex; align-items: center; gap: 15px;">
        <span class="sm-composer-toolbar-title" style="font-size: 11.5px; font-weight: 600; color: var(--color-text-muted);">Tambahkan:</span>
        <button type="button" class="sm-composer-action-btn btn-image btn-indiv-upload-img" style="background: transparent; border: none; color: #10b981; font-size: 15px; cursor: pointer; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Tambahkan Gambar">
          <i class="fas fa-image"></i>
        </button>
        <button type="button" class="sm-composer-action-btn btn-emoji" style="background: transparent; border: none; color: #fbbf24; font-size: 15px; cursor: pointer; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Masukkan Emoji">
          <i class="far fa-smile"></i>
        </button>
        <span class="indiv-img-name-label" style="font-size: 11px; color: var(--color-text-muted); display: none;"></span>
        <input type="file" class="indiv-img-file-input" accept="image/*" style="display: none;">
      </div>

      <!-- Variables tags on the right -->
      <div class="sm-composer-variables" style="display: flex; align-items: center; gap: 6px;">
        <button type="button" class="sm-var-badge btn-var-pill-dynamic" data-var="{Nama}">{Nama}</button>
        <button type="button" class="sm-var-badge btn-var-pill-dynamic" data-var="{Nomor}">{Nomor}</button>
      </div>
    </div>

    <!-- Individual Template Button Builder -->
    <div class="sm-composer-buttons-area" style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px;">
      <label class="switch-container" style="padding: 4px 0; margin-bottom: 8px;">
        <div class="switch-label-area">
          <span class="switch-label-title" style="font-size: 12px; font-weight: 600; color: #ccc;"><i class="fas fa-link"></i> Lampirkan Tombol Aksi (Link / Quick Reply)</span>
        </div>
        <div class="switch-control">
          <input type="checkbox" class="indiv-template-toggle-buttons">
          <span class="switch-slider"></span>
        </div>
      </label>
      
      <div class="indiv-template-buttons-builder" style="display: none; flex-direction: column; gap: 8px; background: rgba(0,0,0,0.15); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
        <div class="indiv-template-buttons-list" style="display: flex; flex-direction: column; gap: 6px;">
          <!-- Dynamic button builder rows will be rendered here by JS -->
        </div>
        <button type="button" class="btn btn-secondary btn-small btn-indiv-add-button-row" style="padding: 5px 10px; font-size: 11px; align-self: flex-start; display: flex; align-items: center; gap: 4px;">
          <i class="fas fa-plus"></i> Tambah Tombol Aksi
        </button>
      </div>
    </div>
  `;

  // Card base64 image state management
  let cardImageBase64 = null;
  card.getImageBase64 = () => cardImageBase64;
  card.setImageBase64 = (base64) => { cardImageBase64 = base64; };

  // Bind image uploader logic
  const uploadBtn = card.querySelector('.btn-indiv-upload-img');
  const removeBtn = card.querySelector('.btn-indiv-remove-img');
  const fileInput = card.querySelector('.indiv-img-file-input');
  const nameLabel = card.querySelector('.indiv-img-name-label');
  const previewContainer = card.querySelector('.indiv-img-preview-container');
  const previewImg = card.querySelector('.indiv-img-preview');

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      if (nameLabel) nameLabel.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        if (previewImg) previewImg.src = base64;
        if (previewContainer) previewContainer.style.display = 'block';
        card.setImageBase64(base64);
      };
      reader.readAsDataURL(file);
    }
  });

  removeBtn.addEventListener('click', () => {
    fileInput.value = '';
    if (nameLabel) nameLabel.textContent = '';
    if (previewContainer) previewContainer.style.display = 'none';
    if (previewImg) previewImg.src = '';
    card.setImageBase64(null);
  });

  // Bind emoji picker
  bindEmojiPicker(card);

  // Bind scheduler instant toggle for Pesan #1
  if (index === 1) {
    const instantCheck = card.querySelector('.indiv-msg-instant');
    const scheduleArea = card.querySelector('.indiv-msg-schedule-area');
    const timeInput = card.querySelector('.indiv-msg-time');

    // Default to today + 5 mins
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    const tzOffset = now.getTimezoneOffset() * 60000;
    timeInput.value = (new Date(now - tzOffset)).toISOString().slice(0, 16);

    instantCheck.addEventListener('change', () => {
      if (instantCheck.checked) {
        scheduleArea.style.display = 'none';
        timeInput.required = false;
        timeInput.value = '';
      } else {
        scheduleArea.style.display = 'flex';
        timeInput.required = true;
        
        // Reset to today + 5 mins
        const now = new Date();
        now.setMinutes(now.getMinutes() + 5);
        const tzOffset = now.getTimezoneOffset() * 60000;
        timeInput.value = (new Date(now - tzOffset)).toISOString().slice(0, 16);
      }
    });
  } else {
    // For followup 2, 3, etc.
    const timeInput = card.querySelector('.indiv-msg-time');
    const now = new Date();
    const daysToAdd = index === 2 ? 1 : (index === 3 ? 3 : (index === 4 ? 7 : 30));
    now.setDate(now.getDate() + daysToAdd);
    const tzOffset = now.getTimezoneOffset() * 60000;
    timeInput.value = (new Date(now - tzOffset)).toISOString().slice(0, 16);
  }

  // Bind dynamic button builder
  const toggle = card.querySelector('.indiv-template-toggle-buttons');
  const builderArea = card.querySelector('.indiv-template-buttons-builder');
  const buttonsList = card.querySelector('.indiv-template-buttons-list');
  const addBtn = card.querySelector('.btn-indiv-add-button-row');

  const prefix = `indiv-card-${index}`;

  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      builderArea.style.display = 'flex';
      if (buttonsList.children.length === 0) {
        addButtonRow(buttonsList, addBtn, prefix);
      }
    } else {
      builderArea.style.display = 'none';
    }
  });

  addBtn.addEventListener('click', () => {
    addButtonRow(buttonsList, addBtn, prefix);
  });

  card.getButtons = () => {
    if (toggle.checked) {
      return getBuilderButtons(buttonsList, prefix);
    }
    return [];
  };

  // Bind delete button listener
  if (index > 1) {
    card.querySelector('.btn-remove-followup').addEventListener('click', () => {
      card.remove();
      reindexIndivCards();
    });
  }

  return card;
}

function reindexIndivCards() {
  const container = document.getElementById('indiv-messages-container');
  if (!container) return;

  const tints = [
    { bg: 'rgba(16, 185, 129, 0.03)', borderLeft: '4px solid #10b981', avatarBg: 'linear-gradient(135deg, #10b981, #064e3b)', shadow: '0 2px 8px rgba(16, 185, 129, 0.25)' }, // Emerald
    { bg: 'rgba(6, 182, 212, 0.03)', borderLeft: '4px solid #06b6d4', avatarBg: 'linear-gradient(135deg, #06b6d4, #083344)', shadow: '0 2px 8px rgba(6, 182, 212, 0.25)' },  // Cyan
    { bg: 'rgba(139, 92, 246, 0.03)', borderLeft: '4px solid #8b5cf6', avatarBg: 'linear-gradient(135deg, #8b5cf6, #2e1065)', shadow: '0 2px 8px rgba(139, 92, 246, 0.25)' }, // Violet
    { bg: 'rgba(249, 115, 22, 0.03)', borderLeft: '4px solid #f97316', avatarBg: 'linear-gradient(135deg, #f97316, #431407)', shadow: '0 2px 8px rgba(249, 115, 22, 0.25)' }   // Orange
  ];

  const cards = container.querySelectorAll('.message-card');
  cards.forEach((card, idx) => {
    const tint = tints[idx % tints.length];
    
    // Dynamically apply tints to maintain beautiful pattern
    card.style.background = tint.bg;
    card.style.borderLeft = tint.borderLeft;

    const title = card.querySelector('.sm-composer-title');
    if (title) title.textContent = `Pesan Follow-up #${idx + 1}`;

    const avatar = card.querySelector('.sm-composer-avatar');
    if (avatar) {
      avatar.style.background = tint.avatarBg;
      avatar.style.boxShadow = tint.shadow;
    }
  });
}

function initIndivCards() {
  const container = document.getElementById('indiv-messages-container');
  if (container && container.children.length === 0) {
    container.appendChild(createIndivMessageCard());
  }

  // Click delegation for variable badges inside follow-up cards
  if (container) {
    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-var-pill-dynamic')) {
        const card = e.target.closest('.message-card');
        if (card) {
          const textarea = card.querySelector('.indiv-msg-text');
          const variable = e.target.getAttribute('data-var');
          if (textarea && variable) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            const before = text.substring(0, start);
            const after  = text.substring(end, text.length);
            
            textarea.value = before + variable + after;
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + variable.length;
          }
        }
      }
    });
  }
}

// Setup Add Follow-up Button click event
const btnAddFollowupMessage = document.getElementById('btn-add-followup-message');
if (btnAddFollowupMessage) {
  btnAddFollowupMessage.addEventListener('click', () => {
    const container = document.getElementById('indiv-messages-container');
    if (container) {
      container.appendChild(createIndivMessageCard());
    }
  });
}

// Initialize on page load
initIndivCards();

// ==========================================================================
// SUBMIT INDIVIDUAL BLAST FORM
// ==========================================================================
const formIndividualBlast = document.getElementById('form-individual-blast-ai');
const txtIndivPhone = document.getElementById('indiv-phone');
const txtIndivName = document.getElementById('indiv-name');

if (formIndividualBlast) {
  formIndividualBlast.addEventListener('submit', async (e) => {
    e.preventDefault();

    const senderProfileId = document.getElementById('indiv-profile-selector').value;
    if (!senderProfileId) {
      alert('Silakan pilih profil WhatsApp pengirim.');
      return;
    }

    const phone = txtIndivPhone.value.trim();
    const name = txtIndivName.value.trim();

    const container = document.getElementById('indiv-messages-container');
    const cards = container.querySelectorAll('.message-card');
    
    if (cards.length === 0) {
      alert('Silakan tambahkan minimal 1 pesan follow-up.');
      return;
    }

    const messages = [];
    let hasImmediate = false;
    let hasScheduledInPast = false;
    const nowTimestamp = Date.now();

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const text = card.querySelector('.indiv-msg-text').value.trim();
      
      const instantCheck = card.querySelector('.indiv-msg-instant');
      const isInstant = instantCheck ? instantCheck.checked : false;

      let scheduledTime = null;
      if (!isInstant) {
        const timeInput = card.querySelector('.indiv-msg-time');
        scheduledTime = timeInput ? timeInput.value : null;
        if (scheduledTime) {
          const schedDate = new Date(scheduledTime);
          if (schedDate.getTime() < nowTimestamp - 60000) { // allow 1 min drift
            hasScheduledInPast = true;
          }
        }
      } else {
        hasImmediate = true;
      }

      const buttons = card.getButtons();
      messages.push({
        messageText: text,
        imageBase64: card.getImageBase64(),
        buttons,
        scheduledTime
      });
    }

    if (hasScheduledInPast) {
      alert('Ada pesan follow-up dengan waktu pengiriman di masa lalu. Harap periksa kembali jadwal Anda!');
      return;
    }

    // Modal Elements for Preview
    const previewModal = document.getElementById('followup-preview-modal');
    const closePreviewBtn = document.getElementById('close-preview-modal');
    const btnCancelSend = document.getElementById('btn-cancel-send');
    const btnConfirmSend = document.getElementById('btn-confirm-send');
    const previewRecipientName = document.getElementById('preview-recipient-name');
    const previewRecipientPhone = document.getElementById('preview-recipient-phone');
    const previewChatContainer = document.getElementById('preview-chat-container');

    let confirmCallbackFn = null;

    function closePreviewModal() {
      if (previewModal) {
        previewModal.classList.remove('active');
      }
    }

    // Bind Close Buttons (only once or safely re-bind)
    if (closePreviewBtn) {
      closePreviewBtn.onclick = closePreviewModal;
    }
    if (btnCancelSend) {
      btnCancelSend.onclick = closePreviewModal;
    }

    if (btnConfirmSend) {
      btnConfirmSend.onclick = () => {
        if (confirmCallbackFn) {
          confirmCallbackFn();
        }
      };
    }

    // Function to generate simulated WhatsApp bubbles inside the modal
    function showFollowupPreviewModal(recipientName, recipientPhone, msgList, onConfirm) {
      if (!previewModal || !previewChatContainer) return;

      previewRecipientName.textContent = recipientName || 'Pelanggan';
      previewRecipientPhone.textContent = recipientPhone;
      previewChatContainer.innerHTML = '';

      confirmCallbackFn = onConfirm;

      msgList.forEach((msg, idx) => {
        // Wrapper for bubble
        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.style.display = 'flex';
        bubbleWrapper.style.flexDirection = 'column';
        bubbleWrapper.style.alignItems = 'flex-end';
        bubbleWrapper.style.width = '100%';
        bubbleWrapper.style.marginBottom = '12px';

        // Header label (Pesan #X + Time)
        const headerLabel = document.createElement('div');
        headerLabel.style.fontSize = '11px';
        headerLabel.style.color = 'var(--color-text-muted)';
        headerLabel.style.marginBottom = '4px';
        headerLabel.style.marginRight = '4px';
        
        let timeLabel = 'Kirim Instan';
        if (msg.scheduledTime) {
          const localTime = new Date(msg.scheduledTime).toLocaleString('id-ID');
          timeLabel = `Terjadwal: ${localTime}`;
        }
        headerLabel.innerHTML = `<strong>Pesan #${idx + 1}</strong> (${timeLabel})`;
        bubbleWrapper.appendChild(headerLabel);

        // Chat bubble panel
        const bubble = document.createElement('div');
        bubble.style.background = 'rgba(18, 140, 126, 0.25)';
        bubble.style.border = '1px solid rgba(18, 140, 126, 0.4)';
        bubble.style.borderRadius = '12px 0 12px 12px';
        bubble.style.padding = '12px';
        bubble.style.maxWidth = '85%';
        bubble.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)';
        bubble.style.display = 'flex';
        bubble.style.flexDirection = 'column';
        bubble.style.gap = '8px';

        // Image preview if uploaded
        if (msg.imageBase64) {
          const img = document.createElement('img');
          img.src = msg.imageBase64;
          img.style.maxWidth = '100%';
          img.style.maxHeight = '140px';
          img.style.borderRadius = '6px';
          img.style.objectFit = 'cover';
          img.style.border = '1px solid rgba(255,255,255,0.1)';
          bubble.appendChild(img);
        }

        // Message text
        const textDiv = document.createElement('div');
        textDiv.style.fontSize = '13px';
        textDiv.style.color = '#fff';
        textDiv.style.whiteSpace = 'pre-wrap';
        textDiv.textContent = msg.messageText;
        bubble.appendChild(textDiv);

        // Dynamic buttons simulated below the message text inside bubble
        if (msg.buttons && Array.isArray(msg.buttons) && msg.buttons.length > 0) {
          const btnList = document.createElement('div');
          btnList.style.display = 'flex';
          btnList.style.flexDirection = 'column';
          btnList.style.gap = '6px';
          btnList.style.marginTop = '6px';
          btnList.style.borderTop = '1px solid rgba(255,255,255,0.1)';
          btnList.style.paddingTop = '8px';

          msg.buttons.forEach(btn => {
            const btnItem = document.createElement('div');
            btnItem.style.background = 'rgba(255, 255, 255, 0.08)';
            btnItem.style.border = '1px solid rgba(255, 255, 255, 0.15)';
            btnItem.style.borderRadius = '20px';
            btnItem.style.padding = '6px 12px';
            btnItem.style.fontSize = '12px';
            btnItem.style.textAlign = 'center';
            btnItem.style.color = 'var(--accent-primary)';
            
            let icon = '🔘';
            let detail = ` (Ketik: ${btn.value})`;
            if (btn.type === 'cta_url') {
              icon = '🔗';
              detail = ` : ${btn.value}`;
            }
            btnItem.textContent = `${icon} ${btn.text}${detail}`;
            btnList.appendChild(btnItem);
          });

          bubble.appendChild(btnList);
        }

        bubbleWrapper.appendChild(bubble);
        previewChatContainer.appendChild(bubbleWrapper);
      });

      // Open modal
      previewModal.classList.add('active');
    }

    // Trigger the preview modal
    showFollowupPreviewModal(name, phone, messages, async () => {
      try {
        const btnSubmit = document.getElementById('btn-submit-individual');
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="fas fa-spinner spin"></i> Memproses Follow-Up...`;

        const res = await fetch('/api/send-individual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, name, messages, senderProfileId })
        });

        const data = await res.json();
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fas fa-paper-plane"></i> Kirim & Jadwalkan Follow-Up`;

        if (!res.ok) throw new Error(data.error);

        // Close preview modal on success
        closePreviewModal();
        
        alert('Seluruh pesan follow-up berantai berhasil diproses!');

        // Reset Form
        txtIndivPhone.value = '';
        txtIndivName.value = '';
        
        // Clear container and reset to exactly 1 card
        container.innerHTML = '';
        indivCardCount = 0;
        container.appendChild(createIndivMessageCard());

        // Redirect ke tab yang sesuai
        if (messages.length > 1 || !hasImmediate) {
          // Jika ada yang dijadwalkan, arahkan ke antrean
          document.querySelector('.nav-item[data-tab="campaign-list"]').click();
        } else {
          // Jika hanya 1 pesan instan, arahkan ke dashboard
          document.querySelector('.nav-item[data-tab="dashboard"]').click();
        }

      } catch (error) {
        alert('Gagal mengirim/menjadwalkan follow-up: ' + error.message);
      }
    });
  });
}

// ==========================================================================
// AUTOSTART SETTINGS LOGIC
// ==========================================================================
const autostartToggle = document.getElementById('setting-autostart-toggle');

async function initAutostartSetting() {
  if (!autostartToggle) return;

  try {
    const res = await fetch('/api/settings/autostart');
    const data = await res.json();
    if (res.ok) {
      autostartToggle.checked = data.enabled;
    }
  } catch (err) {
    console.error('Error fetching autostart settings:', err);
  }

  autostartToggle.addEventListener('change', async () => {
    const enabled = autostartToggle.checked;
    try {
      const res = await fetch('/api/settings/autostart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (enabled) {
        alert('Autostart berhasil diaktifkan! Aplikasi akan berjalan otomatis setiap kali komputer dinyalakan.');
      } else {
        alert('Autostart berhasil dinonaktifkan.');
      }
    } catch (err) {
      alert('Gagal mengubah pengaturan autostart: ' + err.message);
      autostartToggle.checked = !enabled; // revert toggle
    }
  });
}

// ==========================================================================
// GEN-Z FOCUS MODE SETTING LOGIC
// ==========================================================================
const focusModeToggle = document.getElementById('setting-focusmode-toggle');

function initFocusModeSetting() {
  if (!focusModeToggle) return;

  // Load from local storage, default to true (active)
  const focusModeEnabled = localStorage.getItem('focusModeEnabled') !== 'false';
  focusModeToggle.checked = focusModeEnabled;

  if (focusModeEnabled) {
    document.body.classList.add('focus-mode-active');
  } else {
    document.body.classList.remove('focus-mode-active');
  }

  focusModeToggle.addEventListener('change', () => {
    const enabled = focusModeToggle.checked;
    localStorage.setItem('focusModeEnabled', enabled);
    
    if (enabled) {
      document.body.classList.add('focus-mode-active');
    } else {
      document.body.classList.remove('focus-mode-active');
    }
  });
}

// ==========================================================================
// SOFTWARE VERSION CHECKER & AUTO-PATCH UI HANDLER
// ==========================================================================
// SOFTWARE VERSION CHECKER & AUTO-UPDATE MANAGER
// ==========================================================================
async function initVersionChecker() {
  const versionBadge = document.getElementById('app-version-badge');
  const versionText = document.getElementById('app-version-text');
  
  const settingsAppName = document.getElementById('settings-app-name-ver');
  const settingsVerBadge = document.getElementById('settings-version-badge');
  const settingsVerChangelog = document.getElementById('settings-ver-changelog');
  const updateCheckStatusText = document.getElementById('update-check-status-text');
  const btnManualCheck = document.getElementById('btn-manual-check-update');

  async function checkVersion(isManualClick = false) {
    if (isManualClick && btnManualCheck) {
      btnManualCheck.disabled = true;
      btnManualCheck.innerHTML = `<i class="fas fa-spinner spin"></i> Memeriksa Server...`;
      if (updateCheckStatusText) updateCheckStatusText.textContent = 'Menghubungkan ke server rilis GitHub...';
    }

    try {
      const res = await fetch(`/api/system/version?t=${Date.now()}`);
      const data = await res.json();
      
      if (versionText) versionText.textContent = `v${data.currentVersion}`;
      if (settingsAppName) settingsAppName.textContent = `REPLIX AI v${data.currentVersion}`;
      if (settingsVerChangelog && data.changelog) settingsVerChangelog.textContent = data.changelog;

      if (data.updateAvailable) {
        if (versionBadge) {
          versionBadge.style.background = 'rgba(16, 185, 129, 0.15)';
          versionBadge.style.border = '1px solid rgba(16, 185, 129, 0.35)';
          versionBadge.style.color = '#10b981';
          versionBadge.style.cursor = 'pointer';
          versionBadge.innerHTML = `<i class="fas fa-arrow-alt-circle-up" style="color:#10b981;"></i> Update v${data.latestVersion} Tersedia!`;
        }

        if (settingsVerBadge) {
          settingsVerBadge.textContent = `Update Tersedia (v${data.latestVersion})`;
          settingsVerBadge.className = 'badge running';
          settingsVerBadge.style.background = 'rgba(245, 158, 11, 0.15)';
          settingsVerBadge.style.color = '#f59e0b';
          settingsVerBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        }

        if (updateCheckStatusText) {
          updateCheckStatusText.innerHTML = `<span style="color:#f59e0b; font-weight:600;"><i class="fas fa-exclamation-circle"></i> Versi baru v${data.latestVersion} tersedia!</span>`;
        }

        const onVersionClick = () => {
          const msg = `🚀 Pembaruan Aplikasi Tersedia!\n\nVersi Terpasang: v${data.currentVersion}\nVersi Terbaru: v${data.latestVersion}\n\nCatatan Perubahan:\n${data.changelog}\n\nApakah Anda ingin membuka halaman rilis/unduhan update sekarang?`;
          if (confirm(msg)) {
            if (data.downloadUrl) {
              window.open(data.downloadUrl, '_blank');
            }
          }
        };

        if (versionBadge) versionBadge.onclick = onVersionClick;

        if (isManualClick) {
          onVersionClick();
        }
      } else {
        if (settingsVerBadge) {
          settingsVerBadge.textContent = `Terkini (v${data.currentVersion})`;
          settingsVerBadge.className = 'badge completed';
          settingsVerBadge.style.background = 'rgba(16, 185, 129, 0.15)';
          settingsVerBadge.style.color = '#10b981';
          settingsVerBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        }

        if (updateCheckStatusText) {
          updateCheckStatusText.innerHTML = `<span style="color:#10b981;"><i class="fas fa-check-circle"></i> Aplikasi Anda sudah menggunakan versi terbaru (v${data.currentVersion}).</span>`;
        }

        if (isManualClick) {
          alert(`✅ REPLIX AI Berada di Versi Terbaru!\n\nVersi Terpasang: v${data.currentVersion}\nStatus: Tidak ada pembaruan baru di server.`);
        }
      }
    } catch (err) {
      console.error('Failed to check application version:', err);
      if (updateCheckStatusText) {
        updateCheckStatusText.textContent = 'Gagal terhubung ke server pembaruan.';
      }
    } finally {
      if (btnManualCheck) {
        btnManualCheck.disabled = false;
        btnManualCheck.innerHTML = `<i class="fas fa-sync-alt"></i> Cek Pembaruan Aplikasi Sekarang`;
      }
    }
  }

  if (btnManualCheck) {
    btnManualCheck.addEventListener('click', () => checkVersion(true));
  }

  // Initial check on boot
  checkVersion(false);
}

// ==========================================================================
// BOT AUTO-REPLY LOGIC & MODAL HANDLERS
// ==========================================================================
const formAddAutoreply = document.getElementById('form-add-autoreply');
const botRulesTableBody = document.getElementById('bot-rules-table-body');

const autoreplyModal = document.getElementById('autoreply-modal');
const btnOpenAutoreplyModal = document.getElementById('btn-open-autoreply-modal');
const closeAutoreplyModalBtn = document.getElementById('close-autoreply-modal');
const btnCancelAutoreply = document.getElementById('btn-cancel-autoreply');

if (btnOpenAutoreplyModal && autoreplyModal) {
  btnOpenAutoreplyModal.addEventListener('click', () => {
    autoreplyModal.classList.add('active');
  });
}

function closeAutoreplyModal() {
  if (autoreplyModal) {
    autoreplyModal.classList.remove('active');
  }
}

if (closeAutoreplyModalBtn) closeAutoreplyModalBtn.addEventListener('click', closeAutoreplyModal);
if (btnCancelAutoreply) btnCancelAutoreply.addEventListener('click', closeAutoreplyModal);

let loadedGroupsCache = [];

// Handle target type selection toggle
const selectBotTargetType = document.getElementById('bot-target-type');
const botGroupsSelectorArea = document.getElementById('bot-groups-selector-area');
const btnRefreshBotGroups = document.getElementById('btn-refresh-bot-groups');
const botGroupsSearchInput = document.getElementById('bot-groups-search');
const botGroupsCheckboxList = document.getElementById('bot-groups-checkbox-list');

if (selectBotTargetType && botGroupsSelectorArea) {
  selectBotTargetType.addEventListener('change', () => {
    if (selectBotTargetType.value === 'groups') {
      botGroupsSelectorArea.style.display = 'block';
      if (loadedGroupsCache.length === 0) {
        refreshBotGroups();
      }
    } else {
      botGroupsSelectorArea.style.display = 'none';
    }
  });
}

if (btnRefreshBotGroups) {
  btnRefreshBotGroups.addEventListener('click', refreshBotGroups);
}

if (botGroupsSearchInput) {
  botGroupsSearchInput.addEventListener('input', () => {
    const q = botGroupsSearchInput.value.toLowerCase();
    const items = botGroupsCheckboxList.querySelectorAll('.group-check-item');
    items.forEach(item => {
      const name = item.textContent.toLowerCase();
      if (name.includes(q)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  });
}

async function refreshBotGroups() {
  if (!botGroupsCheckboxList) return;
  try {
    btnRefreshBotGroups.disabled = true;
    btnRefreshBotGroups.innerHTML = `<i class="fas fa-spinner spin"></i> Membaca...`;
    
    botGroupsCheckboxList.innerHTML = `<span style="font-size:12px; color:var(--color-text-muted);"><i class="fas fa-spinner spin"></i> Menghubungi WhatsApp...</span>`;

    const res = await fetch('/api/whatsapp/groups');
    const groups = await res.json();
    
    btnRefreshBotGroups.disabled = false;
    btnRefreshBotGroups.innerHTML = `<i class="fas fa-sync-alt"></i> Muat Ulang Grup`;

    if (!res.ok) throw new Error(groups.error);

    loadedGroupsCache = groups;
    botGroupsCheckboxList.innerHTML = '';
    
    if (groups.length === 0) {
      botGroupsCheckboxList.innerHTML = `<span style="font-size:12px; color:var(--color-text-muted);">Tidak ada grup WhatsApp yang terdeteksi.</span>`;
      return;
    }

    groups.forEach(g => {
      const label = document.createElement('label');
      label.className = 'checkbox-container group-check-item';
      label.style.fontOrder = 'normal';
      label.style.fontSize = '12.5px';
      label.style.marginTop = '0px';
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '8px';
      label.innerHTML = `
        <input type="checkbox" class="bot-group-checkbox" value="${g.id}">
        <span>${g.name}</span>
      `;
      botGroupsCheckboxList.appendChild(label);
    });

  } catch (err) {
    btnRefreshBotGroups.disabled = false;
    btnRefreshBotGroups.innerHTML = `<i class="fas fa-sync-alt"></i> Muat Ulang Grup`;
    botGroupsCheckboxList.innerHTML = `<span style="font-size:12px; color:var(--accent-danger);"><i class="fas fa-exclamation-triangle"></i> Gagal memuat grup: ${err.message}</span>`;
  }
}

async function loadBotRules() {
  if (!botRulesTableBody) return;
  
  // Populate profiles selector
  const selectProfile = document.getElementById('bot-profile-select');
  let profilesList = [];
  try {
    const profRes = await fetch('/api/profiles');
    profilesList = await profRes.json();
    if (selectProfile) {
      const currentValue = selectProfile.value;
      selectProfile.innerHTML = '<option value="all">Semua Profil WhatsApp</option>';
      profilesList.forEach(p => {
        selectProfile.innerHTML += `<option value="${p.profileId}">${p.name} (${p.phone || 'Belum terhubung'})</option>`;
      });
      // Restore selected value if still exists
      if (currentValue) selectProfile.value = currentValue;
    }
  } catch (err) {
    console.error('Error loading profiles list for chatbot selector:', err);
  }

  try {
    const res = await fetch('/api/autoreplies');
    const rules = await res.json();
    if (res.ok) {
      botRulesTableBody.innerHTML = '';
      if (rules.length === 0) {
        botRulesTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">Belum ada aturan balasan otomatis yang aktif.</td></tr>`;
        return;
      }

      rules.forEach(rule => {
        const tr = document.createElement('tr');
        
        let typeBadge = `<span class="badge running" style="background-color:rgba(139, 92, 246, 0.15); color:#c084fc; border-color:rgba(139, 92, 246, 0.25);">Kata Kunci</span>`;
        if (rule.isRegex) {
          typeBadge = `<span class="badge running" style="background-color:rgba(236, 72, 153, 0.15); color:#f472b6; border-color:rgba(236, 72, 153, 0.25);">Regex</span>`;
        }

        // Target Chat Badge
        let targetText = `<span style="color:var(--color-text-muted); font-size:14px;"><i class="fas fa-globe"></i> Semua Chat</span>`;
        if (rule.targetType === 'personal') {
          targetText = `<span style="color:var(--accent-info); font-size:14px;"><i class="fas fa-user"></i> Personal Only</span>`;
        } else if (rule.targetType === 'groups') {
          const groupNames = [];
          if (rule.targetGroupIds && rule.targetGroupIds.length > 0) {
            rule.targetGroupIds.forEach(gid => {
              const matched = loadedGroupsCache.find(g => g.id === gid);
              groupNames.push(matched ? matched.name : gid.substring(0, 10) + '...');
            });
          }
          const displayLabel = groupNames.length > 0 ? groupNames.join(', ') : 'Grup';
          targetText = `<span style="color:var(--accent-primary-hover); font-size:14px;" title="${groupNames.join('\n')}"><i class="fas fa-users"></i> ${groupNames.length} Grup (${displayLabel})</span>`;
        }

        // Profile Mapping Name
        let profileName = 'Semua Profil';
        if (rule.profileId && rule.profileId !== 'all') {
          const matchedProf = profilesList.find(p => p.profileId === rule.profileId);
          profileName = matchedProf ? matchedProf.name : rule.profileId;
        }

        const activeBadge = rule.isActive 
          ? `<button class="btn btn-secondary btn-small btn-toggle-rule" data-id="${rule._id}" style="background-color:rgba(0, 230, 118, 0.15); color:var(--accent-secondary); border-color:rgba(0, 230, 118, 0.3);">Aktif</button>`
          : `<button class="btn btn-secondary btn-small btn-toggle-rule" data-id="${rule._id}" style="background-color:rgba(255, 23, 68, 0.15); color:var(--accent-danger); border-color:rgba(255, 23, 68, 0.3);">Nonaktif</button>`;

        tr.innerHTML = `
          <td><strong>${profileName}</strong></td>
          <td><code>${rule.keyword}</code></td>
          <td>${typeBadge}</td>
          <td>${targetText}</td>
          <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${rule.replyText}">${rule.replyText}</td>
          <td><code>${rule.delayMin} - ${rule.delayMax}s</code></td>
          <td>${activeBadge}</td>
          <td>
            <button class="btn btn-danger btn-small btn-delete-rule" data-id="${rule._id}">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        `;
        botRulesTableBody.appendChild(tr);
      });

      // Bind toggle active status listeners
      botRulesTableBody.querySelectorAll('.btn-toggle-rule').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          try {
            const toggleRes = await fetch(`/api/autoreplies/${id}/toggle`, { method: 'PATCH' });
            if (toggleRes.ok) {
              loadBotRules();
            } else {
              const err = await toggleRes.json();
              alert('Gagal mengubah status aturan: ' + err.error);
            }
          } catch (err) {
            alert('Gagal mengubah status aturan: ' + err.message);
          }
        });
      });

      // Bind delete rule listeners
      botRulesTableBody.querySelectorAll('.btn-delete-rule').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Apakah Anda yakin ingin menghapus aturan auto-reply ini?')) {
            const id = btn.getAttribute('data-id');
            try {
              const delRes = await fetch(`/api/autoreplies/${id}`, { method: 'DELETE' });
              if (delRes.ok) {
                loadBotRules();
              } else {
                const err = await delRes.json();
                alert('Gagal menghapus aturan: ' + err.error);
              }
            } catch (err) {
              alert('Gagal menghapus aturan: ' + err.message);
            }
          }
        });
      });
    }
  } catch (error) {
    console.error('Error loading bot rules:', error);
  }
}

if (formAddAutoreply) {
  formAddAutoreply.addEventListener('submit', async (e) => {
    e.preventDefault();
    const profileId = document.getElementById('bot-profile-select') ? document.getElementById('bot-profile-select').value : 'all';
    const keyword = document.getElementById('bot-keyword').value.trim();
    const isRegex = document.getElementById('bot-is-regex').checked;
    const replyText = document.getElementById('bot-reply-text').value.trim();
    const delayMin = parseInt(document.getElementById('bot-delay-min').value) || 2;
    const delayMax = parseInt(document.getElementById('bot-delay-max').value) || 5;

    const targetType = selectBotTargetType ? selectBotTargetType.value : 'all';
    const targetGroupIds = [];
    
    if (targetType === 'groups') {
      const checkedBoxes = botGroupsCheckboxList.querySelectorAll('.bot-group-checkbox:checked');
      checkedBoxes.forEach(box => {
        targetGroupIds.push(box.value);
      });
      if (targetGroupIds.length === 0) {
        alert('Silakan pilih minimal 1 grup WhatsApp target!');
        return;
      }
    }

    if (delayMin > delayMax) {
      alert('Jeda Min tidak boleh lebih besar dari Jeda Max!');
      return;
    }

    try {
      const res = await fetch('/api/autoreplies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, keyword, isRegex, replyText, delayMin, delayMax, targetType, targetGroupIds })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Aturan Bot Auto-Reply berhasil disimpan!');
        formAddAutoreply.reset();
        
        // Hide groups area
        if (botGroupsSelectorArea) botGroupsSelectorArea.style.display = 'none';
        if (botGroupsCheckboxList) botGroupsCheckboxList.innerHTML = `<span class="empty-state" style="font-size:12px; color:var(--color-text-muted);">Klik 'Muat Ulang Grup' untuk membaca daftar grup WhatsApp.</span>`;
        
        closeAutoreplyModal();
        loadBotRules();
      } else {
        alert('Gagal menyimpan aturan: ' + data.error);
      }
    } catch (err) {
      alert('Gagal menyimpan aturan: ' + err.message);
    }
  });
}

const feedbackTableBody = document.getElementById('feedback-table-body');

async function loadFeedbacks() {
  if (!feedbackTableBody) return;
  try {
    const res = await fetch('/api/feedbacks');
    const feedbacks = await res.json();
    if (res.ok) {
      feedbackTableBody.innerHTML = '';
      if (feedbacks.length === 0) {
        feedbackTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">Belum ada respon masuk dari pelanggan.</td></tr>`;
        return;
      }

      feedbacks.forEach(f => {
        const tr = document.createElement('tr');
        const replyTime = f.repliedAt ? new Date(f.repliedAt).toLocaleString('id-ID') : '-';
        const cleanReply = f.replyText ? f.replyText.replace(/"/g, '&quot;') : '';
        const cleanMsgText = f.messageText ? f.messageText.replace(/"/g, '&quot;') : '';

        tr.innerHTML = `
          <td>${replyTime}</td>
          <td><strong>${f.name}</strong></td>
          <td><code>${f.phone}</code></td>
          <td>${f.campaignName}</td>
          <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${cleanMsgText}">${f.messageText || '-'}</td>
          <td style="color:#c084fc; font-weight: 500;" title="${cleanReply}">💬 "${f.replyText || ''}"</td>
        `;
        feedbackTableBody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error loading feedbacks:', error);
  }
}

let currentReportType = 'mass';
let currentReportPeriod = 'all';
let currentReportStartDate = '';
let currentReportEndDate = '';
let currentReportCampaignId = 'all';

async function loadReportsSummary() {
  const type = currentReportType;
  const period = currentReportPeriod;
  const startDate = currentReportStartDate;
  const endDate = currentReportEndDate;
  const campaignId = currentReportCampaignId;

  const repTotalCampaigns = document.getElementById('rep-total-campaigns');
  const repTotalSent = document.getElementById('rep-total-sent');
  const repReadRate = document.getElementById('rep-read-rate');
  const repReadCount = document.getElementById('rep-read-count');
  const repReplyRate = document.getElementById('rep-reply-rate');
  const repReplyCount = document.getElementById('rep-reply-count');
  const repCampaignsTableBody = document.getElementById('rep-campaigns-table-body');
  const repTemplatesTableBody = document.getElementById('rep-templates-table-body');
  const filterReportCampaign = document.getElementById('filter-report-campaign');

  if (!repCampaignsTableBody) return;

  try {
    repCampaignsTableBody.innerHTML = `<tr><td colspan="8" class="empty-state"><i class="fas fa-spinner spin"></i> Menganalisis data...</td></tr>`;
    repTemplatesTableBody.innerHTML = `<tr><td colspan="5" class="empty-state"><i class="fas fa-spinner spin"></i> Menyusun leaderboard...</td></tr>`;

    let url = `/api/reports/summary?type=${type}&period=${period}&campaignId=${campaignId}`;
    if (period === 'custom') {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (res.ok) {
      const { globalStats, campaigns, bestTemplates, availableCampaigns } = data;

      // Populate campaign dropdown
      if (filterReportCampaign) {
        const prevSelected = currentReportCampaignId;
        filterReportCampaign.innerHTML = '<option value="all">Semua Campaign</option>';
        if (availableCampaigns && availableCampaigns.length > 0) {
          availableCampaigns.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            filterReportCampaign.appendChild(opt);
          });
        }
        // Verify if previous selection is still valid in the new options list
        const optionExists = Array.from(filterReportCampaign.options).some(opt => opt.value === prevSelected);
        if (optionExists) {
          filterReportCampaign.value = prevSelected;
          currentReportCampaignId = prevSelected;
        } else {
          filterReportCampaign.value = 'all';
          currentReportCampaignId = 'all';
        }
      }

      // 1. Render Global Cards
      if (repTotalCampaigns) repTotalCampaigns.textContent = globalStats.totalCampaigns;
      if (repTotalSent) repTotalSent.textContent = globalStats.totalSent;
      if (repReadRate) repReadRate.textContent = (globalStats.readRate * 100).toFixed(1) + '%';
      if (repReadCount) repReadCount.textContent = `${globalStats.totalSent} pesan mendarat`;
      if (repReplyRate) repReplyRate.textContent = (globalStats.replyRate * 100).toFixed(1) + '%';
      if (repReplyCount) repReplyCount.textContent = `${globalStats.totalReplied} pelanggan membalas`;

      // 2. Render Campaigns Table
      repCampaignsTableBody.innerHTML = '';
      if (campaigns.length === 0) {
        repCampaignsTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">Belum ada data campaign untuk direkap.</td></tr>`;
      } else {
        campaigns.forEach(c => {
          const tr = document.createElement('tr');
          const scheduleDate = new Date(c.scheduledTime).toLocaleString('id-ID');
          const readPct = (c.readRate * 100).toFixed(1) + '%';
          const replyPct = (c.replyRate * 100).toFixed(1) + '%';
          const cleanBestText = c.bestVariation ? c.bestVariation.replace(/"/g, '&quot;') : '';

          // Score / Effectiveness Label
          let scoreHtml = `<span class="badge failed" style="background-color:rgba(255,23,68,0.12); color:var(--accent-danger); border:1px solid rgba(255,23,68,0.2);">Perlu Evaluasi</span>`;
          if (c.replyRate >= 0.15) {
            scoreHtml = `<span class="badge completed" style="background-color:rgba(0, 230, 118, 0.15); color:var(--accent-secondary); border:1px solid rgba(0,230,118,0.3);">Sangat Efektif</span>`;
          } else if (c.replyRate >= 0.05) {
            scoreHtml = `<span class="badge running" style="background-color:rgba(0, 176, 255, 0.12); color:var(--accent-info); border:1px solid rgba(0,176,255,0.2);">Cukup Efektif</span>`;
          }

          tr.innerHTML = `
            <td>
              <a href="#" class="btn-report-detail" data-id="${c.id}" style="color:var(--accent-primary); font-weight:600; text-decoration:none;">
                <i class="fas fa-search-plus"></i> ${c.name}
              </a>
            </td>
            <td>${scheduleDate}</td>
            <td><code>${c.total}</code></td>
            <td><code>${c.sent}</code></td>
            <td><code>${readPct}</code> (${c.sent})</td>
            <td><code>${replyPct}</code> (${c.replied})</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${cleanBestText}">${c.bestVariation}</td>
            <td>${scoreHtml}</td>
          `;
          repCampaignsTableBody.appendChild(tr);
        });

        // Add detail click triggers
        repCampaignsTableBody.querySelectorAll('.btn-report-detail').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const id = btn.getAttribute('data-id');
            openCampaignModal(id);
          });
        });
      }

      // 3. Render Copywriting Leaderboard Table
      repTemplatesTableBody.innerHTML = '';
      if (bestTemplates.length === 0) {
        repTemplatesTableBody.innerHTML = `<tr><td colspan="5" class="empty-state">Belum ada copywriting yang terkirim.</td></tr>`;
      } else {
        bestTemplates.forEach((t, idx) => {
          const tr = document.createElement('tr');
          const cleanText = t.text ? t.text.replace(/"/g, '&quot;') : '';
          const readPct = t.sent > 0 ? (t.read / t.sent * 100).toFixed(1) + '%' : '0%';
          const replyPct = (t.replyRate * 100).toFixed(1) + '%';

          // Leaderboard rank icon
          let rankIcon = `<code>#${idx + 1}</code>`;
          if (idx === 0) rankIcon = `<span style="font-size:16px;">🥇</span>`;
          if (idx === 1) rankIcon = `<span style="font-size:16px;">🥈</span>`;
          if (idx === 2) rankIcon = `<span style="font-size:16px;">🥉</span>`;

          let statusHtml = `<span class="badge failed" style="background-color:rgba(255,23,68,0.12); color:var(--accent-danger); border:1px solid rgba(255,23,68,0.2);">Kurang Responsif</span>`;
          if (t.replyRate >= 0.15) {
            statusHtml = `<span class="badge completed" style="background-color:rgba(0, 230, 118, 0.15); color:var(--accent-secondary); border:1px solid rgba(0,230,118,0.3);">Konversi Tinggi</span>`;
          } else if (t.replyRate >= 0.05) {
            statusHtml = `<span class="badge running" style="background-color:rgba(0, 176, 255, 0.12); color:var(--accent-info); border:1px solid rgba(0,176,255,0.2);">Konversi Sedang</span>`;
          }

          tr.innerHTML = `
            <td style="max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${cleanText}">
              ${rankIcon} ${t.text}
            </td>
            <td><code>${t.sent}</code></td>
            <td><code>${readPct}</code> (${t.read})</td>
            <td><code>${replyPct}</code> (${t.replied})</td>
            <td>${statusHtml}</td>
          `;
          repTemplatesTableBody.appendChild(tr);
        });
      }
    }
  } catch (error) {
    console.error('Error loading reports summary:', error);
    repCampaignsTableBody.innerHTML = `<tr><td colspan="8" class="empty-state" style="color:var(--accent-danger)">Gagal memuat rekap laporan.</td></tr>`;
  }
}

// Bind report filter controls
const btnReportTypeMass = document.getElementById('btn-report-type-mass');
const btnReportTypeIndividual = document.getElementById('btn-report-type-individual');
const filterReportPeriod = document.getElementById('filter-report-period');
const filterReportCustomDates = document.getElementById('filter-report-custom-dates');
const filterReportCampaign = document.getElementById('filter-report-campaign');
const btnReportApplyFilters = document.getElementById('btn-report-apply-filters');

if (btnReportTypeMass && btnReportTypeIndividual) {
  btnReportTypeMass.addEventListener('click', () => {
    btnReportTypeMass.className = 'btn btn-primary';
    btnReportTypeMass.style.background = 'var(--accent-primary)';
    btnReportTypeMass.style.borderColor = 'var(--accent-primary)';
    
    btnReportTypeIndividual.className = 'btn btn-secondary';
    btnReportTypeIndividual.style.background = '';
    btnReportTypeIndividual.style.borderColor = '';
    
    currentReportType = 'mass';
    currentReportCampaignId = 'all'; // reset campaign select on type switch
    loadReportsSummary();
  });

  btnReportTypeIndividual.addEventListener('click', () => {
    btnReportTypeIndividual.className = 'btn btn-primary';
    btnReportTypeIndividual.style.background = 'var(--accent-primary)';
    btnReportTypeIndividual.style.borderColor = 'var(--accent-primary)';
    
    btnReportTypeMass.className = 'btn btn-secondary';
    btnReportTypeMass.style.background = '';
    btnReportTypeMass.style.borderColor = '';
    
    currentReportType = 'individual';
    currentReportCampaignId = 'all'; // reset campaign select on type switch
    loadReportsSummary();
  });
}

if (filterReportPeriod) {
  filterReportPeriod.addEventListener('change', () => {
    if (filterReportPeriod.value === 'custom') {
      if (filterReportCustomDates) filterReportCustomDates.style.display = 'flex';
    } else {
      if (filterReportCustomDates) filterReportCustomDates.style.display = 'none';
      
      // Auto-apply filters when switching standard periods to be fast
      currentReportPeriod = filterReportPeriod.value;
      loadReportsSummary();
    }
  });
}

if (btnReportApplyFilters) {
  btnReportApplyFilters.addEventListener('click', () => {
    if (filterReportPeriod) currentReportPeriod = filterReportPeriod.value;
    
    const startDateInput = document.getElementById('filter-report-start-date');
    const endDateInput = document.getElementById('filter-report-end-date');
    if (startDateInput) currentReportStartDate = startDateInput.value;
    if (endDateInput) currentReportEndDate = endDateInput.value;
    
    if (filterReportCampaign) currentReportCampaignId = filterReportCampaign.value;
    
    loadReportsSummary();
  });
}

// Call on startup
initAutostartSetting();
initFocusModeSetting();
initVersionChecker();
loadStats();
loadLogs();
loadFeedbacks();
loadProfiles();

// ==========================================================================
// WHATSAPP PROFILE MANAGEMENT & AI BLASTER INTERACTION SYSTEM
// ==========================================================================
let loadedProfiles = [];
let currentScanningProfileId = null;

async function loadProfiles() {
  try {
    const res = await fetch('/api/profiles');
    const profiles = await res.json();
    if (!res.ok) throw new Error(profiles.error);
    loadedProfiles = profiles;
    
    renderProfilesList();
    populateProfilesSelection();
    updateConnectionPill();
    loadRamHealthInfo();
  } catch (error) {
    console.error('Error loading profiles:', error);
  }
}

function renderProfilesList() {
  const container = document.getElementById('profiles-list-container');
  if (!container) return;
  
  container.innerHTML = '';
  if (loadedProfiles.length === 0) {
    container.innerHTML = `<div class="empty-state" style="font-size: 13px;">Belum ada profil WhatsApp terdaftar.</div>`;
    return;
  }
  
  loadedProfiles.forEach(prof => {
    const card = document.createElement('div');
    card.className = 'panel glass profile-card';
    card.style = 'padding: 14px 18px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); margin-bottom: 8px;';
    card.id = `profile-card-${prof.profileId}`;

    let statusText = 'Terputus';
    let statusClass = 'disconnected';
    let actionBtn = `<button type="button" class="btn btn-secondary btn-small" onclick="connectProfile('${prof.profileId}')"><i class="fas fa-link"></i> Hubungkan</button>`;
    
    if (prof.status === 'connecting') {
      statusText = 'Menghubungkan';
      statusClass = 'connecting';
      actionBtn = `<button type="button" class="btn btn-secondary btn-small" disabled><i class="fas fa-spinner fa-spin"></i> Menghubungkan...</button>`;
    } else if (prof.status === 'scanning') {
      statusText = 'Scan QR Code';
      statusClass = 'scanning';
      actionBtn = `<button type="button" class="btn btn-secondary btn-small" onclick="connectProfile('${prof.profileId}')"><i class="fas fa-qrcode"></i> Tampilkan QR</button>`;
    } else if (prof.status === 'connected') {
      statusText = 'Terhubung';
      statusClass = 'connected';
      actionBtn = `<button type="button" class="btn btn-danger btn-small" onclick="disconnectProfile('${prof.profileId}')"><i class="fas fa-unlink"></i> Putuskan</button>`;
    }

    const phoneText = prof.phone ? `<span style="font-size: 11px; color: var(--color-text-muted); display: block; margin-top:2px;">WhatsApp ID: +${prof.phone}</span>` : '';

    card.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span style="font-weight: 600; font-size: 13.5px; color: #fff;">${prof.name}</span>
        <div style="display: flex; align-items: center; gap: 6px; font-size: 11.5px;">
          <span class="status-indicator ${statusClass}"></span>
          <span style="color: var(--color-text-muted); font-weight: 500;">${statusText}</span>
        </div>
        ${phoneText}
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        ${actionBtn}
        <button type="button" class="btn btn-danger btn-small" style="padding: 6px 10px; background: rgba(220,53,69,0.15); border-color: rgba(220,53,69,0.2);" onclick="deleteProfile('${prof.profileId}')">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function updateConnectionPill() {
  const total = loadedProfiles.length;
  const connected = loadedProfiles.filter(p => p.status === 'connected').length;
  const disconnected = total - connected;

  if (total === 0) {
    pillIndicator.className = 'status-indicator disconnected';
    pillText.innerHTML = '<span style="color:var(--color-text-muted);">WA: 0 Aktif</span>';
    return;
  }

  if (disconnected > 0) {
    // If some or all profiles are disconnected, show warnings and active count
    pillIndicator.className = 'status-indicator scanning'; // shows warning orange dot
    pillText.innerHTML = `WA: <strong style="color:var(--accent-secondary);">${connected}</strong> Online / <strong style="color:var(--accent-danger); font-weight:700;">${disconnected} Offline</strong>`;
  } else {
    // All profiles connected
    pillIndicator.className = 'status-indicator connected'; // green dot
    pillText.innerHTML = `WA: <strong style="color:var(--accent-secondary);">${connected}</strong> / ${total} Online`;
  }
}

function populateProfilesSelection() {
  // 1. Checkboxes for Campaign Form
  const checkboxContainer = document.getElementById('camp-profiles-selection-container');
  if (checkboxContainer) {
    checkboxContainer.innerHTML = '';
    const connectedProfiles = loadedProfiles.filter(p => p.status === 'connected');
    
    if (connectedProfiles.length === 0) {
      checkboxContainer.innerHTML = `<span style="font-size: 12.5px; color: var(--color-text-muted); display:flex; align-items:center; gap:6px;"><i class="fas fa-exclamation-triangle" style="color:var(--accent-secondary);"></i> Belum ada profil WhatsApp terhubung. Aktifkan koneksi di tab <strong>Profil WhatsApp</strong>.</span>`;
    } else {
      connectedProfiles.forEach(prof => {
        const label = document.createElement('label');
        label.className = 'checkbox-container';
        label.style = 'font-size: 12.5px; font-weight: 500; display: flex; align-items: center; gap: 8px; cursor: pointer; color: #fff; margin-bottom: 6px;';
        label.innerHTML = `
          <input type="checkbox" name="camp-sender-profiles" value="${prof.profileId}" checked style="cursor:pointer;">
          <span>${prof.name} (+${prof.phone || 'Unknown'})</span>
        `;
        checkboxContainer.appendChild(label);
      });
    }
  }

  // 2. Select options for Individual Form
  const selectElement = document.getElementById('indiv-profile-selector');
  if (selectElement) {
    selectElement.innerHTML = `<option value="">-- Pilih Profil WhatsApp --</option>`;
    const connectedProfiles = loadedProfiles.filter(p => p.status === 'connected');
    connectedProfiles.forEach(prof => {
      const opt = document.createElement('option');
      opt.value = prof.profileId;
      opt.textContent = `${prof.name} (+${prof.phone || 'Unknown'})`;
      selectElement.appendChild(opt);
    });
  }

  // 3. Select options for Scraper Profile Select
  const scraperSelectElement = document.getElementById('scraper-profile-select');
  if (scraperSelectElement) {
    scraperSelectElement.innerHTML = `<option value="">-- Pilih Akun WA --</option>`;
    const connectedProfiles = loadedProfiles.filter(p => p.status === 'connected');
    connectedProfiles.forEach(prof => {
      const opt = document.createElement('option');
      opt.value = prof.profileId;
      opt.textContent = `${prof.name} (+${prof.phone || 'Unknown'})`;
      scraperSelectElement.appendChild(opt);
    });
  }
}

async function loadRamHealthInfo() {
  const ramTitle = document.getElementById('ram-status-title');
  const ramDesc = document.getElementById('ram-status-desc');
  const ramBadge = document.getElementById('ram-status-badge');
  const ramIconBox = document.getElementById('ram-icon-box');

  if (!ramTitle || !ramDesc || !ramBadge) return;

  try {
    const res = await fetch('/api/system/ram-health');
    const data = await res.json();
    
    if (res.ok) {
      ramTitle.textContent = `RAM System: ${data.totalMemGB} GB (${data.memUsagePercent}% terpakai)`;
      const licMax = data.licenseMaxProfiles || 5;
      ramDesc.textContent = `Batas aman RAM: Max ${data.recommendedMaxProfiles} profil. (Lisensi Paket: Max ${licMax} WA Connected, Aktif: ${data.activeProfilesCount}/${licMax})`;

      if (data.healthStatus === 'optimal') {
        ramBadge.textContent = 'Optimal';
        ramBadge.style.background = 'rgba(16, 185, 129, 0.1)';
        ramBadge.style.color = '#10b981';
        ramBadge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
        if (ramIconBox) {
          ramIconBox.style.background = 'rgba(16, 185, 129, 0.15)';
          ramIconBox.style.color = '#10b981';
        }
      } else if (data.healthStatus === 'warning') {
        ramBadge.textContent = 'Peringatan Memori';
        ramBadge.style.background = 'rgba(245, 158, 11, 0.15)';
        ramBadge.style.color = '#f59e0b';
        ramBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        if (ramIconBox) {
          ramIconBox.style.background = 'rgba(245, 158, 11, 0.2)';
          ramIconBox.style.color = '#f59e0b';
        }
      } else {
        ramBadge.textContent = 'Kritis (Tinggi)';
        ramBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        ramBadge.style.color = '#ef4444';
        ramBadge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        if (ramIconBox) {
          ramIconBox.style.background = 'rgba(239, 68, 68, 0.2)';
          ramIconBox.style.color = '#ef4444';
        }
      }
    }
  } catch (err) {
    console.error('Failed to load RAM health status:', err);
  }
}

async function connectProfile(profileId, force = false) {
  currentScanningProfileId = profileId;
  const qrPanel = document.getElementById('profile-qr-panel');
  const qrBox = document.getElementById('profile-qr-box');
  const connectingBox = document.getElementById('profile-connecting-box');
  const qrInstruction = document.getElementById('qr-panel-instruction');
  const qrTitle = document.getElementById('qr-panel-title');

  const prof = loadedProfiles.find(p => p.profileId === profileId);
  qrTitle.textContent = `Hubungkan: ${prof ? prof.name : 'Profil'}`;

  qrBox.style.display = 'none';
  connectingBox.style.display = 'flex';
  qrInstruction.style.display = 'none';

  try {
    const url = `/api/profiles/${profileId}/connect${force ? '?force=true' : ''}`;
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (data.ramWarning) {
      connectingBox.style.display = 'none';
      qrInstruction.style.display = 'block';
      if (confirm(data.message)) {
        return connectProfile(profileId, true);
      } else {
        return;
      }
    }

    loadProfiles();
    loadRamHealthInfo();
  } catch (error) {
    alert('Gagal menghubungkan profil: ' + error.message);
    qrInstruction.style.display = 'block';
    connectingBox.style.display = 'none';
    loadProfiles();
  }
}

async function disconnectProfile(profileId) {
  if (confirm('Apakah Anda yakin ingin memutuskan koneksi profil ini? Sesi login WhatsApp akan dihapus.')) {
    try {
      const res = await fetch(`/api/profiles/${profileId}/disconnect`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      loadProfiles();
    } catch (error) {
      alert('Gagal memutuskan koneksi: ' + error.message);
    }
  }
}

async function deleteProfile(profileId) {
  if (confirm('Apakah Anda yakin ingin menghapus profil ini beserta semua data sesinya?')) {
    try {
      const res = await fetch(`/api/profiles/${profileId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      loadProfiles();
      
      if (currentScanningProfileId === profileId) {
        currentScanningProfileId = null;
        document.getElementById('profile-qr-box').style.display = 'none';
        document.getElementById('profile-connecting-box').style.display = 'none';
        document.getElementById('qr-panel-instruction').style.display = 'block';
        document.getElementById('qr-panel-title').textContent = 'Pindai QR Code WhatsApp';
      }
    } catch (error) {
      alert('Gagal menghapus profil: ' + error.message);
    }
  }
}

function updateProfileStatusUI(profileId, status, qrData, phone) {
  const idx = loadedProfiles.findIndex(p => p.profileId === profileId);
  if (idx !== -1) {
    loadedProfiles[idx].status = status;
    if (qrData) loadedProfiles[idx].qrData = qrData;
    if (phone) loadedProfiles[idx].phone = phone;
  } else {
    loadProfiles();
    return;
  }

  renderProfilesList();
  populateProfilesSelection();
  updateConnectionPill();

  if (currentScanningProfileId === profileId) {
    const qrBox = document.getElementById('profile-qr-box');
    const connectingBox = document.getElementById('profile-connecting-box');
    const qrImageElem = document.getElementById('profile-qr-image');
    const qrInstruction = document.getElementById('qr-panel-instruction');

    if (status === 'connecting') {
      qrBox.style.display = 'none';
      connectingBox.style.display = 'flex';
      qrInstruction.style.display = 'none';
    } else if (status === 'scanning') {
      connectingBox.style.display = 'none';
      qrBox.style.display = 'flex';
      qrInstruction.style.display = 'none';
      if (qrData) {
        qrImageElem.src = qrData;
      }
    } else if (status === 'connected') {
      qrBox.style.display = 'none';
      connectingBox.style.display = 'none';
      qrInstruction.style.display = 'block';
      qrInstruction.innerHTML = `<span style="color:var(--accent-primary); font-weight:600;"><i class="fas fa-check-circle"></i> Profil WhatsApp berhasil terhubung!</span>`;
      currentScanningProfileId = null;
    } else if (status === 'disconnected') {
      qrBox.style.display = 'none';
      connectingBox.style.display = 'none';
      qrInstruction.style.display = 'block';
      qrInstruction.textContent = 'Koneksi terputus. Klik "Hubungkan" pada profil untuk memindai ulang.';
      currentScanningProfileId = null;
    }
  }
}

// Bind Profile handlers globally
window.connectProfile = connectProfile;
window.disconnectProfile = disconnectProfile;
window.deleteProfile = deleteProfile;

// Form Create Profile Submission
const formCreateProfile = document.getElementById('form-create-profile');
if (formCreateProfile) {
  formCreateProfile.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('new-profile-name');
    const name = nameInput.value.trim();
    if (!name) return;

    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      nameInput.value = '';
      loadProfiles();
      alert(`Profil "${name}" berhasil didaftarkan.`);
    } catch (err) {
      alert('Gagal mendaftarkan profil: ' + err.message);
    }
  });
}

// Blaster Switcher (Mass vs Individual)
const btnSwitchBlasterMass = document.getElementById('btn-switch-blaster-mass');
const btnSwitchBlasterIndiv = document.getElementById('btn-switch-blaster-indiv');
const containerMass = document.getElementById('ai-blaster-mass-container');
const containerIndiv = document.getElementById('ai-blaster-indiv-container');

if (btnSwitchBlasterMass && btnSwitchBlasterIndiv) {
  btnSwitchBlasterMass.addEventListener('click', () => {
    btnSwitchBlasterMass.className = 'btn btn-primary';
    btnSwitchBlasterMass.style.background = 'var(--accent-primary)';
    btnSwitchBlasterMass.style.borderColor = 'var(--accent-primary)';

    btnSwitchBlasterIndiv.className = 'btn btn-secondary';
    btnSwitchBlasterIndiv.style.background = 'transparent';
    btnSwitchBlasterIndiv.style.borderColor = 'transparent';

    containerMass.style.display = 'flex';
    containerIndiv.style.display = 'none';
  });

  btnSwitchBlasterIndiv.addEventListener('click', () => {
    btnSwitchBlasterIndiv.className = 'btn btn-primary';
    btnSwitchBlasterIndiv.style.background = 'var(--accent-primary)';
    btnSwitchBlasterIndiv.style.borderColor = 'var(--accent-primary)';

    btnSwitchBlasterMass.className = 'btn btn-secondary';
    btnSwitchBlasterMass.style.background = 'transparent';
    btnSwitchBlasterMass.style.borderColor = 'transparent';

    containerIndiv.style.display = 'flex';
    containerMass.style.display = 'none';
  });
}

// --- AI Settings & Copywriting Generator Logic ---

let activeTextareaTarget = null;

// Track last focused textarea to easily paste AI generated copy
document.addEventListener('focusin', (e) => {
  if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.classList.contains('camp-template-text') || e.target.classList.contains('indiv-msg-text'))) {
    activeTextareaTarget = e.target;
    console.log('Active copywriting target set to:', e.target);
  }
});

// UI Elements for settings tab
const settingsAiProvider = document.getElementById('settings-ai-provider');
const btnSaveAiSettings = document.getElementById('btn-save-ai-settings');

// Gemini dynamic key list elements
const geminiKeysListContainer = document.getElementById('gemini-keys-list-container');
const btnAddGeminiKeyRow = document.getElementById('btn-add-gemini-key-row');

// Input fields for other engines
const settingsOpenaiKey = document.getElementById('settings-openai-key');
const settingsOpenaiModel = document.getElementById('settings-openai-model');
const settingsClaudeKey = document.getElementById('settings-claude-key');
const settingsClaudeModel = document.getElementById('settings-claude-model');
const settingsDeepseekKey = document.getElementById('settings-deepseek-key');
const settingsDeepseekModel = document.getElementById('settings-deepseek-model');
const settingsCustomUrl = document.getElementById('settings-custom-url');
const settingsCustomKey = document.getElementById('settings-custom-key');
const settingsCustomModel = document.getElementById('settings-custom-model');

// Helper to create a new Gemini Key input row
function createGeminiKeyRow(val = '') {
  if (!geminiKeysListContainer) return;
  
  const row = document.createElement('div');
  row.className = 'gemini-key-row';
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.alignItems = 'center';
  row.style.width = '100%';

  row.innerHTML = `
    <input type="password" class="gemini-api-key-input" value="${val}" placeholder="Masukkan API Key Gemini..." style="flex: 1; padding: 10px; font-size: 13px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: #fff; box-sizing: border-box;">
    <button type="button" class="btn btn-secondary btn-toggle-key-visibility" style="padding: 10px 12px; background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); border-radius: 6px; color: #fff;"><i class="fas fa-eye"></i></button>
    <button type="button" class="btn btn-danger btn-delete-key-row" style="padding: 10px 12px; background: rgba(220,53,69,0.15); border-color: rgba(220,53,69,0.25); color: #ef4444; border-radius: 6px;"><i class="fas fa-trash-alt"></i></button>
  `;

  // Eye toggle visibility
  const input = row.querySelector('.gemini-api-key-input');
  const btnToggle = row.querySelector('.btn-toggle-key-visibility');
  btnToggle.addEventListener('click', () => {
    const icon = btnToggle.querySelector('i');
    if (input.type === 'password') {
      input.type = 'text';
      icon.className = 'fas fa-eye-slash';
    } else {
      input.type = 'password';
      icon.className = 'fas fa-eye';
    }
  });

  // Delete row
  const btnDelete = row.querySelector('.btn-delete-key-row');
  btnDelete.addEventListener('click', () => {
    const rowsCount = geminiKeysListContainer.querySelectorAll('.gemini-key-row').length;
    if (rowsCount > 1) {
      row.remove();
    } else {
      input.value = '';
    }
  });

  geminiKeysListContainer.appendChild(row);
}

// Add row listener
if (btnAddGeminiKeyRow) {
  btnAddGeminiKeyRow.addEventListener('click', () => createGeminiKeyRow(''));
}

// Toggle panels in settings based on selected provider
if (settingsAiProvider) {
  settingsAiProvider.addEventListener('change', () => {
    const selected = settingsAiProvider.value;
    
    // Hide all panels
    document.querySelectorAll('.config-ai-panel').forEach(p => p.style.display = 'none');
    
    // Show active panel
    const activePanel = document.getElementById(`config-ai-${selected}`);
    if (activePanel) {
      activePanel.style.display = 'flex';
      activePanel.style.flexDirection = 'column';
      activePanel.style.gap = '12px';
    }
  });
}

// Load AI Settings
async function loadAiSettings() {
  try {
    const res = await fetch('/api/settings/ai');
    const data = await res.json();
    if (res.ok) {
      if (settingsAiProvider) {
        settingsAiProvider.value = data.aiProvider || 'gemini';
        settingsAiProvider.dispatchEvent(new Event('change'));
      }
      
      // Load Gemini keys list
      if (geminiKeysListContainer) {
        geminiKeysListContainer.innerHTML = '';
        if (data.geminiApiKey) {
          const keys = data.geminiApiKey.split(',').map(k => k.trim()).filter(Boolean);
          keys.forEach(k => createGeminiKeyRow(k));
        }
        // Always ensure at least one row exists
        if (geminiKeysListContainer.querySelectorAll('.gemini-key-row').length === 0) {
          createGeminiKeyRow('');
        }
      }

      const settingsGeminiModel = document.getElementById('settings-gemini-model');
      if (settingsGeminiModel) settingsGeminiModel.value = data.geminiModel || 'gemini-2.5-flash';

      if (settingsOpenaiKey) settingsOpenaiKey.value = data.openaiKey || '';
      if (settingsOpenaiModel) settingsOpenaiModel.value = data.openaiModel || 'gpt-4o-mini';
      if (settingsClaudeKey) settingsClaudeKey.value = data.claudeKey || '';
      if (settingsClaudeModel) settingsClaudeModel.value = data.claudeModel || 'claude-3-5-sonnet-20241022';
      if (settingsDeepseekKey) settingsDeepseekKey.value = data.deepseekKey || '';
      if (settingsDeepseekModel) settingsDeepseekModel.value = data.deepseekModel || 'deepseek-chat';
      if (settingsCustomUrl) settingsCustomUrl.value = data.customUrl || '';
      if (settingsCustomKey) settingsCustomKey.value = data.customKey || '';
      if (settingsCustomModel) settingsCustomModel.value = data.customModel || '';

      // Update AI warning badge on copywriting screen
      const warningBadge = document.getElementById('gemini-key-warning');
      const hasKey = (data.aiProvider === 'gemini' && data.geminiApiKey) ||
                     (data.aiProvider === 'openai' && data.openaiKey) ||
                     (data.aiProvider === 'claude' && data.claudeKey) ||
                     (data.aiProvider === 'deepseek' && data.deepseekKey) ||
                     (data.aiProvider === 'custom' && data.customUrl);
      if (warningBadge) {
        warningBadge.style.display = hasKey ? 'none' : 'block';
      }

      // Update AI Engine indicator badge dynamically
      const engineBadge = document.getElementById('ai-engine-badge');
      if (engineBadge) {
        let activeModel = '';
        if (data.aiProvider === 'gemini') activeModel = data.geminiModel || 'gemini-2.5-flash';
        else if (data.aiProvider === 'openai') activeModel = data.openaiModel || 'gpt-4o-mini';
        else if (data.aiProvider === 'claude') activeModel = data.claudeModel || 'claude-3-5-sonnet';
        else if (data.aiProvider === 'deepseek') activeModel = data.deepseekModel || 'deepseek-chat';
        else if (data.aiProvider === 'custom') activeModel = data.customModel || 'custom';

        engineBadge.innerHTML = `<i class="fas fa-bolt"></i> Engine: ${data.aiProvider.toUpperCase()} (${activeModel})`;
      }
    }
  } catch (err) {
    console.error('Failed to load AI settings:', err);
  }
}

// Save AI Settings
if (btnSaveAiSettings) {
  btnSaveAiSettings.addEventListener('click', async () => {
    // Collect all Gemini keys from input list
    let geminiKeysStr = '';
    if (geminiKeysListContainer) {
      const inputs = geminiKeysListContainer.querySelectorAll('.gemini-api-key-input');
      const keys = Array.from(inputs).map(inp => inp.value.trim()).filter(Boolean);
      geminiKeysStr = keys.join(',');
    }

    const settingsGeminiModel = document.getElementById('settings-gemini-model');

    const body = {
      aiProvider: settingsAiProvider ? settingsAiProvider.value : 'gemini',
      geminiApiKey: geminiKeysStr,
      geminiModel: settingsGeminiModel ? settingsGeminiModel.value : 'gemini-2.5-flash',
      openaiKey: settingsOpenaiKey ? settingsOpenaiKey.value : '',
      openaiModel: settingsOpenaiModel ? settingsOpenaiModel.value : 'gpt-4o-mini',
      claudeKey: settingsClaudeKey ? settingsClaudeKey.value : '',
      claudeModel: settingsClaudeModel ? settingsClaudeModel.value : 'claude-3-5-sonnet-20241022',
      deepseekKey: settingsDeepseekKey ? settingsDeepseekKey.value : '',
      deepseekModel: settingsDeepseekModel ? settingsDeepseekModel.value : 'deepseek-chat',
      customUrl: settingsCustomUrl ? settingsCustomUrl.value : '',
      customKey: settingsCustomKey ? settingsCustomKey.value : '',
      customModel: settingsCustomModel ? settingsCustomModel.value : ''
    };

    try {
      const res = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Pengaturan AI Copywriter berhasil disimpan.');
      loadAiSettings();
    } catch (err) {
      alert('Gagal menyimpan pengaturan AI: ' + err.message);
    }
  });
}

// --- AI Copywriting Generator Pop-up Modal Logic ---

const aiGeneratorModal = document.getElementById('ai-generator-modal');
const closeAiGeneratorModal = document.getElementById('close-ai-generator-modal');

// Dynamic modal trigger listeners
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-open-ai-generator');
  if (btn) {
    if (aiGeneratorModal) {
      aiGeneratorModal.style.display = 'flex';
      
      // Reset output area but preserve inputs for convenience
      if (aiCopywritingOutput) aiCopywritingOutput.value = '';
      if (btnGenerateVariation) btnGenerateVariation.disabled = true;
      
      // Reset to Interview Tab as default active tab
      const btnModeForm = document.getElementById('btn-copywrite-mode-form');
      const btnModeInterview = document.getElementById('btn-copywrite-mode-interview');
      const containerForm = document.getElementById('copywrite-container-form');
      const containerInterview = document.getElementById('copywrite-container-interview');

      if (btnModeForm && btnModeInterview && containerForm && containerInterview) {
        containerForm.style.display = 'none';
        containerInterview.style.display = 'flex';
        
        btnModeInterview.style.background = 'var(--accent-primary)';
        btnModeInterview.style.borderColor = 'var(--accent-primary)';
        btnModeInterview.style.color = '#050505';
        btnModeInterview.style.fontWeight = '600';
        
        btnModeForm.style.background = 'transparent';
        btnModeForm.style.borderColor = 'transparent';
        btnModeForm.style.color = '#a3a3a3';
        btnModeForm.style.fontWeight = '500';
      }
      
      renderAiApplyButtons();
      
      if (typeof startCopywriteInterview === 'function') {
        startCopywriteInterview();
      }
    }
  }
});

if (closeAiGeneratorModal && aiGeneratorModal) {
  closeAiGeneratorModal.addEventListener('click', () => {
    aiGeneratorModal.style.display = 'none';
  });
}

// UI Elements inside Modal
const formAiGenerator = document.getElementById('form-ai-generator');
const aiBusinessDetails = document.getElementById('ai-business-details');
const aiPromoDetails = document.getElementById('ai-promo-details');
const aiMessageTone = document.getElementById('ai-message-tone');
const aiMessageCta = document.getElementById('ai-message-cta');
const aiUseEmoji = document.getElementById('ai-use-emoji');
const btnGenerateCopywriting = document.getElementById('btn-generate-copywriting');
const aiCopywritingOutput = document.getElementById('ai-copywriting-output');
const btnGenerateVariation = document.getElementById('btn-generate-variation');
const aiApplyButtonsWrapper = document.getElementById('ai-apply-buttons-wrapper');

// Render variations application buttons dynamically
function renderAiApplyButtons() {
  if (!aiApplyButtonsWrapper) return;
  aiApplyButtonsWrapper.innerHTML = '';

  const containerMass = document.getElementById('ai-blaster-mass-container');
  const isMassActive = (containerMass && containerMass.style.display !== 'none');

  const text = aiCopywritingOutput ? aiCopywritingOutput.value.trim() : '';
  const isDisabled = !text;

  if (isMassActive) {
    const textareas = document.querySelectorAll('.camp-template-text');
    if (textareas.length === 0) {
      aiApplyButtonsWrapper.innerHTML = '<span style="font-size: 12px; color: var(--color-text-muted);">Tidak ada variasi pesan kampanye massal.</span>';
      return;
    }
    textareas.forEach((ta, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-small';
      btn.style.padding = '6px 12px';
      btn.style.fontSize = '12px';
      btn.style.background = isDisabled ? 'rgba(255,255,255,0.03)' : 'rgba(3, 218, 198, 0.15)';
      btn.style.borderColor = isDisabled ? 'rgba(255,255,255,0.06)' : 'rgba(3, 218, 198, 0.25)';
      btn.style.color = isDisabled ? '#888' : '#03dac6';
      btn.disabled = isDisabled;
      btn.innerHTML = `<i class="fas fa-check"></i> Variasi Pesan #${idx + 1}`;
      
      btn.addEventListener('click', () => {
        if (ta.value.trim().length > 0) {
          const ok = confirm("Kolom pesan ini sudah terisi. Apakah Anda yakin ingin menimpa (replace) dengan hasil AI yang baru?");
          if (!ok) return;
        }
        ta.value = text;
        ta.dispatchEvent(new Event('input'));
        alert(`Copywriting disalin ke Variasi Pesan #${idx + 1}!`);
        if (aiGeneratorModal) aiGeneratorModal.style.display = 'none';
      });
      aiApplyButtonsWrapper.appendChild(btn);
    });
  } else {
    const textareas = document.querySelectorAll('.indiv-msg-text');
    if (textareas.length === 0) {
      aiApplyButtonsWrapper.innerHTML = '<span style="font-size: 12px; color: var(--color-text-muted);">Tidak ada pesan follow-up individu.</span>';
      return;
    }
    textareas.forEach((ta, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-small';
      btn.style.padding = '6px 12px';
      btn.style.fontSize = '12px';
      btn.style.background = isDisabled ? 'rgba(255,255,255,0.03)' : 'rgba(3, 218, 198, 0.15)';
      btn.style.borderColor = isDisabled ? 'rgba(255,255,255,0.06)' : 'rgba(3, 218, 198, 0.25)';
      btn.style.color = isDisabled ? '#888' : '#03dac6';
      btn.disabled = isDisabled;
      btn.innerHTML = `<i class="fas fa-check"></i> Pesan Follow-up #${idx + 1}`;
      
      btn.addEventListener('click', () => {
        if (ta.value.trim().length > 0) {
          const ok = confirm("Kolom pesan ini sudah terisi. Apakah Anda yakin ingin menimpa (replace) dengan hasil AI yang baru?");
          if (!ok) return;
        }
        ta.value = text;
        ta.dispatchEvent(new Event('input'));
        alert(`Copywriting disalin ke Pesan Follow-up #${idx + 1}!`);
        if (aiGeneratorModal) aiGeneratorModal.style.display = 'none';
      });
      aiApplyButtonsWrapper.appendChild(btn);
    });
  }
}

// Generate main copywriting
if (formAiGenerator) {
  formAiGenerator.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!aiBusinessDetails || !aiPromoDetails || !btnGenerateCopywriting || !aiCopywritingOutput) return;

    aiCopywritingOutput.value = '';
    if (btnGenerateVariation) btnGenerateVariation.disabled = true;
    renderAiApplyButtons();

    const originalHtml = btnGenerateCopywriting.innerHTML;
    btnGenerateCopywriting.disabled = true;
    btnGenerateCopywriting.innerHTML = '<i class="fas fa-spinner spin"></i> Menulis...';

    const payload = {
      businessDetails: aiBusinessDetails.value,
      promoDetails: aiPromoDetails.value,
      tone: aiMessageTone ? aiMessageTone.value : 'casual',
      cta: aiMessageCta ? aiMessageCta.value : '',
      useEmoji: aiUseEmoji ? aiUseEmoji.checked : true
    };

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      aiCopywritingOutput.value = data.replyText || '';
      if (btnGenerateVariation) btnGenerateVariation.disabled = false;
      renderAiApplyButtons();
    } catch (err) {
      alert('AI Generator gagal membuat copywriting: ' + err.message);
    } finally {
      btnGenerateCopywriting.disabled = false;
      btnGenerateCopywriting.innerHTML = originalHtml;
    }
  });
}

// ==========================================================================
// AI COPYWRITING INTERVIEW FLOW (TANYA-JAWAB WIZARD)
// ==========================================================================
let interviewStep = 0;
let interviewAnswers = {
  product: '',
  promo: '',
  tone: 'casual',
  cta: '',
  emoji: true
};

const interviewQuestions = [
  {
    text: "Halo! Saya Asisten AI Copywriter. Saya akan memandu Anda membuat pesan blast promosi secara bertahap lewat tanya-jawab santai.<br><br>Apakah Anda siap memulai? (Ketik <strong>Ya</strong> atau klik tombol di bawah)",
    guide: "Wawancara interaktif ini dirancang agar orang awam bisa dengan mudah menyusun detail promosi tanpa kebingungan."
  },
  {
    text: "<strong>Pertanyaan 1 dari 5:</strong><br>Apa nama produk atau jasa yang ingin Anda jual, serta apa kegunaan utamanya?<br><br>💡 <i><b>Penjelasan Singkat:</b> Tulis nama produk Anda dan apa fungsinya agar calon konsumen paham.</i><br><br>💡 <i><b>Contoh:</b> Jual Gamis Silk Ramadhan bahan sutra premium untuk outfit lebaran keluarga yang elegan.</i>",
    guide: "Tuliskan nama produk dan nilai manfaat utamanya secara singkat."
  },
  {
    text: "<strong>Pertanyaan 2 dari 5:</strong><br>Apakah ada diskon, promo, bonus, atau penawaran spesial untuk calon pembeli?<br><br>💡 <i><b>Penjelasan Singkat:</b> Penawaran khusus (diskon, beli 1 gratis 1, free ongkir) sangat ampuh membuat orang ingin langsung membeli saat itu juga (efek FOMO).</i><br><br>💡 <i><b>Contoh:</b> Diskon 20% khusus hari ini saja, atau Beli 1 Gratis Hijab Instan, atau Free Ongkir se-Jawa.</i>",
    guide: "Sebutkan promo atau potongan harga terbaik Anda."
  },
  {
    text: "<strong>Pertanyaan 3 dari 5:</strong><br>Gaya bahasa (tone) apa yang ingin Anda gunakan?<br>Silakan ketik nomor pilihannya (1-5) atau ketik gayanya secara langsung:<br><br>1. <b>Casual & Santai</b> (Ramah & Akrab)<br>2. <b>Formal & Profesional</b> (Bisnis Resmi)<br>3. <b>Urgent & FOMO</b> (Hard Selling / Mendesak)<br>4. <b>Storytelling</b> (Soft Selling / Bercerita)<br>5. <b>Humoris & Lucu</b>",
    guide: "Gaya bahasa menentukan kesan pertama. Pilih yang paling cocok dengan target pelanggan Anda."
  },
  {
    text: "<strong>Pertanyaan 4 dari 5:</strong><br>Apa Call to Action (CTA) yang Anda inginkan?<br><br>💡 <i><b>Penjelasan Singkat:</b> CTA adalah kalimat ajakan penting di akhir pesan agar konsumen langsung melakukan tindakan tertentu. Tanpa CTA yang jelas, orang awam bingung harus memesan ke mana.</i><br><br>💡 <i><b>Contoh:</b> Hubungi wa.me/628123456789 atau ketik 'MAU' untuk memesan sekarang.</i>",
    guide: "Buat petunjuk pemesanan yang sesederhana mungkin bagi calon pembeli."
  },
  {
    text: "<strong>Pertanyaan 5 dari 5:</strong><br>Apakah Anda ingin menyertakan emoji-emoji menarik di dalam pesan Anda agar terlihat lebih interaktif? (Ketik <strong>Ya</strong> atau <strong>Tidak</strong>)",
    guide: "Emoji mempermudah pembacaan visual dan memecah teks promosi yang tebal di layar HP."
  }
];

function addInterviewChatBubble(sender, text, guideText = "") {
  const chatContainer = document.getElementById('copywrite-interview-chat');
  if (!chatContainer) return;
  
  // Mark all previous bubbles as inactive so they can dim in Focus Mode
  const existingBubbles = chatContainer.querySelectorAll('.interview-chat-bubble');
  existingBubbles.forEach(b => b.classList.add('inactive'));
  
  const bubble = document.createElement('div');
  bubble.className = `interview-chat-bubble ${sender}`;
  
  if (sender === 'ai') {
    bubble.innerHTML = `<div>${text}</div>`;
    
    if (guideText) {
      const guideBox = document.createElement('div');
      guideBox.className = 'interview-chat-bubble-guide';
      guideBox.innerHTML = guideText;
      bubble.appendChild(guideBox);
    }
  } else {
    bubble.textContent = text;
  }
  
  chatContainer.appendChild(bubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function startCopywriteInterview() {
  const chatContainer = document.getElementById('copywrite-interview-chat');
  if (chatContainer) chatContainer.innerHTML = '';
  
  interviewStep = 0;
  interviewAnswers = {
    product: '',
    promo: '',
    tone: 'casual',
    cta: '',
    emoji: true
  };
  
  const btnGenerate = document.getElementById('btn-copywrite-interview-generate');
  if (btnGenerate) btnGenerate.style.display = 'none';
  
  const input = document.getElementById('copywrite-interview-input');
  if (input) {
    input.disabled = false;
    input.placeholder = "Ketik 'ya' atau klik tombol untuk memulai...";
    input.value = '';
  }
  const btnSend = document.getElementById('btn-copywrite-interview-send');
  if (btnSend) btnSend.disabled = false;
  
  // Show step 0
  addInterviewChatBubble('ai', interviewQuestions[0].text, interviewQuestions[0].guide);
  
  // Add quickstart button
  const quickStartDiv = document.createElement('div');
  quickStartDiv.style.marginTop = '4px';
  quickStartDiv.style.alignSelf = 'flex-start';
  
  const btnMulai = document.createElement('button');
  btnMulai.type = 'button';
  btnMulai.className = 'btn btn-primary btn-small';
  btnMulai.style.padding = '6px 12px';
  btnMulai.style.fontSize = '11.5px';
  btnMulai.style.background = 'var(--accent-primary)';
  btnMulai.style.borderColor = 'var(--accent-primary)';
  btnMulai.style.cursor = 'pointer';
  btnMulai.style.borderRadius = '6px';
  btnMulai.innerHTML = '<i class="fas fa-play"></i> Mulai Wawancara';
  btnMulai.addEventListener('click', () => {
    btnMulai.disabled = true;
    btnMulai.style.display = 'none';
    handleInterviewUserAnswer("ya");
  });
  
  quickStartDiv.appendChild(btnMulai);
  chatContainer.appendChild(quickStartDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function handleInterviewUserAnswer(answerText) {
  answerText = answerText.trim();
  if (!answerText) return;
  
  // Append user message
  addInterviewChatBubble('user', answerText);
  
  const input = document.getElementById('copywrite-interview-input');
  if (input) input.value = '';

  setTimeout(() => {
    if (interviewStep === 0) {
      interviewStep = 1;
      addInterviewChatBubble('ai', interviewQuestions[1].text, interviewQuestions[1].guide);
      if (input) input.placeholder = "Ketik detail produk Anda...";
    } else if (interviewStep === 1) {
      interviewAnswers.product = answerText;
      interviewStep = 2;
      
      // Dynamic connection text
      const nextText = `Wah, <strong>${answerText}</strong> menarik sekali dan memiliki potensi pasar yang besar! Agar penawaran Anda lebih menggoda bagi calon pembeli...<br><br>${interviewQuestions[2].text}`;
      
      addInterviewChatBubble('ai', nextText, interviewQuestions[2].guide);
      if (input) input.placeholder = "Ketik diskon/promo Anda...";
    } else if (interviewStep === 2) {
      interviewAnswers.promo = answerText;
      interviewStep = 3;
      
      // Dynamic connection text
      const nextText = `Promo <strong>${answerText}</strong> pasti sangat disukai pembeli! Selanjutnya, gaya bahasa (tone) seperti apa yang ingin Anda gunakan untuk mempromosikan produk ini?<br><br>${interviewQuestions[3].text}`;
      
      addInterviewChatBubble('ai', nextText, interviewQuestions[3].guide);
      if (input) input.placeholder = "Pilih nomor 1-5 gaya bahasa...";
    } else if (interviewStep === 3) {
      let selectedTone = 'casual';
      let selectedToneLabel = 'Casual & Santai';
      const ansLower = answerText.toLowerCase();
      if (ansLower.includes('1') || ansLower.includes('casual') || ansLower.includes('santai')) {
        selectedTone = 'casual';
        selectedToneLabel = 'Casual & Santai';
      } else if (ansLower.includes('2') || ansLower.includes('formal') || ansLower.includes('profesional')) {
        selectedTone = 'formal';
        selectedToneLabel = 'Formal & Profesional';
      } else if (ansLower.includes('3') || ansLower.includes('urgent') || ansLower.includes('fomo') || ansLower.includes('hard')) {
        selectedTone = 'urgent';
        selectedToneLabel = 'Urgent & FOMO';
      } else if (ansLower.includes('4') || ansLower.includes('storytelling') || ansLower.includes('soft')) {
        selectedTone = 'storytelling';
        selectedToneLabel = 'Storytelling';
      } else if (ansLower.includes('5') || ansLower.includes('humoris') || ansLower.includes('lucu')) {
        selectedTone = 'humorous';
        selectedToneLabel = 'Humoris & Lucu';
      }
      interviewAnswers.tone = selectedTone;
      interviewStep = 4;
      
      // Dynamic connection text
      const nextText = `Gaya bahasa <strong>${selectedToneLabel}</strong> sangat pas untuk membangun kecocokan dengan target pembeli Anda! Sekarang, mari tentukan Call to Action (CTA) pesan Anda.<br><br>${interviewQuestions[4].text}`;
      
      addInterviewChatBubble('ai', nextText, interviewQuestions[4].guide);
      if (input) input.placeholder = "Ketik petunjuk pemesanan (CTA)...";
    } else if (interviewStep === 4) {
      interviewAnswers.cta = answerText;
      interviewStep = 5;
      
      // Dynamic connection text
      const nextText = `Instruksi <strong>${answerText}</strong> sudah sangat jelas untuk memudahkan orang bertindak! Terakhir...<br><br>${interviewQuestions[5].text}`;
      
      addInterviewChatBubble('ai', nextText, interviewQuestions[5].guide);
      if (input) input.placeholder = "Ya atau Tidak?";
    } else if (interviewStep === 5) {
      const ansLower = answerText.toLowerCase();
      const useEmoji = !(ansLower.includes('tidak') || ansLower.includes('no') || ansLower.includes('gak') || ansLower.includes('n'));
      interviewAnswers.emoji = useEmoji;
      interviewStep = 6;
      
      // Final confirmation summarizing everything dynamically
      const finalGreeting = `<strong>Wawancara Selesai! 🎉</strong><br><br>Saya telah merangkum detail promosi Anda:<br>` +
        `• <b>Produk/Jasa</b>: ${interviewAnswers.product}<br>` +
        `• <b>Promo</b>: ${interviewAnswers.promo}<br>` +
        `• <b>CTA</b>: ${interviewAnswers.cta}<br>` +
        `• <b>Emoji</b>: ${useEmoji ? 'Ya' : 'Tidak'}<br><br>` +
        `Silakan klik tombol <strong>Buat Copywriting!</strong> di bawah untuk mulai men-generate draf promosi Anda sekarang.`;
        
      addInterviewChatBubble('ai', finalGreeting);
      
      if (input) {
        input.placeholder = "Semua pertanyaan selesai diisi.";
        input.disabled = true;
      }
      const btnSend = document.getElementById('btn-copywrite-interview-send');
      if (btnSend) btnSend.disabled = true;
      
      const btnGenerate = document.getElementById('btn-copywrite-interview-generate');
      if (btnGenerate) btnGenerate.style.display = 'inline-flex';
    }
  }, 400);
}

async function handleInterviewGenerate() {
  if (!aiCopywritingOutput) return;

  aiCopywritingOutput.value = '';
  if (btnGenerateVariation) btnGenerateVariation.disabled = true;
  renderAiApplyButtons();

  const btnGen = document.getElementById('btn-copywrite-interview-generate');
  const originalHtml = btnGen.innerHTML;
  btnGen.disabled = true;
  btnGen.innerHTML = '<i class="fas fa-spinner spin"></i> Menulis...';

  const payload = {
    businessDetails: interviewAnswers.product,
    promoDetails: interviewAnswers.promo,
    tone: interviewAnswers.tone,
    cta: interviewAnswers.cta,
    useEmoji: interviewAnswers.emoji
  };

  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    aiCopywritingOutput.value = data.replyText || '';
    if (btnGenerateVariation) btnGenerateVariation.disabled = false;
    renderAiApplyButtons();
  } catch (err) {
    alert('AI Generator gagal membuat copywriting: ' + err.message);
  } finally {
    btnGen.disabled = false;
    btnGen.innerHTML = originalHtml;
  }
}

// Bind Interview Controls
(function() {
  const btnModeForm = document.getElementById('btn-copywrite-mode-form');
  const btnModeInterview = document.getElementById('btn-copywrite-mode-interview');
  const containerForm = document.getElementById('copywrite-container-form');
  const containerInterview = document.getElementById('copywrite-container-interview');

  if (btnModeForm && btnModeInterview && containerForm && containerInterview) {
    btnModeForm.addEventListener('click', () => {
      containerForm.style.display = 'flex';
      containerInterview.style.display = 'none';
      btnModeForm.style.background = 'var(--accent-primary)';
      btnModeForm.style.borderColor = 'var(--accent-primary)';
      btnModeForm.style.color = '#050505';
      btnModeForm.style.fontWeight = '600';
      
      btnModeInterview.style.background = 'transparent';
      btnModeInterview.style.borderColor = 'transparent';
      btnModeInterview.style.color = '#a3a3a3';
      btnModeInterview.style.fontWeight = '500';
    });

    btnModeInterview.addEventListener('click', () => {
      containerForm.style.display = 'none';
      containerInterview.style.display = 'flex';
      btnModeInterview.style.background = 'var(--accent-primary)';
      btnModeInterview.style.borderColor = 'var(--accent-primary)';
      btnModeInterview.style.color = '#050505';
      btnModeInterview.style.fontWeight = '600';
      
      btnModeForm.style.background = 'transparent';
      btnModeForm.style.borderColor = 'transparent';
      btnModeForm.style.color = '#a3a3a3';
      btnModeForm.style.fontWeight = '500';
      
      const chat = document.getElementById('copywrite-interview-chat');
      if (chat && chat.children.length === 0) {
        startCopywriteInterview();
      }
    });
  }

  const interviewInput = document.getElementById('copywrite-interview-input');
  const btnInterviewSend = document.getElementById('btn-copywrite-interview-send');
  const btnInterviewReset = document.getElementById('btn-copywrite-interview-reset');
  const btnInterviewGenerate = document.getElementById('btn-copywrite-interview-generate');

  if (interviewInput) {
    interviewInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleInterviewUserAnswer(interviewInput.value);
      }
    });
  }

  if (btnInterviewSend) {
    btnInterviewSend.addEventListener('click', () => {
      if (interviewInput) {
        handleInterviewUserAnswer(interviewInput.value);
      }
    });
  }

  if (btnInterviewReset) {
    btnInterviewReset.addEventListener('click', () => {
      startCopywriteInterview();
    });
  }

  if (btnInterviewGenerate) {
    btnInterviewGenerate.addEventListener('click', () => {
      handleInterviewGenerate();
    });
  }
})();


// Generate variation from current output
if (btnGenerateVariation && aiCopywritingOutput) {
  btnGenerateVariation.addEventListener('click', async () => {
    const currentText = aiCopywritingOutput.value.trim();
    if (!currentText) return;

    const originalHtml = btnGenerateVariation.innerHTML;
    btnGenerateVariation.disabled = true;
    btnGenerateVariation.innerHTML = '<i class="fas fa-spinner spin"></i> Membuat Variasi...';

    try {
      const res = await fetch('/api/ai/variation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentText })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      aiCopywritingOutput.value = data.replyText || '';
      renderAiApplyButtons();
    } catch (err) {
      alert('Gagal membuat variasi alternatif: ' + err.message);
    } finally {
      btnGenerateVariation.disabled = false;
      btnGenerateVariation.innerHTML = originalHtml;
    }
  });
}

// Initial Settings Load on App Boot
loadAiSettings();

// Copywriting Injector Helper
const btnInjectCopywriting = document.getElementById('btn-inject-copywriting');
const txtCopywritingInput = document.getElementById('ai-copywriting-injector-text');

if (btnInjectCopywriting && txtCopywritingInput) {
  btnInjectCopywriting.addEventListener('click', () => {
    const text = txtCopywritingInput.value.trim();
    if (!text) {
      alert('Teks copywriting kosong.');
      return;
    }

    const isMassActive = (containerMass.style.display !== 'none');
    if (isMassActive) {
      const textareas = document.querySelectorAll('.camp-template-text');
      if (textareas.length > 0) {
        const activeTextarea = textareas[textareas.length - 1];
        activeTextarea.value = text;
        activeTextarea.dispatchEvent(new Event('input'));
        alert('Copywriting disalin ke Variasi Pesan kampanye massal!');
        txtCopywritingInput.value = '';
      } else {
        alert('Tidak ada template pesan kampanye massal yang aktif.');
      }
    } else {
      const textareas = document.querySelectorAll('.indiv-msg-text');
      if (textareas.length > 0) {
        const activeTextarea = textareas[textareas.length - 1];
        activeTextarea.value = text;
        activeTextarea.dispatchEvent(new Event('input'));
        alert('Copywriting disalin ke Template Pesan individu!');
        txtCopywritingInput.value = '';
      } else {
        alert('Tidak ada form pesan individu yang aktif.');
      }
    }
  });
}
// --- AI Blaster Screen Layout Toggle (Split vs Focus Left vs Focus Right) ---
const btnLayoutFocusLeft = document.getElementById('btn-layout-focus-left');
const btnLayoutSplit = document.getElementById('btn-layout-split');
const btnLayoutFocusRight = document.getElementById('btn-layout-focus-right');

const blasterWorkspaceGrid = document.getElementById('ai-blaster-workspace-grid');
const blasterLeftCol = document.getElementById('ai-blaster-left-col');
const blasterRightCol = document.getElementById('ai-blaster-right-col');

if (btnLayoutFocusLeft && btnLayoutSplit && btnLayoutFocusRight && blasterWorkspaceGrid && blasterLeftCol && blasterRightCol) {
  
  function updateLayoutSwitcherStyles(activeBtn) {
    [btnLayoutFocusLeft, btnLayoutSplit, btnLayoutFocusRight].forEach(btn => {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'transparent';
      btn.className = 'btn btn-secondary';
    });
    activeBtn.style.background = 'var(--accent-primary)';
    activeBtn.style.borderColor = 'var(--accent-primary)';
    activeBtn.className = 'btn btn-primary';
  }

  btnLayoutFocusLeft.addEventListener('click', () => {
    updateLayoutSwitcherStyles(btnLayoutFocusLeft);
    blasterLeftCol.style.display = 'flex';
    blasterRightCol.style.display = 'none';
    blasterWorkspaceGrid.style.gridTemplateColumns = '1fr';
  });

  btnLayoutSplit.addEventListener('click', () => {
    updateLayoutSwitcherStyles(btnLayoutSplit);
    blasterLeftCol.style.display = 'flex';
    blasterRightCol.style.display = 'flex';
    blasterWorkspaceGrid.style.gridTemplateColumns = '0.8fr 1.2fr';
  });

  btnLayoutFocusRight.addEventListener('click', () => {
    updateLayoutSwitcherStyles(btnLayoutFocusRight);
    blasterLeftCol.style.display = 'none';
    blasterRightCol.style.display = 'flex';
    blasterWorkspaceGrid.style.gridTemplateColumns = '1fr';
  });

}

// ==========================================================================
// ONLINE LICENSING SYSTEM (FRONTEND INTEGRATION)
// ==========================================================================
const licenseLockScreen = document.getElementById('license-lock-screen');
const licenseKeyInput = document.getElementById('license-key-input');
const licenseHwidDisplay = document.getElementById('license-hwid-display');
const licenseForm = document.getElementById('license-activation-form');
const licenseFeedback = document.getElementById('license-feedback-message');
const btnActivateLicense = document.getElementById('btn-activate-license');

async function checkLicenseStatus() {
  if (!licenseLockScreen) return;
  
  try {
    const res = await fetch('/api/license/status');
    const data = await res.json();
    
    // Populate the Settings page License Info card
    const settingStatus = document.getElementById('license-detail-status');
    const settingKey = document.getElementById('license-detail-key');
    const settingExpiry = document.getElementById('license-detail-expiry');
    const settingHwid = document.getElementById('license-detail-hwid');
    const btnToggle = document.getElementById('btn-toggle-license-visibility');

    if (settingStatus) {
      settingStatus.textContent = data.active ? 'Aktif' : 'Tidak Aktif';
      settingStatus.style.background = data.active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
      settingStatus.style.borderColor = data.active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
      settingStatus.style.color = data.active ? 'var(--accent-primary)' : 'var(--accent-danger)';
    }

    if (settingHwid) {
      settingHwid.textContent = data.hwid || 'Tidak diketahui';
    }

    if (settingExpiry) {
      if (data.expiryDate) {
        const expiry = new Date(data.expiryDate);
        const d = expiry.getDate().toString().padStart(2, '0');
        const m = (expiry.getMonth() + 1).toString().padStart(2, '0');
        const y = expiry.getFullYear();
        settingExpiry.textContent = `${d}-${m}-${y}`;
      } else {
        settingExpiry.textContent = 'Tidak Terbatas (Lifetime)';
      }
    }

    const settingDevices = document.getElementById('license-detail-devices');
    if (settingDevices) {
      if (data.devicesUsed !== undefined && data.maxDevices !== undefined) {
        settingDevices.textContent = `${data.devicesUsed} / ${data.maxDevices} PC`;
      } else {
        settingDevices.textContent = '-';
      }
    }

    if (settingKey) {
      const rawKey = data.licenseKey || '';
      settingKey.setAttribute('data-raw', rawKey);
      settingKey.textContent = rawKey ? '••••••••••••••••' : 'Belum Ada Lisensi';
      
      if (btnToggle) {
        btnToggle.style.display = rawKey ? 'inline-block' : 'none';
        if (!btnToggle.dataset.hasListener) {
          btnToggle.dataset.hasListener = 'true';
          btnToggle.addEventListener('click', () => {
            const icon = btnToggle.querySelector('i');
            const isMasked = settingKey.textContent.includes('•');
            if (isMasked) {
              settingKey.textContent = rawKey;
              icon.className = 'fas fa-eye-slash';
              icon.style.color = 'var(--accent-danger)';
            } else {
              settingKey.textContent = '••••••••••••••••';
              icon.className = 'fas fa-eye';
              icon.style.color = 'var(--accent-primary)';
            }
          });
        }
      }
    }
    
    if (licenseHwidDisplay) {
      licenseHwidDisplay.textContent = data.hwid || 'Tidak diketahui';
    }
    
    const expiryBar = document.getElementById('license-expiry-bar');
    
    if (data.active) {
      licenseLockScreen.style.display = 'none';
      console.log('✅ License is active. Access granted.');
      
      // Update sidebar expiration warning bar
      if (expiryBar && data.expiryDate) {
        const expiry = new Date(data.expiryDate);
        const today = new Date();
        today.setHours(0,0,0,0);
        expiry.setHours(0,0,0,0);
        
        const diffTime = expiry - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Format date: DD-MM-YYYY
        const d = expiry.getDate().toString().padStart(2, '0');
        const m = (expiry.getMonth() + 1).toString().padStart(2, '0');
        const y = expiry.getFullYear();
        const formattedDate = `${d}-${m}-${y}`;
        
        expiryBar.style.display = 'block';
        
        if (diffDays < 0) {
          // Expired
          expiryBar.style.background = 'rgba(239, 68, 68, 0.15)';
          expiryBar.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          expiryBar.style.color = '#f87171';
          expiryBar.style.animation = 'none';
          expiryBar.innerHTML = `<i class="fas fa-times-circle"></i> 🚨 Expired! (${formattedDate})`;
        } else if (diffDays === 0) {
          // Expires Today
          expiryBar.style.background = 'rgba(239, 68, 68, 0.15)';
          expiryBar.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          expiryBar.style.color = '#f87171';
          expiryBar.style.animation = 'none';
          expiryBar.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 🚨 Habis Hari Ini!`;
        } else if (diffDays <= 7) {
          // Warning orange pulsing alert
          expiryBar.style.background = 'rgba(245, 158, 11, 0.15)';
          expiryBar.style.border = '1px solid rgba(245, 158, 11, 0.3)';
          expiryBar.style.color = '#fbbf24';
          
          if (!document.getElementById('expiry-pulse-style')) {
            const style = document.createElement('style');
            style.id = 'expiry-pulse-style';
            style.innerHTML = `@keyframes expiryPulse { 0% { opacity: 1; } 50% { opacity: 0.6; } 100% { opacity: 1; } }`;
            document.head.appendChild(style);
          }
          expiryBar.style.animation = 'expiryPulse 2s infinite';
          expiryBar.innerHTML = `<i class="fas fa-clock"></i> ⚠️ Habis ${diffDays} Hari Lagi!`;
        } else {
          // Normal active state
          expiryBar.style.background = 'rgba(255, 255, 255, 0.04)';
          expiryBar.style.border = '1px solid rgba(255, 255, 255, 0.08)';
          expiryBar.style.color = 'var(--color-text-muted)';
          expiryBar.style.animation = 'none';
          expiryBar.innerHTML = `<i class="fas fa-calendar-check" style="color:var(--accent-secondary); margin-right:4px;"></i> Aktif s.d: ${formattedDate}`;
        }
      }
    } else {
      licenseLockScreen.style.display = 'flex';
      console.log('🔒 License is inactive. Screen locked.');
      if (expiryBar) expiryBar.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to check license status:', err);
    if (licenseLockScreen) {
      licenseLockScreen.style.display = 'flex';
    }
  }
}

if (licenseForm) {
  licenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!licenseKeyInput || !licenseFeedback || !btnActivateLicense) return;
    
    const licenseKey = licenseKeyInput.value.trim();
    if (!licenseKey) return;
    
    // UI Loading state
    btnActivateLicense.disabled = true;
    btnActivateLicense.innerHTML = '<i class="fas fa-spinner spin"></i> Memproses Aktivasi...';
    licenseFeedback.style.display = 'none';
    
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengaktifkan lisensi.');
      }
      
      // Success feedback
      licenseFeedback.className = '';
      licenseFeedback.style.background = 'rgba(40, 167, 69, 0.15)';
      licenseFeedback.style.border = '1px solid rgba(40, 167, 69, 0.3)';
      licenseFeedback.style.color = '#28a745';
      licenseFeedback.innerHTML = `<i class="fas fa-check-circle"></i> <strong>Aktivasi Sukses!</strong><br>${data.message || 'Lisensi berhasil diverifikasi.'}`;
      licenseFeedback.style.display = 'block';
      
      setTimeout(() => {
        // Hide lock screen and refresh app state
        licenseLockScreen.style.opacity = '0';
        licenseLockScreen.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
          licenseLockScreen.style.display = 'none';
          licenseLockScreen.style.opacity = '1'; // reset opacity for next time
          window.location.reload(); // Reload page to boot WA instances and start scheduler
        }, 500);
      }, 1500);
      
    } catch (err) {
      // Error feedback
      licenseFeedback.className = '';
      licenseFeedback.style.background = 'rgba(220, 53, 69, 0.15)';
      licenseFeedback.style.border = '1px solid rgba(220, 53, 69, 0.3)';
      licenseFeedback.style.color = '#dc3545';
      licenseFeedback.innerHTML = `<i class="fas fa-exclamation-circle"></i> <strong>Aktivasi Gagal:</strong><br>${err.message}`;
      licenseFeedback.style.display = 'block';
      
      // Reset button state
      btnActivateLicense.disabled = false;
      btnActivateLicense.innerHTML = '<i class="fas fa-key"></i> Aktifkan Lisensi Sekarang';
    }
  });
}

// Initial license check on page load (with readyState fallback to prevent race condition)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    checkLicenseStatus();
  });
} else {
  checkLicenseStatus();
}

// Settings tab accordion section toggles
document.querySelectorAll('.settings-section-header').forEach(header => {
  header.addEventListener('click', () => {
    const card = header.closest('.settings-section-card');
    if (card) {
      card.classList.toggle('active');
    }
  });
});

// ==========================================================================
// COLLAPSIBLE SIDEBAR LOGIC
// ==========================================================================
(function() {
  const container = document.getElementById('main-app-container');
  const btnCollapse = document.getElementById('btn-collapse-sidebar');
  const btnExpand = document.getElementById('btn-expand-sidebar');

  // Load saved sidebar state
  const sidebarHidden = localStorage.getItem('sidebar-hidden') === 'true';
  if (sidebarHidden && container) {
    container.classList.add('sidebar-hidden');
  }

  if (btnCollapse) {
    btnCollapse.addEventListener('click', () => {
      if (container) {
        container.classList.add('sidebar-hidden');
        localStorage.setItem('sidebar-hidden', 'true');
      }
    });
  }

  if (btnExpand) {
    btnExpand.addEventListener('click', () => {
      if (container) {
        container.classList.remove('sidebar-hidden');
        localStorage.setItem('sidebar-hidden', 'false');
      }
    });
  }
})();

// ==========================================================================
// DYNAMIC SVG CHART FOR DASHBOARD
// ==========================================================================
function drawDashboardChart(logs = []) {
  const svg = document.getElementById('dashboard-svg-chart');
  if (!svg) return;
  
  // Calculate date range of last 7 days
  const days = [];
  const labels = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(d.toDateString());
    // Label as "DD/MM"
    labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
  }
  
  // Group logs by day
  const sentCounts = Array(7).fill(0);
  const failedCounts = Array(7).fill(0);
  
  logs.forEach(log => {
    const logDate = new Date(log.sentAt || log.createdAt).toDateString();
    const idx = days.indexOf(logDate);
    if (idx !== -1) {
      if (log.status === 'sent') {
        sentCounts[idx]++;
      } else if (log.status === 'failed') {
        failedCounts[idx]++;
      }
    }
  });
  
  // Show empty chart state overlay if no logs exist
  const totalSent = sentCounts.reduce((a, b) => a + b, 0);
  const totalFailed = failedCounts.reduce((a, b) => a + b, 0);
  const isEmpty = (totalSent === 0 && totalFailed === 0);
  
  const emptyMsg = document.getElementById('chart-empty-msg');
  if (emptyMsg) {
    emptyMsg.style.opacity = isEmpty ? '1' : '0';
  }
  
  // Scale SVG dimensions
  const svgWidth = 600;
  const svgHeight = 200;
  const paddingX = 40;
  const paddingY = 20;
  const chartWidth = svgWidth - paddingX * 2;
  const chartHeight = svgHeight - paddingY * 2;
  
  // Find max value for Y scaling
  const maxVal = Math.max(...sentCounts, ...failedCounts, 10);
  const yMax = Math.ceil(maxVal / 5) * 5; // round to nearest 5
  
  // Generate Grid lines
  const gridGroup = document.getElementById('chart-grid-lines');
  if (gridGroup) {
    gridGroup.innerHTML = '';
    const gridRows = 4;
    for (let i = 0; i <= gridRows; i++) {
      const y = paddingY + (chartHeight * i) / gridRows;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', paddingX);
      line.setAttribute('y1', y);
      line.setAttribute('x2', svgWidth - paddingX);
      line.setAttribute('y2', y);
      gridGroup.appendChild(line);
    }
  }
  
  // Draw X labels
  const xLabelsGroup = document.getElementById('chart-x-labels');
  if (xLabelsGroup) {
    xLabelsGroup.innerHTML = '';
  }
  
  // Map points to SVG coordinates
  const pointsSent = [];
  const pointsFailed = [];
  
  for (let i = 0; i < 7; i++) {
    const x = paddingX + (chartWidth * i) / 6;
    const ySent = svgHeight - paddingY - (sentCounts[i] / yMax) * chartHeight;
    const yFailed = svgHeight - paddingY - (failedCounts[i] / yMax) * chartHeight;
    
    pointsSent.push({x, y: ySent, val: sentCounts[i]});
    pointsFailed.push({x, y: yFailed, val: failedCounts[i]});
    
    // Draw x label text
    if (xLabelsGroup) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', svgHeight - 5);
      text.textContent = labels[i];
      xLabelsGroup.appendChild(text);
    }
  }
  
  // Generate Line Path strings
  const getLinePath = (points) => {
    if (points.length === 0) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const cpX1 = points[i-1].x + (points[i].x - points[i-1].x) / 2;
      const cpY1 = points[i-1].y;
      const cpX2 = points[i-1].x + (points[i].x - points[i-1].x) / 2;
      const cpY2 = points[i].y;
      d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${points[i].x} ${points[i].y}`;
    }
    return d;
  };
  
  const getAreaPath = (points) => {
    const linePath = getLinePath(points);
    if (!linePath) return '';
    return `${linePath} L ${points[points.length-1].x} ${svgHeight - paddingY} L ${points[0].x} ${svgHeight - paddingY} Z`;
  };
  
  // Set paths
  const lineSent = document.getElementById('chart-line-sent');
  const lineFailed = document.getElementById('chart-line-failed');
  const areaSent = document.getElementById('chart-area-sent');
  const areaFailed = document.getElementById('chart-area-failed');
  
  if (lineSent) lineSent.setAttribute('d', getLinePath(pointsSent));
  if (lineFailed) lineFailed.setAttribute('d', getLinePath(pointsFailed));
  if (areaSent) areaSent.setAttribute('d', getAreaPath(pointsSent));
  if (areaFailed) areaFailed.setAttribute('d', getAreaPath(pointsFailed));
  
  // Draw data points circles
  const ptsSentGroup = document.getElementById('chart-points-sent');
  const ptsFailedGroup = document.getElementById('chart-points-failed');
  
  if (ptsSentGroup) ptsSentGroup.innerHTML = '';
  if (ptsFailedGroup) ptsFailedGroup.innerHTML = '';
  
  const drawCircles = (points, group, colorValue) => {
    if (!group) return;
    points.forEach((pt) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', '#171717');
      circle.setAttribute('stroke', colorValue);
      circle.setAttribute('stroke-width', '2');
      circle.style.transition = 'cx 0.5s ease, cy 0.5s ease';
      
      const hoverCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hoverCircle.setAttribute('cx', pt.x);
      hoverCircle.setAttribute('cy', pt.y);
      hoverCircle.setAttribute('r', '12');
      hoverCircle.setAttribute('fill', 'transparent');
      hoverCircle.style.cursor = 'pointer';
      
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${pt.val} Pesan`;
      hoverCircle.appendChild(title);
      
      group.appendChild(circle);
      group.appendChild(hoverCircle);
    });
  };
  
  drawCircles(pointsSent, ptsSentGroup, 'var(--accent-primary)');
  drawCircles(pointsFailed, ptsFailedGroup, 'var(--accent-danger)');
}

// ==========================================================================
// DUMMY SEED & RESET DATA EVENT BINDINGS
// ==========================================================================
(function() {
  const btnSeed = document.getElementById('btn-seed-dummy');
  const btnReset = document.getElementById('btn-reset-dummy');

  if (btnSeed) {
    btnSeed.addEventListener('click', async () => {
      if (confirm('Apakah Anda yakin ingin men-generate data dummy profesional? Ini akan menghapus data lama Anda dan merestart halaman.')) {
        try {
          btnSeed.disabled = true;
          btnSeed.innerHTML = '<i class="fas fa-spinner spin"></i> Mengisi Data...';
          
          const res = await fetch('/api/dummy/seed', { method: 'POST' });
          const data = await res.json();
          
          if (res.ok) {
            alert('Sukses! Data dummy profesional berhasil di-generate.');
            location.reload();
          } else {
            throw new Error(data.error || 'Terjadi kesalahan');
          }
        } catch (error) {
          alert('Gagal mengisi data dummy: ' + error.message);
        } finally {
          btnSeed.disabled = false;
          btnSeed.innerHTML = '<i class="fas fa-database"></i> Isi Data Dummy';
        }
      }
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      if (confirm('Apakah Anda yakin ingin mengosongkan database? Semua campaign, log, profil WA, dan autoreply akan dihapus.')) {
        try {
          btnReset.disabled = true;
          btnReset.innerHTML = '<i class="fas fa-spinner spin"></i> Mereset...';
          
          const res = await fetch('/api/dummy/reset', { method: 'POST' });
          const data = await res.json();
          
          if (res.ok) {
            alert('Sukses! Database berhasil dikosongkan.');
            location.reload();
          } else {
            throw new Error(data.error || 'Terjadi kesalahan');
          }
        } catch (error) {
          alert('Gagal mereset database: ' + error.message);
        } finally {
          btnReset.disabled = false;
          btnReset.innerHTML = '<i class="fas fa-trash-alt"></i> Reset Database';
        }
      }
    });
  }

  // ==========================================================================
  // WA GROUP SCRAPER LOGIC
  // ==========================================================================
  const scraperProfileSelect = document.getElementById('scraper-profile-select');
  const scraperGroupSelect = document.getElementById('scraper-group-select');
  const scraperGroupSearch = document.getElementById('scraper-group-search');
  const btnScraperLoadGroups = document.getElementById('btn-scraper-load-groups');
  const btnScraperStartScrape = document.getElementById('btn-scraper-start-scrape');

  let allLoadedGroups = [];

  function renderGroupOptions(groupsList) {
    scraperGroupSelect.innerHTML = '<option value="">-- Pilih Grup WhatsApp --</option>';
    if (groupsList.length === 0) {
      const opt = document.createElement('option');
      opt.value = "";
      opt.textContent = "Tidak ada grup yang ditemukan";
      scraperGroupSelect.appendChild(opt);
      return;
    }
    groupsList.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      scraperGroupSelect.appendChild(opt);
    });
  }

  if (scraperGroupSearch) {
    scraperGroupSearch.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderGroupOptions(allLoadedGroups);
      } else {
        const filtered = allLoadedGroups.filter(g => g.name.toLowerCase().includes(q));
        renderGroupOptions(filtered);
      }
    });
  }

  async function loadScraperGroups() {
    const profileId = scraperProfileSelect.value;
    if (!profileId) {
      alert('Pilih Akun WhatsApp terlebih dahulu!');
      return;
    }
    
    btnScraperLoadGroups.disabled = true;
    btnScraperLoadGroups.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...';
    
    try {
      const res = await fetch(`/api/whatsapp/groups?profileId=${profileId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal memuat grup');
      }
      
      allLoadedGroups = await res.json();
      
      if (scraperGroupSearch) {
        scraperGroupSearch.value = '';
        scraperGroupSearch.style.display = allLoadedGroups.length > 0 ? 'block' : 'none';
      }
      
      renderGroupOptions(allLoadedGroups);
    } catch (error) {
      alert('Gagal memuat grup: ' + error.message);
    } finally {
      btnScraperLoadGroups.disabled = false;
      btnScraperLoadGroups.innerHTML = '<i class="fas fa-sync-alt"></i> Muat Grup';
    }
  }

  async function startGroupScrape() {
    const profileId = scraperProfileSelect.value;
    const groupId = scraperGroupSelect.value;
    
    if (!profileId || !groupId) {
      alert('Harap pilih Akun WhatsApp dan Grup terlebih dahulu!');
      return;
    }
    
    btnScraperStartScrape.disabled = true;
    btnScraperStartScrape.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Men-scrape Anggota...';
    
    try {
      const res = await fetch(`/api/whatsapp/groups/${groupId}/participants?profileId=${profileId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal men-scrape');
      }
      
      const data = await res.json();
      
      if (!data.participants || data.participants.length === 0) {
        alert('Grup ini kosong atau tidak memiliki anggota yang bisa di-scrape.');
        return;
      }
      
      // Map to parsedContacts
      parsedContacts = data.participants.map(p => ({
        phone: p.phone,
        name: p.name || 'Anggota Grup',
        variables: {}
      }));
      
      // Show CSV export button
      const btnExport = document.getElementById('btn-scraper-export-csv');
      if (btnExport) {
        btnExport.style.display = 'inline-flex';
      }
      
      // Render the contact list preview in the UI
      renderPreviewTable(['Phone', 'Name'], 'Phone', 'Name');
      
      alert(`Sukses! Berhasil men-scrape ${data.participantCount} nomor dari grup "${data.groupName}" ke daftar penerima.`);
    } catch (error) {
      alert('Gagal men-scrape anggota grup: ' + error.message);
    } finally {
      btnScraperStartScrape.disabled = false;
      btnScraperStartScrape.innerHTML = '<i class="fas fa-filter"></i> Scrape & Impor Kontak';
    }
  }

  // Handle Scraped CSV Download
  const btnScraperExportCsv = document.getElementById('btn-scraper-export-csv');
  if (btnScraperExportCsv) {
    btnScraperExportCsv.addEventListener('click', (e) => {
      e.preventDefault();
      if (parsedContacts.length === 0) {
        alert('Tidak ada kontak untuk diekspor.');
        return;
      }
      try {
        let csvContent = 'Phone,Name\n';
        parsedContacts.forEach(c => {
          const cleanName = c.name ? c.name.replace(/"/g, '""') : 'Anggota';
          csvContent += `${c.phone},"${cleanName}"\n`;
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `scraped-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
        
        // Append to DOM, click, and clean up after small timeout
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 150);
      } catch (err) {
        alert('Gagal mengekspor CSV: ' + err.message);
      }
    });
  }

  if (btnScraperLoadGroups) {
    btnScraperLoadGroups.addEventListener('click', loadScraperGroups);
  }
  if (scraperProfileSelect) {
    scraperProfileSelect.addEventListener('change', loadScraperGroups);
  }
  if (btnScraperStartScrape) {
    btnScraperStartScrape.addEventListener('click', startGroupScrape);
  }
})();

// ==========================================================================
// MASTER FOLLOW-UP PROGRAM STUDIO & STANDALONE INDIVIDUAL BLAST ENGINE
// ==========================================================================
(function initMasterProgramStudio() {
  let masterProgramsList = [];
  let currentEditingMasterId = null;

  // Sub-tab Switcher inside Blast Individu tab
  const btnSubtabSchedule = document.getElementById('btn-subtab-indiv-schedule');
  const btnSubtabMaster = document.getElementById('btn-subtab-indiv-master');
  const subviewSchedule = document.getElementById('subview-indiv-schedule');
  const subviewMaster = document.getElementById('subview-indiv-master');

  if (btnSubtabSchedule && btnSubtabMaster) {
    btnSubtabSchedule.addEventListener('click', () => {
      btnSubtabSchedule.className = 'btn btn-primary';
      btnSubtabSchedule.style.background = 'var(--accent-primary)';
      btnSubtabSchedule.style.borderColor = 'var(--accent-primary)';

      btnSubtabMaster.className = 'btn btn-secondary';
      btnSubtabMaster.style.background = 'transparent';
      btnSubtabMaster.style.borderColor = 'rgba(255,255,255,0.12)';

      subviewSchedule.style.display = 'flex';
      subviewMaster.style.display = 'none';
    });

    btnSubtabMaster.addEventListener('click', () => {
      btnSubtabMaster.className = 'btn btn-primary';
      btnSubtabMaster.style.background = 'var(--accent-primary)';
      btnSubtabMaster.style.borderColor = 'var(--accent-primary)';

      btnSubtabSchedule.className = 'btn btn-secondary';
      btnSubtabSchedule.style.background = 'transparent';
      btnSubtabSchedule.style.borderColor = 'rgba(255,255,255,0.12)';

      subviewSchedule.style.display = 'none';
      subviewMaster.style.display = 'grid';
      loadMasterPrograms();
    });
  }

  // Load Master Programs from API
  async function loadMasterPrograms() {
    try {
      const res = await fetch('/api/followup-programs');
      const data = await res.json();
      if (res.ok) {
        masterProgramsList = data || [];
        renderMasterProgramsDropdown();
        renderMasterProgramsCards();
      }
    } catch (err) {
      console.error('Failed to load Master Programs:', err);
    }
  }

  // Populate Dropdown in Schedule Form
  function renderMasterProgramsDropdown() {
    const selectPreset = document.getElementById('indiv-program-preset-sa');
    if (!selectPreset) return;
    selectPreset.innerHTML = '<option value="">-- Pilih Master Program --</option>';
    masterProgramsList.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p._id;
      opt.textContent = `${p.name} (${p.steps ? p.steps.length : 0} Langkah)`;
      selectPreset.appendChild(opt);
    });
  }

  // Render Saved Master Program Cards in Left Panel
  function renderMasterProgramsCards() {
    const listContainer = document.getElementById('master-programs-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (masterProgramsList.length === 0) {
      listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--color-text-muted); font-size:12px;">Belum ada Master Program tersimpan.</div>`;
      return;
    }

    masterProgramsList.forEach(p => {
      const card = document.createElement('div');
      card.className = 'panel glass';
      card.style.cssText = `padding: 12px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; transition: all 0.2s;`;
      
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <h5 style="font-size: 13.5px; font-weight: 600; color: #fff; margin: 0; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</h5>
          <span class="badge info" style="font-size: 10px; padding: 2px 6px;">${p.category || 'Umum'}</span>
        </div>
        <p style="font-size: 11.5px; color: var(--color-text-muted); margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.description || 'Tidak ada deskripsi.'}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 4px; font-size: 11px;">
          <span style="color: #10b981; font-weight: 600;"><i class="fas fa-layer-group"></i> ${p.steps ? p.steps.length : 0} Langkah Pesan</span>
          <div style="display:flex; gap: 6px;">
            <button type="button" class="btn btn-secondary btn-small btn-edit-prog" data-id="${p._id}" style="padding: 2px 8px; font-size: 10.5px;">Edit</button>
            <button type="button" class="btn btn-danger btn-small btn-del-prog" data-id="${p._id}" style="padding: 2px 8px; font-size: 10.5px; background: rgba(239,68,68,0.2); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">Hapus</button>
          </div>
        </div>
      `;

      card.querySelector('.btn-edit-prog').addEventListener('click', (e) => {
        e.stopPropagation();
        editMasterProgram(p._id);
      });

      card.querySelector('.btn-del-prog').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMasterProgram(p._id);
      });

      listContainer.appendChild(card);
    });
  }

  // Helper to create Step Builder Item for Master Form Studio
  function createMasterStepItem(stepData = {}) {
    const stepDiv = document.createElement('div');
    stepDiv.className = 'master-step-item panel glass';
    stepDiv.style.cssText = `padding: 16px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; display: flex; flex-direction: column; gap: 12px;`;

    const offsetVal = stepData.offsetValue !== undefined ? stepData.offsetValue : 1;
    const offsetUnit = stepData.offsetUnit || 'days';
    const timeOfDay = stepData.timeOfDay || '09:00';
    const textVal = stepData.text || '';

    stepDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="step-badge-label" style="font-size: 12px; font-weight: 700; color: var(--accent-primary);">Langkah Pesan</span>
        <button type="button" class="btn btn-danger btn-small btn-remove-master-step" style="padding: 3px 8px; font-size: 10.5px; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);">
          <i class="fas fa-trash-alt"></i> Hapus Step
        </button>
      </div>

      <div style="display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 12px; align-items: center;">
        <div class="form-group" style="margin:0;">
          <label style="font-size: 11px; margin-bottom: 4px;">Jeda Pengiriman</label>
          <div style="display:flex; gap: 6px;">
            <input type="number" class="step-offset-val" min="0" value="${offsetVal}" required style="padding: 8px; font-size: 12.5px; background: #0d0d0d; border: 1px solid #292929; color: #fff; width: 70px;">
            <select class="step-offset-unit" style="padding: 8px; font-size: 12.5px; background: #0d0d0d; border: 1px solid #292929; color: #fff; flex: 1;">
              <option value="days" ${offsetUnit === 'days' ? 'selected' : ''}>Hari (H+)</option>
              <option value="hours" ${offsetUnit === 'hours' ? 'selected' : ''}>Jam</option>
              <option value="minutes" ${offsetUnit === 'minutes' ? 'selected' : ''}>Menit</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin:0;">
          <label style="font-size: 11px; margin-bottom: 4px;">Pukul Target (WIB)</label>
          <input type="time" class="step-time-of-day" value="${timeOfDay}" style="padding: 8px; font-size: 12.5px; background: #0d0d0d; border: 1px solid #292929; color: #fff;">
        </div>

        <div style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-size: 11px; color:var(--color-text-muted);">Sisip Variabel Cepat</label>
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-small btn-insert-var" data-var="{Nama}" style="padding: 3px 6px; font-size: 10px;">+{Nama}</button>
            <button type="button" class="btn btn-secondary btn-small btn-insert-var" data-var="{Nomor}" style="padding: 3px 6px; font-size: 10px;">+{Nomor}</button>
            <button type="button" class="btn btn-secondary btn-small btn-insert-var" data-var="{Link_Drive}" style="padding: 3px 6px; font-size: 10px;">+{Link_Drive}</button>
          </div>
        </div>
      </div>

      <div class="form-group" style="margin:0;">
        <label style="font-size: 11.5px; font-weight: 600; margin-bottom: 4px; display:block;">Pesan Copywriting <span class="required">*</span></label>
        <textarea class="step-text-val" rows="4" required placeholder="Tulis isi pesan follow-up di sini... (Super nyaman untuk mengetik pesan panjang)" style="width: 100%; padding: 12px; font-size: 13px; line-height: 1.5; font-family: 'Inter', sans-serif; background: #080808; border: 1px solid #262626; border-radius: 8px; color: #fff; resize: vertical; min-height: 110px;"></textarea>
      </div>
    `;

    stepDiv.querySelector('.step-text-val').value = textVal;

    stepDiv.querySelector('.btn-remove-master-step').addEventListener('click', () => {
      const container = document.getElementById('master-prog-steps-container');
      if (container.querySelectorAll('.master-step-item').length <= 1) {
        alert('Minimal harus ada 1 langkah (step) pesan!');
        return;
      }
      stepDiv.remove();
      updateStepNumbers();
    });

    stepDiv.querySelectorAll('.btn-insert-var').forEach(btn => {
      btn.addEventListener('click', () => {
        const textarea = stepDiv.querySelector('.step-text-val');
        const v = btn.getAttribute('data-var');
        if (textarea && v) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const text = textarea.value;
          textarea.value = text.substring(0, start) + v + text.substring(end);
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = start + v.length;
        }
      });
    });

    return stepDiv;
  }

  function updateStepNumbers() {
    const container = document.getElementById('master-prog-steps-container');
    if (!container) return;
    const items = container.querySelectorAll('.master-step-item');
    items.forEach((item, idx) => {
      const badge = item.querySelector('.step-badge-label');
      if (badge) badge.textContent = `Langkah #${idx + 1}`;
    });
  }

  // Add Step button in Master Studio
  const btnAddMasterStep = document.getElementById('btn-add-master-step');
  if (btnAddMasterStep) {
    btnAddMasterStep.addEventListener('click', () => {
      const container = document.getElementById('master-prog-steps-container');
      if (container) {
        container.appendChild(createMasterStepItem());
        updateStepNumbers();
      }
    });
  }

  // Reset Master Form
  function resetMasterForm() {
    currentEditingMasterId = null;
    document.getElementById('master-prog-id').value = '';
    document.getElementById('master-prog-name').value = '';
    document.getElementById('master-prog-category').value = '';
    document.getElementById('master-prog-desc').value = '';

    const modeBadge = document.getElementById('master-program-mode-badge');
    if (modeBadge) {
      modeBadge.textContent = 'Program Baru';
      modeBadge.className = 'badge info';
    }

    const container = document.getElementById('master-prog-steps-container');
    if (container) {
      container.innerHTML = '';
      container.appendChild(createMasterStepItem());
      updateStepNumbers();
    }
  }

  const btnResetMaster = document.getElementById('btn-reset-master-form');
  if (btnResetMaster) {
    btnResetMaster.addEventListener('click', resetMasterForm);
  }

  const btnNewMaster = document.getElementById('btn-new-master-program');
  if (btnNewMaster) {
    btnNewMaster.addEventListener('click', resetMasterForm);
  }

  // Edit Master Program
  function editMasterProgram(progId) {
    const prog = masterProgramsList.find(p => p._id === progId);
    if (!prog) return;

    currentEditingMasterId = prog._id;
    document.getElementById('master-prog-id').value = prog._id;
    document.getElementById('master-prog-name').value = prog.name || '';
    document.getElementById('master-prog-category').value = prog.category || '';
    document.getElementById('master-prog-desc').value = prog.description || '';

    const modeBadge = document.getElementById('master-program-mode-badge');
    if (modeBadge) {
      modeBadge.textContent = 'Edit Program';
      modeBadge.className = 'badge running';
    }

    const container = document.getElementById('master-prog-steps-container');
    if (container) {
      container.innerHTML = '';
      if (prog.steps && prog.steps.length > 0) {
        prog.steps.forEach(s => {
          container.appendChild(createMasterStepItem(s));
        });
      } else {
        container.appendChild(createMasterStepItem());
      }
      updateStepNumbers();
    }
  }

  // Delete Master Program
  async function deleteMasterProgram(progId) {
    if (!confirm('Apakah Anda yakin ingin menghapus Master Program ini dari koleksi?')) return;
    try {
      const res = await fetch(`/api/followup-programs/${progId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        loadMasterPrograms();
        if (currentEditingMasterId === progId) {
          resetMasterForm();
        }
      } else {
        alert('Gagal menghapus: ' + data.error);
      }
    } catch (err) {
      alert('Gagal menghapus: ' + err.message);
    }
  }

  // Submit Master Program Form
  const formMasterBuilder = document.getElementById('form-master-program-builder');
  if (formMasterBuilder) {
    formMasterBuilder.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('master-prog-name').value.trim();
      const category = document.getElementById('master-prog-category').value.trim();
      const description = document.getElementById('master-prog-desc').value.trim();

      const container = document.getElementById('master-prog-steps-container');
      const stepItems = container.querySelectorAll('.master-step-item');

      if (stepItems.length === 0) {
        alert('Minimal harus ada 1 langkah pesan!');
        return;
      }

      const steps = [];
      stepItems.forEach((item, idx) => {
        const offsetValue = Number(item.querySelector('.step-offset-val').value) || 0;
        const offsetUnit = item.querySelector('.step-offset-unit').value;
        const timeOfDay = item.querySelector('.step-time-of-day').value || '09:00';
        const text = item.querySelector('.step-text-val').value.trim();

        steps.push({
          stepNumber: idx + 1,
          offsetValue,
          offsetUnit,
          timeOfDay,
          text
        });
      });

      const payload = { name, category, description, steps };
      const progId = document.getElementById('master-prog-id').value;

      const url = progId ? `/api/followup-programs/${progId}` : '/api/followup-programs';
      const method = progId ? 'PUT' : 'POST';

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
          alert('Berhasil menyimpan Master Program!');
          resetMasterForm();
          loadMasterPrograms();
        } else {
          alert('Gagal menyimpan: ' + data.error);
        }
      } catch (err) {
        alert('Terjadi kesalahan: ' + err.message);
      }
    });
  }

  // Load Selected Master Program into Schedule Form Timeline
  const btnApplyPreset = document.getElementById('btn-apply-program-preset-sa');
  if (btnApplyPreset) {
    btnApplyPreset.addEventListener('click', () => {
      const selectPreset = document.getElementById('indiv-program-preset-sa');
      const progId = selectPreset ? selectPreset.value : '';
      if (!progId) {
        alert('Silakan pilih Master Program dari dropdown terlebih dahulu.');
        return;
      }

      const prog = masterProgramsList.find(p => p._id === progId);
      if (!prog) return;

      const container = document.getElementById('indiv-messages-container-sa');
      if (!container) return;
      container.innerHTML = '';

      const now = new Date();

      prog.steps.forEach((s, idx) => {
        const card = createIndivMessageCard();
        
        // Populate text
        const textarea = card.querySelector('.indiv-msg-text');
        if (textarea) textarea.value = s.text;

        // Calculate target datetime based on offset
        const targetDate = new Date(now.getTime());
        if (s.offsetUnit === 'days') {
          targetDate.setDate(targetDate.getDate() + (s.offsetValue || 1));
        } else if (s.offsetUnit === 'hours') {
          targetDate.setHours(targetDate.getHours() + (s.offsetValue || 1));
        } else if (s.offsetUnit === 'minutes') {
          targetDate.setMinutes(targetDate.getMinutes() + (s.offsetValue || 1));
        }

        if (s.timeOfDay) {
          const [hh, mm] = s.timeOfDay.split(':');
          if (hh !== undefined && mm !== undefined) {
            targetDate.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
          }
        }

        // Set time input in card
        const timeInput = card.querySelector('.indiv-msg-time');
        if (timeInput) {
          const year = targetDate.getFullYear();
          const month = String(targetDate.getMonth() + 1).padStart(2, '0');
          const day = String(targetDate.getDate()).padStart(2, '0');
          const hours = String(targetDate.getHours()).padStart(2, '0');
          const mins = String(targetDate.getMinutes()).padStart(2, '0');
          timeInput.value = `${year}-${month}-${day}T${hours}:${mins}`;
        }

        container.appendChild(card);
      });

      alert(`Sukses memuat ${prog.steps.length} langkah pesan dari "${prog.name}" ke linimasa!`);
    });
  }

  // Add Step button in Standalone Schedule Form
  const btnAddStepSa = document.getElementById('btn-add-followup-step-sa');
  if (btnAddStepSa) {
    btnAddStepSa.addEventListener('click', () => {
      const container = document.getElementById('indiv-messages-container-sa');
      if (container) {
        container.appendChild(createIndivMessageCard());
      }
    });
  }

  // Handle Form Submit Standalone Schedule
  const formIndivSa = document.getElementById('form-individual-blast-sa');
  if (formIndivSa) {
    formIndivSa.addEventListener('submit', async (e) => {
      e.preventDefault();

      const senderProfileId = document.getElementById('indiv-profile-sa').value;
      if (!senderProfileId) {
        alert('Silakan pilih profil WhatsApp pengirim.');
        return;
      }

      const phone = document.getElementById('indiv-phone-sa').value.trim();
      const name = document.getElementById('indiv-name-sa').value.trim();

      const container = document.getElementById('indiv-messages-container-sa');
      const cards = container.querySelectorAll('.message-card');

      if (cards.length === 0) {
        alert('Silakan tambahkan minimal 1 pesan follow-up.');
        return;
      }

      const messages = [];
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const text = card.querySelector('.indiv-msg-text').value.trim();
        const instantCheck = card.querySelector('.indiv-msg-instant');
        const isInstant = instantCheck ? instantCheck.checked : false;

        let scheduledTime = null;
        if (!isInstant) {
          const timeInput = card.querySelector('.indiv-msg-time');
          scheduledTime = timeInput ? timeInput.value : null;
        }

        const buttons = card.getButtons();
        messages.push({
          messageText: text,
          imageBase64: card.getImageBase64(),
          buttons,
          scheduledTime
        });
      }

      // Submit each scheduled message as individual campaign
      try {
        let successCount = 0;
        for (const msg of messages) {
          const payload = {
            name: `Individu - ${name || phone}`,
            senderProfiles: [senderProfileId],
            scheduledTime: msg.scheduledTime || new Date().toISOString(),
            messageTemplate: msg.messageText,
            imageBase64: msg.imageBase64,
            buttons: msg.buttons,
            contacts: [{ name: name || phone, phone }]
          };

          const res = await fetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) successCount++;
        }

        alert(`Sukses menjadwalkan ${successCount} pesan follow-up untuk ${name || phone}!`);
        formIndivSa.reset();
        container.innerHTML = '';
        container.appendChild(createIndivMessageCard());
      } catch (err) {
        alert('Terjadi kesalahan: ' + err.message);
      }
    });
  }

  // Populate WA Profile selects on tab load
  async function populateProfilesDropdown() {
    try {
      const res = await fetch('/api/profiles');
      const profiles = await res.json();
      const selectSa = document.getElementById('indiv-profile-sa');
      if (selectSa) {
        selectSa.innerHTML = '<option value="">-- Pilih Profil WA --</option>';
        profiles.forEach(p => {
          const opt = document.value = p.profileId;
          const optionEl = document.createElement('option');
          optionEl.value = p.profileId;
          optionEl.textContent = `${p.name} (${p.phone || p.status})`;
          selectSa.appendChild(optionEl);
        });
      }
    } catch (e) {}
  }

  // Auto initialize on tab switch
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      if (tab === 'blast-individu-tab') {
        loadMasterPrograms();
        populateProfilesDropdown();
        const saContainer = document.getElementById('indiv-messages-container-sa');
        if (saContainer && saContainer.querySelectorAll('.message-card').length === 0) {
          saContainer.appendChild(createIndivMessageCard());
        }
      }
    });
  });

  // Initial load
  resetMasterForm();
  loadMasterPrograms();
})();

