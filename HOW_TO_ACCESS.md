# How to Access Your Applications - Quick Guide

Your applications are running! Here's how to access them.

## ✅ Current Status

Both applications are running successfully:
- **Frontend:** Port 3000 (online)
- **Backend:** Port 30004 (online)
- **PM2:** Auto-restart enabled
- **Startup:** Enabled on boot

## 🚀 Quick Access

### Option 1: Direct Access (Works Now)

**Find your server IP:**
```bash
curl ifconfig.me
```

**Access applications:**
```
Frontend: http://YOUR_SERVER_IP:3000
Backend:  http://YOUR_SERVER_IP:30004
```

**Example:**
```
http://123.45.67.89:3000      # Frontend
http://123.45.67.89:30004     # Backend API
```

### Option 2: Domain Access (Requires Setup)

To use your domain names:

**1. Setup Nginx (5 minutes):**
```bash
cd /home/httptruevault/git/Invtrade
chmod +x setup-nginx.sh
sudo ./setup-nginx.sh
```

**2. Update DNS:**
Point these domains to your server IP:
- `httptruevaultglobalbank.com` → YOUR_SERVER_IP
- `www.httptruevaultglobalbank.com` → YOUR_SERVER_IP
- `api.httptruevaultglobalbank.com` → YOUR_SERVER_IP

**3. Install SSL (Optional but Recommended):**
```bash
sudo yum install certbot python3-certbot-nginx
sudo certbot --nginx -d httptruevaultglobalbank.com -d www.httptruevaultglobalbank.com
sudo certbot --nginx -d api.httptruevaultglobalbank.com
```

**Then access via:**
```
https://httptruevaultglobalbank.com      # Frontend
https://api.httptruevaultglobalbank.com  # Backend
```

## 🔍 Verify Everything Works

### Check PM2 Status
```bash
pm2 list
```

### View Logs
```bash
pm2 logs
```

### Test Frontend
```bash
curl http://localhost:3000
```

### Test Backend
```bash
curl http://localhost:30004/api/health
```

## 🛠️ Management Commands

```bash
# View status
pm2 list

# View logs
pm2 logs

# Restart
./restart-all.sh

# Stop
./stop-all.sh

# Start
./start-all.sh
```

## 📚 Full Documentation

- `ACCESS_GUIDE.md` - Complete access guide
- `WEBUZO_DEPLOYMENT.md` - Full deployment documentation
- `WEBUZO_QUICK_START.md` - Quick reference

## 🎉 You're All Set!

Your applications are running and ready to use. Start with direct IP access to test, then set up Nginx and DNS for production domain access.

**Need help?** Check the logs: `pm2 logs`
