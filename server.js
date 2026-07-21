require('dotenv').config();
const express = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const qrcode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const { connectDB, WAProfile, Campaign, MessageLog, AutoReply, Setting } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_blast';

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Global state
const clients = new Map(); // key: profileId, value: whatsapp-web.js Client instance
const sseClients = [];
let isSchedulerRunning = false;
// Portable MongoDB configuration & process lifecycles
let mongodProcess = null;
function startPortableMongoDB() {
  return new Promise((resolve) => {
    const isPackaged = __dirname.includes('app.asar');
    const binDir = isPackaged 
      ? path.join(__dirname, '..', '..', 'bin')
      : path.join(__dirname, 'bin');
    const mongodPath = path.join(binDir, 'mongod.exe');

    if (!fs.existsSync(mongodPath)) {
      console.log('ℹ️ Portable MongoDB binary not found, using default system MongoDB.');
      return resolve(MONGODB_URI); // Use default DB URI
    }

    const dataDir = path.join(
      process.env.LOCALAPPDATA || process.env.APPDATA || __dirname,
      'whatsapp-blast-desktop',
      'db-data'
    );

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    console.log(`Starting portable MongoDB at "${dataDir}" on port 27018...`);
    
    mongodProcess = spawn(mongodPath, [
      '--dbpath', dataDir,
      '--port', '27018',
      '--bind_ip', '127.0.0.1'
    ]);

    let resolved = false;

    mongodProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Waiting for connections') && !resolved) {
        resolved = true;
        console.log('✅ Portable MongoDB started successfully.');
        resolve('mongodb://127.0.0.1:27018/whatsapp_blast');
      }
    });

    mongodProcess.stderr.on('data', (data) => {
      // Don't clutter logs with warnings
    });

    mongodProcess.on('close', (code) => {
      console.log(`Portable MongoDB process exited with code ${code}`);
    });

    // Timeout fallback if already running
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve('mongodb://127.0.0.1:27018/whatsapp_blast');
      }
    }, 4000);
  });
}

// Clean up database process on server exit
process.on('exit', () => {
  if (mongodProcess) mongodProcess.kill();
});
process.on('SIGINT', () => {
  if (mongodProcess) mongodProcess.kill();
  process.exit();
});

// Helper to get system Chrome or Edge path for Puppeteer
function getSystemChromePath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      console.log(`Found system browser for Puppeteer: ${p}`);
      return p;
    }
  }
  return null;
}

// Licensing system configuration (Multi-Server GAS Router for High Availability & Failover)
const LICENSE_API_URLS = [
  'https://script.google.com/macros/s/AKfycbwX-1q10hQPj6DFFTOAXgpirJHzYPCNT0kUbFBV58WxoxQK61t9csoeLtcFB8yV2Z3Z/exec', // Server 1 Utama
  'https://script.google.com/macros/s/AKfycbzpYb-rgraC8ROBObzXqZXf5DiyrXtMUiOTcLct1fquK-rULww9v7163ebFqI7E-Fx0QQ/exec', // Server 2 Cadangan
  'https://script.google.com/macros/s/AKfycbyEX4N9LmHP9rl037ymPSRO5ukLekPsXkc_DgCw_mmDQUpdL-MJ22nPzS3NhrEp4Xx9Sw/exec'  // Server 3 Cadangan
];
let isLicenseActive = false;

// Helper Router untuk Failover & Load Balancing ke Multi-Server GAS
async function fetchWithGASFailover(bodyData, timeoutMs = 6000) {
  let lastError = null;
  // Acak urutan server awal (Load Balancing) agar beban terbagi rata
  const startIdx = Math.floor(Math.random() * LICENSE_API_URLS.length);
  
  for (let i = 0; i < LICENSE_API_URLS.length; i++) {
    const targetIdx = (startIdx + i) % LICENSE_API_URLS.length;
    const url = LICENSE_API_URLS[targetIdx];
    
    try {
      console.log(`[License Router] Mencoba verifikasi lisensi via GAS Server #${targetIdx + 1}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const data = await response.json();
      console.log(`[License Router] GAS Server #${targetIdx + 1} merespon sukses!`);
      return data;
    } catch (err) {
      console.warn(`[License Router] GAS Server #${targetIdx + 1} gagal/timeout (${err.message}). Mencoba server cadangan...`);
      lastError = err;
    }
  }
  
  throw new Error(`Semua (${LICENSE_API_URLS.length}) Server GAS Lisensi gagal merespon. Error: ${lastError ? lastError.message : 'Unknown'}`);
}

// Helper to get computer hardware motherboard UUID
function getMotherboardUUID() {
  return new Promise((resolve) => {
    exec('wmic csproduct get uuid', (err, stdout) => {
      if (err) {
        exec('powershell -Command "(Get-CimInstance Win32_ComputerSystemProduct).Uuid"', (err2, stdout2) => {
          if (err2) {
            resolve('unknown-windows-device');
          } else {
            resolve(stdout2.trim());
          }
        });
      } else {
        const lines = stdout.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length > 1) {
          resolve(lines[1]);
        } else {
          resolve('unknown-windows-device');
        }
      }
    });
  });
}

let licenseExpiryDate = null;

// Validator to verify license status online
async function validateLicenseOnline(licenseKey) {
  try {
    const hwid = await getMotherboardUUID();
    const data = await fetchWithGASFailover({ licenseKey, hwid }, 6000);
    
    if (data.success) {
      licenseExpiryDate = data.expiryDate || null;
      if (licenseExpiryDate) {
        await Setting.findOneAndUpdate(
          { key: 'licenseExpiry' },
          { value: licenseExpiryDate },
          { upsert: true }
        );
      }
      if (data.devicesUsed !== undefined) {
        await Setting.findOneAndUpdate(
          { key: 'licenseDevicesUsed' },
          { value: data.devicesUsed.toString() },
          { upsert: true }
        );
      }
      if (data.maxDevices !== undefined) {
        await Setting.findOneAndUpdate(
          { key: 'licenseMaxDevices' },
          { value: data.maxDevices.toString() },
          { upsert: true }
        );
      }
    }
    return data.success;
  } catch (e) {
    console.log('Error validating license online via GAS Router, falling back to local cached activation:', e.message);
    try {
      const cachedExpiry = await Setting.findOne({ key: 'licenseExpiry' });
      if (cachedExpiry) {
        licenseExpiryDate = cachedExpiry.value;
      }
    } catch (dbErr) {
      console.error('Failed to load cached expiry date:', dbErr.message);
    }
    return true; // Fallback to true if network/Google Sheets is down/offline
  }
}
// Legacy global fallbacks to prevent ReferenceErrors
let connectionState = 'disconnected';
let qrData = null;
let client = null;

// Format phone number to WhatsApp JID format for whatsapp-web.js (@c.us)
function formatWhatsAppNumber(phone) {
  let cleaned = phone.toString().replace(/\D/g, ''); // keep only digits
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  if (!cleaned.endsWith('@c.us')) {
    cleaned = cleaned + '@c.us';
  }
  return cleaned;
}

// Helper to send message with optional image (base64) and buttons (formatted as text links)
async function sendMessageHelper(profileId, jid, text, imageBase64, buttons) {
  const clientInstance = clients.get(profileId);
  const profile = await WAProfile.findOne({ profileId });
  
  if (!clientInstance || !profile || profile.status !== 'connected') {
    throw new Error(`WhatsApp profile "${profileId}" is not connected.`);
  }

  let finalMessage = text;

  // Format buttons as styled links or reply helpers at the bottom of the message
  if (buttons && Array.isArray(buttons) && buttons.length > 0) {
    finalMessage += '\n\n------------------------\n';
    buttons.forEach(btn => {
      if (btn.type === 'cta_url') {
        finalMessage += `\n🔗 *${btn.text}* : ${btn.value}`;
      } else {
        // Quick reply helper text
        finalMessage += `\n🔘 *${btn.text}* (Ketik: _${btn.value}_)`;
      }
    });
  }

  let sentMsg;
  if (imageBase64) {
    // Extract MIME type and raw base64 data
    const mimeMatch = imageBase64.match(/data:([^;]+);base64/);
    const mimetype = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Data = imageBase64.split(',')[1];
    
    // Construct MessageMedia object
    const media = new MessageMedia(mimetype, base64Data, 'media-image');
    
    // Send image with caption (caption is the text/finalMessage)
    sentMsg = await clientInstance.sendMessage(jid, media, { caption: finalMessage });
  } else {
    // Send plain text message
    sentMsg = await clientInstance.sendMessage(jid, finalMessage);
  }
  return sentMsg;
}

// A/B Testing Weighted Randomizer
function getWeightedRandomTemplate(templates) {
  if (!templates || templates.length === 0) return null;
  
  const totalWeight = templates.reduce((acc, t) => acc + (Number(t.weight) || 0), 0);
  if (totalWeight <= 0) {
    const rndIndex = Math.floor(Math.random() * templates.length);
    return templates[rndIndex];
  }
  
  let rnd = Math.random() * totalWeight;
  for (const template of templates) {
    if (rnd < template.weight) {
      return template;
    }
    rnd -= template.weight;
  }
  
  return templates[templates.length - 1];
}

