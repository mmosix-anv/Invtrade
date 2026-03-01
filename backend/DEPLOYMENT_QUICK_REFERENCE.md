# Render Deployment - Quick Reference

## Essential Settings

| Setting | Value |
|---------|-------|
| **Service Type** | Web Service |
| **Root Directory** | `backend` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start:render` |
| **Runtime** | Node |
| **Node Version** | 20.x |

## Required Environment Variables

```bash
# Core
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/database
DIRECT_URL=postgresql://user:password@host:5432/database

# URLs
APP_PUBLIC_URL=https://your-app-backend.onrender.com
NEXT_PUBLIC_BACKEND_URL=https://your-app-backend.onrender.com
FRONTEND_URL=https://your-app.vercel.app

# Security
APP_ACCESS_TOKEN_SECRET=your-secure-random-string-min-32-chars
APP_REFRESH_TOKEN_SECRET=your-different-secure-random-string
APP_ENCRYPT_SECRET=your-encryption-key-32-chars
SESSION_SECRET=your-session-secret-min-32-chars
```

## Deployment Steps

### Via Render Dashboard

1. New + → Web Service
2. Connect Git repository
3. Set **Root Directory** to `backend`
4. Set **Build Command** to `npm install && npm run build`
5. Set **Start Command** to `npm run start:render`
6. Add environment variables
7. Create PostgreSQL database (optional)
8. Deploy

### Via render.yaml

Create `render.yaml` in root:
```yaml
services:
  - type: web
    name: your-app-backend
    runtime: node
    rootDir: backend
    buildCommand: npm install && npm run build
    startCommand: npm run start:render
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Build fails | Check root directory is set to `backend` |
| Module not found | Ensure all dependencies in `package.json` |
| Database connection fails | Verify `DATABASE_URL` is correct |
| Service spins down | Upgrade to Starter plan ($7/month) |
| Out of memory | Upgrade to Standard plan (2 GB RAM) |

## Post-Deployment Checklist

- [ ] Service is running
- [ ] Database connected
- [ ] API endpoints respond
- [ ] CORS configured for frontend
- [ ] Environment variables set
- [ ] Database seeded (if needed)
- [ ] Logs show no errors

## Instance Types

| Plan | RAM | CPU | Price | Use Case |
|------|-----|-----|-------|----------|
| Free | 512 MB | Shared | $0 | Testing |
| Starter | 512 MB | Shared | $7/mo | Small apps |
| Standard | 2 GB | Dedicated | $25/mo | Production |
| Pro | 4 GB | Dedicated | $85/mo | High traffic |

## Database Setup

### Render PostgreSQL

1. New + → PostgreSQL
2. Name: `your-app-db`
3. Copy Internal Database URL
4. Add to web service as `DATABASE_URL`

### External Database

Use Supabase, AWS RDS, or any PostgreSQL provider.

## Monitoring

**View Logs:**
Service → Logs tab

**View Metrics:**
Service → Metrics tab (CPU, Memory, Requests)

**Set Alerts:**
Settings → Notifications

## Full Documentation

See [../RENDER_DEPLOYMENT.md](../RENDER_DEPLOYMENT.md) for complete guide.
