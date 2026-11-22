import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log('--- Checking Configurations ---');
console.log('PORT:', process.env.PORT);
console.log('MONGODB_URI set:', Boolean(process.env.MONGODB_URI));
console.log('GEMINI_API_KEY set:', Boolean(process.env.GEMINI_API_KEY));
console.log('JWT_SECRET set:', Boolean(process.env.JWT_SECRET));

async function checkMongo() {
  console.log('\n--- Testing MongoDB Connection ---');
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('FAIL: MONGODB_URI is not set in server/.env');
    return;
  }

  try {
    console.log('Connecting to MongoDB Atlas...');
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`SUCCESS: Connected to MongoDB host: ${conn.connection.host}`);
    console.log(`Database Name: ${conn.connection.name}`);
    await mongoose.disconnect();
    console.log('SUCCESS: Disconnected cleanly. Connection is 100% verified!');
  } catch (err) {
    console.error(`FAIL: MongoDB connection failed: ${err.message}`);
  }
}

checkMongo();
