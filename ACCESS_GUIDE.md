# How to Access Your Invtrade Applications

Your applications are now running! Here's how to access them.

## Current Status

✅ **Backend:** Running on port 30004  
✅ **Frontend:** Running on port 3000  
✅ **PM2:** Configured for auto-restart  
✅ **Startup:** Enabled on system boot  

## Access Methods

### Method 1: Direct Access (IP + Port)

**Frontend:**
```
http://YOUR_SERVER_IP:3000
```

**Backend API:**
```
http://YOUR_SERVER_IP:30004
```

**Example:**
```
http://123.45.67.89:3000      # Frontend
http://123.45.67.89:30004     # Backend
```

**To find your server IP:**
```bash
curl ifconfig.me
# or
ip addr show
```

### Method 2: Domain Access (Recommended)

To access via your domain names, you need to:

1. **Configure Nginx** (reverse proxy)
2. **Update DNS** (point domain to server)
3. **Install SSL** (HTTPS)

---

## Setup Nginx (Reverse Proxy)

### Step 1: Install Nginx (if not installed)

**CentOS/RHEL:**
```bash
sudo yum install nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Step 2: Configure Nginx

```bash
cd /home/httptruevault/git/Invtrade

# Make setup script executable
chmod +x setup-nginx.sh

# Run setup script
sudo ./setup-nginx.sh
```

Or manually:

```bash
# Copy configuration
sudo cp nginx-config.conf /etc/nginx/conf.d/invtrade.conf

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Step 3: Open Firewall Ports

**CentOS/RHEL (firewalld):**
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

**Ubuntu/Debian (ufw):**
```bash
sudo ufw allow 'Nginx Full'
sudo ufw reload
```

**Or open specific ports:**
```bash
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload
```

---

## Update DNS Records

Point your domains to your server IP:

### DNS Configuration

**A Records:**
```
httptruevaultglobalbank.com        → YOUR_SERVER_IP
www.httptruevaultglobalbank.com    → YOUR_SERVER_IP
api.httptruevaultglobalbank.com    → YOUR_SERVER_IP
```

**Example:**
```
httptruevaultglobalbank.com        → 123.45.67.89
www.httptruevaultglobalbank.com    → 123.45.67.89
api.httptruevaultglobalbank.com    → 123.45.67.89
```

**Wait for DNS propagation** (can take 5 minutes to 48 hours)

Check DNS propagation:
```bash
nslookup httptruevaultglobalbank.com
nslookup api.httptruevaultglobalbank.com
```

---

## Install SSL Certificate (HTTPS)

### Using Let's Encrypt (Free)

**Step 1: Install Certbot**

**CentOS/RHEL:**
```bash
sudo yum install certbot python3-certbot-nginx
```

**Ubuntu/Debian:**
```bash
sudo apt install certbot python3-certbot-nginx
```

**Step 2: Get SSL Certificates**

```bash
# For frontend domain
sudo certbot --nginx -d httptruevaultglobalbank.com -d www.httptruevaultglobalbank.com

# For backend API domain
sudo certbot --nginx -d api.httptruevaultglobalbank.com
```

Follow the prompts:
- Enter your email
- Agree to terms
- Choose to redirect HTTP to HTTPS (recommended)

**Step 3: Test Auto-Renewal**

```bash
sudo certbot renew --dry-run
```

Certbot will automatically renew certificates before they expire.

---

## Access Your Applications

After DNS and Nginx are configured:

### Frontend
```
https://httptruevaultglobalbank.com
https://www.httptruevaultglobalbank.com
```

### Backend API
```
https://api.httptruevaultglobalbank.com
```

---

## Verify Everything is Working

### 1. Check PM2 Status

```bash
pm2 list
```

Should show both applications as "online".

### 2. Check Application Logs

```bash
# View all logs
pm2 logs

# View frontend logs
pm2 logs invtrade-frontend

# View backend logs
pm2 logs invtrade-backend
```

### 3. Test Frontend

```bash
# Direct access
curl http://localhost:3000

# Via domain (after Nginx setup)
curl http://httptruevaultglobalbank.com
```

### 4. Test Backend API

```bash
# Direct access
curl http://localhost:30004/api/health

# Via domain (after Nginx setup)
curl http://api.httptruevaultglobalbank.com/api/health
```

### 5. Check Nginx Status

```bash
sudo systemctl status nginx
sudo nginx -t
```

---

## Troubleshooting

### Can't Access via IP:Port

**Check if applications are running:**
```bash
pm2 list
```

**Check if ports are listening:**
```bash
netstat -tulpn | grep 3000
netstat -tulpn | grep 30004
```

**Check firewall:**
```bash
# Temporarily disable to test
sudo systemctl stop firewalld  # CentOS/RHEL
sudo ufw disable               # Ubuntu/Debian

# If it works, open the ports properly
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=30004/tcp
sudo firewall-cmd --reload
```

### Can't Access via Domain

**Check DNS:**
```bash
nslookup httptruevaultglobalbank.com
ping httptruevaultglobalbank.com
```

**Check Nginx:**
```bash
sudo systemctl status nginx
sudo nginx -t
curl -I http://httptruevaultglobalbank.com
```

**Check Nginx logs:**
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### SSL Certificate Issues

**Check certificate status:**
```bash
sudo certbot certificates
```

**Renew certificate manually:**
```bash
sudo certbot renew
```

**Check Nginx SSL configuration:**
```bash
sudo nginx -t
```

---

## Quick Access Summary

| Service | Direct Access | Domain Access (after setup) |
|---------|--------------|----------------------------|
| Frontend | `http://SERVER_IP:3000` | `https://httptruevaultglobalbank.com` |
| Backend | `http://SERVER_IP:30004` | `https://api.httptruevaultglobalbank.com` |

---

## Next Steps

1. ✅ Applications are running
2. ⏳ Configure Nginx (run `./setup-nginx.sh`)
3. ⏳ Update DNS records
4. ⏳ Install SSL certificates
5. ⏳ Test access via domains
6. ⏳ Update frontend environment variables with production URLs

---

## Support

**View logs:**
```bash
pm2 logs
```

**Restart applications:**
```bash
./restart-all.sh
```

**Check status:**
```bash
pm2 list
pm2 monit
```

For detailed help, see:
- `WEBUZO_DEPLOYMENT.md` - Complete deployment guide
- `WEBUZO_QUICK_START.md` - Quick reference

---

**Your applications are running!** 🎉

Start with direct IP access to verify everything works, then set up Nginx and DNS for domain access.
