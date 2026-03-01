// Frontend Startup File for Webuzo Node.js Application
// This file starts the Next.js production server

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('========================================');
console.log('Starting Invtrade Frontend');
console.log('========================================');
console.log('Working directory:', __dirname);
console.log('Node version:', process.version);

// Force production environment
process.env.NODE_ENV = 'production';
const port = process.env.PORT || 30000;

console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', port);
console.log('========================================');

// Check if .next folder exists
const nextDir = path.join(__dirname, '.next');
if (!fs.existsSync(nextDir)) {
  console.error('❌ Error: .next folder not found!');
  console.error('Please run: npm run build');
  console.error('Current directory:', __dirname);
  console.error('Looking for:', nextDir);
  process.exit(1);
}

console.log('✓ Found .next directory');

// Start Next.js server
const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');

if (!fs.existsSync(nextBin)) {
  console.error('❌ Error: Next.js binary not found!');
  console.error('Please run: npm install');
  process.exit(1);
}

console.log('✓ Starting Next.js production server...');

const server = spawn('node', [nextBin, 'start', '-p', port.toString()], {
  cwd: __dirname,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port.toString(),
  },
  stdio: 'inherit'
});

server.on('error', (err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

// Handle termination signals
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.kill('SIGINT');
});

console.log('Frontend server starting...');
console.log(`Access at: http://localhost:${port}`);
