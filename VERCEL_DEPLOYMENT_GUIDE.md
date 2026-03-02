# Vercel Deployment Guide - Complete Setup

## Overview

This guide will help you deploy the frontend to Vercel while keeping the backend on Webuzo.

**Architecture:**
```
Frontend (Vercel) → Backend (Webuzo)
  ↓ /uploads/* → Proxied via Next.js rewrites
  ↓ /img/logo/* → Proxied via Next.js rewrites
  ↓ /api/* → Direct API calls
```

## Changes Made ✅

### 1. Updated `frontend/next.config.js`

The rewrites function now proxies uploads and logos to the backend in production:

```javascript
async rewrites() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  if (backendUrl) {
    return [
      {
        source: "/uploads/:path*",
        destination: `${backendUrl}/uploads/:path*`,
      },
      {
        source: "/img/logo/:path*",
        destination: `${backendUrl}/img/logo/:path*`,
      },
    ];
  }
  // ... development fallback
}
```

### 2. Backend CORS Already Configured ✅

The backend automatically allows origins from `NEXT_PUBLIC_SITE_URL`, so no backend changes needed!

## Deployment Steps

### Step 1: Prepare Environment Variables

Create a file with your Vercel environment variables:

```bash
# Production URLs
NEXT_PUBLIC_BACKEND_URL=https://inv-api.mozdev.top
NEXT_PUBLIC_BACKEND_WS_URL=inv-api.mozdev.top
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
NODE_ENV=production

# Other required variables (copy from your .env)
NEXT_PUBLIC_SITE_NAME=Invtrade
NEXT_PUBLIC_DEFAULT_LANGUAGE=en
NEXT_PUBLIC_DEFAULT_THEME=dark

# Database (if needed by frontend)
NEXT_PUBLIC_SUPABASE_URL=https://haspwjdvxkfmsxgxofyt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Add any other NEXT_PUBLIC_* variables from your .env
```

### Step 2: Deploy to Vercel

#### Option A: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to frontend
cd frontend

# Deploy
vercel

# Follow prompts:
# - Link to existing project or create new
# - Set root directory: frontend
# - Build command: npm run build:i18n && npm run build:vercel
# - Output directory: .next
# - Install command: npm install --legacy-peer-deps --include=dev
```

#### Option B: Via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your Git repository
4. Configure:
   - **Framework Preset:** Next.js
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build:i18n && npm run build:vercel`
   - **Output Directory:** `.next`
   - **Install Command:** `npm install --legacy-peer-deps --include=dev`
   - **Node Version:** 20.x

**Important:** The `--include=dev` flag is critical! It installs devDependencies like `cross-env` which are needed for the build.

### Step 3: Set Environment Variables on Vercel

In Vercel dashboard:

1. Go to your project
2. Click "Settings" → "Environment Variables"
3. Add each variable:

```
NEXT_PUBLIC_BACKEND_URL = https://inv-api.mozdev.top
NEXT_PUBLIC_BACKEND_WS_URL = inv-api.mozdev.top
NEXT_PUBLIC_SITE_URL = https://your-app.vercel.app
NODE_ENV = production
```

**Important:** Add ALL `NEXT_PUBLIC_*` variables from your `.env` file!

### Step 4: Update Backend Environment

Update backend `.env` to allow Vercel domain:

```bash
# On Webuzo server
cd /home/httptruevault/git/Invtrade

# Edit backend .env
nano backend/.env

# Update NEXT_PUBLIC_SITE_URL to include Vercel domain
NEXT_PUBLIC_SITE_URL="https://your-app.vercel.app"
```

**Or keep both domains:**
The backend CORS automatically handles www and non-www variants, but for multiple domains, you might need to update the backend code.

### Step 5: Restart Backend

```bash
# Via Webuzo panel:
# Applications → Node.js → Restart invtrade-backend

# Or via script:
./webuzo-restart.sh backend
```

### Step 6: Deploy Frontend

```bash
# Trigger deployment
vercel --prod

# Or push to Git (if auto-deploy enabled)
git push origin main
```

### Step 7: Configure Custom Domain (Optional)

In Vercel dashboard:

1. Go to "Settings" → "Domains"
2. Add your custom domain
3. Update DNS records as instructed
4. Update `NEXT_PUBLIC_SITE_URL` to your custom domain

## Testing Checklist

After deployment, test these features:

### 1. Static Files
- [ ] User avatars display
- [ ] Logo displays correctly
- [ ] NFT images load
- [ ] Product images display

### 2. Uploads
- [ ] Can upload avatar
- [ ] Can upload KYC documents
- [ ] Can upload P2P attachments
- [ ] Can upload support files

