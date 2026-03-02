# CORS Fix for Vercel Deployment

## Error

```
Access to fetch at 'https://inv-api.mozdev.top/api/auth/login' 
from origin 'https://invtrade.vercel.app' 
has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Root Cause

The backend is not allowing requests from your Vercel domain (`https://invtrade.vercel.app`).

## Solution

### Step 1: Update Backend Environment Variable

SSH into your Webuzo server and update the backend `.env`:

```bash
# SSH to server
ssh your-server

# Navigate to project
cd /home/httptruevault/git/Invtrade

# Edit backend .env
nano backend/.env
```

**Find this line:**
```bash
NEXT_PUBLIC_SITE_URL="https://inv-app.mozdev.top"
```

**Change to:**
```bash
NEXT_PUBLIC_SITE_URL="https://invtrade.vercel.app"
```

**Save:** Press `Ctrl+X`, then `Y`, then `Enter`

### Step 2: Restart Backend

```bash
# Via Webuzo panel:
# Applications → Node.js → invtrade-backend → Restart

# Or via script:
./webuzo-restart.sh backend

# Or manually:
cd backend
pm2 restart invtrade-backend
```

### Step 3: Verify

Wait 10-20 seconds for backend to restart, then test login again.

## Alternative: Support Multiple Domains

If you want to support BOTH domains (Webuzo and Vercel), you need to update the backend code.

### Option A: Add Environment Variable for Multiple Origins

**Update `backend/.env`:**
```bash
NEXT_PUBLIC_SITE_URL="https://invtrade.vercel.app"
ADDITIONAL_ALLOWED_ORIGINS="https://inv-app.mozdev.top,https://www.invtrade.vercel.app"
```

**Update `backend/dist/src/utils/index.js`:**

Find the `getProdOrigins` function and add:

```javascript
const getProdOrigins = () => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return [];
  
  const origins = [
    siteUrl,
    siteUrl.replace('http://', 'https://'),
    siteUrl.replace('https://', 'http://'),
  ];
  
  // Add www and non-www variants
  const withoutWww = siteUrl.replace('://www.', '://');
  const withWww = siteUrl.replace('://', '://www.');
  
  if (withoutWww !== siteUrl) {
    origins.push(withoutWww, withoutWww.replace('http://', 'https://'), withoutWww.replace('https://', 'http://'));
  }
  if (withWww !== siteUrl && !withWww.includes('://www.www.')) {
    origins.push(withWww, withWww.replace('http://', 'https://'), withWww.replace('https://', 'http://'));
  }
  
  // Add additional origins from environment variable
  const additionalOrigins = process.env.ADDITIONAL_ALLOWED_ORIGINS;
  if (additionalOrigins) {
    const extraOrigins = additionalOrigins.split(',').map(o => o.trim());
    origins.push(...extraOrigins);
  }
  
  // Remove duplicates
  return [...new Set(origins)];
};
```

### Option B: Quick Fix - Allow Both Domains

**Edit `backend/.env`:**
```bash
# Use comma-separated list (if backend supports it)
NEXT_PUBLIC_SITE_URL="https://invtrade.vercel.app,https://inv-app.mozdev.top"
```

**Note:** This might not work with current code. Use Option A for proper support.

## Testing

### 1. Check Backend Logs

```bash
# On Webuzo server
tail -f /home/httptruevault/logs/backend.log

# Or if using PM2
pm2 logs invtrade-backend
```

Look for CORS-related messages.

### 2. Test with curl

```bash
# Test OPTIONS request (preflight)
curl -X OPTIONS https://inv-api.mozdev.top/api/auth/login \
  -H "Origin: https://invtrade.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -v

# Should see:
# Access-Control-Allow-Origin: https://invtrade.vercel.app
```

### 3. Test in Browser

1. Open `https://invtrade.vercel.app`
2. Open DevTools (F12)
3. Try to login
4. Check Network tab for CORS headers

## Troubleshooting

### Issue: Still Getting CORS Error

**Check:**
1. Backend restarted successfully
2. Environment variable updated correctly
3. No typos in domain name
4. Using HTTPS (not HTTP)

**Verify backend is running:**
```bash
curl https://inv-api.mozdev.top/api/health
```

### Issue: Backend Not Restarting

**Check status:**
```bash
pm2 status
# or
./webuzo-status.sh
```

**Force restart:**
```bash
pm2 restart invtrade-backend --update-env
```

### Issue: Multiple Domains Not Working

**Solution:** Use the code update in Option A above to support multiple origins.

## Quick Fix Commands

```bash
# All-in-one fix
cd /home/httptruevault/git/Invtrade
sed -i 's|NEXT_PUBLIC_SITE_URL="https://inv-app.mozdev.top"|NEXT_PUBLIC_SITE_URL="https://invtrade.vercel.app"|g' backend/.env
./webuzo-restart.sh backend

# Wait 20 seconds
sleep 20

# Test
curl -X OPTIONS https://inv-api.mozdev.top/api/auth/login \
  -H "Origin: https://invtrade.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -v | grep "Access-Control-Allow-Origin"
```

## Expected Result

After fix, you should see in Network tab:

```
Request Headers:
  Origin: https://invtrade.vercel.app

Response Headers:
  Access-Control-Allow-Origin: https://invtrade.vercel.app
  Access-Control-Allow-Credentials: true
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
  Access-Control-Allow-Headers: Content-Type, Authorization
```

## Summary

**Problem:** Backend not allowing Vercel domain  
**Solution:** Update `NEXT_PUBLIC_SITE_URL` in backend `.env`  
**Steps:**
1. Edit `backend/.env`
2. Change `NEXT_PUBLIC_SITE_URL` to `https://invtrade.vercel.app`
3. Restart backend
4. Test login

**Time:** 2-3 minutes

---

**After this fix, login and all API calls should work!**
