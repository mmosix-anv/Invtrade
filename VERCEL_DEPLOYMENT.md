# Vercel Deployment Guide - Frontend

Complete guide for deploying the frontend to Vercel.

## Quick Configuration

### Root Directory
```
frontend
```

### Build Command
```bash
npm run build:i18n && npm run build
```

### Output Directory
```
.next
```

### Install Command
```bash
npm install --legacy-peer-deps
```

**Note:** The frontend includes a `.npmrc` file that automatically sets `legacy-peer-deps=true`, so you can also just use `npm install`. However, Vercel requires explicit command specification.

### Node Version
```
20.x
```

## Detailed Setup

### 1. Project Settings in Vercel Dashboard

When creating a new project or configuring an existing one:

**Framework Preset:** Next.js

**Root Directory:** `frontend` (IMPORTANT: Set this to frontend folder)

**Build & Development Settings:**
- Build Command: `npm run build:i18n && npm run build`
- Output Directory: `.next` (leave as default)
- Install Command: `npm install --legacy-peer-deps`
- Development Command: `npm run dev` (default is fine)

### 2. Why These Commands?

#### Build Command: `npm run build:i18n && npm run build`

The build process requires two steps:

1. **`npm run build:i18n`** - Generates i18n manifest
   - Analyzes all pages and extracts translation keys
   - Creates optimized translation files in `public/i18n/`
   - Required before Next.js build

2. **`npm run build`** - Builds Next.js application
   - Runs `next build` with optimizations
   - Uses 8GB memory allocation for large builds
   - Generates production-ready `.next` folder

#### Output Directory: `.next`

Next.js outputs the production build to `.next` folder. Vercel automatically serves this.

#### Install Command: `npm install --legacy-peer-deps`

Uses `--legacy-peer-deps` flag to handle peer dependency conflicts:
- `tailwind-scrollbar@3.1.0` requires Tailwind CSS v3
- Your project uses Tailwind CSS v4
- The flag allows installation despite version mismatch
- The package still works correctly with v4

### 3. Environment Variables

Add these in Vercel Dashboard → Settings → Environment Variables:

#### Required Variables

```bash
# Backend API URL (your backend deployment URL)
NEXT_PUBLIC_BACKEND_URL=https://your-backend.com

# Backend API Port (usually 443 for HTTPS)
NEXT_PUBLIC_BACKEND_PORT=443

# Site URL (your Vercel deployment URL)
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app

# Default language
NEXT_PUBLIC_DEFAULT_LANGUAGE=en

# App name
NEXT_PUBLIC_APP_NAME=YourAppName
```

#### Optional Variables

```bash
# Google reCAPTCHA (if using)
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_recaptcha_key

# WalletConnect Project ID (if using Web3)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Analytics (if using)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Feature flags
NEXT_PUBLIC_HAS_CHART_ENGINE=true
```

### 4. Build Settings Optimization

For better build performance on Vercel:

**Node.js Version:** 20.x (recommended)

**Build & Output Settings:**
- Enable: "Automatically expose System Environment Variables"
- Memory: Vercel automatically allocates sufficient memory

### 5. Deployment Workflow

#### Option A: Git Integration (Recommended)

1. Connect your GitHub/GitLab/Bitbucket repository
2. Set root directory to `frontend`
3. Configure build settings as above
4. Push to main branch → automatic deployment

#### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to frontend
cd frontend

# Deploy
vercel

# Deploy to production
vercel --prod
```

### 6. Common Issues & Solutions

#### Issue: Peer dependency conflict with tailwindcss

**Error:** `ERESOLVE unable to resolve dependency tree` - `tailwind-scrollbar` requires Tailwind CSS v3

**Solution:** Use `--legacy-peer-deps` flag in install command:
```bash
npm install --legacy-peer-deps
```

This is already configured in the Vercel settings above.

#### Issue: Build fails with "Cannot find module"

**Solution:** Ensure root directory is set to `frontend` in Vercel settings.

#### Issue: i18n files missing

**Solution:** Make sure build command includes `npm run build:i18n &&` before `npm run build`.

#### Issue: Environment variables not working

**Solution:** 
- All client-side variables must start with `NEXT_PUBLIC_`
- Redeploy after adding environment variables
- Check Vercel logs for missing variables

#### Issue: Build timeout

**Solution:**
- Upgrade to Vercel Pro for longer build times
- Or optimize build by removing unused dependencies

#### Issue: API calls failing

**Solution:**
- Verify `NEXT_PUBLIC_BACKEND_URL` is correct
- Ensure backend allows CORS from your Vercel domain
- Check backend is deployed and accessible

### 7. Performance Optimization

#### Enable Vercel Analytics

```bash
npm install @vercel/analytics
```

Add to `app/layout.tsx`:
```tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

#### Enable Vercel Speed Insights

```bash
npm install @vercel/speed-insights
```

Add to `app/layout.tsx`:
```tsx
import { SpeedInsights } from '@vercel/speed-insights/next';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
```

### 8. Vercel Configuration File

You can also use `vercel.json` in the frontend folder:

```json
{
  "buildCommand": "npm run build:i18n && npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1"],
  "env": {
    "NEXT_PUBLIC_BACKEND_URL": "@backend-url",
    "NEXT_PUBLIC_BACKEND_PORT": "443"
  }
}
```

### 9. Post-Deployment Checklist

- [ ] Frontend loads successfully
- [ ] API calls to backend work
- [ ] Environment variables are set correctly
- [ ] Images load properly
- [ ] i18n translations work
- [ ] Authentication works
- [ ] Web3 wallet connection works (if applicable)
- [ ] Check Vercel deployment logs for warnings

### 10. Monitoring

**Vercel Dashboard:**
- Monitor build times
- Check deployment logs
- View analytics
- Monitor bandwidth usage

**Logs:**
```bash
# View real-time logs
vercel logs your-deployment-url --follow
```

## Summary

**Quick Setup:**
1. Root Directory: `frontend`
2. Build Command: `npm run build:i18n && npm run build`
3. Output Directory: `.next`
4. Install Command: `npm install`
5. Add environment variables
6. Deploy!

The frontend is fully independent and can be deployed to Vercel without any dependencies on the root or backend folders.

## Additional Resources

- [Vercel Next.js Documentation](https://vercel.com/docs/frameworks/nextjs)
- [Next.js Deployment Documentation](https://nextjs.org/docs/deployment)
- [Vercel CLI Documentation](https://vercel.com/docs/cli)
