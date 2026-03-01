# Vercel Setup - Step by Step

## Step 1: Import Project

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Import your Git repository (GitHub/GitLab/Bitbucket)

## Step 2: Configure Project Settings

### Framework Preset
- Select: **Next.js**

### Root Directory
⚠️ **CRITICAL:** Click "Edit" next to Root Directory
- Set to: `frontend`
- This tells Vercel to build only the frontend folder

### Build and Output Settings

Click "Override" to customize build settings:

#### Build Command
```bash
npm run build:i18n && npm run build
```

#### Output Directory
```
.next
```
(This is the default, usually no need to change)

#### Install Command
```bash
npm install --legacy-peer-deps
```
⚠️ **IMPORTANT:** Must include `--legacy-peer-deps` flag

#### Development Command
```bash
npm run dev
```
(Default is fine)

## Step 3: Environment Variables

Click "Environment Variables" section and add:

### Required Variables

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | `https://your-backend.com` | Production, Preview, Development |
| `NEXT_PUBLIC_BACKEND_PORT` | `443` | Production, Preview, Development |
| `NEXT_PUBLIC_SITE_URL` | `https://your-app.vercel.app` | Production |
| `NEXT_PUBLIC_SITE_URL` | `https://your-app-preview.vercel.app` | Preview |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Development |
| `NEXT_PUBLIC_DEFAULT_LANGUAGE` | `en` | All |
| `NEXT_PUBLIC_APP_NAME` | `YourAppName` | All |

### Optional Variables

Add these if you're using the features:

| Name | Value | Notes |
|------|-------|-------|
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Your key | For reCAPTCHA |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Your ID | For Web3 wallets |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | G-XXXXXXXXXX | For Google Analytics |

## Step 4: Deploy

1. Click "Deploy"
2. Wait for build to complete (usually 2-5 minutes)
3. Check deployment logs for any errors

## Step 5: Verify Deployment

After deployment completes:

- [ ] Visit your Vercel URL
- [ ] Check that the site loads
- [ ] Test API calls to backend
- [ ] Verify images load
- [ ] Test authentication
- [ ] Check translations work

## Troubleshooting Build Errors

### Error: "ERESOLVE unable to resolve dependency tree"

**Cause:** Missing `--legacy-peer-deps` flag

**Fix:** 
1. Go to Project Settings → General
2. Find "Install Command"
3. Change to: `npm install --legacy-peer-deps`
4. Redeploy

### Error: "Cannot find module"

**Cause:** Root directory not set correctly

**Fix:**
1. Go to Project Settings → General
2. Find "Root Directory"
3. Set to: `frontend`
4. Redeploy

### Error: "i18n files missing"

**Cause:** Build command doesn't include i18n generation

**Fix:**
1. Go to Project Settings → General
2. Find "Build Command"
3. Change to: `npm run build:i18n && npm run build`
4. Redeploy

### Error: "Environment variable not defined"

**Cause:** Missing environment variables

**Fix:**
1. Go to Project Settings → Environment Variables
2. Add missing variables (must start with `NEXT_PUBLIC_`)
3. Redeploy

## Post-Deployment Configuration

### Custom Domain

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS records as shown
4. Update `NEXT_PUBLIC_SITE_URL` environment variable

### Enable Analytics

1. Go to Project → Analytics tab
2. Enable Vercel Analytics
3. Install package: `npm install @vercel/analytics`
4. Add to your layout component

### Enable Speed Insights

1. Go to Project → Speed Insights tab
2. Enable Speed Insights
3. Install package: `npm install @vercel/speed-insights`
4. Add to your layout component

## Continuous Deployment

Once configured, Vercel automatically deploys:

- **Production:** Pushes to `main` branch
- **Preview:** Pull requests and other branches
- **Development:** Local development (not deployed)

## Monitoring

### View Logs

1. Go to Deployments
2. Click on a deployment
3. View build logs and runtime logs

### Check Performance

1. Go to Analytics tab
2. View page views, performance metrics
3. Check Core Web Vitals

## Need Help?

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)
- Check `VERCEL_DEPLOYMENT.md` for detailed troubleshooting
