# Frontend Build Issue - Troubleshooting

## Problem

Frontend server.js shows error:
```
Error: Could not find a production build in the '.next' directory.
```

Even though `.next` folder exists after running `npm run build`.

## Possible Causes

1. **Wrong NODE_ENV** - Environment set to `development` instead of `production`
2. **Wrong working directory** - Server not running from correct folder
3. **Incomplete build** - Build didn't complete successfully
4. **Permission issues** - Can't read `.next` folder

## Solutions

### Solution 1: Use Updated server.js (Recommended)

The updated `server.js` now:
- Forces `NODE_ENV=production`
- Checks if `.next` exists before starting
- Uses explicit port flag `-p`

**Test it:**
```bash
cd /home/httptruevault/git/Invtrade/frontend
node server.js
```

### Solution 2: Use Alternative start.js

If `server.js` still doesn't work, use the simpler `start.js`:

**In Webuzo:**
- Change **Startup File** from `server.js` to `start.js`

**Test it:**
```bash
cd /home/httptruevault/git/Invtrade/frontend
node start.js
```

### Solution 3: Direct Next.js Command

Use Next.js directly without wrapper:

**Start Command in Webuzo:**
```bash
NODE_ENV=production node node_modules/next/dist/bin/next start -p 3000
```

### Solution 4: Rebuild Frontend

Make sure the build is complete:

```bash
cd /home/httptruevault/git/Invtrade/frontend

# Clean previous build
rm -rf .next

# Reinstall dependencies
npm install --legacy-peer-deps --include=dev

# Build i18n
npm run build:i18n

# Build Next.js
npm run build

# Verify .next exists
ls -la .next

# Test server
NODE_ENV=production node server.js
```

### Solution 5: Check Permissions

```bash
# Check .next folder permissions
ls -la /home/httptruevault/git/Invtrade/frontend/.next

# Fix permissions if needed
chmod -R 755 /home/httptruevault/git/Invtrade/frontend/.next
```

### Solution 6: Use npm script

Instead of custom startup file, use npm script:

**Start Command in Webuzo:**
```bash
npm start
```

Make sure `package.json` has:
```json
{
  "scripts": {
    "start": "next start"
  }
}
```

## Verification Steps

### 1. Check Build Exists

```bash
cd /home/httptruevault/git/Invtrade/frontend

# Check .next folder
ls -la .next

# Should show:
# - .next/BUILD_ID
# - .next/server/
# - .next/static/
```

### 2. Check Environment

```bash
# Test with explicit environment
cd /home/httptruevault/git/Invtrade/frontend
NODE_ENV=production PORT=3000 node server.js
```

### 3. Check Next.js Binary

```bash
# Verify Next.js is installed
ls -la node_modules/next/dist/bin/next

# Test Next.js directly
node node_modules/next/dist/bin/next start -p 3000
```

## Recommended Webuzo Settings

### Option A: Using server.js (Updated)

```
Startup File: server.js
Start Command: node server.js
Environment Variables:
  NODE_ENV=production
  PORT=3000
```

### Option B: Using start.js (Simpler)

```
Startup File: start.js
Start Command: node start.js
Environment Variables:
  NODE_ENV=production
  PORT=3000
```

### Option C: Direct Next.js

```
Startup File: (leave empty)
Start Command: NODE_ENV=production node node_modules/next/dist/bin/next start -p 3000
Environment Variables:
  NODE_ENV=production
  PORT=3000
```

## Debug Output

The updated `server.js` now shows:
- ✓ Working directory
- ✓ Node version
- ✓ Environment (should be "production")
- ✓ Port (should be 3000, not 30000)
- ✓ Whether .next folder exists
- ✓ Whether Next.js binary exists

If any check fails, it will show an error and exit.

## Common Mistakes

❌ **Wrong:** Environment shows "development"  
✅ **Correct:** Environment shows "production"

❌ **Wrong:** Port shows 30000  
✅ **Correct:** Port shows 3000

❌ **Wrong:** Running from wrong directory  
✅ **Correct:** Running from `/home/httptruevault/git/Invtrade/frontend`

❌ **Wrong:** .next folder doesn't exist  
✅ **Correct:** .next folder exists with BUILD_ID file

## Quick Fix

```bash
cd /home/httptruevault/git/Invtrade/frontend

# Ensure production environment
export NODE_ENV=production
export PORT=3000

# Rebuild
npm run build

# Test
node server.js
```

If this works, then use the same settings in Webuzo.

## Files Created

- ✅ `frontend/server.js` - Updated with checks and forced production mode
- ✅ `frontend/start.js` - Simpler alternative startup file
- ✅ `FRONTEND_BUILD_ISSUE.md` - This troubleshooting guide

## Summary

The issue is that Next.js needs `NODE_ENV=production` to find the production build. The updated `server.js` now forces this. If it still doesn't work, use `start.js` or the direct Next.js command.
