// Simple Frontend Startup File (Alternative)
// Use this if server.js doesn't work

// Force production mode
process.env.NODE_ENV = 'production';
process.env.PORT = process.env.PORT || '30000';

console.log('Starting Next.js in production mode...');
console.log('Port:', process.env.PORT);

// Start Next.js
require('child_process').spawn(
  'node',
  ['node_modules/next/dist/bin/next', 'start', '-p', process.env.PORT],
  { 
    stdio: 'inherit',
    env: process.env
  }
);
