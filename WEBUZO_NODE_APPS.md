# Webuzo Node.js Applications Setup

Guide for setting up Frontend and Backend as separate Webuzo Node.js applications.

## Overview

Instead of using PM2, you can create 2 separate Node.js applications in Webuzo:
1. **Invtrade Frontend** (Next.js)
2. **Invtrade Backend** (Express/API)

This gives you:
- ✅ Webuzo's built-in management interface
- ✅ Automatic process management
- ✅ Easy start/stop/restart from Webuzo panel
- ✅ Built-in monitoring and logs
- ✅ Domain management integration

---

## Prerequisites

1. Webuzo control panel access
2. Node.js installed (v20.x recommended)
3. Git repository cloned to `/home/httptruevault/git/Invtrade`

---

## Application 1: Frontend (Next.js)

### Step 1: Build Frontend

```bash
cd /home/httptruevault/git/Invtrade/frontend
npm install --legacy-peer-deps --include=dev
npm run build:i18n
npm run build
```

### Step 2: Create Webuzo Node.js Application

**In Webuzo Panel:**

1. Go to **Applications** → **Node.js**
2. Click **Install Node.js Application**
3. Fill in the details:

**Application Details:**
- **Application Name:** `invtrade-frontend`
- **Domain:** `httptruevaultglobalbank.com` (or subdomain)
- **Application Path:** `/home/httptruevault/git/Invtrade/frontend`
- **Node.js Version:** `20.x` (or latest available)
- **Application Port:** Leave empty or use Webuzo's auto-assigned port (e.g., 30000)
- **Startup File:** `server.js`
- **Environment:** `production`

**Start Command:**
```bash
node server.js
```

**Stop Command:**
```bash
kill $(lsof -t -i:$PORT)
```
Or use the port Webuzo assigns (e.g., 30000):
```bash
kill $(lsof -t -i:30000)
```

**Environment Variables:**
```
NODE_ENV=production
PORT=30000
NEXT_PUBLIC_BACKEND_URL=https://api.httptruevaultglobalbank.com
NEXT_PUBLIC_SITE_URL=https://httptruevaultglobalbank.com
```

**Note:** Webuzo will automatically assign a port (like 30000). The `PORT` environment variable will be set by Webuzo. Just make sure `NODE_ENV=production` is set.

### Step 3: Create Startup File

Create `/home/httptruevault/git/Invtrade/frontend/server.js`:

```javascript
// Frontend Startup File for Webuzo
// This file starts the Next.js production server

const { spawn } = require('child_process');
const path = require('path');

console.log('Starting Invtrade Frontend...');
console.log('Working directory:', __dirname);
console.log('Node version:', process.version);

// Start Next.js server
const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
const server = spawn('node', [nextBin, 'start'], {
  cwd: __dirname,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: process.env.PORT || 3000,
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
```

---

## Application 2: Backend (API)

### Step 1: Build Backend

```bash
cd /home/httptruevault/git/Invtrade/backend
npm install
npm run build
```

### Step 2: Create Webuzo Node.js Application

**In Webuzo Panel:**

1. Go to **Applications** → **Node.js**
2. Click **Install Node.js Application**
3. Fill in the details:

**Application Details:**
- **Application Name:** `invtrade-backend`
- **Domain:** `api.httptruevaultglobalbank.com` (or subdomain)
- **Application Path:** `/home/httptruevault/git/Invtrade/backend`
- **Node.js Version:** `20.x` (or latest available)
- **Application Port:** Leave empty or use Webuzo's auto-assigned port (e.g., 30001)
- **Startup File:** `server.js`
- **Environment:** `production`

**Start Command:**
```bash
node server.js
```

**Stop Command:**
```bash
kill $(lsof -t -i:$PORT)
```
Or use the port Webuzo assigns (e.g., 30001):
```bash
kill $(lsof -t -i:30001)
```

**Environment Variables:**
```
NODE_ENV=production
NEXT_PUBLIC_BACKEND_PORT=$PORT
DATABASE_URL=your_database_url_here
```

**Note:** Webuzo will automatically assign a port. The `PORT` environment variable will be set by Webuzo. Just make sure `NODE_ENV=production` is set.

### Step 3: Create Startup File

Create `/home/httptruevault/git/Invtrade/backend/server.js`:

```javascript
// Backend Startup File for Webuzo
// This file starts the compiled backend application

const path = require('path');
const fs = require('fs');

console.log('Starting Invtrade Backend...');
console.log('Working directory:', __dirname);
console.log('Node version:', process.version);

// Load environment variables
const envPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('Loaded environment from:', envPath);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('No .env file found, using system environment variables');
}

// Start the backend server
const indexPath = path.join(__dirname, 'dist', 'index.js');

if (!fs.existsSync(indexPath)) {
  console.error('Error: dist/index.js not found!');
  console.error('Please run: npm run build');
  process.exit(1);
}

console.log('Starting backend from:', indexPath);
require(indexPath);
```

---

## Alternative: Simpler Startup Files

If the above doesn't work, use these simpler versions:

### Frontend server.js (Simple)

```javascript
// Simple frontend startup
require('child_process').spawn(
  'node',
  ['node_modules/next/dist/bin/next', 'start'],
  { stdio: 'inherit' }
);
```

### Backend server.js (Simple)

```javascript
// Simple backend startup
require('dotenv').config({ path: '../.env' });
require('./dist/index.js');
```

