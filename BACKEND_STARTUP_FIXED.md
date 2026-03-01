# Backend Startup Issue - Fixed

## Problem Summary

The backend was failing to start with the error:
```
Error: Cannot find module 'module-alias/register'
```

## Root Cause

The initial `npm install` in the backend folder was incomplete. It only installed 455 packages instead of the full 1952 packages required. This happened because:

1. The `module-alias` package folder was empty (no files installed)
2. Many other dependencies were also missing (like `ajv`)
3. This caused a cascade of "Cannot find module" errors

## Solution Applied

### 1. Clean Reinstall of Dependencies

```bash
cd backend
rm -rf node_modules
rm package-lock.json
npm install
```

This properly installed all 1952 packages including:
- `module-alias` with its `register.js` file
- `ajv` and all other dependencies
- All transitive dependencies

### 2. Fixed Nodemon Configuration

Updated `backend/nodemon.json` to remove the `-r module-alias/register` flag since the code already handles module aliasing internally:

**Before:**
```json
{
  "exec": "node -r module-alias/register dist/index.js"
}
```

**After:**
```json
{
  "exec": "node dist/index.js"
}
```

## Current Status

✅ **Backend is now running successfully!**

- Server started on port 30004
- Database initialized (5.0s)
- Notifications initialized (1.7s)
- Security initialized (563ms)
- Roles initialized (290ms)
- Routes initialized (927ms)
- Cron jobs initialized (4.2s)
- Extensions initialized (442ms)
- Total startup time: 13.1s

## How to Start Backend

### Development Mode (with auto-reload)

```bash
cd backend
npm run dev
```

### Production Mode

```bash
cd backend
npm start
```

### Direct Node (after build)

```bash
cd backend
npm run build
node dist/index.js
```

## Prerequisites

Before starting the backend, ensure:

1. **Dependencies installed:**
   ```bash
   cd backend
   npm install
   ```

2. **Environment variables configured:**
   - `.env` file exists in root or backend folder
   - Database connection URL is correct
   - All required secrets are set

3. **Database is accessible:**
   - PostgreSQL/Supabase database is running
   - Connection URL in `.env` is correct
   - Database credentials are valid

4. **TypeScript compiled (if running directly):**
   ```bash
   npm run build
   ```

## Common Issues & Solutions

### Issue: "Cannot find module 'X'"

**Cause:** Dependencies not fully installed

**Solution:**
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

### Issue: "Database connection failed"

**Cause:** Database not accessible or wrong credentials

**Solution:**
- Check `DATABASE_URL` in `.env`
- Verify database is running
- Test connection manually

### Issue: "Port already in use"

**Cause:** Another process using port 30004

**Solution:**
- Change port in `.env`: `NEXT_PUBLIC_BACKEND_PORT=30005`
- Or kill the process using the port

### Issue: Build fails on Render

**Cause:** Missing devDependencies during build

**Solution:**
Use the `build:render` script which installs devDependencies:
```bash
npm run build:render
```

## Deployment Notes

### Local Development
- Use `npm run dev` for auto-reload
- Watches `dist/**/*` and `.env` for changes
- Restarts automatically on file changes

### Render Deployment
- Build command: `npm run build:render`
- Start command: `npm run start:render`
- Installs devDependencies for TypeScript compilation
- Runs compiled code with `node dist/index.js`

### Production (PM2)
- Start command: `npm start`
- Uses PM2 for process management
- Runs `pm2 start dist/index.js --env production`

## Files Modified

1. `backend/nodemon.json` - Removed `-r module-alias/register` flag
2. `backend/package.json` - Added `build:render` script
3. `backend/node_modules/` - Full reinstall (1952 packages)

## Verification

To verify the backend is running:

1. **Check console output:**
   ```
   ✓ Server ready on port 30004
   ```

2. **Test health endpoint:**
   ```bash
   curl http://localhost:30004/api/health
   ```

3. **Check in browser:**
   ```
   http://localhost:30004
   ```

## Next Steps

1. ✅ Backend is running locally
2. ⏳ Test API endpoints
3. ⏳ Deploy to Render with updated configuration
4. ⏳ Connect frontend to backend
5. ⏳ Test full stack integration

## Related Documentation

- `backend/START_BACKEND.md` - Detailed startup guide
- `backend/DEPLOYMENT_QUICK_REFERENCE.md` - Deployment quick reference
- `RENDER_DEPLOYMENT.md` - Full Render deployment guide
- `DEPLOYMENT_FIXES.md` - Frontend and backend deployment fixes

---

**Status:** ✅ RESOLVED

**Date:** 2026-03-01

**Resolution:** Clean reinstall of node_modules fixed all module resolution issues
