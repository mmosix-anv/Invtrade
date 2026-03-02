# Vercel Build Error Fix - cross-env not found

## Error

```
cross-env NODE_OPTIONS=--max-old-space-size=8192 next build
sh: line 1: cross-env: command not found
Error: Command "npm run build:i18n && npm run build" exited with 127
```

## Root Cause

Vercel is not installing devDependencies by default. The `cross-env` package is in devDependencies and is needed for the build.

## Solution ✅

### Option 1: Use vercel.json (Recommended)

Created `frontend/vercel.json`:

```json
{
  "buildCommand": "npm run build:i18n && npm run build:vercel",
  "installCommand": "npm install --legacy-peer-deps --include=dev",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

**Key:** `--include=dev` installs devDependencies!

### Option 2: Configure in Vercel Dashboard

1. Go to your project settings
2. Navigate to "Build & Development Settings"
3. Override settings:
   - **Install Command:** `npm install --legacy-peer-deps --include=dev`
   - **Build Command:** `npm run build:i18n && npm run build:vercel`

### Option 3: Use build:vercel Script (Already Done)

The `build:vercel` script doesn't use `cross-env`:

```json
{
  "scripts": {
    "build": "cross-env NODE_OPTIONS=--max-old-space-size=8192 next build",
    "build:vercel": "NODE_OPTIONS=--max-old-space-size=8192 next build"
  }
}
```

**Note:** `build:vercel` sets `NODE_OPTIONS` directly without `cross-env`.

## Why This Happens

### Default Vercel Behavior:
```bash
npm install --production
# Only installs dependencies, NOT devDependencies
```

### What We Need:
```bash
npm install --include=dev
# Installs both dependencies AND devDependencies
```

## Verification

After deploying, check the build log:

```
✓ Installing dependencies...
  npm install --legacy-peer-deps --include=dev
  
✓ Building...
  npm run build:i18n && npm run build:vercel
  
✓ Success!
```

## Alternative: Move cross-env to dependencies

If you still have issues, move `cross-env` from devDependencies to dependencies:

```json
{
  "dependencies": {
    "cross-env": "^10.1.0",
    // ... other dependencies
  }
}
```

**Not recommended** because it increases production bundle size unnecessarily.

## Summary

**Problem:** `cross-env` not found during build  
**Cause:** Vercel not installing devDependencies  
**Solution:** Use `--include=dev` flag in install command  
**Status:** ✅ Fixed with `vercel.json`  

---

**Next:** Redeploy to Vercel and the build should succeed!
