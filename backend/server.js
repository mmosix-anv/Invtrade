// Backend Startup File for Webuzo Node.js Application
// This file starts the compiled backend application

const path = require('path');
const fs = require('fs');

console.log('========================================');
console.log('Starting Invtrade Backend');
console.log('========================================');
console.log('Working directory:', __dirname);
console.log('Node version:', process.version);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('========================================');

// Load environment variables
const envPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('✓ Loaded environment from:', envPath);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('⚠ No .env file found, using system environment variables');
}

// Check if dist folder exists
const distPath = path.join(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
  console.error('❌ Error: dist folder not found!');
  console.error('Please run: npm run build');
  process.exit(1);
}

// Check if index.js exists
const indexPath = path.join(distPath, 'index.js');
if (!fs.existsSync(indexPath)) {
  console.error('❌ Error: dist/index.js not found!');
  console.error('Please run: npm run build');
  process.exit(1);
}

console.log('✓ Starting backend from:', indexPath);
console.log('========================================');

// Start the backend server
try {
  require(indexPath);
} catch (error) {
  console.error('❌ Failed to start backend:', error);
  process.exit(1);
}
