# 🚀 Quick Start Guide

## Migration Status: ✅ COMPLETE

Your Bicrypto application has been successfully migrated to Supabase PostgreSQL with Turborepo!

## 📊 Current Status

- ✅ Database: 158 tables created
- ✅ Data: Core data seeded (currencies, gateways, roles, permissions, super admin)
- ✅ Configuration: Supabase PostgreSQL configured
- ✅ Build System: Turborepo configured
- ✅ Deployment: Vercel-ready

## 🎯 Start Development (3 Steps)

### Step 1: Install Dependencies (if not already done)
```bash
pnpm install
```

### Step 2: Start Development Server
```bash
pnpm turbo dev
```

This will start:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

### Step 3: Login as Super Admin
- **URL:** http://localhost:3000
- **Email:** superadmin@example.com
- **Password:** 12345678

**⚠️ IMPORTANT:** Change this password immediately after first login!

## 🔧 Useful Commands

### Development
```bash
# Start both frontend and backend
pnpm turbo dev

# Start only frontend
pnpm turbo dev --filter=frontend

# Start only backend
pnpm turbo dev --filter=backend
```

### Build
```bash
# Build everything
pnpm turbo build

# Build only frontend
pnpm turbo build --filter=frontend

# Build only backend
pnpm turbo build --filter=backend
```

### Database
```bash
# Test database connection
node backend/test-connection.js

# Run seeders (if needed)
cd backend && npx sequelize-cli db:seed:all --config ./config.js
```

### Testing
```bash
# Run all tests
pnpm turbo test

# Run tests with coverage
pnpm test:coverage
```

## 📝 Important Information

### Database Connection
- **Connection Pooler (App):** Port 6543
- **Direct Connection (Migrations):** Port 5432
- **Database:** PostgreSQL 17.6
- **Provider:** Supabase

### Supabase Dashboard
- **URL:** https://supabase.com/dashboard/project/haspwjdvxkfmsxgxofyt
- **SQL Editor:** https://supabase.com/dashboard/project/haspwjdvxkfmsxgxofyt/sql

### Environment Variables
All Supabase credentials are configured in `.env` file:
- `DATABASE_URL` - Connection pooler URL
- `DIRECT_URL` - Direct connection URL
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

## 🚨 Troubleshooting

### SSL Certificate Warning
If you see SSL warnings during development:
```bash
# PowerShell
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'

# Bash
export NODE_TLS_REJECT_UNAUTHORIZED='0'
```

### Database Connection Issues
1. Verify `.env` file has correct Supabase credentials
2. Check Supabase project is active
3. Test connection: `node backend/test-connection.js`

### Port Already in Use
If ports 3000 or 4000 are in use:
1. Stop other applications using these ports
2. Or change ports in `.env` file:
   - `NEXT_PUBLIC_FRONTEND_PORT=3001`
   - `NEXT_PUBLIC_BACKEND_PORT=4001`

## 📚 Documentation

Comprehensive guides are available:
- `MIGRATION_COMPLETE.md` - Full migration summary
- `MIGRATION_GUIDE.md` - Detailed migration guide
- `QUICK_START.md` - Quick start guide
- `TURBOREPO_SETUP.md` - Turborepo configuration
- `VERCEL_DEPLOYMENT.md` - Vercel deployment guide
- `SUPABASE_SETUP.md` - Supabase setup guide

## 🚀 Deploy to Vercel

### Quick Deploy
```bash
# Install Vercel CLI
pnpm add -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### Environment Variables
Add all variables from `.env` to Vercel:
```bash
vercel env add DATABASE_URL
vercel env add DIRECT_URL
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
# ... add all other required variables
```

See `VERCEL_DEPLOYMENT.md` for detailed deployment instructions.

## ✅ Pre-Deployment Checklist

Before deploying to production:

- [ ] Changed Super Admin password
- [ ] Tested all major features
- [ ] Verified database connection
- [ ] Added environment variables to Vercel
- [ ] Tested build process: `pnpm turbo build`
- [ ] Reviewed security settings
- [ ] Enabled Row Level Security in Supabase
- [ ] Configured monitoring and alerts

## 🎉 You're Ready!

Everything is set up and ready to go. Just run:

```bash
pnpm turbo dev
```

And start building! 🚀

---

**Need Help?**
- Check the documentation files in the root directory
- Visit Supabase Dashboard for database management
- Review Turborepo docs: https://turbo.build/repo/docs
- Check Vercel docs: https://vercel.com/docs

**Migration Date:** February 27, 2026
**Status:** ✅ READY FOR DEVELOPMENT
