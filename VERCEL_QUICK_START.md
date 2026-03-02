# Vercel Deployment - Quick Start

## What Was Changed ✅

1. **`frontend/next.config.js`** - Updated to proxy uploads/logos to backend
2. **Backend CORS** - Already configured (no changes needed)
3. **WebSocket** - Already configured (no changes needed)

## Deploy in 5 Steps

### 1. Set Environment Variables on Vercel

```bash
NEXT_PUBLIC_BACKEND_URL=https://inv-api.mozdev.top
NEXT_PUBLIC_BACKEND_WS_URL=inv-api.mozdev.top
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
NODE_ENV=production

# Copy ALL other NEXT_PUBLIC_* variables from your .env
```

### 2. Configure Vercel Project

**Option A: Use vercel.json (Automatic)**

Already created at `frontend/vercel.json`:
```json
{
  "buildCommand": "npm run build:i18n && npm run build:vercel",
  "installCommand": "npm install --legacy-peer-deps --include=dev",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

**Option B: Manual Configuration**

In Vercel dashboard:
```
Root Directory: frontend
Build Command: npm run build:i18n && npm run build:vercel
Output Directory: .next
Install Command: npm install --legacy-peer-deps --include=dev
Node Version: 20.x
```

**Important:** The `--include=dev` flag is required to install `cross-env`!

### 3. Update Backend .env

```bash
# On Webuzo server
nano /home/httptruevault/git/Invtrade/backend/.env

# Update:
NEXT_PUBLIC_SITE_URL="https://your-app.vercel.app"
```

### 4. Restart Backend

```bash
# Via Webuzo panel or:
./webuzo-restart.sh backend
```

### 5. Deploy

```bash
vercel --prod
```

## Test

- [ ] Images load
- [ ] Uploads work
- [ ] WebSocket works
- [ ] No CORS errors

## Troubleshooting

**Build fails: "cross-env: command not found"**
- Ensure install command includes `--include=dev`
- Check `frontend/vercel.json` exists
- See `VERCEL_BUILD_FIX.md`

**Images not loading?**
- Check `NEXT_PUBLIC_BACKEND_URL` is set on Vercel

**CORS errors?**
- Update backend `NEXT_PUBLIC_SITE_URL`
- Restart backend

**WebSocket errors?**
- Check `NEXT_PUBLIC_BACKEND_WS_URL` (no `wss://`, just domain)
- Rebuild frontend

---

See `VERCEL_DEPLOYMENT_GUIDE.md` for complete details.
