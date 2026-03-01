# Webuzo Deployment Guide

Complete guide for deploying frontend and backend on Webuzo hosting.

## Prerequisites

- Webuzo hosting account with Node.js support
- SSH access to your server
- Git installed on server
- PM2 installed globally (for process management)

## Directory Structure

```
/home/httptruevault/
├── git/
│   └── Invtrade/
│       ├── frontend/
│       └── backend/
├── logs/
│   ├── frontend-error.log
│   ├── frontend-out.log
│   ├── backend-error.log
│   └── backend-out.log
└── public_html/  (optional, for static files)
```

---

## Initial Setup

### 1. Install PM2 (if not installed)

```bash
npm install -g pm2
```

### 2. Create Logs Directory

```bash
mkdir -p /home/httptruevault/logs
```

### 3. Clone Repository

```bash
cd /home/httptruevault/git
git clone https://github.com/mmosix-anv/Invtrade.git
cd Invtrade
```

---

## Frontend Deployment

### Step 1: Install Dependencies

```bash
cd /home/httptruevault/git/Invtrade/frontend
npm install --legacy-peer-deps --include=dev
```

### Step 2: Build Application

```bash
npm run build:i18n
npm run build
```

This creates the `.next` folder with the production build.

### Step 3: Configure PM2

The `ecosystem.config.js` file is already configured. Review and adjust if needed:

```javascript
// frontend/ecosystem.config.js
module.exports = {
  apps: [{
    name: "invtrade-frontend",
    script: "node_modules/next/dist/bin/next",
    args: "start",
    cwd: "/home/httptruevault/git/Invtrade/frontend",
    instances: 1,
    exec_mode: "cluster",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
    },
    // ... other settings
  }]
};
```

### Step 4: Start Frontend

```bash
cd /home/httptruevault/git/Invtrade/frontend
pm2 start ecosystem.config.js
```

### Step 5: Save PM2 Configuration

```bash
pm2 save
pm2 startup
```

Follow the instructions to enable PM2 to start on system boot.

---

## Backend Deployment

### Step 1: Install Dependencies

```bash
cd /home/httptruevault/git/Invtrade/backend
npm install
```

### Step 2: Build Application

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist` folder.

### Step 3: Configure PM2

The `ecosystem.config.js` file is already configured. Review and adjust if needed:

```javascript
// backend/ecosystem.config.js
module.exports = {
  apps: [{
    name: "invtrade-backend",
    script: "dist/index.js",
    cwd: "/home/httptruevault/git/Invtrade/backend",
    instances: 1,
    exec_mode: "cluster",
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_BACKEND_PORT: 30004,
    },
    // ... other settings
  }]
};
```

### Step 4: Start Backend

```bash
cd /home/httptruevault/git/Invtrade/backend
pm2 start ecosystem.config.js
```

### Step 5: Save PM2 Configuration

```bash
pm2 save
```

---

## PM2 Commands Reference

### Start Applications

```bash
# Start frontend
cd /home/httptruevault/git/Invtrade/frontend
pm2 start ecosystem.config.js

# Start backend
cd /home/httptruevault/git/Invtrade/backend
pm2 start ecosystem.config.js

# Start both (from root)
pm2 start frontend/ecosystem.config.js
pm2 start backend/ecosystem.config.js
```

### Stop Applications

```bash
# Stop frontend
pm2 stop invtrade-frontend

# Stop backend
pm2 stop invtrade-backend

# Stop all
pm2 stop all
```

### Restart Applications

```bash
# Restart frontend
pm2 restart invtrade-frontend

# Restart backend
pm2 restart invtrade-backend

# Restart all
pm2 restart all
```

### Delete Applications

```bash
# Delete frontend
pm2 delete invtrade-frontend

# Delete backend
pm2 delete invtrade-backend

# Delete all
pm2 delete all
```

### View Status

```bash
# List all applications
pm2 list

# Show detailed info
pm2 show invtrade-frontend
pm2 show invtrade-backend
```

### View Logs

```bash
# View all logs
pm2 logs

# View frontend logs
pm2 logs invtrade-frontend