// Broadcast SSE updates to all connected clients
function broadcastSSE(data) {
  sseClients.forEach(res => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Connect specific WhatsApp Profile Web via Puppeteer
async function connectToWhatsApp(profileId) {
  try {
    const profile = await WAProfile.findOne({ profileId });
    if (!profile) {
      console.error(`Profile not found for ID: ${profileId}`);
      return;
    }

    // Check if already active
    if (clients.has(profileId)) {
      console.log(`WhatsApp profile ${profileId} is already connecting/connected.`);
      return;
    }

    profile.status = 'connecting';
    profile.qrData = null;
    await profile.save();

    broadcastSSE({
      type: 'profile-status',
      profileId,
      status: 'connecting',
      qrData: null
    });

    const sessionDir = path.join(__dirname, 'data', `session_${profileId}`);
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
      fs.mkdirSync(path.join(__dirname, 'data'));
    }

    const chromePath = getSystemChromePath();
    const puppeteerOptions = {
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-extensions',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      ]
    };
    if (chromePath) {
      puppeteerOptions.executablePath = chromePath;
    }

    const clientInstance = new Client({
      authStrategy: new LocalAuth({
        clientId: `profile_${profileId}`,
        dataPath: sessionDir
      }),
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
      },
      puppeteer: puppeteerOptions
    });

    clients.set(profileId, clientInstance);

    clientInstance.on('qr', async (qr) => {
      try {
        const url = await qrcode.toDataURL(qr);
        profile.status = 'scanning';
        profile.qrData = url;
        await profile.save();

        broadcastSSE({
          type: 'profile-status',
          profileId,
          status: 'scanning',
          qrData: url
        });
        console.log(`Profile "${profile.name}" (${profileId}) QR generated.`);
      } catch (err) {
        console.error('Error generating QR code:', err);
      }
    });

    clientInstance.on('ready', async () => {
      try {
        profile.status = 'connected';
        profile.qrData = null;
        
        let phoneNum = '';
        if (clientInstance.info && clientInstance.info.wid) {
          phoneNum = clientInstance.info.wid.user;
        }
        profile.phone = phoneNum;
        profile.connectedAt = new Date();
        await profile.save();

        broadcastSSE({
          type: 'profile-status',
          profileId,
          status: 'connected',
          qrData: null,
          phone: phoneNum
        });
        console.log(`Profile "${profile.name}" (${profileId}) is ready and connected!`);
      } catch (err) {
        console.error('Error handling ready state:', err);
      }
    });

    clientInstance.on('message_ack', async (msg, ack) => {
      if (ack === 4) {
        try {
          const log = await MessageLog.findOne({
            $or: [
              { messageId: msg.id.id },
              { messageId: msg.id._serialized }
            ]
          });
          if (log && log.feedbackStatus !== 'replied') {
            log.feedbackStatus = 'read';
            await log.save();
            broadcastSSE({ type: 'message-read', logId: log._id, campaignId: log.campaignId });
          }
        } catch (err) {
          console.error('Error handling message_ack:', err);
        }
      }
    });

    clientInstance.on('message', async (msg) => {
      if (!msg.body) return;

      const incomingText = msg.body.trim().toLowerCase();
      const senderJid = msg.from;
      const cleanPhone = senderJid.replace('@c.us', '').replace('@g.us', '');
      const isGroupMsg = msg.isGroup || senderJid.endsWith('@g.us');

      // A/B Testing Feedback Loop
      try {
        let matchedLog = null;
        if (msg.hasQuotedMsg) {
          const quoted = await msg.getQuotedMessage();
          if (quoted && quoted.id) {
            matchedLog = await MessageLog.findOne({
              $or: [
                { messageId: quoted.id.id },
                { messageId: quoted.id._serialized }
              ]
            });
          }
        }
        if (!matchedLog) {
          matchedLog = await MessageLog.findOne({
            phone: cleanPhone,
            status: 'sent',
            senderProfileId: profileId
          }).sort({ sentAt: -1 });
        }
        if (matchedLog && matchedLog.feedbackStatus !== 'replied') {
          matchedLog.feedbackStatus = 'replied';
          matchedLog.replyText = msg.body ? msg.body.trim() : '';
          matchedLog.repliedAt = new Date();
          await matchedLog.save();
          console.log(`[A/B Testing] Response from ${cleanPhone} on profile ${profileId}.`);
          broadcastSSE({
            type: 'message-replied',
            logId: matchedLog._id,
            campaignId: matchedLog.campaignId,
            replyText: matchedLog.replyText
          });
        }
      } catch (fbErr) {
        console.error('Error recording message reply feedback:', fbErr);
      }

      // Quick Reply Autoreply check
      try {
        const campaign = await Campaign.findOne({
          $or: [
            {
              'buttons': {
                $elemMatch: {
                  type: 'quick_reply',
                  value: incomingText
                }
              }
            },
            {
              'messageTemplates.buttons': {
                $elemMatch: {
                  type: 'quick_reply',
                  value: incomingText
                }
              }
            }
          ]
        }).sort({ createdAt: -1 });

        if (campaign) {
          let btn = null;
          if (campaign.buttons && campaign.buttons.length > 0) {
            btn = campaign.buttons.find(b => b.type === 'quick_reply' && b.value.toLowerCase() === incomingText);
          }
          if (!btn && campaign.messageTemplates && campaign.messageTemplates.length > 0) {
            for (const t of campaign.messageTemplates) {
              if (t.buttons && t.buttons.length > 0) {
                const found = t.buttons.find(b => b.type === 'quick_reply' && b.value.toLowerCase() === incomingText);
                if (found) {
                  btn = found;
                  break;
                }
              }
            }
          }
          if (btn && btn.replyText && btn.replyText.trim()) {
            console.log(`[Chatbot] Auto-reply triggered for ${senderJid} matching keyword "${incomingText}"`);

            await clientInstance.sendMessage(senderJid, btn.replyText.trim());

            const chatbotCampaignName = `Chatbot - ${campaign.name}`;
            const userLog = await MessageLog.findOne({ phone: cleanPhone }).sort({ createdAt: -1 });
            const userName = userLog ? userLog.name : 'Pelanggan';

            let replyCampaign = await Campaign.findOne({ name: chatbotCampaignName });
            if (!replyCampaign) {
              replyCampaign = new Campaign({
                name: chatbotCampaignName,
                messageTemplate: btn.replyText.trim(),
                scheduledTime: new Date(),
                status: 'completed'
              });
              await replyCampaign.save();
            }

            const log = new MessageLog({
              campaignId: replyCampaign._id,
              campaignName: replyCampaign.name,
              senderProfileId: profileId,
              phone: cleanPhone,
              name: userName,
              messageText: btn.replyText.trim(),
              status: 'sent',
              sentAt: new Date()
            });
            await log.save();

            broadcastSSE({
              type: 'message-sent',
              campaignId: replyCampaign._id,
              logId: log._id,
              phone: cleanPhone,
              name: log.name,
              status: 'sent',
              sentAt: log.sentAt
            });
            return;
          }
        }

        // AutoReply Global Rules check (filtered by active profile JID/ID)
        const rules = await AutoReply.find({ 
          isActive: true, 
          $or: [{ profileId: 'all' }, { profileId: profileId }] 
        });
        let matchedRule = null;

        for (const rule of rules) {
          if (rule.targetType === 'personal' && isGroupMsg) continue;
          if (rule.targetType === 'groups') {
            if (!isGroupMsg) continue;
            if (rule.targetGroupIds && rule.targetGroupIds.length > 0) {
              if (!rule.targetGroupIds.includes(senderJid)) continue;
            }
          }

          if (rule.isRegex) {
            try {
              const rx = new RegExp(rule.keyword, 'i');
              if (rx.test(incomingText)) {
                matchedRule = rule;
                break;
              }
            } catch (rxErr) {
              console.error(`Invalid regex rule keyword: ${rule.keyword}`, rxErr);
            }
          } else {
            if (incomingText === rule.keyword.trim().toLowerCase()) {
              matchedRule = rule;
              break;
            }
          }
        }

        if (matchedRule) {
          const delaySec = Math.floor(Math.random() * (matchedRule.delayMax - matchedRule.delayMin + 1)) + matchedRule.delayMin;
          console.log(`[AutoReply Bot] Match found. Replying in ${delaySec} seconds.`);

          setTimeout(async () => {
            try {
              if (clients.get(profileId) !== clientInstance) return;

              await clientInstance.sendMessage(senderJid, matchedRule.replyText.trim());

              const botCampaignName = `Bot AutoReply - ${matchedRule.keyword}`;
              let replyCampaign = await Campaign.findOne({ name: botCampaignName });
              if (!replyCampaign) {
                replyCampaign = new Campaign({
                  name: botCampaignName,
                  messageTemplate: matchedRule.replyText.trim(),
                  scheduledTime: new Date(),
                  status: 'completed'
                });
                await replyCampaign.save();
              }

              const userLog = await MessageLog.findOne({ phone: cleanPhone }).sort({ createdAt: -1 });
              const userName = userLog ? userLog.name : 'Pelanggan';

              const log = new MessageLog({
                campaignId: replyCampaign._id,
                campaignName: replyCampaign.name,
                senderProfileId: profileId,
                phone: cleanPhone,
                name: userName,
                messageText: matchedRule.replyText.trim(),
                status: 'sent',
                sentAt: new Date()
              });
              await log.save();

              broadcastSSE({
                type: 'message-sent',
                campaignId: replyCampaign._id,
                logId: log._id,
                phone: cleanPhone,
                name: log.name,
                status: 'sent',
                sentAt: log.sentAt
              });

            } catch (sendErr) {
              console.error('Error sending auto-reply:', sendErr);
            }
          }, delaySec * 1000);
        }
      } catch (err) {
        console.error('Error handling incoming message auto-reply:', err);
      }
    });

    clientInstance.on('authenticated', () => {
      console.log(`Profile ${profileId} authenticated successfully.`);
    });

    clientInstance.on('auth_failure', async (msg) => {
      console.error(`Profile ${profileId} auth failure:`, msg);
      try {
        profile.status = 'disconnected';
        profile.qrData = null;
        await profile.save();

        broadcastSSE({
          type: 'profile-status',
          profileId,
          status: 'disconnected',
          qrData: null
        });
        clients.delete(profileId);
      } catch (err) {
        console.error('Error handling profile auth failure:', err);
      }
    });

    clientInstance.on('disconnected', async (reason) => {
      console.log(`Profile ${profileId} disconnected. Reason:`, reason);
      try {
        profile.status = 'disconnected';
        profile.qrData = null;
        await profile.save();

        broadcastSSE({
          type: 'profile-status',
          profileId,
          status: 'disconnected',
          qrData: null
        });

        // Clear instance
        try {
          clientInstance.destroy();
        } catch (e) {}
        clients.delete(profileId);

        // Delete session files
        if (fs.existsSync(sessionDir)) {
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            console.log(`Session auth dir for ${profileId} deleted.`);
          } catch (err) {
            console.error('Failed to delete session dir:', err.message);
          }
        }
      } catch (err) {
        console.error('Error handling profile disconnect:', err);
      }
    });

    console.log(`Initializing Puppeteer browser client for profile ${profileId}...`);
    await clientInstance.initialize();

  } catch (error) {
    console.error(`Error in connectToWhatsApp for profile ${profileId}:`, error);
    try {
      const profile = await WAProfile.findOne({ profileId });
      if (profile) {
        profile.status = 'disconnected';
        profile.qrData = null;
        await profile.save();
        broadcastSSE({ type: 'profile-status', profileId, status: 'disconnected', qrData: null });
      }
    } catch (e) {}
    clients.delete(profileId);
  }
}

