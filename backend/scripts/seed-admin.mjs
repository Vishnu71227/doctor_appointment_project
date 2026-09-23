import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env file');
  process.exit(1);
}

console.log('🔌 Connecting to MongoDB...');
await mongoose.connect(MONGODB_URI);
console.log('✅ Connected!');

// Check if admin already exists
const existing = await mongoose.connection.collection('users').findOne({ email: 'admin@healthline.com' });

if (existing) {
  console.log('⚠️  Admin already exists with email: admin@healthline.com');
  console.log('🔑 Use these login details:');
  console.log('   Email:    admin@healthline.com');
  console.log('   Password: Admin@123  (if not changed)');
  await mongoose.disconnect();
  process.exit(0);
}

const hashed = await bcrypt.hash('Admin@123', 12);

await mongoose.connection.collection('users').insertOne({
  id: 'admin-super-001',
  full_name: 'Super Admin',
  email: 'admin@healthline.com',
  password: hashed,
  role: 'admin',
  admin_role: 'super_admin',
  is_active: true,
  otp_verified: true,
  phone_verified: true,
  phone: null,
  profile_image: null,
  created_at: new Date(),
  updated_at: new Date(),
});

console.log('');
console.log('🎉 Super Admin created successfully!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🌐 URL:      /admin  (ya /login)');
console.log('📧 Email:    admin@healthline.com');
console.log('🔑 Password: Admin@123');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⚠️  Production mein password zaroor change karo!');
console.log('');

await mongoose.disconnect();
