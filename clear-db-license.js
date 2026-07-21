const mongoose = require('mongoose');

const ports = [27018, 27017];

const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true }
});

const Setting = mongoose.model('Setting', settingSchema);

async function cleanPort(port) {
  try {
    const uri = `mongodb://127.0.0.1:${port}/whatsapp_blast`;
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
    console.log(`\nConnected to database on port ${port}.`);
    
    const before = await Setting.find();
    console.log('Settings before clean:', before);
    
    await Setting.deleteOne({ key: 'licenseKey' });
    await Setting.deleteOne({ key: 'licenseExpiry' });
    
    const after = await Setting.find();
    console.log('Settings after clean:', after);
    
    await mongoose.disconnect();
    console.log(`Disconnected from port ${port}.`);
  } catch (err) {
    console.log(`Database on port ${port} is not running or unreachable.`);
  }
}

async function run() {
  for (const port of ports) {
    await cleanPort(port);
  }
  console.log('\nClean complete! You can now test activation from a clean state.');
  process.exit(0);
}

run();
