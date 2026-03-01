# Quick Start Guide - Supabase Migration

## ✅ What's Been Done

1. ✅ Turborepo installed and configured
2. ✅ Supabase client libraries installed
3. ✅ PostgreSQL driver (pg) installed
4. ✅ Database configuration updated for Supabase
5. ✅ Environment variables configured
6. ✅ Database connection tested successfully

## 🎯 Current Status

Your Supabase PostgreSQL database is connected and ready!
- **Database**: PostgreSQL 17.6
- **Status**: Empty (ready for migration)
- **Connection**: Working ✅

## 📋 Next Steps

### Step 1: Migrate Your Database Schema

You have several options:

#### Option A: Using Sequelize Migrations (Recommended for this project)

```bash
cd backend

# Run existing migrations
npx sequelize-cli db:migrate

# If successful, run seeders
npx sequelize-cli db:seed:all
```

**Note**: You may need to update your Sequelize models first to use PostgreSQL data types. See the data type conversion guide below.

#### Option B: Export from MySQL and Import

If you have existing MySQL data:

```bash
# 1. Export from MySQL
mysqldump -u root -p bicrypto > mysql_backup.sql

# 2. Convert to PostgreSQL format (manual or use tools)
# 3. Import to Supabase using Supabase SQL Editor
```

#### Option C: Use pgloader (Automated)

```bash
# Install pgloader
# Windows: Use Docker
docker run --rm -it dimitri/pgloader:latest pgloader --version

# Create migration.load file (see SUPABASE_SETUP.md)
# Run migration
pgloader migration.load
```

### Step 2: Update Sequelize Models for PostgreSQL

Common data type changes needed:

```typescript
// Before (MySQL)
@Column({ type: DataTypes.TINYINT })
status: number;

// After (PostgreSQL)
@Column({ type: DataTypes.SMALLINT })
status: number;

// Or for boolean flags
@Column({ type: DataTypes.BOOLEAN })
isActive: boolean;
```

**Files to update**: All files in `backend/models/` directory

See `MIGRATION_GUIDE.md` for complete data type conversion table.

### Step 3: Test Locally

```bash
# Start development servers
pnpm turbo dev

# Or start individually
pnpm dev:frontend
pnpm dev:backend
```

### Step 4: Run Tests

```bash
pnpm turbo test
```

### Step 5: Deploy to Vercel

```bash
# Install Vercel CLI
pnpm add -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

## 🔧 Important Configuration Notes

### SSL Certificate Handling

For development on Windows, you may need to set:

```bash
# PowerShell
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'

# Or add to your .env
NODE_TLS_REJECT_UNAUTHORIZED=0
```

**Note**: This is only for development. Production deployments on Vercel handle SSL automatically.

### Database Configuration

Your `backend/config.js` is now configured for PostgreSQL with:
- Connection pooling
- SSL support
- Proper dialect settings

### Environment Variables

Your `.env` file now includes:
- `DATABASE_URL` - Connection pooler (for serverless)
- `DIRECT_URL` - Direct connection (for migrations)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public API key
- `SUPABASE_SERVICE_ROLE_KEY` - Admin API key

## 🚨 Common Issues & Solutions

### Issue: SSL Certificate Errors

**Solution**: Set `NODE_TLS_REJECT_UNAUTHORIZED=0` for development or update dialectOptions in config.

### Issue: Connection Timeout

**Solution**: 
1. Check if Supabase project is active
2. Verify DATABASE_URL is correct
3. Check network/firewall settings

### Issue: Sequelize Migration Fails

**Solution**:
1. Update models for PostgreSQL data types
2. Check migration files for MySQL-specific syntax
3. Run migrations one at a time to identify issues

### Issue: Data Type Mismatch

**Solution**: Review and update all Sequelize models. Common changes:
- `TINYINT` → `SMALLINT` or `BOOLEAN`
- `DATETIME` → `DATE` or `TIMESTAMPTZ`
- `JSON` → `JSONB`

## 📚 Documentation

Detailed guides available:

1. **MIGRATION_GUIDE.md** - Complete migration process
2. **SUPABASE_SETUP.md** - Supabase configuration details
3. **TURBOREPO_SETUP.md** - Turborepo usage and features
4. **VERCEL_DEPLOYMENT.md** - Deployment instructions
5. **MIGRATION_CHECKLIST.md** - Detailed checklist

## 🎯 Recommended Workflow

1. **Update Models** (30-60 min)
   - Review all files in `backend/models/`
   - Update data types for PostgreSQL
   - Test model definitions

2. **Run Migrations** (15-30 min)
   - Execute `npx sequelize-cli db:migrate`
   - Fix any errors
   - Verify tables created in Supabase

3. **Seed Database** (10-15 min)
   - Run `npx sequelize-cli db:seed:all`
   - Verify data in Supabase Dashboard

4. **Test Application** (30 min)
   - Start dev servers: `pnpm turbo dev`
   - Test all major features
   - Check database operations

5. **Deploy** (15 min)
   - Push to Git
   - Deploy to Vercel
   - Verify production deployment

## 🔄 Rollback Plan

If you need to rollback to MySQL:

```bash
# 1. Restore MySQL config
mv backend/config.mysql.backup.js backend/config.js

# 2. Update .env with MySQL credentials
# Comment out Supabase vars, uncomment MySQL vars

# 3. Reinstall MySQL driver
cd backend
pnpm add mysql2
pnpm remove pg pg-hstore

# 4. Restart services
pnpm turbo dev
```

## 💡 Tips

1. **Use Supabase Dashboard** - Monitor queries, check logs, manage data
2. **Enable Row Level Security** - Add security policies after migration
3. **Add Indexes** - Optimize query performance
4. **Use Connection Pooler** - Always use DATABASE_URL (port 6543) for serverless
5. **Test Thoroughly** - Verify all features before deploying

## 🆘 Need Help?

1. Check the detailed documentation files
2. Review Supabase logs in Dashboard → Logs
3. Check backend logs for errors
4. Consult:
   - [Supabase Docs](https://supabase.com/docs)
   - [Turborepo Docs](https://turbo.build/repo/docs)
   - [Vercel Docs](https://vercel.com/docs)

## ✨ What's New

### Turborepo Commands

```bash
# Development
pnpm turbo dev              # All packages
pnpm dev:frontend           # Frontend only
pnpm dev:backend            # Backend only

# Building
pnpm turbo build            # All packages
pnpm build:frontend         # Frontend only
pnpm build:backend          # Backend only

# Testing
pnpm turbo test             # All tests
pnpm turbo lint             # Lint all

# Type checking
pnpm turbo type-check       # Check types
```

### Supabase Features Available

- ✅ PostgreSQL 17.6 database
- ✅ Connection pooling
- ✅ Automatic backups
- ✅ Real-time subscriptions (optional)
- ✅ Row Level Security (optional)
- ✅ Storage for files (optional)
- ✅ Auth integration (optional)

---

**Ready to proceed?** Start with Step 1: Migrate Your Database Schema!

For detailed instructions, see **MIGRATION_GUIDE.md**.
