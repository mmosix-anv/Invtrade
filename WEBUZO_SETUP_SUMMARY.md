# Webuzo Setup Summary

Complete setup for running Invtrade on Webuzo hosting.

## Files Created

### PM2 Ecosystem Configuration
- ✅ `backend/ecosystem.config.js` - Backend PM2 configuration
- ✅ `frontend/ecosystem.config.js` - Frontend PM2 configuration

### Management Scripts
- ✅ `start-all.sh` - Start both applications
- ✅ `stop-all.sh` - Stop both applications
- ✅ `restart-all.sh` - Restart both applications
- ✅ `update-and-restart.sh` - Pull code, rebuild, and restart

### Documentation
- ✅ `WEBUZO_DEPLOYMENT.md` - Complete deployment guide
- ✅ `WEBUZO_QUICK_START.md` - Quick reference guide

## Setup Instructions

### 1. Make Scripts Executable

```bash
cd /home/httptruevault/git/Invtrade
chmod +x start-all.sh
chmod +x stop-all.sh
chmod +x restart-all.sh
chmod +x update-and-restart.sh
```

### 2. Install PM2 (if not installed)

```bash
npm install -g pm2
```

### 3. Create Logs Directory

```bash
mkdir -p /home/httptruevault/logs
```

### 4. Install Dependencies

```bash
# Frontend
cd /home/httptruevault/git/Invtrade/frontend
npm install --legacy-peer-deps --include=dev

# Backend
cd /home/httptruevault/git/Invtrade/backend
npm install
```

### 5. Build Applications

```bash
# Frontend
cd /home/httptruevault/git/Invtrade/frontend
npm run build:i18n
npm run build

# Backend
cd /home/httptruevault/git/Invtrade/backend
npm run build
```

### 6. Start Applications

```bash
cd /home/httptruevault/git/Invtrade
./start-all.sh
```

### 7. Enable Auto-Start on Boot

```bash
pm2 startup
# Follow the instructions shown
pm2 save
```

## Usage

### Start Applications

```bash
cd /home/httptruevault/git/Invtrade
./start-all.sh
```

### Stop Applications

```bash
cd /home/httptruevault/git/Invtrade
./stop-all.sh
```

### Restart Applications

```bash
cd /home/httptruevault/git/Invtrade
./restart-all.sh
```

### Update and Restart

```bash
cd /home/httptruevault/git/Invtrade
./update-and-restart.sh
```

## PM2 Commands

### View Status

```bash
pm2 list
```

### View Logs

```bash
pm2 logs
pm2 logs invtrade-frontend
pm2 logs invtrade-backend
```

### Monitor

```bash
pm2 monit
```

### Manual Control

```bash
# Start
pm2 start frontend/ecosystem.config.js
pm2 start backend/ecosystem.config.js

# Stop
pm2 stop invtrade-frontend
pm2 stop invtrade-backend

# Restart
pm2 restart invtrade-frontend
pm2 restart invtrade-backend

# Delete
pm2 delete invtrade-frontend
pm2 delete invtrade-backend
```

## Configuration

### Frontend (ecosystem.config.js)

```javascript
{
  name: "invtrade-frontend",
  script: "node_modules/next/dist/bin/next",
  args: "start",
  cwd: "/home/httptruevault/git/Invtrade/frontend",
  instances: 1,
  env: {
    NODE_ENV: "production",
    PORT: 3000,
  }
}
```

### Backend (ecosystem.config.js)

```javascript
{
  name: "invtrade-backend",
  script: "dist/index.js",
  cwd: "/home/httptruevault/git/Invtrade/backend",
  instances: 1,
  env: {
    NODE_ENV: "production",
    NEXT_PUBLIC_BACKEND_PORT: 30004,
  }
}
```

## Ports

- Frontend: `3000`
- Backend: `30004`

## Log Files

- Frontend Error: `/home/httptruevault/logs/frontend-error.log`
- Frontend Output: `/home/httptruevault/logs/frontend-out.log`
- Backend Error: `/home/httptruevault/logs/backend-error.log`
- Backend Output: `/home/httptruevault/logs/backend-out.log`

## Troubleshooting

### Check if applications are running

```bash
pm2 list
```

### Check logs for errors

```bash
pm2 logs --err --lines 50
```

### Check if ports are in use

```bash
lsof -i :3000   # Frontend
lsof -i :30004  # Backend
```

### Restart applications

```bash
./restart-all.sh
```

### Clear logs

```bash
pm2 flush
```

## Nginx Configuration (Optional)

If using Nginx as reverse proxy, configure it to forward:
- Port 80/443 → Port 3000 (Frontend)
- api.domain.com → Port 30004 (Backend)

See `WEBUZO_DEPLOYMENT.md` for Nginx configuration examples.

## Next Steps

1. ✅ Scripts created and made executable
2. ✅ PM2 ecosystem files configured
3. ⏳ Install dependencies
4. ⏳ Build applications
5. ⏳ Start applications
6. ⏳ Configure Nginx (if needed)
7. ⏳ Set up SSL certificates (if needed)
8. ⏳ Enable PM2 startup on boot

## Support

For detailed instructions, see:
- `WEBUZO_DEPLOYMENT.md` - Complete guide
- `WEBUZO_QUICK_START.md` - Quick reference

For issues:
1. Check logs: `pm2 logs`
2. Check status: `pm2 list`
3. Review error logs in `/home/httptruevault/logs/`

---

**Status:** ✅ Configuration Complete  
**Date:** 2026-03-01  
**Ready for:** Deployment on Webuzo
