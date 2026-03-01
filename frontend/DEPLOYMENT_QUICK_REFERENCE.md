# Vercel Deployment - Quick Reference

## Essential Settings

| Setting | Value |
|---------|-------|
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build:i18n && npm run build:vercel` |
| **Output Directory** | `.next` |
| **Install Command** | `npm install --legacy-peer-deps --include=dev` |
| **Node Version** | `20.x` |
| **Framework** | Next.js |

> **Important:** The `--legacy-peer-deps` flag is required due to Tailwind CSS v4 compatibility with `tailwind-scrollbar`. The `--include=dev` flag is required to install TypeScript and other build tools.

## Required Environment Variables

```bash
NEXT_PUBLIC_BACKEND_URL=https://your-backend.com
NEXT_PUBLIC_BACKEND_PORT=443
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
NEXT_PUBLIC_DEFAULT_LANGUAGE=en
NEXT_PUBLIC_APP_NAME=YourAppName
```

## Why --legacy-peer-deps?

Your project uses Tailwind CSS v4, but `tailwind-scrollbar` requires v3. The `--legacy-peer-deps` flag allows npm to install despite this peer dependency conflict. The package works fine with v4.

## Deployment Steps

### Via Vercel Dashboard

1. Import Git repository
2. Set **Root Directory** to `frontend`
3. Set **Build Command** to `npm run build:i18n && npm run build:vercel`
4. Add environment variables
5. Deploy

### Via Vercel CLI

```bash
cd frontend
npm install -g vercel
vercel
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Peer dependency conflict | Install command uses `--legacy-peer-deps` |
| Build fails | Check root directory is set to `frontend` |
| i18n missing | Ensure build command includes `npm run build:i18n &&` |
| API fails | Verify `NEXT_PUBLIC_BACKEND_URL` is correct |
| Env vars not working | Must start with `NEXT_PUBLIC_` |

## Post-Deployment Checklist

- [ ] Site loads
- [ ] API calls work
- [ ] Images display
- [ ] Translations work
- [ ] Authentication works

## Full Documentation

See [VERCEL_DEPLOYMENT.md](../VERCEL_DEPLOYMENT.md) for complete guide.