---

## Managing Applications in Webuzo

### Start/Stop/Restart

**Via Webuzo Panel:**
1. Go to **Applications** → **Node.js**
2. Find your application
3. Click **Start**, **Stop**, or **Restart**

**Via Command Line:**
```bash
# Frontend
webuzo-nodejs start invtrade-frontend
webuzo-nodejs stop invtrade-frontend
webuzo-nodejs restart invtrade-frontend

# Backend
webuzo-nodejs start invtrade-backend
webuzo-nodejs stop invtrade-backend
webuzo-nodejs restart invtrade-backend
```

### View Logs

**Via Webuzo Panel:**
1. Go to **Applications** → **Node.js**
2. Click on application name
3. View **Logs** tab

**Via Command Line:**
```bash
# Frontend logs
tail -f /home/httptruevault/logs/invtrade-frontend.log

# Backend logs
tail -f /home/httptruevault/logs/invtrade-backend.log
```

### Update Application

```bash
# Pull latest code
cd /home/httptruevault/git/Invtrade
git pull origin main

# Update frontend
cd frontend
npm install --legacy-peer-deps --include=dev
npm run build:i18n
npm run build

# Update backend
cd ../backend
npm install
npm run build

# Restart via Webuzo panel or:
webuzo-nodejs restart invtrade-frontend
webuzo-nodejs restart invtrade-backend
```

---

## Domain Configuration

### Frontend Domain

**Primary Domain:** `httptruevaultglobalbank.com`
**Aliases:** `www.httptruevaultglobalbank.com`

Webuzo will automatically configure Nginx/Apache to proxy to port 3000.

### Backend Domain

**Primary Domain:** `api.httptruevaultglobalbank.com`

Webuzo will automatically configure Nginx/Apache to proxy to port 30004.

---

## SSL Certificates

### Via Webuzo Panel

1. Go to **SSL** → **Let's Encrypt**
2. Select domain
3. Click **Install SSL**

Webuzo will automatically:
- Install SSL certificate
- Configure HTTPS
- Set up auto-renewal

---

## Environment Variables

### Set via Webuzo Panel

1. Go to **Applications** → **Node.js**
2. Click on application name
3. Go to **Environment Variables** tab
4. Add variables:

**Frontend:**
```
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_BACKEND_URL=https://api.httptruevaultglobalbank.com
NEXT_PUBLIC_SITE_URL=https://httptruevaultglobalbank.com
```

**Backend:**
```
NODE_ENV=production
NEXT_PUBLIC_BACKEND_PORT=30004
DATABASE_URL=your_database_url
```

### Or use .env file

Keep your `.env` file in `/home/httptruevault/git/Invtrade/.env` and the startup files will load it.

---

## Advantages of Webuzo Node.js Apps

✅ **Integrated Management** - Start/stop from Webuzo panel  
✅ **Automatic Proxy** - Nginx/Apache configured automatically  
✅ **SSL Integration** - Easy Let's Encrypt setup  
✅ **Domain Management** - Domains managed in one place  
✅ **Built-in Monitoring** - View logs and status in panel  
✅ **Auto-restart** - Applications restart on crash  
✅ **Resource Limits** - Set memory/CPU limits per app  

---

## Disadvantages vs PM2

❌ **Less Flexible** - Limited to Webuzo's configuration  
❌ **Webuzo Dependent** - Requires Webuzo panel access  
❌ **Limited Clustering** - Can't easily run multiple instances  

---

## Migration from PM2

If you're currently using PM2:

```bash
# Stop PM2 applications
pm2 stop all
pm2 delete all
pm2 save

# Disable PM2 startup
pm2 unstartup

# Then set up Webuzo Node.js applications as described above
```

---

## Troubleshooting

### Application Won't Start

1. **Check startup file exists:**
   ```bash
   ls -la /home/httptruevault/git/Invtrade/frontend/server.js
   ls -la /home/httptruevault/git/Invtrade/backend/server.js
   ```

2. **Check build output:**
   ```bash
   ls -la /home/httptruevault/git/Invtrade/frontend/.next
   ls -la /home/httptruevault/git/Invtrade/backend/dist
   ```

3. **Test startup file manually:**
   ```bash
   cd /home/httptruevault/git/Invtrade/frontend
   node server.js
   ```

4. **Check Webuzo logs:**
   - View in Webuzo panel under application logs
   - Or check system logs

### Port Already in Use

If PM2 is still running:
```bash
pm2 stop all
pm2 delete all
```

Check what's using the port:
```bash
lsof -i :3000
lsof -i :30004
```

### Build Errors

Make sure dependencies are installed:
```bash
cd frontend
npm install --legacy-peer-deps --include=dev

cd ../backend
npm install
```

---

## Summary

**Setup Steps:**
1. ✅ Build both applications
2. ✅ Create server.js files
3. ✅ Create Webuzo Node.js applications
4. ✅ Configure domains
5. ✅ Install SSL certificates
6. ✅ Set environment variables

**Management:**
- Start/stop via Webuzo panel
- View logs in panel
- Update code and restart

**Access:**
- Frontend: `https://httptruevaultglobalbank.com`
- Backend: `https://api.httptruevaultglobalbank.com`

---

**Webuzo Node.js applications provide a cleaner, more integrated solution for hosting on Webuzo!**