### 3. Downloads
- [ ] Can download digital products
- [ ] Can export trade history
- [ ] Can download reports

### 4. WebSocket
- [ ] Real-time price updates work
- [ ] Order notifications work
- [ ] Support chat works
- [ ] No WebSocket errors in console

### 5. API Calls
- [ ] Login works
- [ ] Trading works
- [ ] All features functional

## Troubleshooting

### Issue: Images Not Loading

**Check:**
1. Browser console for errors
2. Network tab - where is it trying to load from?
3. Verify `NEXT_PUBLIC_BACKEND_URL` is set on Vercel

**Fix:**
```bash
# Verify environment variable
vercel env ls

# Add if missing
vercel env add NEXT_PUBLIC_BACKEND_URL
```

### Issue: CORS Errors

**Symptoms:**
```
Access to fetch at 'https://inv-api.mozdev.top/api/...' from origin 'https://your-app.vercel.app' has been blocked by CORS policy
```

**Fix:**
1. Update backend `.env`:
   ```bash
   NEXT_PUBLIC_SITE_URL="https://your-app.vercel.app"
   ```
2. Restart backend
3. Clear browser cache

### Issue: WebSocket Connection Failed

**Check:**
1. `NEXT_PUBLIC_BACKEND_WS_URL` is set correctly
2. No protocol (`wss://`), just domain: `inv-api.mozdev.top`
3. Backend is running

**Fix:**
```bash
# On Vercel, verify:
NEXT_PUBLIC_BACKEND_WS_URL=inv-api.mozdev.top

# Rebuild frontend
vercel --prod
```

### Issue: 404 on Uploads

**Check:**
1. Rewrites are working
2. Backend is serving files
3. File exists on backend

**Test:**
```bash
# Direct backend access
curl https://inv-api.mozdev.top/uploads/test.jpg

# Via frontend (should proxy)
curl https://your-app.vercel.app/uploads/test.jpg
```

### Issue: Build Fails

**Common causes:**
1. Missing environment variables
2. TypeScript errors
3. Missing dependencies

**Fix:**
```bash
# Check build logs on Vercel
# Ensure all NEXT_PUBLIC_* variables are set
# Verify install command includes --legacy-peer-deps
```

## Performance Optimization

### 1. Enable Vercel Image Optimization

Already configured in `next.config.js`:
```javascript
images: {
  unoptimized: false,
  minimumCacheTTL: 5184000,
  formats: ['image/webp', 'image/avif'],
}
```

### 2. Add Remote Patterns for Backend Images

Update `next.config.js`:
```javascript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'inv-api.mozdev.top',
      pathname: '/uploads/**',
    },
  ],
}
```

### 3. Enable Caching Headers

Backend already sets cache headers for static files.

## Monitoring

### Vercel Analytics

Enable in Vercel dashboard:
1. Go to "Analytics"
2. Enable Web Analytics
3. Monitor performance

### Error Tracking

Check Vercel logs:
```bash
vercel logs
```

Or in dashboard: "Deployments" → Click deployment → "Logs"

## Rollback Plan

If something goes wrong:

### Option 1: Rollback Deployment
```bash
# Via Vercel dashboard
# Deployments → Previous deployment → Promote to Production
```

### Option 2: Revert to Webuzo
1. Keep backend on Webuzo
2. Redeploy frontend to Webuzo
3. Update DNS back to Webuzo

## Cost Estimate

### Vercel Pricing
- **Hobby (Free):**
  - 100GB bandwidth/month
  - Unlimited deployments
  - Perfect for testing

- **Pro ($20/month):**
  - 1TB bandwidth/month
  - Better performance
  - Team features

### Webuzo (Current)
- Backend stays on Webuzo
- No additional cost

## Next Steps (Optional)

### Phase 2: Migrate to CDN

For better performance, migrate uploads to Cloudflare R2:

1. Setup Cloudflare R2 bucket
2. Migrate existing files
3. Update upload functions
4. Remove rewrites (files now on CDN)

See `VERCEL_DEPLOYMENT_FIX.md` for CDN migration guide.

## Summary

**What We Did:**
1. ✅ Updated `next.config.js` to proxy uploads/logos
2. ✅ Backend CORS already configured
3. ✅ WebSocket configuration ready

**What You Need to Do:**
1. Set environment variables on Vercel
2. Deploy to Vercel
3. Update backend `NEXT_PUBLIC_SITE_URL`
4. Test thoroughly

**Result:**
- Frontend on Vercel (fast, global CDN)
- Backend on Webuzo (WebSocket support)
- All features working
- No code changes needed

---

**Ready to deploy!** Follow the steps above and you'll have your frontend on Vercel in ~30 minutes.
