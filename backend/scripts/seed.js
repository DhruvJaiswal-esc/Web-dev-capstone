// npm run seed        -> creates the admin from ADMIN_* env vars
// npm run seed:demo   -> also creates a demo faculty, two students and a group (or set SEED_DEMO=true)
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Group = require('../src/models/Group');

async function upsertUser(data) {
  const existing = await User.findOne({ email: data.email });
  if (existing) return console.log(`exists: ${data.email}`), existing;
  const u = await User.create(data);
  console.log(`created ${data.role}: ${data.email}`);
  return u;
}

(async () => {
  await connectDB();
  const admin = await upsertUser({
    name: process.env.ADMIN_NAME || 'Admin',
    email: (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin@12345',
    role: 'admin',
  });

  if (process.argv.includes('--demo') || process.env.SEED_DEMO === 'true') {
    await upsertUser({ name: 'Demo Faculty', email: 'faculty@example.com', password: 'Faculty@12345', role: 'faculty' });
    const group = (await Group.findOne({ name: 'CSE-A' })) || (await Group.create({ name: 'CSE-A', description: 'Demo section', createdBy: admin._id }));
    await upsertUser({ name: 'Student One', email: 'student1@example.com', password: 'Student@12345', role: 'student', groups: [group._id] });
    await upsertUser({ name: 'Student Two', email: 'student2@example.com', password: 'Student@12345', role: 'student', groups: [group._id] });
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