# View backend logs
pm2 logs invtrade-backend

# View last 100 lines
pm2 logs --lines 100

# View error logs only
pm2 logs --err

# Clear logs
pm2 flush
```

### Monitor Applications

```bash
# Real-time monitoring
pm2 monit

# Web-based monitoring (optional)
pm2 web
```

---

## Environment Variables

### Frontend Environment Variables

Create or update `/home/httptruevault/git/Invtrade/frontend/.env`:

```bash
# Application
NEXT_PUBLIC_SITE_URL=https://httptruevaultglobalbank.com
NEXT_PUBLIC_BACKEND_URL=https://api.httptruevaultglobalbank.com
NEXT_PUBLIC_BACKEND_PORT=443
NEXT_PUBLIC_DEFAULT_LANGUAGE=en
NEXT_PUBLIC_APP_NAME=Invtrade

# Optional
NEXT_PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY=your-key
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-project-id
```

### Backend Environment Variables

Use the existing `.env` file in the root or create one in backend folder.

---

## Nginx Configuration (Reverse Proxy)

If using Nginx as a reverse proxy, configure it to forward requests:

### Frontend (Port 3000)

```nginx
server {
    listen 80;
    server_name httptruevaultglobalbank.com www.httptruevaultglobalbank.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Backend (Port 30004)

```nginx
server {
    listen 80;
    server_name api.httptruevaultglobalbank.com;

    location / {
        proxy_pass http://localhost:30004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Deployment Scripts

### Quick Start Script

Create `/home/httptruevault/git/Invtrade/start-all.sh`:

```bash
#!/bin/bash

echo "Starting Invtrade applications..."

# Start backend
echo "Starting backend..."
cd /home/httptruevault/git/Invtrade/backend
pm2 start ecosystem.config.js

# Start frontend
echo "Starting frontend..."
cd /home/httptruevault/git/Invtrade/frontend
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

echo "All applications started!"
pm2 list
```

Make it executable:
```bash
chmod +x /home/httptruevault/git/Invtrade/start-all.sh
```

### Quick Stop Script

Create `/home/httptruevault/git/Invtrade/stop-all.sh`:

```bash
#!/bin/bash

echo "Stopping Invtrade applications..."

pm2 stop invtrade-frontend
pm2 stop invtrade-backend

echo "All applications stopped!"
pm2 list
```

Make it executable:
```bash
chmod +x /home/httptruevault/git/Invtrade/stop-all.sh
```

### Update and Restart Script

Create `/home/httptruevault/git/Invtrade/update-and-restart.sh`:

```bash
#!/bin/bash

echo "Updating Invtrade applications..."

# Pull latest code
cd /home/httptruevault/git/Invtrade
git pull origin main

# Update and rebuild backend
echo "Updating backend..."
cd backend
npm install
npm run build
pm2 restart invtrade-backend

# Update and rebuild frontend
echo "Updating frontend..."
cd ../frontend
npm install --legacy-peer-deps --include=dev
npm run build:i18n
npm run build
pm2 restart invtrade-frontend

echo "Update complete!"
pm2 list
```

Make it executable:
```bash
chmod +x /home/httptruevault/git/Invtrade/update-and-restart.sh
```

---

## Usage

### Start Applications

```bash
# Using PM2 directly
cd /home/httptruevault/git/Invtrade/frontend
pm2 start ecosystem.config.js

cd /home/httptruevault/git/Invtrade/backend
pm2 start ecosystem.config.js

# Or using the script
/home/httptruevault/git/Invtrade/start-all.sh
```

### Stop Applications

```bash
# Using PM2 directly
pm2 stop invtrade-frontend
pm2 stop invtrade-backend

# Or using the script
/home/httptruevault/git/Invtrade/stop-all.sh
```

### Restart Applications

```bash
pm2 restart invtrade-frontend
pm2 restart invtrade-backend
```

### Update and Restart

```bash
/home/httptruevault/git/Invtrade/update-and-restart.sh
```

---

## Troubleshooting

### Application Won't Start

1. **Check logs:**
   ```bash
   pm2 logs invtrade-frontend --lines 50
   pm2 logs invtrade-backend --lines 50
   ```

2. **Check if port is in use:**
   ```bash
   lsof -i :3000  # Frontend
   lsof -i :30004 # Backend
   ```

3. **Check build output:**
   ```bash
   ls -la frontend/.next
   ls -la backend/dist
   ```

### Application Crashes

1. **Check error logs:**
   ```bash
   cat /home/httptruevault/logs/frontend-error.log
   cat /home/httptruevault/logs/backend-error.log
   ```

2. **Check PM2 status:**
   ```bash
   pm2 list
   pm2 show invtrade-frontend
   pm2 show invtrade-backend
   ```

3. **Restart with logs:**
   ```bash
   pm2 restart invtrade-frontend --update-env
   pm2 logs invtrade-frontend
   ```

### Database Connection Issues

1. **Check environment variables:**
   ```bash
   pm2 env invtrade-backend
   ```

2. **Test database connection:**
   ```bash
   cd /home/httptruevault/git/Invtrade/backend
   node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL)"
   ```

### Memory Issues

1. **Check memory usage:**
   ```bash
   pm2 monit
   ```

2. **Increase memory limit in ecosystem.config.js:**
   ```javascript
   max_memory_restart: "2G"  // Increase from 1G to 2G
   ```

3. **Restart application:**
   ```bash
   pm2 restart invtrade-frontend --update-env
   ```

---

## Monitoring and Maintenance

### Daily Checks

```bash
# Check application status
pm2 list

