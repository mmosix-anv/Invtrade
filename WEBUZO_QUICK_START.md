# Webuzo Quick Start Guide

Quick reference for managing Invtrade on Webuzo.

## Initial Setup (One Time)

```bash
# 1. Install PM2 globally
npm install -g pm2

# 2. Create logs directory
mkdir -p /home/httptruevault/logs

# 3. Make scripts executable
cd /home/httptruevault/git/Invtrade
chmod +x *.sh

# 4. Install dependencies and build
cd frontend
npm install --legacy-peer-deps --include=dev
npm run build:i18n && npm run build

cd ../backend
npm install
npm run build

# 5. Start applications
cd ..
./start-all.sh

# 6. Enable PM2 startup on boot
pm2 startup
# Follow the instructions shown
pm2 save
```

## Daily Commands

### Start Applications

```bash
# Using script (recommended)
cd /home/httptruevault/git/Invtrade
./start-all.sh

# Or manually
pm2 start frontend/ecosystem.config.js
pm2 start backend/ecosystem.config.js
```

### Stop Applications

```bash
# Using script
cd /home/httptruevault/git/Invtrade
./stop-all.sh

# Or manually
pm2 stop invtrade-frontend
pm2 stop invtrade-backend
```

### Restart Applications

```bash
# Using script
cd /home/httptruevault/git/Invtrade
./restart-all.sh

# Or manually
pm2 restart invtrade-frontend
pm2 restart invtrade-backend
```

### Update and Restart

```bash
cd /home/httptruevault/git/Invtrade
./update-and-restart.sh
```

## Monitoring

### View Status

```bash
pm2 list
```

### View Logs

```bash
# All logs
pm2 logs

# Frontend only
pm2 logs invtrade-frontend

# Backend only
pm2 logs invtrade-backend

# Last 50 lines
pm2 logs --lines 50

# Error logs only
pm2 logs --err
```

### Real-time Monitoring

```bash
pm2 monit
```

## Troubleshooting

### Application Not Starting

```bash
# Check logs
pm2 logs invtrade-frontend --lines 100
pm2 logs invtrade-backend --lines 100

# Check if port is in use
lsof -i :3000   # Frontend
lsof -i :30004  # Backend

# Check build output
ls -la frontend/.next
ls -la backend/dist
```

### Application Crashed

```bash
# View error logs
pm2 logs --err

# Restart application
pm2 restart invtrade-frontend
pm2 restart invtrade-backend

# Or restart all
./restart-all.sh
```

### Clear Logs

```bash
pm2 flush
```

## File Locations

| Item | Path |
|------|------|
| Frontend code | `/home/httptruevault/git/Invtrade/frontend` |
| Backend code | `/home/httptruevault/git/Invtrade/backend` |
| Frontend logs | `/home/httptruevault/logs/frontend-*.log` |
| Backend logs | `/home/httptruevault/logs/backend-*.log` |
| Scripts | `/home/httptruevault/git/Invtrade/*.sh` |

## Ports

- Frontend: `3000`
- Backend: `30004`

## URLs

- Frontend: `http://localhost:3000` or `https://httptruevaultglobalbank.com`
- Backend: `http://localhost:30004` or `https://api.httptruevaultglobalbank.com`

## PM2 Ecosystem Files

- Frontend: `frontend/ecosystem.config.js`
- Backend: `backend/ecosystem.config.js`

## Environment Variables

- Root: `/home/httptruevault/git/Invtrade/.env`
- Frontend: `/home/httptruevault/git/Invtrade/frontend/.env`

## Quick Commands Reference

```bash
# Start
./start-all.sh

# Stop
./stop-all.sh

# Restart
./restart-all.sh

# Update
./update-and-restart.sh

# Status
pm2 list

# Logs
pm2 logs

# Monitor
pm2 monit
```

## Need Help?

See full documentation: `WEBUZO_DEPLOYMENT.md`