// Background scheduler
let isProcessing = false;
async function startScheduler() {
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;

  console.log('Scheduler started. Scanning queue every 10 seconds.');

  setInterval(async () => {
    if (!isLicenseActive) return;
    if (isProcessing) return;

    try {
      // Find the oldest pending campaign that is due for execution
      const campaign = await Campaign.findOne({
        status: 'pending',
        scheduledTime: { $lte: new Date() }
      }).sort({ scheduledTime: 1 });

      if (!campaign) return;

      isProcessing = true;
      console.log(`Executing campaign: "${campaign.name}" (${campaign._id})`);

      campaign.status = 'running';
      await campaign.save();
      broadcastSSE({ type: 'campaign-started', campaignId: campaign._id, campaignName: campaign.name });

      // Fetch pending logs for this campaign
      const logs = await MessageLog.find({
        campaignId: campaign._id,
        status: 'pending'
      });

      console.log(`Total messages to send: ${logs.length}`);

      let senderIndex = 0;
      let consecutiveFailures = 0;
      const ANTI_BAN_FAILURE_THRESHOLD = 3;

      for (const log of logs) {
        // Re-check campaign cancel or pause status
        const currentCampaign = await Campaign.findById(campaign._id);
        if (!currentCampaign || currentCampaign.status === 'cancelled' || currentCampaign.status === 'paused') {
          console.log(`Campaign "${campaign.name}" is ${currentCampaign ? currentCampaign.status : 'deleted'}. Halting sending loop.`);
          break;
        }

        // Re-evaluate active profiles
        let activeProfiles = [];
        const assigned = campaign.senderProfiles && campaign.senderProfiles.length > 0
          ? campaign.senderProfiles
          : Array.from(clients.keys());
        
        for (const pid of assigned) {
          const prof = await WAProfile.findOne({ profileId: pid });
          if (prof && prof.status === 'connected' && clients.has(pid)) {
            activeProfiles.push(pid);
          }
        }

        // Wait until at least one profile is connected
        while (activeProfiles.length === 0) {
          console.log('No assigned WhatsApp profiles are connected. Pausing blast sending...');
          const checkCancel = await Campaign.findById(campaign._id);
          if (!checkCancel || checkCancel.status === 'cancelled' || checkCancel.status === 'paused') {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 5000));

          activeProfiles = [];
          const reassigned = campaign.senderProfiles && campaign.senderProfiles.length > 0
            ? campaign.senderProfiles
            : Array.from(clients.keys());
          
          for (const pid of reassigned) {
            const prof = await WAProfile.findOne({ profileId: pid });
            if (prof && prof.status === 'connected' && clients.has(pid)) {
              activeProfiles.push(pid);
            }
          }
        }

        const reCheckCancel = await Campaign.findById(campaign._id);
        if (!reCheckCancel || reCheckCancel.status === 'cancelled' || reCheckCancel.status === 'paused') {
          console.log(`Campaign "${campaign.name}" was cancelled/paused during pause.`);
          break;
        }

        // Select profile round-robin
        const selectedProfileId = activeProfiles[senderIndex % activeProfiles.length];
        senderIndex++;

        // Parse variables in template
        let selectedTemplate = null;
        let templateText = campaign.messageTemplate;
        let variationId = null;

        if (campaign.messageTemplates && campaign.messageTemplates.length > 0) {
          selectedTemplate = getWeightedRandomTemplate(campaign.messageTemplates);
          if (selectedTemplate) {
            templateText = selectedTemplate.text;
            variationId = selectedTemplate.id;
          }
        }

        // Parse variables in template
        let messageText = templateText || '';
        messageText = messageText.replace(/{Nama}/gi, log.name);
        messageText = messageText.replace(/{Nomor}/gi, log.phone);
        
        if (log.variables) {
          for (const [key, val] of log.variables.entries()) {
            const regex = new RegExp(`{${key}}`, 'gi');
            messageText = messageText.replace(regex, val);
          }
        }

        log.messageText = messageText;
        log.variationId = variationId;
        log.senderProfileId = selectedProfileId;
        log.feedbackStatus = 'pending';

        try {
          const jid = formatWhatsAppNumber(log.phone);
          console.log(`Sending to ${log.name} (${jid}) using profile "${selectedProfileId}"...`);

          const imageToSend = (selectedTemplate && selectedTemplate.imageBase64) ? selectedTemplate.imageBase64 : campaign.imageBase64;
          const buttonsToSend = (selectedTemplate && selectedTemplate.buttons && selectedTemplate.buttons.length > 0) ? selectedTemplate.buttons : campaign.buttons;
          const sentMsg = await sendMessageHelper(selectedProfileId, jid, messageText, imageToSend, buttonsToSend);
          if (sentMsg && sentMsg.id) {
            log.messageId = sentMsg.id.id;
          }

          log.status = 'sent';
          log.sentAt = new Date();
          await log.save();

          // Reset consecutive failure counter on successful delivery
          consecutiveFailures = 0;

          broadcastSSE({
            type: 'message-sent',
            campaignId: campaign._id,
            logId: log._id,
            phone: log.phone,
            name: log.name,
            status: 'sent',
            sentAt: log.sentAt
          });

        } catch (sendErr) {
          console.error(`Failed to send message to ${log.phone}:`, sendErr.message);
          log.status = 'failed';
          log.error = sendErr.message;
          await log.save();

          consecutiveFailures++;
          console.warn(`[Anti-Ban Guard 🛡️] Failure count: ${consecutiveFailures}/${ANTI_BAN_FAILURE_THRESHOLD} for campaign "${campaign.name}"`);

          broadcastSSE({
            type: 'message-failed',
            campaignId: campaign._id,
            logId: log._id,
            phone: log.phone,
            name: log.name,
            status: 'failed',
            error: sendErr.message
          });

          // Trigger Emergency Auto-Pause if failure threshold is reached
          if (consecutiveFailures >= ANTI_BAN_FAILURE_THRESHOLD) {
            console.warn(`[Anti-Ban Guard 🛡️] EMERGENCY AUTO-PAUSE TRIGGERED for campaign "${campaign.name}"! Protecting WhatsApp numbers.`);
            
            const campaignToPause = await Campaign.findById(campaign._id);
            if (campaignToPause && campaignToPause.status === 'running') {
              campaignToPause.status = 'paused';
              await campaignToPause.save();
              
              broadcastSSE({
                type: 'campaign-auto-paused',
                campaignId: campaign._id,
                campaignName: campaign.name,
                reason: `🛡️ Anti-Ban Guard: Kampanye otomatis di-pause setelah ${consecutiveFailures} kegagalan pengiriman beruntun untuk mencegah pembatasan/pemblokiran nomor WhatsApp Anda.`
              });
            }
            break; // Exit sending loop immediately
          }
        }

        // Delay to avoid spam detection
        const delaySec = Math.floor(Math.random() * (campaign.delayMax - campaign.delayMin + 1)) + campaign.delayMin;
        console.log(`Sleeping for ${delaySec} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
      }

      // Mark campaign as completed if still running
      const finalCampaign = await Campaign.findById(campaign._id);
      if (finalCampaign && finalCampaign.status === 'running') {
        finalCampaign.status = 'completed';
        await finalCampaign.save();
        console.log(`Campaign "${campaign.name}" completed successfully.`);
        broadcastSSE({ type: 'campaign-completed', campaignId: campaign._id, campaignName: campaign.name });
      }

    } catch (err) {
      console.error('Error during campaign execution loop:', err);
    } finally {
      isProcessing = false;
    }
  }, 10000);
}

// --- REST API Endpoints ---

// Real-time Connection SSE
app.get('/api/connection-status', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Write initial data
  res.write(`data: ${JSON.stringify({ type: 'status', connectionState, qrData })}\n\n`);

  sseClients.push(res);
  console.log(`SSE Client connected. Total: ${sseClients.length}`);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) {
      sseClients.splice(idx, 1);
    }
    console.log(`SSE Client disconnected. Total: ${sseClients.length}`);
  });
});

// Start connection manually
app.post('/api/connect', async (req, res) => {
  if (connectionState === 'disconnected') {
    connectToWhatsApp();
    res.json({ success: true, message: 'Initiated connection process.' });
  } else {
    res.status(400).json({ error: `Connection is already in state: ${connectionState}` });
  }
});

// Terminate/Log out WhatsApp connection
app.post('/api/disconnect', async (req, res) => {
  connectionState = 'disconnected';
  qrData = null;
  broadcastSSE({ type: 'status', connectionState, qrData });

  if (client) {
    try {
      await client.logout();
      await client.destroy();
    } catch (e) {
      console.log('Ignored error during WhatsApp logout:', e.message);
    }
    client = null;
  }

  const sessionDir = path.join(__dirname, 'data', 'session');
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log('Manually deleted auth session folder.');
    } catch (err) {
      console.error('Error cleaning session folder:', err.message);
    }
  }

  res.json({ success: true, message: 'Disconnected and session cleared.' });
});

// Send individual blast message immediately or schedule multiple follow-ups
app.post('/api/send-individual', async (req, res) => {
  const { phone, name, messages, senderProfileId } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Missing phone number.' });
  }

  // Standardize incoming message items
  let msgList = [];
  if (messages && Array.isArray(messages) && messages.length > 0) {
    msgList = messages;
  } else {
    // Fallback to single message structure for backwards compatibility
    const { messageText, imageBase64, buttons, scheduledTime } = req.body;
    if (!messageText) {
      return res.status(400).json({ error: 'Missing message text.' });
    }
    msgList.push({ messageText, imageBase64, buttons, scheduledTime });
  }

  // Find selected sender profile
  const selectedProfileId = senderProfileId || Array.from(clients.keys())[0];
  if (!selectedProfileId) {
    return res.status(400).json({ error: 'Tidak ada profil WhatsApp yang terhubung.' });
  }

  const clientInstance = clients.get(selectedProfileId);
  const profile = await WAProfile.findOne({ profileId: selectedProfileId });

  // Check if we have any immediate message. If yes, check connection
  const hasImmediate = msgList.some(m => !m.scheduledTime);
  if (hasImmediate && (!clientInstance || !profile || profile.status !== 'connected')) {
    return res.status(400).json({ error: `Profil WhatsApp "${selectedProfileId}" belum terhubung. Tidak dapat mengirim pesan instan.` });
  }

  try {
    const results = [];

    for (let i = 0; i < msgList.length; i++) {
      const msgItem = msgList[i];
      const { messageText, imageBase64, buttons, scheduledTime } = msgItem;
      const isScheduled = !!scheduledTime;

      // Create campaign
      const campaignSuffix = msgList.length > 1 ? ` (Follow-up #${i + 1})` : '';
      const campaign = new Campaign({
        name: `Individu - ${name || phone}${campaignSuffix}`,
        messageTemplate: messageText,
        senderProfiles: [selectedProfileId],
        scheduledTime: isScheduled ? new Date(scheduledTime) : new Date(),
        status: isScheduled ? 'pending' : 'running',
        imageBase64: imageBase64 || null,
        buttons: buttons || []
      });
      await campaign.save();

      // Create log
      const log = new MessageLog({
        campaignId: campaign._id,
        campaignName: campaign.name,
        senderProfileId: selectedProfileId,
        phone,
        name: name || 'Pelanggan',
        variables: {},
        messageText,
        status: 'pending'
      });
      await log.save();

      if (isScheduled) {
        console.log(`[Follow-up] Scheduled message to ${phone} using profile "${selectedProfileId}" at ${scheduledTime}.`);
        results.push({ campaignId: campaign._id, status: 'scheduled', time: scheduledTime });
      } else {
        // Send immediately
        const jid = formatWhatsAppNumber(phone);
        try {
          const sentMsg = await sendMessageHelper(selectedProfileId, jid, messageText, imageBase64, buttons);
          if (sentMsg && sentMsg.id) {
            log.messageId = sentMsg.id.id;
          }

          log.status = 'sent';
          log.sentAt = new Date();
          log.feedbackStatus = 'sent';
          await log.save();

          campaign.status = 'completed';
          await campaign.save();

          // Broadcast SSE log updates
          broadcastSSE({
            type: 'message-sent',
            campaignId: campaign._id,
            logId: log._id,
            phone,
            name: log.name,
            status: 'sent',
            sentAt: log.sentAt
          });

          results.push({ campaignId: campaign._id, status: 'sent' });

        } catch (sendErr) {
          log.status = 'failed';
          log.error = sendErr.message;
          await log.save();

          campaign.status = 'completed';
          await campaign.save();

          broadcastSSE({
            type: 'message-failed',
            campaignId: campaign._id,
            logId: log._id,
            phone,
            name: log.name,
            status: 'failed',
            error: sendErr.message
          });

          // Throw to outer block if this is the only message, otherwise record error
          if (msgList.length === 1) {
            throw sendErr;
          } else {
            results.push({ campaignId: campaign._id, status: 'failed', error: sendErr.message });
          }
        }
      }
    }

    res.json({ success: true, message: 'Follow-up messages processed successfully.', details: results });

  } catch (error) {
    console.error('Multiple follow-up individual send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new Blast Campaign
app.post('/api/campaigns', async (req, res) => {
  if (!isLicenseActive) {
    return res.status(403).json({ error: 'Aplikasi belum diaktifkan. Silakan masukkan Lisensi yang valid.' });
  }
  const { name, messageTemplate, messageTemplates, senderProfiles, scheduledTime, delayMin, delayMax, contacts, imageBase64, buttons } = req.body;

  if (!name || (!messageTemplate && (!messageTemplates || messageTemplates.length === 0)) || !scheduledTime || !contacts || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters (either messageTemplate or messageTemplates is required) or empty contacts list.' });
  }

  try {
    const campaign = new Campaign({
      name,
      messageTemplate: messageTemplate || '',
      messageTemplates: messageTemplates || [],
      senderProfiles: senderProfiles || [],
      scheduledTime: new Date(scheduledTime),
      delayMin: Number(delayMin) || 5,
      delayMax: Number(delayMax) || 15,
      status: 'pending',
      imageBase64: imageBase64 || null,
      buttons: buttons || []
    });

    await campaign.save();

    // Map contacts to MessageLog items
    const logs = contacts.map(c => ({
      campaignId: campaign._id,
      campaignName: campaign.name,
      phone: c.phone,
      name: c.name || 'Pelanggan',
      variables: c.variables || {},
      status: 'pending',
      messageText: messageTemplate || '' // Will be resolved dynamically per recipient at send time
    }));

    await MessageLog.insertMany(logs);

    console.log(`Scheduled campaign "${name}" with ${contacts.length} recipients.`);
    res.status(201).json({ success: true, campaignId: campaign._id });

  } catch (error) {
    console.error('Failed to create campaign:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get all Campaigns list with stats
app.get('/api/campaigns', async (req, res) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 });
    
    // Enrich with statistics
    const enrichedCampaigns = await Promise.all(campaigns.map(async (c) => {
      const total = await MessageLog.countDocuments({ campaignId: c._id });
      const sent = await MessageLog.countDocuments({ campaignId: c._id, status: 'sent' });
      const failed = await MessageLog.countDocuments({ campaignId: c._id, status: 'failed' });
      const pending = await MessageLog.countDocuments({ campaignId: c._id, status: 'pending' });

      return {
        ...c.toObject(),
        stats: { total, sent, failed, pending }
      };
    }));

    res.json(enrichedCampaigns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get detail of Campaign (with logs)
app.get('/api/campaigns/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const logs = await MessageLog.find({ campaignId: campaign._id }).sort({ sentAt: -1, createdAt: 1 });
    res.json({ campaign, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a pending/running campaign
app.post('/api/campaigns/:id/cancel', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      return res.status(400).json({ error: `Cannot cancel campaign in ${campaign.status} status` });
    }

    campaign.status = 'cancelled';
    await campaign.save();

    // Mark remaining pending message logs as failed/cancelled
    await MessageLog.updateMany(
      { campaignId: campaign._id, status: 'pending' },
      { status: 'failed', error: 'Campaign cancelled by user' }
    );

    console.log(`Campaign "${campaign.name}" was cancelled.`);
    broadcastSSE({ type: 'campaign-cancelled', campaignId: campaign._id, campaignName: campaign.name });

    res.json({ success: true, message: 'Campaign cancelled successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pause a running campaign manually
app.post('/api/campaigns/:id/pause', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'running') {
      return res.status(400).json({ error: 'Hanya kampanye yang sedang berjalan (running) yang bisa di-pause.' });
    }

    campaign.status = 'paused';
    await campaign.save();

    console.log(`Campaign "${campaign.name}" was paused by user.`);
    broadcastSSE({ type: 'campaign-paused', campaignId: campaign._id, campaignName: campaign.name });

    res.json({ success: true, message: 'Kampanye berhasil di-pause.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resume a paused campaign
app.post('/api/campaigns/:id/resume', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'paused') {
      return res.status(400).json({ error: "Hanya kampanye berstatus 'paused' yang bisa dilanjutkan kembali." });
    }

    campaign.status = 'pending';
    campaign.scheduledTime = new Date(); // Trigger background queue immediately
    await campaign.save();

    console.log(`Campaign "${campaign.name}" was resumed by user.`);
    broadcastSSE({ type: 'campaign-resumed', campaignId: campaign._id, campaignName: campaign.name });

    res.json({ success: true, message: 'Kampanye berhasil dilanjutkan kembali.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reschedule a pending campaign
app.post('/api/campaigns/:id/reschedule', async (req, res) => {
  const { scheduledTime } = req.body;
  if (!scheduledTime) {
    return res.status(400).json({ error: 'Missing new scheduled time.' });
  }

  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'pending') {
      return res.status(400).json({ error: `Cannot reschedule campaign in ${campaign.status} status.` });
    }

    campaign.scheduledTime = new Date(scheduledTime);
    await campaign.save();

    console.log(`Campaign "${campaign.name}" was rescheduled to ${scheduledTime}.`);
    
    broadcastSSE({ type: 'campaign-rescheduled', campaignId: campaign._id, scheduledTime: campaign.scheduledTime });

    res.json({ success: true, message: 'Campaign rescheduled successfully.', scheduledTime: campaign.scheduledTime });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Seeding & Resetting Sandbox dummy data for testing rekap & feedback
app.post('/api/dummy/seed', async (req, res) => {
  try {
    // 1. Clear existing data to avoid conflicts, but keep settings
    await Campaign.deleteMany({});
    await MessageLog.deleteMany({});
    await AutoReply.deleteMany({});
    await WAProfile.deleteMany({});

    // 2. Create WA Profiles
    const profiles = [
      { profileId: 'profile_cs1', name: 'CS Penjualan - Indah', phone: '6281234567891', status: 'connected', connectedAt: new Date() },
      { profileId: 'profile_cs2', name: 'CS Support - Sarah', phone: '6281234567892', status: 'connected', connectedAt: new Date() },
      { profileId: 'profile_admin', name: 'Admin Utama', phone: '6281234567893', status: 'connected', connectedAt: new Date() }
    ];
    await WAProfile.insertMany(profiles);

    // 3. Create Auto-Reply Rules
    const autoReplies = [
      { profileId: 'all', keyword: 'info', replyText: 'Terima kasih telah menghubungi kami. Berikut info katalog produk kami: https://katalog.com/produk', targetType: 'personal', isActive: true },
      { profileId: 'all', keyword: 'harga', replyText: 'Harga Gamis Silk Premium Rp 250.000 (Diskon Ramadhan 20%). Mau pesan warna apa kak?', targetType: 'personal', isActive: true },
      { profileId: 'all', keyword: 'alamat', replyText: 'Toko kami berlokasi di Jl. Emerald Raya No. 10, Jakarta Selatan.', targetType: 'all', isActive: true }
    ];
    await AutoReply.insertMany(autoReplies);

    // 4. Create Campaigns
    const now = new Date();
    
    // Campaign 1: Mass Campaign (Completed 3 days ago)
    const c1Time = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const campaign1 = new Campaign({
      name: 'Broadcast Promo Gamis Silk Ramadhan',
      messageTemplates: [
        { id: 'v1', text: 'Halo {Nama}, dapatkan diskon 20% khusus pembelian Gamis Silk Premium hari ini saja! Klik wa.me/6281234567891', weight: 50 },
        { id: 'v2', text: 'Assalamualaikum {Nama}, koleksi Gamis Silk Premium terbaru diskon 20% hari ini. Mau warna apa saja kak?', weight: 50 }
      ],
      senderProfiles: ['profile_cs1'],
      scheduledTime: c1Time,
      status: 'completed',
      delayMin: 5,
      delayMax: 10
    });
    await campaign1.save();

    // Campaign 2: Mass Campaign (Completed 1 day ago)
    const c2Time = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const campaign2 = new Campaign({
      name: 'Survey Kepuasan & Voucher Free Ongkir',
      messageTemplates: [
        { id: 'v1', text: 'Halo {Nama}, bagaimana pengalaman belanja di toko kami? Balas survey ini untuk dapat voucher free ongkir!', weight: 100 }
      ],
      senderProfiles: ['profile_cs2'],
      scheduledTime: c2Time,
      status: 'completed',
      delayMin: 5,
      delayMax: 10
    });
    await campaign2.save();

    // Campaign 3: Individual Follow-up (Pending)
    const c3Time = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours later
    const campaign3 = new Campaign({
      name: 'Individu - Follow Up Pembayaran',
      messageTemplates: [
        { id: 'v1', text: 'Halo {Nama}, kami mendapati invoice pembayaran untuk pesanan Anda masih pending. Ada yang bisa dibantu?', weight: 100 }
      ],
      senderProfiles: ['profile_admin'],
      scheduledTime: c3Time,
      status: 'pending',
      delayMin: 5,
      delayMax: 10
    });
    await campaign3.save();

    // 5. Create Message Logs & Customer Feedbacks (for Campaign 1 & 2)
    const logs = [];
    const customerNames = [
      'Pak Rangga', 'Sarif', 'Budi Hartono', 'Teh Anita', 'Yusuf Habibi', 
      'Mbak Rina', 'Afdal Wijaya', 'Putri Ayu', 'Diana R', 'Zulkifli'
    ];
    const phones = [
      '628111111111', '628111111112', '628111111113', '628111111114', '628111111115',
      '628111111116', '628111111117', '628111111118', '628111111119', '628111111120'
    ];

    // Generate logs spread over the last 7 days for the chart
    for (let i = 6; i >= 0; i--) {
      const logDay = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      
      const sentCount = 5 + Math.floor(Math.random() * 8); // 5 to 12 sent
      const failedCount = Math.floor(Math.random() * 2);    // 0 to 1 failed
      
      for (let s = 0; s < sentCount; s++) {
        const isCamp1 = s % 2 === 0;
        const targetCamp = isCamp1 ? campaign1 : campaign2;
        const name = customerNames[s % customerNames.length];
        const phone = phones[s % phones.length];
        
        const hasReplied = s % 3 === 0; // ~33% reply rate
        const replies = [
          'Saya mau order Gamis Silk warna maroon kak, masih ada?',
          'Bisa COD area Bandung?',
          'Mau voucher free ongkir dong kak',
          'Sangat puas belanjanya! Sukses terus ya.',
          'Nanti saya transfer siangan ya kak'
        ];
        
        logs.push({
          campaignId: targetCamp._id,
          campaignName: targetCamp.name,
          senderProfileId: isCamp1 ? 'profile_cs1' : 'profile_cs2',
          phone: phone,
          name: name,
          messageText: targetCamp.messageTemplates[0].text.replace('{Nama}', name),
          variationId: targetCamp.messageTemplates[0].id,
          status: 'sent',
          feedbackStatus: hasReplied ? 'replied' : 'read',
          replyText: hasReplied ? replies[s % replies.length] : undefined,
          repliedAt: hasReplied ? new Date(logDay.getTime() + 45 * 60 * 1000) : undefined,
          sentAt: logDay,
          createdAt: logDay
        });
      }

      for (let f = 0; f < failedCount; f++) {
        const name = customerNames[(f + 5) % customerNames.length];
        const phone = '6289999999' + f;
        logs.push({
          campaignId: campaign1._id,
          campaignName: campaign1.name,
          senderProfileId: 'profile_cs1',
          phone: phone,
          name: name,
          messageText: campaign1.messageTemplates[0].text.replace('{Nama}', name),
          variationId: campaign1.messageTemplates[0].id,
          status: 'failed',
          feedbackStatus: 'pending',
          error: 'Phone number not registered on WhatsApp',
          sentAt: logDay,
          createdAt: logDay
        });
      }
    }
    await MessageLog.insertMany(logs);

    res.json({ success: true, message: 'Database seeded with professional dummy data successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dummy/reset', async (req, res) => {
  try {
    await Campaign.deleteMany({});
    await MessageLog.deleteMany({});
    await AutoReply.deleteMany({});
    await WAProfile.deleteMany({});
    res.json({ success: true, message: 'Database reset successfully. All dummy data cleared.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get overall statistics for Dashboard
app.get('/api/stats', async (req, res) => {
  try {
    const totalCampaigns = await Campaign.countDocuments();
    const sentCount = await MessageLog.countDocuments({ status: 'sent' });
    const failedCount = await MessageLog.countDocuments({ status: 'failed' });
    const pendingCount = await MessageLog.countDocuments({ status: 'pending' });

    res.json({
      totalCampaigns,
      sent: sentCount,
      failed: failedCount,
      pending: pendingCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recent log items for dashboard preview
app.get('/api/logs', async (req, res) => {
  try {
    const recentLogs = await MessageLog.find()
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(recentLogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get A/B Testing Statistics and Anti-Stale performance loop for Campaign variations
app.get('/api/campaigns/:id/ab-stats', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const logs = await MessageLog.find({ campaignId: campaign._id, status: 'sent' });
    
    // Group logs by variationId
    const statsByVariation = {};

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Initialize stats object for each template in campaign
    if (campaign.messageTemplates && campaign.messageTemplates.length > 0) {
      campaign.messageTemplates.forEach(t => {
        statsByVariation[t.id] = {
          templateId: t.id,
          text: t.text,
          weight: t.weight,
          totalSent: 0,
          totalReplied: 0,
          totalRead: 0,
          recentSent: 0,
          recentReplied: 0,
          recentRead: 0
        };
      });
    } else {
      // Fallback for single template campaign
      statsByVariation['default'] = {
        templateId: 'default',
        text: campaign.messageTemplate,
        weight: 100,
        totalSent: 0,
        totalReplied: 0,
        totalRead: 0,
        recentSent: 0,
        recentReplied: 0,
        recentRead: 0
      };
    }

    // Process logs
    logs.forEach(log => {
      const varId = log.variationId || 'default';
      
      // If we encounter a variationId not in campaign (e.g. template removed), initialize it
      if (!statsByVariation[varId]) {
        statsByVariation[varId] = {
          templateId: varId,
          text: log.messageText,
          weight: 0,
          totalSent: 0,
          totalReplied: 0,
          totalRead: 0,
          recentSent: 0,
          recentReplied: 0,
          recentRead: 0
        };
      }

      const varStats = statsByVariation[varId];
      varStats.totalSent++;
      if (log.feedbackStatus === 'replied') {
        varStats.totalReplied++;
      }
      if (log.feedbackStatus === 'read' || log.feedbackStatus === 'replied') {
        varStats.totalRead++;
      }

      // Check if sent in last 7 days
      if (log.sentAt && log.sentAt >= sevenDaysAgo) {
        varStats.recentSent++;
        if (log.feedbackStatus === 'replied') {
          varStats.recentReplied++;
        }
        if (log.feedbackStatus === 'read' || log.feedbackStatus === 'replied') {
          varStats.recentRead++;
        }
      }
    });

    // Calculate rates and isStale flags
    const result = Object.values(statsByVariation).map(varStats => {
      const overallRate = varStats.totalSent > 0 ? (varStats.totalReplied / varStats.totalSent) : 0;
      const recentRate = varStats.recentSent > 0 ? (varStats.recentReplied / varStats.recentSent) : 0;
      const readRate = varStats.totalSent > 0 ? (varStats.totalRead / varStats.totalSent) : 0;

      let isStale = false;
      // Minimum sample of 5 messages in recent 7 days to trigger stale check
      if (varStats.recentSent >= 5 && overallRate > 0) {
        if (recentRate < 0.5 * overallRate) {
          isStale = true;
        }
      }

      return {
        ...varStats,
        overallReplyRate: overallRate,
        recentReplyRate: recentRate,
        overallReadRate: readRate,
        isStale
      };
    });

    res.json({ campaignId: campaign._id, campaignName: campaign.name, variations: result });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all client feedback replies
app.get('/api/feedbacks', async (req, res) => {
  try {
    const feedbacks = await MessageLog.find({ feedbackStatus: 'replied' })
      .sort({ repliedAt: -1, sentAt: -1 })
      .limit(100);
    res.json(feedbacks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get campaign reporting summary (Global stats, campaign rekap, copywriting leaderboard)
app.get('/api/reports/summary', async (req, res) => {
  try {
    const reportType = req.query.type || 'mass'; // 'mass' or 'individual'
    const period = req.query.period || 'all'; // 'all', 'today', '7days', '30days', 'custom'
    const startDateStr = req.query.startDate;
    const endDateStr = req.query.endDate;
    const campaignId = req.query.campaignId;

    // Define filter for campaigns
    const filterQuery = reportType === 'individual'
      ? { name: /^Individu -/i }
      : { name: { $not: /^Individu -/i } };

    // Apply date range filter if requested
    let start = null;
    let end = null;
    const now = new Date();

    if (period === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (period === '7days') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      end = now;
    } else if (period === '30days') {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = now;
    } else if (period === 'custom' && startDateStr && endDateStr) {
      start = new Date(startDateStr);
      end = new Date(endDateStr);
      end.setHours(23, 59, 59, 999);
    }

    if (start && end) {
      filterQuery.scheduledTime = { $gte: start, $lte: end };
    }

    // Get all available campaigns for the dropdown list (before applying specific campaign filter)
    const allMatchingCampaigns = await Campaign.find(filterQuery).sort({ scheduledTime: -1 });
    const availableCampaigns = allMatchingCampaigns.map(c => ({ id: c._id, name: c.name }));

    // Apply specific campaign filter for the actual reports calculations
    if (campaignId && campaignId !== 'all') {
      filterQuery._id = campaignId;
    }

    const campaignsList = await Campaign.find(filterQuery).sort({ scheduledTime: -1 });
    const campaignIds = campaignsList.map(c => c._id);
    
    // Global metrics based on the filtered list of campaigns
    const totalCampaigns = campaignsList.length;
    const totalAttempted = await MessageLog.countDocuments({ campaignId: { $in: campaignIds } });
    const totalSent = await MessageLog.countDocuments({ campaignId: { $in: campaignIds }, status: 'sent' });
    const totalReplied = await MessageLog.countDocuments({ campaignId: { $in: campaignIds }, status: 'sent', feedbackStatus: 'replied' });
    
    const campaignsSummary = [];
    
    for (const camp of campaignsList) {
      const logs = await MessageLog.find({ campaignId: camp._id });
      const total = logs.length;
      const sent = logs.filter(l => l.status === 'sent').length;
      const replied = logs.filter(l => l.status === 'sent' && l.feedbackStatus === 'replied').length;
      
      // Calculate best variation inside this campaign
      let bestVariationText = '-';
      if (camp.messageTemplates && camp.messageTemplates.length > 0) {
        let bestRate = -1;
        let bestText = '-';
        for (const t of camp.messageTemplates) {
          const varLogs = logs.filter(l => l.variationId === t.id && l.status === 'sent');
          if (varLogs.length > 0) {
            const varReplied = varLogs.filter(l => l.feedbackStatus === 'replied').length;
            const rate = varReplied / varLogs.length;
            if (rate > bestRate) {
              bestRate = rate;
              bestText = t.text;
            }
          }
        }
        if (bestRate > 0) {
          bestVariationText = bestText;
        }
      } else {
        // If single template
        bestVariationText = camp.messageTemplate || '-';
      }

      campaignsSummary.push({
        id: camp._id,
        name: camp.name,
        scheduledTime: camp.scheduledTime,
        total,
        sent,
        replied,
        readRate: total > 0 ? (sent / total) : 0, // Maps to Delivery Rate (sent / total)
        replyRate: sent > 0 ? (replied / sent) : 0,
        bestVariation: bestVariationText
      });
    }

    // Leaderboard of best copywriting templates globally (restricted to selected type!)
    const allLogs = await MessageLog.find({ campaignId: { $in: campaignIds }, status: 'sent' });
    const templateMap = {};
    for (const log of allLogs) {
      const text = log.messageText;
      if (!text) continue;
      if (!templateMap[text]) {
        templateMap[text] = { text, sent: 0, replied: 0 };
      }
      templateMap[text].sent++;
      if (log.feedbackStatus === 'replied') {
        templateMap[text].replied++;
      }
    }

    const bestTemplates = Object.values(templateMap)
      .map(t => ({
        text: t.text,
        sent: t.sent,
        read: t.sent, // Delivered is same as sent in this view
        replied: t.replied,
        replyRate: t.sent > 0 ? (t.replied / t.sent) : 0
      }))
      .sort((a, b) => b.replyRate - a.replyRate || b.sent - a.sent)
      .slice(0, 10); // Top 10

    res.json({
      globalStats: {
        totalCampaigns,
        totalSent,
        totalAttempted,
        totalReplied,
        readRate: totalAttempted > 0 ? (totalSent / totalAttempted) : 0, // Maps to Delivery Rate
        replyRate: totalSent > 0 ? (totalReplied / totalSent) : 0
      },
      campaigns: campaignsSummary,
      bestTemplates,
      availableCampaigns
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch all WhatsApp groups
app.get('/api/whatsapp/groups', async (req, res) => {
  try {
    const profileId = req.query.profileId;
    if (!profileId) {
      return res.status(400).json({ error: 'Missing profileId query parameter.' });
    }
    const clientInstance = clients.get(profileId);
    if (!clientInstance) {
      return res.status(400).json({ error: 'WhatsApp profile tidak terhubung.' });
    }
    const chats = await clientInstance.getChats();
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(chat => ({
        id: chat.id._serialized,
        name: chat.name || 'Grup Tanpa Nama'
      }));
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all WhatsApp profiles
app.get('/api/profiles', async (req, res) => {
  try {
    const profiles = await WAProfile.find().sort({ createdAt: 1 });
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create a new WhatsApp profile
app.post('/api/profiles', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nama profil wajib diisi.' });
    }

    const count = await WAProfile.countDocuments();
    const profileId = `profile-${Date.now()}-${count + 1}`;

    const profile = new WAProfile({
      profileId,
      name: name.trim(),
      status: 'disconnected'
    });
    await profile.save();
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to get system RAM status and recommended profile limit
function getSystemRamHealth() {
  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();
  const totalMemGB = Math.round((totalMemBytes / (1024 * 1024 * 1024)) * 10) / 10;
  const freeMemGB = Math.round((freeMemBytes / (1024 * 1024 * 1024)) * 10) / 10;
  const usedMemGB = Math.round(((totalMemBytes - freeMemBytes) / (1024 * 1024 * 1024)) * 10) / 10;
  const memUsagePercent = Math.round(((totalMemBytes - freeMemBytes) / totalMemBytes) * 100);

  let recommendedMaxProfiles = 4;
  if (totalMemGB <= 4.5) {
    recommendedMaxProfiles = 2;
  } else if (totalMemGB <= 8.5) {
    recommendedMaxProfiles = 4;
  } else if (totalMemGB <= 16.5) {
    recommendedMaxProfiles = 6;
  } else {
    recommendedMaxProfiles = 10;
  }

  const activeProfilesCount = clients.size;

  let healthStatus = 'optimal';
  if (memUsagePercent > 82 || (activeProfilesCount > recommendedMaxProfiles)) {
    healthStatus = 'warning';
  }
  if (memUsagePercent > 90) {
    healthStatus = 'critical';
  }

  return {
    totalMemGB,
    freeMemGB,
    usedMemGB,
    memUsagePercent,
    activeProfilesCount,
    recommendedMaxProfiles,
    healthStatus
  };
}

// REST Endpoint to fetch RAM health
app.get('/api/system/ram-health', (req, res) => {
  res.json(getSystemRamHealth());
});

// POST connect profile (Puppeteer init with RAM Safety Guard)
app.post('/api/profiles/:id/connect', async (req, res) => {
  if (!isLicenseActive) {
    return res.status(403).json({ error: 'Aplikasi belum diaktifkan. Silakan masukkan Lisensi yang valid.' });
  }
  try {
    const profileId = req.params.id;
    const profile = await WAProfile.findOne({ profileId });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const isForce = req.query.force === 'true';
    const ramInfo = getSystemRamHealth();

    if (!isForce && (ramInfo.activeProfilesCount >= ramInfo.recommendedMaxProfiles || ramInfo.memUsagePercent > 88)) {
      return res.json({
        success: false,
        warning: true,
        ramWarning: true,
        message: `⚠️ Proteksi RAM System: Komputer Anda memiliki RAM ${ramInfo.totalMemGB}GB (${ramInfo.memUsagePercent}% terpakai). Menjalankan lebih dari ${ramInfo.recommendedMaxProfiles} profil WhatsApp bersamaan berisiko membuat komputer lambat/lag. Apakah Anda ingin tetap mengaktifkannya?`,
        ramInfo
      });
    }

    // Connect WA in background
    connectToWhatsApp(profileId);
    res.json({ success: true, message: 'Menghubungkan profil...' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST disconnect profile (logout and delete session files)
app.post('/api/profiles/:id/disconnect', async (req, res) => {
  try {
    const profileId = req.params.id;
    const profile = await WAProfile.findOne({ profileId });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const clientInstance = clients.get(profileId);
    if (clientInstance) {
      try {
        await clientInstance.logout();
        await clientInstance.destroy();
      } catch (e) {
        console.log(`Error destroying client for profile ${profileId}:`, e.message);
      }
      clients.delete(profileId);
    }

    profile.status = 'disconnected';
    profile.qrData = null;
    await profile.save();

    const sessionDir = path.join(__dirname, 'data', `session_${profileId}`);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`Session auth dir for ${profileId} deleted on manual disconnect.`);
      } catch (err) {
        console.error('Failed to delete session dir:', err.message);
      }
    }

    broadcastSSE({ type: 'profile-status', profileId, status: 'disconnected', qrData: null });
    res.json({ success: true, message: 'Profil WhatsApp berhasil diputuskan.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a WhatsApp profile
app.delete('/api/profiles/:id', async (req, res) => {
  try {
    const profileId = req.params.id;
    const profile = await WAProfile.findOne({ profileId });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const clientInstance = clients.get(profileId);
    if (clientInstance) {
      try {
        await clientInstance.destroy();
      } catch (e) {}
      clients.delete(profileId);
    }

    await WAProfile.deleteOne({ profileId });

    const sessionDir = path.join(__dirname, 'data', `session_${profileId}`);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (err) {}
    }

    res.json({ success: true, message: 'Profil WhatsApp berhasil dihapus.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Online Licensing Verification Endpoints ---

// Get current license status and motherboard UUID
app.get('/api/license/status', async (req, res) => {
  try {
    const hwid = await getMotherboardUUID();
    if (!licenseExpiryDate) {
      const cachedExpiry = await Setting.findOne({ key: 'licenseExpiry' });
      if (cachedExpiry) licenseExpiryDate = cachedExpiry.value;
    }
    const keySetting = await Setting.findOne({ key: 'licenseKey' });
    const licenseKey = keySetting ? keySetting.value : '';
    
    const cachedUsed = await Setting.findOne({ key: 'licenseDevicesUsed' });
    const cachedMax = await Setting.findOne({ key: 'licenseMaxDevices' });
    
    res.json({ 
      active: isLicenseActive, 
      hwid, 
      expiryDate: licenseExpiryDate, 
      licenseKey,
      devicesUsed: cachedUsed ? parseInt(cachedUsed.value, 10) : 1,
      maxDevices: cachedMax ? parseInt(cachedMax.value, 10) : 1
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process license key activation online
app.post('/api/license/activate', async (req, res) => {
  try {
    const { licenseKey } = req.body;
    if (!licenseKey) {
      return res.status(400).json({ error: 'License Key tidak boleh kosong.' });
    }
    const hwid = await getMotherboardUUID();
    
    console.log(`Sending activation request for key ${licenseKey} and HWID ${hwid}...`);
    
    const data = await fetchWithGASFailover({ licenseKey, hwid }, 10000);
    if (!data.success) {
      return res.status(400).json({ error: data.message || 'Gagal mengaktifkan lisensi.' });
    }
    
    // Save license key to local settings database
    await Setting.findOneAndUpdate(
      { key: 'licenseKey' },
      { value: licenseKey },
      { upsert: true, new: true }
    );
    
    // Save license expiry date to database and global state
    licenseExpiryDate = data.expiryDate || null;
    if (licenseExpiryDate) {
      await Setting.findOneAndUpdate(
        { key: 'licenseExpiry' },
        { value: licenseExpiryDate },
        { upsert: true }
      );
      console.log(`Saved license expiry date: ${licenseExpiryDate}`);
    }
    if (data.devicesUsed !== undefined) {
      await Setting.findOneAndUpdate(
        { key: 'licenseDevicesUsed' },
        { value: data.devicesUsed.toString() },
        { upsert: true }
      );
    }
    if (data.maxDevices !== undefined) {
      await Setting.findOneAndUpdate(
        { key: 'licenseMaxDevices' },
        { value: data.maxDevices.toString() },
        { upsert: true }
      );
    }
    
    isLicenseActive = true;
    res.json({ 
      success: true, 
      message: data.message, 
      expiryDate: licenseExpiryDate,
      devicesUsed: data.devicesUsed,
      maxDevices: data.maxDevices
    });
  } catch (error) {
    console.error('License activation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- AI Settings & Copywriting Generation Endpoints ---

// Get AI Settings
app.get('/api/settings/ai', async (req, res) => {
  try {
    const keys = [
      'aiProvider', 'geminiApiKey', 'geminiModel', 'openaiKey', 'openaiModel',
      'claudeKey', 'claudeModel', 'deepseekKey', 'deepseekModel',
      'customUrl', 'customKey', 'customModel'
    ];
    
    const settings = await Setting.find({ key: { $in: keys } });
    const config = {};
    keys.forEach(k => {
      const found = settings.find(s => s.key === k);
      config[k] = found ? found.value : '';
    });
    
    if (!config.aiProvider) config.aiProvider = 'gemini';
    if (!config.geminiModel) config.geminiModel = 'gemini-2.5-flash';
    
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save AI Settings
app.post('/api/settings/ai', async (req, res) => {
  try {
    const fields = req.body;
    
    for (const [key, value] of Object.entries(fields)) {
      await Setting.findOneAndUpdate(
        { key },
        { value: (value || '').trim() },
        { upsert: true }
      );
    }
    
    res.json({ success: true, message: 'Pengaturan AI berhasil disimpan.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Copywriting Generation Router (with Gemini key failover rotation & multi-provider support)
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { businessDetails, promoDetails, tone, cta, useEmoji } = req.body;
    if (!businessDetails || !promoDetails) {
      return res.status(400).json({ error: 'Detail produk dan promo wajib diisi.' });
    }

    // Load active provider
    const providerSetting = await Setting.findOne({ key: 'aiProvider' });
    const provider = providerSetting ? providerSetting.value : 'gemini';

    // Construct prompt
    const toneNames = {
      casual: 'Casual, santai, akrab, dan bersahabat',
      formal: 'Professional, formal, sopan, dan terpercaya',
      urgent: 'Urgent, menggunakan taktik FOMO (Fear of Missing Out), persuasif keras (Hard Sell)',
      storytelling: 'Soft Sell dengan metode bercerita (Storytelling) yang menarik rasa ingin tahu',
      humorous: 'Humoris, lucu, menghibur, tapi tetap fokus pada penjualan'
    };
    
    const selectedTone = toneNames[tone] || toneNames.casual;
    const emojiPrompt = useEmoji ? 'Gunakan emoji yang relevan dan proporsional untuk meningkatkan ketertarikan visual.' : 'Jangan gunakan emoji sama sekali.';

    const prompt = `Tugas Anda adalah membuat copywriting pesan WhatsApp blast yang sangat menarik, persuasif, dan siap dikirim.
Gunakan data berikut:
- Detail Produk/Bisnis: ${businessDetails}
- Detail Promo/Penawaran: ${promoDetails}
- Gaya Bahasa (Tone): ${selectedTone}
- Call to Action (CTA): ${cta || 'Hubungi kami sekarang'}
- Emoji: ${emojiPrompt}

ATURAN UTAMA: Output Anda HARUS langsung berupa teks isi pesan WhatsApp yang siap dikirim. JANGAN sertakan kalimat pengantar (seperti "Berikut adalah draf copywriting Anda:") atau penutup penjelasan dari Anda sendiri. Mulailah langsung dengan isi pesan!`;

    // Process based on provider
    if (provider === 'gemini') {
      const keySetting = await Setting.findOne({ key: 'geminiApiKey' });
      if (!keySetting || !keySetting.value) {
        return res.status(400).json({ error: 'API Key Gemini belum diset di Pengaturan.' });
      }

      const modelSetting = await Setting.findOne({ key: 'geminiModel' });
      const geminiModel = modelSetting && modelSetting.value ? modelSetting.value.trim() : 'gemini-2.5-flash';

      // Support multi-key rotation (comma separated)
      const keys = keySetting.value.split(',').map(k => k.trim()).filter(Boolean);
      if (keys.length === 0) {
        return res.status(400).json({ error: 'Format API Key Gemini tidak valid.' });
      }

      let lastError = null;
      for (let i = 0; i < keys.length; i++) {
        const currentKey = keys[i];
        console.log(`[AI Router] Trying Gemini Key index ${i} (${currentKey.substring(0, 8)}...) using model ${geminiModel}...`);
        
        try {
          // Use v1beta endpoint for maximum model compatibility (e.g. gemini-1.5-flash, gemini-2.5-flash)
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${currentKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            }),
            signal: AbortSignal.timeout(15000)
          });

          const data = await response.json();
          if (response.ok) {
            const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (replyText) {
              console.log(`[AI Router] Gemini key index ${i} succeeded!`);
              return res.json({ success: true, replyText });
            }
          }

          lastError = data.error ? data.error.message : `HTTP status ${response.status}`;
          console.warn(`[AI Router] Gemini key index ${i} failed: ${lastError}`);
        } catch (err) {
          lastError = err.message;
          console.warn(`[AI Router] Gemini key index ${i} encountered connection error: ${lastError}`);
        }
      }
      throw new Error(`Semua API Key Gemini (${keys.length} key) gagal digunakan. Error terakhir: ${lastError}`);
    } 
    
    else if (provider === 'openai') {
      const keySetting = await Setting.findOne({ key: 'openaiKey' });
      if (!keySetting || !keySetting.value) {
        return res.status(400).json({ error: 'API Key OpenAI belum diset di Pengaturan.' });
      }
      const modelSetting = await Setting.findOne({ key: 'openaiModel' });
      const model = modelSetting && modelSetting.value ? modelSetting.value : 'gpt-4o-mini';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keySetting.value}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ? data.error.message : `HTTP error ${response.status}`);
      }

      const replyText = data.choices?.[0]?.message?.content || '';
      return res.json({ success: true, replyText });
    } 
    
    else if (provider === 'claude') {
      const keySetting = await Setting.findOne({ key: 'claudeKey' });
      if (!keySetting || !keySetting.value) {
        return res.status(400).json({ error: 'API Key Claude belum diset di Pengaturan.' });
      }
      const modelSetting = await Setting.findOne({ key: 'claudeModel' });
      const model = modelSetting && modelSetting.value ? modelSetting.value : 'claude-3-5-sonnet-20241022';

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': keySetting.value,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 1524,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ? data.error.message : `HTTP error ${response.status}`);
      }

      const replyText = data.content?.[0]?.text || '';
      return res.json({ success: true, replyText });
    } 
    
    else if (provider === 'deepseek') {
      const keySetting = await Setting.findOne({ key: 'deepseekKey' });
      if (!keySetting || !keySetting.value) {
        return res.status(400).json({ error: 'API Key DeepSeek belum diset di Pengaturan.' });
      }
      const modelSetting = await Setting.findOne({ key: 'deepseekModel' });
      const model = modelSetting && modelSetting.value ? modelSetting.value : 'deepseek-chat';

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keySetting.value}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ? data.error.message : `HTTP error ${response.status}`);
      }

      const replyText = data.choices?.[0]?.message?.content || '';
      return res.json({ success: true, replyText });
    } 
    
    else if (provider === 'custom') {
      const urlSetting = await Setting.findOne({ key: 'customUrl' });
      const keySetting = await Setting.findOne({ key: 'customKey' });
      const modelSetting = await Setting.findOne({ key: 'customModel' });
      
      if (!urlSetting || !urlSetting.value) {
        return res.status(400).json({ error: 'Custom Base URL belum diset di Pengaturan.' });
      }

      const headers = { 'Content-Type': 'application/json' };
      if (keySetting && keySetting.value) {
        headers['Authorization'] = `Bearer ${keySetting.value}`;
      }

      const model = modelSetting && modelSetting.value ? modelSetting.value : 'default';

      let customBase = urlSetting.value.trim();
      if (customBase.endsWith('/')) customBase = customBase.slice(0, -1);

      const response = await fetch(`${customBase}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ? data.error.message : `HTTP error ${response.status}`);
      }

      const replyText = data.choices?.[0]?.message?.content || '';
      return res.json({ success: true, replyText });
    } 
    
    else {
      throw new Error(`Engine AI provider "${provider}" tidak didukung.`);
    }

  } catch (error) {
    console.error('AI Copywriting Generation Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Copywriting Variation Generator (uses the selected provider/model to rewrite existing copy)
app.post('/api/ai/variation', async (req, res) => {
  try {
    const { currentText } = req.body;
    if (!currentText) {
      return res.status(400).json({ error: 'Teks copywriting dasar wajib diisi.' });
    }

    // Load active provider
    const providerSetting = await Setting.findOne({ key: 'aiProvider' });
    const provider = providerSetting ? providerSetting.value : 'gemini';

    const prompt = `Tugas Anda adalah membuat satu variasi copywriting alternatif baru dari pesan WhatsApp blast berikut:
---
${currentText}
---

ATURAN RE-WRITE:
1. Informasi utama, promo, penawaran, dan call to action (CTA) harus tetap sama persis.
2. Gunakan gaya kalimat, diksi, pembukaan, dan susunan kata yang berbeda agar terlihat segar dan unik untuk keperluan A/B Testing.
3. ATURAN UTAMA: Output Anda HARUS langsung berupa teks isi pesan WhatsApp yang siap dikirim. JANGAN sertakan kalimat pengantar (seperti "Berikut adalah variasi alternatif Anda:") atau penjelasan dari Anda sendiri. Mulailah langsung dengan isi pesan!`;

    // Process based on provider
    if (provider === 'gemini') {
      const keySetting = await Setting.findOne({ key: 'geminiApiKey' });
      if (!keySetting || !keySetting.value) {
        return res.status(400).json({ error: 'API Key Gemini belum diset di Pengaturan.' });
      }

      const modelSetting = await Setting.findOne({ key: 'geminiModel' });
      const geminiModel = modelSetting && modelSetting.value ? modelSetting.value.trim() : 'gemini-2.5-flash';

      const keys = keySetting.value.split(',').map(k => k.trim()).filter(Boolean);
      if (keys.length === 0) {
        return res.status(400).json({ error: 'Format API Key Gemini tidak valid.' });
      }

      let lastError = null;
      for (let i = 0; i < keys.length; i++) {
        const currentKey = keys[i];
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${currentKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            }),
            signal: AbortSignal.timeout(15000)
          });

          const data = await response.json();
          if (response.ok) {
            const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (replyText) {
              return res.json({ success: true, replyText });
            }
          }
          lastError = data.error ? data.error.message : `HTTP status ${response.status}`;
        } catch (err) {
          lastError = err.message;
        }
      }
      throw new Error(`Semua API Key Gemini gagal digunakan. Error terakhir: ${lastError}`);
    } 
    
    else if (provider === 'openai') {
      const keySetting = await Setting.findOne({ key: 'openaiKey' });
      if (!keySetting || !keySetting.value) {
        return res.status(400).json({ error: 'API Key OpenAI belum diset.' });
      }
      const modelSetting = await Setting.findOne({ key: 'openaiModel' });
      const model = modelSetting && modelSetting.value ? modelSetting.value : 'gpt-4o-mini';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keySetting.value}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ? data.error.message : `HTTP ${response.status}`);
      return res.json({ success: true, replyText: data.choices?.[0]?.message?.content || '' });
    } 
    
    else if (provider === 'claude') {
      const keySetting = await Setting.findOne({ key: 'claudeKey' });
      if (!keySetting || !keySetting.value) {
        return res.status(400).json({ error: 'API Key Claude belum diset.' });
      }
      const modelSetting = await Setting.findOne({ key: 'claudeModel' });
      const model = modelSetting && modelSetting.value ? modelSetting.value : 'claude-3-5-sonnet-20241022';

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': keySetting.value,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 1524,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ? data.error.message : `HTTP ${response.status}`);
      return res.json({ success: true, replyText: data.content?.[0]?.text || '' });
    } 
    
    else if (provider === 'deepseek') {
      const keySetting = await Setting.findOne({ key: 'deepseekKey' });
      if (!keySetting || !keySetting.value) {
        return res.status(400).json({ error: 'API Key DeepSeek belum diset.' });
      }
      const modelSetting = await Setting.findOne({ key: 'deepseekModel' });
      const model = modelSetting && modelSetting.value ? modelSetting.value : 'deepseek-chat';

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keySetting.value}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ? data.error.message : `HTTP ${response.status}`);
      return res.json({ success: true, replyText: data.choices?.[0]?.message?.content || '' });
    } 
    
    else if (provider === 'custom') {
      const urlSetting = await Setting.findOne({ key: 'customUrl' });
      const keySetting = await Setting.findOne({ key: 'customKey' });
      const modelSetting = await Setting.findOne({ key: 'customModel' });
      
      if (!urlSetting || !urlSetting.value) {
        return res.status(400).json({ error: 'Custom Base URL belum diset.' });
      }

      const headers = { 'Content-Type': 'application/json' };
      if (keySetting && keySetting.value) {
        headers['Authorization'] = `Bearer ${keySetting.value}`;
      }

      const model = modelSetting && modelSetting.value ? modelSetting.value : 'default';
      let customBase = urlSetting.value.trim();
      if (customBase.endsWith('/')) customBase = customBase.slice(0, -1);

      const response = await fetch(`${customBase}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ? data.error.message : `HTTP ${response.status}`);
      return res.json({ success: true, replyText: data.choices?.[0]?.message?.content || '' });
    } 
    
    else {
      throw new Error(`Engine AI provider "${provider}" tidak didukung.`);
    }

  } catch (error) {
    console.error('AI Copywriting Variation Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// AutoReply REST APIs
app.get('/api/autoreplies', async (req, res) => {
  try {
    const rules = await AutoReply.find().sort({ createdAt: -1 });
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/autoreplies', async (req, res) => {
  try {
    const { profileId, keyword, isRegex, replyText, delayMin, delayMax, targetType, targetGroupIds } = req.body;
    if (!keyword || !replyText) {
      return res.status(400).json({ error: 'Kata kunci (keyword) dan teks balasan wajib diisi.' });
    }
    const rule = new AutoReply({
      profileId: profileId || 'all',
      keyword: keyword.trim(),
      isRegex: !!isRegex,
      replyText: replyText.trim(),
      delayMin: Number(delayMin) || 2,
      delayMax: Number(delayMax) || 5,
      targetType: targetType || 'all',
      targetGroupIds: targetGroupIds || []
    });
    await rule.save();
    res.json({ success: true, rule });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/autoreplies/:id', async (req, res) => {
  try {
    await AutoReply.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Aturan balasan otomatis berhasil dihapus.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/autoreplies/:id/toggle', async (req, res) => {
  try {
    const rule = await AutoReply.findById(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    rule.isActive = !rule.isActive;
    await rule.save();
    res.json({ success: true, isActive: rule.isActive });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Autostart Settings API
app.get('/api/settings/autostart', (req, res) => {
  const startupFolder = path.join(
    process.env.APPDATA,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup'
  );
  const shortcutPath = path.join(startupFolder, 'WhatsAppBlast.lnk');
  const enabled = fs.existsSync(shortcutPath);
  res.json({ enabled });
});

app.post('/api/settings/autostart', (req, res) => {
  const { enabled } = req.body;
  const startupFolder = path.join(
    process.env.APPDATA,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup'
  );
  const shortcutPath = path.join(startupFolder, 'WhatsAppBlast.lnk');
  const projectPath = __dirname;
  const launcherPath = path.join(projectPath, 'Launcher.exe');

  try {
    if (enabled) {
      const { exec } = require('child_process');
      const psCommand = `powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('${shortcutPath}'); $Shortcut.TargetPath = '${launcherPath}'; $Shortcut.WorkingDirectory = '${projectPath}'; $Shortcut.Save();"`;
      
      exec(psCommand, (err) => {
        if (err) {
          console.error('Error creating autostart shortcut:', err);
          return res.status(500).json({ error: 'Gagal membuat shortcut startup: ' + err.message });
        }
        res.json({ success: true, enabled: true });
      });
    } else {
      if (fs.existsSync(shortcutPath)) {
        fs.unlinkSync(shortcutPath);
      }
      res.json({ success: true, enabled: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend routing fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Database, WhatsApp connection, Scheduler & Server
async function main() {
  console.log('Connecting to database...');
  const dbUri = await startPortableMongoDB();
  await connectDB(dbUri);

  // Validate local license key on startup
  try {
    const setting = await Setting.findOne({ key: 'licenseKey' });
    if (setting && setting.value) {
      console.log('Verifying local license key online...');
      isLicenseActive = await validateLicenseOnline(setting.value);
      if (isLicenseActive) {
        console.log('✅ License is verified and active!');
      } else {
        console.log('❌ License verification failed! App entering lock state.');
      }
    } else {
      console.log('ℹ️ No license key activated yet. App entering lock state.');
      isLicenseActive = false;
    }
  } catch (licErr) {
    console.error('Error verifying license during boot:', licErr.message);
    isLicenseActive = false;
  }

  if (isLicenseActive) {
    // Reset connecting/scanning profiles to disconnected on startup
    try {
      await WAProfile.updateMany(
        { status: { $in: ['connecting', 'scanning'] } },
        { status: 'disconnected', qrData: null }
      );
      
      // Auto-connect previously connected profiles
      const activeProfiles = await WAProfile.find({ status: 'connected' });
      console.log(`Auto-initializing ${activeProfiles.length} active profiles...`);
      for (const prof of activeProfiles) {
        // Set to disconnected temporarily so connectToWhatsApp starts it clean
        prof.status = 'disconnected';
        await prof.save();
        connectToWhatsApp(prof.profileId);
      }
    } catch (bootErr) {
      console.error('Error during startup profile recovery:', bootErr);
    }

    // Run the scheduler
    startScheduler();
  } else {
    console.log('⚠️ Scheduler and profile auto-initialization skipped because license is inactive.');
  }

  // ==========================================================================
  // SOFTWARE VERSION CHECKER & AUTO-PATCH API
  // ==========================================================================
  const CURRENT_APP_VERSION = '1.0.0';
  const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/ranggadana13/whatsapp-blast-releases/main/latest.json';

  app.get('/api/system/version', async (req, res) => {
    try {
      const remoteRes = await fetch(REMOTE_VERSION_URL, {
        signal: AbortSignal.timeout(4000)
      });
      
      if (remoteRes.ok) {
        const data = await remoteRes.json();
        const latestVersion = data.version || CURRENT_APP_VERSION;
        
        const p1 = latestVersion.split('.').map(Number);
        const p2 = CURRENT_APP_VERSION.split('.').map(Number);
        let updateAvailable = false;
        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
          const v1 = p1[i] || 0;
          const v2 = p2[i] || 0;
          if (v1 > v2) { updateAvailable = true; break; }
          if (v1 < v2) { break; }
        }
        
        return res.json({
          currentVersion: CURRENT_APP_VERSION,
          latestVersion,
          updateAvailable,
          changelog: data.changelog || 'Pembaruan stabilitas dan peningkatan fitur.',
          downloadUrl: data.downloadUrl || 'https://github.com/ranggadana13/whatsapp-blast-releases/releases'
        });
      }
    } catch (err) {
      console.log('[Auto-Patch Checker] Remote check skipped/offline:', err.message);
    }
    
    res.json({
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: CURRENT_APP_VERSION,
      updateAvailable: false,
      changelog: 'Aplikasi berjalan pada versi terbaru.',
      downloadUrl: ''
    });
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('Fatal initialization error:', err);
});
