const mongoose = require('mongoose');

// Schema for WhatsApp Profiles (Multi-Account Support)
const waProfileSchema = new mongoose.Schema({
  profileId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  phone: { type: String },
  status: { type: String, enum: ['disconnected', 'connecting', 'scanning', 'connected'], default: 'disconnected' },
  qrData: { type: String },
  connectedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// Schema for Campaigns
const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  messageTemplate: { type: String }, // Made optional for A/B testing campaigns
  messageTemplates: [{
    id: { type: String, required: true },
    text: { type: String, required: true },
    weight: { type: Number, default: 50 }, // Selection percentage weight (e.g. 70, 30)
    imageBase64: { type: String }, // Stores optional base64 image data for this variation
    buttons: [{
      type: { type: String, enum: ['quick_reply', 'cta_url'], default: 'quick_reply' },
      text: { type: String },
      value: { type: String }, // button ID for quick_reply, URL for cta_url
      replyText: { type: String } // Optional auto-reply message
    }]
  }],
  senderProfiles: [{ type: String }], // Array of profileId assigned for sending
  scheduledTime: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'running', 'completed', 'cancelled'], default: 'pending' },
  delayMin: { type: Number, default: 5 }, // Minimum delay in seconds between messages
  delayMax: { type: Number, default: 15 }, // Maximum delay in seconds between messages
  imageBase64: { type: String }, // Stores optional base64 image data
  buttons: [{
    type: { type: String, enum: ['quick_reply', 'cta_url'], default: 'quick_reply' },
    text: { type: String },
    value: { type: String }, // button ID for quick_reply, URL for cta_url
    replyText: { type: String } // Optional auto-reply message
  }],
  createdAt: { type: Date, default: Date.now }
});

// Schema for individual message logs (critical for customer chat/behavior analysis)
const messageLogSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  campaignName: { type: String, required: true },
  senderProfileId: { type: String }, // Tracks which WhatsApp profile was used
  phone: { type: String, required: true },
  name: { type: String, required: true },
  variables: { type: Map, of: String },
  messageText: { type: String, required: true },
  messageId: { type: String }, // Captures Sent Message JID ID from WhatsApp to map callbacks
  variationId: { type: String }, // Tracks which message variation was sent
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  feedbackStatus: { type: String, enum: ['pending', 'sent', 'read', 'replied'], default: 'pending' }, // Smart A/B testing response loops
  replyText: { type: String }, // Stores the actual response text from the customer
  repliedAt: { type: Date }, // Timestamp when the customer responded
  sentAt: { type: Date },
  error: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Schema for Auto-Reply Bot Rules
const autoReplySchema = new mongoose.Schema({
  profileId: { type: String, default: 'all' }, // specific profileId, or 'all'
  keyword: { type: String, required: true }, // e.g. "promo", "info", or regex pattern
  isRegex: { type: Boolean, default: false }, // if true, treat keyword as regular expression
  replyText: { type: String, required: true },
  delayMin: { type: Number, default: 2 }, // minimum delay in seconds (default 2)
  delayMax: { type: Number, default: 5 }, // maximum delay in seconds (default 5)
  targetType: { type: String, enum: ['all', 'personal', 'groups'], default: 'all' }, // all, personal, or specific groups
  targetGroupIds: [{ type: String }], // Array of JID strings (e.g. 120363028374928374@g.us)
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Schema for Settings
const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true }
});

// Schema for Master Follow-up Programs (Dynamic Preset Studio)
const followUpProgramSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String, default: 'Umum' }, // e.g. Klinik, Dealer, Property, Olshop
  steps: [{
    stepNumber: { type: Number, required: true },
    offsetValue: { type: Number, default: 1 },
    offsetUnit: { type: String, enum: ['minutes', 'hours', 'days'], default: 'days' },
    timeOfDay: { type: String, default: '09:00' },
    text: { type: String, required: true },
    imageBase64: { type: String }
  }],
  createdAt: { type: Date, default: Date.now }
});

const WAProfile = mongoose.model('WAProfile', waProfileSchema);
const Campaign = mongoose.model('Campaign', campaignSchema);
const MessageLog = mongoose.model('MessageLog', messageLogSchema);
const AutoReply = mongoose.model('AutoReply', autoReplySchema);
const Setting = mongoose.model('Setting', settingSchema);
const FollowUpProgram = mongoose.model('FollowUpProgram', followUpProgramSchema);

const connectDB = async (uri) => {
  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected successfully.');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    console.error('Please check your MONGODB_URI in the .env file.');
  }
};

module.exports = {
  connectDB,
  WAProfile,
  Campaign,
  MessageLog,
  AutoReply,
  Setting,
  FollowUpProgram,
  mongoose
};
