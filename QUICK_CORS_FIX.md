# Quick CORS Fix

## Error
```
Access to fetch at 'https://inv-api.mozdev.top/api/auth/login' 
from origin 'https://invtrade.vercel.app' 
has been blocked by CORS policy
```

## Fix (3 Commands)

```bash
# 1. SSH to server and navigate to project
cd /home/httptruevault/git/Invtrade

# 2. Update backend .env
nano backend/.env
# Change: NEXT_PUBLIC_SITE_URL="https://inv-app.mozdev.top"
# To:     NEXT_PUBLIC_SITE_URL="https://invtrade.vercel.app"
# Save: Ctrl+X, Y, Enter

# 3. Restart backend
./webuzo-restart.sh backend
```

## Test

Wait 20 seconds, then try login again at `https://invtrade.vercel.app`

## Verify

```bash
# Check if backend allows Vercel domain
curl -X OPTIONS https://inv-api.mozdev.top/api/auth/login \
  -H "Origin: https://invtrade.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -v 2>&1 | grep "Access-Control-Allow-Origin"

# Should show:
# Access-Control-Allow-Origin: https://invtrade.vercel.app
```

---

See `CORS_FIX_VERCEL.md` for detailed guide.
