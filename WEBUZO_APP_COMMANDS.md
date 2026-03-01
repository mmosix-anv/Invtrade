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
| **Application Port** | `3000` |
| **Startup File** | `server.js` |
| **Environment** | `production` |

### Commands

**Start Command:**
```bash
node server.js
```

**Stop Command:**
```bash
kill $(lsof -t -i:3000)
```

### Environment Variables

```
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_BACKEND_URL=https://api.httptruevaultglobalbank.com
NEXT_PUBLIC_SITE_URL=https://httptruevaultglobalbank.com
```

---

## Backend Application

### Application Settings

| Field | Value |
|-------|-------|
| **Application Name** | `invtrade-backend` |
| **Domain** | `api.httptruevaultglobalbank.com` |
| **Application Path** | `/home/httptruevault/git/Invtrade/backend` |
| **Node.js Version** | `20.x` |
| **Application Port** | `30004` |
| **Startup File** | `server.js` |
| **Environment** | `production` |

### Commands

**Start Command:**
```bash
node server.js
```

**Stop Command:**
```bash
kill $(lsof -t -i:30004)
```

### Environment Variables

```
NODE_ENV=production
NEXT_PUBLIC_BACKEND_PORT=30004
DATABASE_URL=your_database_url_here
```

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
