// Frontend Startup File for Webuzo Node.js Application
// This file starts the Next.js production server

const { spawn } = require('child_process');
const path = require('path');

console.log('========================================');
console.log('Starting Invtrade Frontend');
console.log('========================================');
console.log('Working directory:', __dirname);
console.log('Node version:', process.version);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', process.env.PORT || 30000);
console.log('========================================');

// Start Next.js server
const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
const server = spawn('node', [nextBin, 'start'], {
  cwd: __dirname,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: process.env.PORT || 30000,
  },
  stdio: 'inherit'
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
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
