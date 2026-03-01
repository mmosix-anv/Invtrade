# Webuzo Node.js Application Commands

Exact commands to use in Webuzo Node.js application form.

---

## Frontend Application

### Application Settings

| Field | Value |
|-------|-------|
| **Application Name** | `invtrade-frontend` |
| **Domain** | `httptruevaultglobalbank.com` |
| **Application Path** | `/home/httptruevault/git/Invtrade/frontend` |
| **Node.js Version** | `20.x` |
| **Application Port** | Auto-assigned by Webuzo (e.g., 30000) |
| **Startup File** | `server.js` |
| **Environment** | `production` |

### Commands

**Start Command:**
```bash
node server.js
```

**Stop Command:**
```bash
kill $(lsof -t -i:$PORT)
```

**Note:** Webuzo automatically assigns the port (like 30000). Use that port in the stop command if `$PORT` doesn't work:
```bash
kill $(lsof -t -i:30000)
```

### Environment Variables

```
NODE_ENV=production
NEXT_PUBLIC_BACKEND_URL=https://api.httptruevaultglobalbank.com
NEXT_PUBLIC_SITE_URL=https://httptruevaultglobalbank.com
```

**Important:** Don't set `PORT` manually - Webuzo sets it automatically.

---

## Backend Application

### Application Settings

| Field | Value |
|-------|-------|
| **Application Name** | `invtrade-backend` |
| **Domain** | `api.httptruevaultglobalbank.com` |
| **Application Path** | `/home/httptruevault/git/Invtrade/backend` |
| **Node.js Version** | `20.x` |
| **Application Port** | Auto-assigned by Webuzo (e.g., 30001) |
| **Startup File** | `server.js` |
| **Environment** | `production` |

### Commands

**Start Command:**
```bash
node server.js
```

**Stop Command:**
```bash
kill $(lsof -t -i:$PORT)
```

**Note:** Webuzo automatically assigns the port (like 30001). Use that port in the stop command if `$PORT` doesn't work:
```bash
kill $(lsof -t -i:30001)
```

### Environment Variables

```
NODE_ENV=production
DATABASE_URL=your_database_url_here
```

**Important:** Don't set `NEXT_PUBLIC_BACKEND_PORT` manually - Webuzo sets `PORT` automatically.

---

## Alternative Stop Commands

If the `lsof` command doesn't work in Webuzo, use these alternatives:

### Frontend Stop Command (Alternative)
```bash
pkill -f "frontend/server.js"
```

### Backend Stop Command (Alternative)
```bash
pkill -f "backend/server.js"
```

---

## Summary

**Just copy these into Webuzo:**

### Frontend
- **Start:** `node server.js`
- **Stop:** `kill $(lsof -t -i:3000)`

### Backend
- **Start:** `node server.js`
- **Stop:** `kill $(lsof -t -i:30004)`

That's it! Webuzo will handle the rest.
