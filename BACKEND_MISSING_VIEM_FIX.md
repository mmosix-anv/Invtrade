# Backend Missing viem Package Fix

## Error

```
Cannot find module 'viem'
Require stack:
- /home/httptruevault/git/Invtrade/backend/dist/src/api/auth/utils.js
- /home/httptruevault/git/Invtrade/backend/dist/src/api/auth/login/index.post.js
```

## Root Cause

The `viem` package was missing from `backend/package.json`. It's used for wallet signature verification in the authentication system.

## Solution Applied ✅

Added `viem` to `backend/package.json`:

```json
{
  "dependencies": {
    "viem": "^2.21.54"
  }
}
```

## What You Need to Do

### Step 1: Pull Latest Changes

```bash
cd /home/httptruevault/git/Invtrade
git pull origin main
```

### Step 2: Install viem

```bash
cd backend
npm install viem
```

Or install all dependencies:

```bash
cd backend
npm install
```

### Step 3: Restart Backend

```bash
cd /home/httptruevault/git/Invtrade
./webuzo-restart.sh backend
```

## Quick Fix (One Command)

```bash
cd /home/httptruevault/git/Invtrade && git pull && cd backend && npm install viem && cd .. && ./webuzo-restart.sh backend
```

## Alternative: Manual Install Without Git

If you don't want to pull from Git:

```bash
cd /home/httptruevault/git/Invtrade/backend
npm install viem@^2.21.54
cd ..
./webuzo-restart.sh backend
```

## Verify

After restart, try logging in again. The error should be gone.

### Check Backend Logs

```bash
tail -f /home/httptruevault/logs/backend.log
```

Look for successful startup without "Cannot find module 'viem'" errors.

### Test Login

1. Go to `https://invtrade.vercel.app`
2. Try to login
3. Should work now! ✅

## What viem Does

`viem` is used for:
- Wallet signature verification (WalletConnect, MetaMask)
- Ethereum address validation
- Message signing/verification
- Blockchain interactions

## Summary

**Problem:** `viem` package missing from backend  
**Solution:** Added to `package.json` and installed  
**Time:** 2-3 minutes  
**Status:** ✅ Fixed  

---

**After this fix, wallet login and regular login should both work!**

