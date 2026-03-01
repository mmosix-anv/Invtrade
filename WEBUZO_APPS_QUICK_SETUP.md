# Webuzo Node.js Apps - Quick Setup Guide

Set up Frontend and Backend as separate Webuzo Node.js applications.

## Why Use Webuzo Node.js Apps?

✅ Manage from Webuzo panel (no command line needed)  
✅ Automatic domain and SSL configuration  
✅ Built-in monitoring and logs  
✅ Auto-restart on crash  
✅ Easy start/stop/restart  

## Prerequisites

- [x] Code in `/home/httptruevault/git/Invtrade`
- [x] Node.js 20.x installed
- [x] Webuzo panel access

## Step 1: Build Applications

```bash
# Build frontend
cd /home/httptruevault/git/Invtrade/frontend
npm install --legacy-peer-deps --include=dev
npm run build:i18n && npm run build

# Build backend
cd /home/httptruevault/git/Invtrade/backend
npm install
npm run build
```

## Step 2: Stop PM2 (if running)

```bash
pm2 stop all
pm2 delete all
pm2 save
pm2 unstartup
```

## Step 3: Create Frontend App in Webuzo

**In Webuzo Panel:**

1. Go to **Applications** → **Node.js**
2. Click **Install Node.js Application**
3. Fill in:

```
Application Name: invtrade-frontend
Domain: httptruevaultglobalbank.com
Application Path: /home/httptruevault/git/Invtrade/frontend
Node.js Version: 20.x
Application Port: 3000
Startup File: server.js
Environment: production
```

4. Add Environment Variables:
```
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_BACKEND_URL=https://api.httptruevaultglobalbank.com
NEXT_PUBLIC_SITE_URL=https://httptruevaultglobalbank.com
```

5. Click **Install**

## Step 4: Create Backend App in Webuzo

**In Webuzo Panel:**

1. Go to **Applications** → **Node.js**
2. Click **Install Node.js Application**
3. Fill in:

```
Application Name: invtrade-backend
Domain: api.httptruevaultglobalbank.com
Application Path: /home/httptruevault/git/Invtrade/backend
Node.js Version: 20.x
Application Port: 30004
Startup File: server.js
Environment: production
```

4. Add Environment Variables:
```
NODE_ENV=production
NEXT_PUBLIC_BACKEND_PORT=30004
```

5. Click **Install**

## Step 5: Install SSL Certificates

**In Webuzo Panel:**

1. Go to **SSL** → **Let's Encrypt**
2. Select `httptruevaultglobalbank.com`
3. Click **Install SSL**
4. Repeat for `api.httptruevaultglobalbank.com`

## Step 6: Access Your Applications

```
Frontend: https://httptruevaultglobalbank.com
Backend:  https://api.httptruevaultglobalbank.com
```

## Managing Applications

### Via Webuzo Panel

**Start/Stop/Restart:**
1. Go to **Applications** → **Node.js**
2. Find your application
3. Click **Start**, **Stop**, or **Restart**

**View Logs:**
1. Click on application name
2. Go to **Logs** tab

### Via Command Line (if available)

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

## Updating Applications

```bash
# Pull latest code
cd /home/httptruevault/git/Invtrade
git pull origin main

# Update frontend
cd frontend
npm install --legacy-peer-deps --include=dev
npm run build:i18n && npm run build

# Update backend
cd ../backend
npm install
npm run build

# Restart via Webuzo panel
```

## Troubleshooting

### Application Won't Start

1. **Check build output:**
   ```bash
   ls -la frontend/.next
   ls -la backend/dist
   ```

2. **Test startup file:**
   ```bash
   cd frontend
   node server.js
   ```

3. **Check logs in Webuzo panel**

### Port Already in Use

```bash
# Check what's using the port
lsof -i :3000
lsof -i :30004

# Kill if needed
kill -9 <PID>
```

### Build Errors

```bash
# Clean install
cd frontend
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps --include=dev
npm run build:i18n && npm run build

cd ../backend
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Files Created

- ✅ `frontend/server.js` - Frontend startup file
- ✅ `backend/server.js` - Backend startup file
- ✅ `WEBUZO_NODE_APPS.md` - Complete documentation

## Comparison: PM2 vs Webuzo Apps

| Feature | PM2 | Webuzo Apps |
|---------|-----|-------------|
| Management | Command line | Web panel |
| Monitoring | `pm2 monit` | Built-in panel |
| Logs | `pm2 logs` | Web panel |
| SSL | Manual | Integrated |
| Domains | Manual Nginx | Automatic |
| Auto-restart | Yes | Yes |
| Clustering | Easy | Limited |

## Summary

**Webuzo Node.js Apps** provide a cleaner, more integrated solution:
- Manage everything from Webuzo panel
- Automatic domain and SSL configuration
- Built-in monitoring and logs
- Perfect for production hosting

**PM2** is better for:
- Development environments
- Multiple instances/clustering
- Advanced process management
- Command-line preference

---

**Choose Webuzo Apps for easier management and better integration with Webuzo hosting!**