# Check logs for errors
pm2 logs --err --lines 20

# Check memory usage
pm2 monit
```

### Weekly Maintenance

```bash
# Clear old logs
pm2 flush

# Update applications
/home/httptruevault/git/Invtrade/update-and-restart.sh

# Check for updates
cd /home/httptruevault/git/Invtrade
git fetch
git status
```

### Backup

```bash
# Backup PM2 configuration
pm2 save

# Backup environment files
cp /home/httptruevault/git/Invtrade/.env /home/httptruevault/backups/.env.$(date +%Y%m%d)
```

---

## SSL/HTTPS Setup

If using Let's Encrypt with Certbot:

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d httptruevaultglobalbank.com -d www.httptruevaultglobalbank.com
sudo certbot --nginx -d api.httptruevaultglobalbank.com

# Auto-renewal
sudo certbot renew --dry-run
```

---

## Performance Optimization

### Enable Clustering

Update ecosystem.config.js to use multiple instances:

```javascript
instances: "max",  // Use all CPU cores
exec_mode: "cluster",
```

### Enable Compression

Nginx gzip compression is usually enabled by default. Verify in nginx.conf:

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;
```

---

## Quick Reference

### Essential Commands

| Action | Command |
|--------|---------|
| Start frontend | `pm2 start frontend/ecosystem.config.js` |
| Start backend | `pm2 start backend/ecosystem.config.js` |
| Stop frontend | `pm2 stop invtrade-frontend` |
| Stop backend | `pm2 stop invtrade-backend` |
| Restart frontend | `pm2 restart invtrade-frontend` |
| Restart backend | `pm2 restart invtrade-backend` |
| View logs | `pm2 logs` |
| View status | `pm2 list` |
| Monitor | `pm2 monit` |

### File Locations

| Item | Path |
|------|------|
| Frontend code | `/home/httptruevault/git/Invtrade/frontend` |
| Backend code | `/home/httptruevault/git/Invtrade/backend` |
| Frontend logs | `/home/httptruevault/logs/frontend-*.log` |
| Backend logs | `/home/httptruevault/logs/backend-*.log` |
| PM2 config | `~/.pm2/` |
| Environment | `/home/httptruevault/git/Invtrade/.env` |

---

## Support

For issues:
1. Check logs: `pm2 logs`
2. Check status: `pm2 list`
3. Review error logs in `/home/httptruevault/logs/`
4. Check Nginx logs: `/var/log/nginx/error.log`

---

**Last Updated:** 2026-03-01  
**Status:** Production Ready
