# Quick Fix Commands - Copy & Paste

## All-in-One Fix (Recommended)

```bash
cd /home/httptruevault/git/Invtrade && \
git pull && \
cd backend && \
npm install viem && \
sed -i 's|NEXT_PUBLIC_SITE_URL="https://inv-app.mozdev.top"|NEXT_PUBLIC_SITE_URL="https://invtrade.vercel.app"|g' .env && \
cd .. && \
./webuzo-restart.sh backend && \
echo "✅ Backend fixed! Now deploy frontend to Vercel."
```

## Step-by-Step (If you prefer)

### 1. Pull Latest Code
```bash
cd /home/httptruevault/git/Invtrade
git pull
```

### 2. Install viem
```bash
cd backend
npm install viem
```

### 3. Update Backend .env
```bash
cd /home/httptruevault/git/Invtrade
sed -i 's|NEXT_PUBLIC_SITE_URL="https://inv-app.mozdev.top"|NEXT_PUBLIC_SITE_URL="https://invtrade.vercel.app"|g' backend/.env
```

### 4. Restart Backend
```bash
cd /home/httptruevault/git/Invtrade
./webuzo-restart.sh backend
```

### 5. Deploy Frontend to Vercel
```bash
cd frontend
vercel --prod
```

## Verify Everything Works

### Check Backend Status
```bash
pm2 status
pm2 logs invtrade-backend --lines 50
```

### Test CORS
```bash
curl -X OPTIONS https://inv-api.mozdev.top/api/auth/login \
  -H "Origin: https://invtrade.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -v 2>&1 | grep "Access-Control-Allow-Origin"
```

### Check viem Installation
```bash
cd /home/httptruevault/git/Invtrade/backend
npm list viem
```

## Expected Results

### Backend Logs Should Show:
```
✅ Server running on port 30004
✅ WebSocket server initialized
✅ Database connected
✅ No "Cannot find module 'viem'" errors
```

### CORS Test Should Return:
```
Access-Control-Allow-Origin: https://invtrade.vercel.app
```

### Frontend Should:
```
✅ Login works (no CORS error)
✅ WebSocket connects
✅ Images load
✅ No Envato security message
```

## Rollback (If Needed)

### Revert Backend .env
```bash
cd /home/httptruevault/git/Invtrade
sed -i 's|NEXT_PUBLIC_SITE_URL="https://invtrade.vercel.app"|NEXT_PUBLIC_SITE_URL="https://inv-app.mozdev.top"|g' backend/.env
./webuzo-restart.sh backend
```

### Revert Git Changes
```bash
cd /home/httptruevault/git/Invtrade
git reset --hard HEAD~1
```

## Support Both Domains (Optional)

If you want both Webuzo and Vercel to work:

```bash
cd /home/httptruevault/git/Invtrade
nano backend/.env
```

Add this line:
```bash
ADDITIONAL_ALLOWED_ORIGINS="https://inv-app.mozdev.top"
```

Then restart:
```bash
./webuzo-restart.sh backend
```

## Time Estimate

- **All-in-One Command:** 2-3 minutes
- **Step-by-Step:** 5-10 minutes
- **Verification:** 2 minutes

**Total:** ~10 minutes to complete deployment

---

**Copy the "All-in-One Fix" command and paste it into your SSH terminal!** 🚀
