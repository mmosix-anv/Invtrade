# Migration Guide: MySQL to Supabase PostgreSQL + Turborepo

This guide will help you migrate your Bicrypto project from MySQL to Supabase PostgreSQL and configure it as a Vercel Turborepo monorepo.

## Prerequisites

1. A Supabase account (https://supabase.com)
2. A Vercel account (https://vercel.com)
3. Node.js 18+ and pnpm installed
4. Turbo CLI: `pnpm install -g turbo`

## Step 1: Set Up Supabase Project

1. Create a new project in Supabase Dashboard
2. Go to Project Settings → Database
3. Copy your connection strings:
   - `DATABASE_URL` (Transaction pooler)
   - `DIRECT_URL` (Session pooler)
4. Copy your API keys from Project Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Step 2: Update Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Supabase credentials:
   ```env
   DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
   DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
   NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT-REF].supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
   SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   ```

## Step 3: Install Dependencies

```bash
# Install Turborepo
pnpm add -D turbo

# Install Supabase client libraries
pnpm add @supabase/supabase-js

# Install PostgreSQL driver for Sequelize
cd backend
pnpm add pg pg-hstore
pnpm remove mysql2
cd ..
```

## Step 4: Update Database Configuration

Replace `backend/config.js` with `backend/config.supabase.js`:

```bash
mv backend/config.js backend/config.mysql.js.backup
mv backend/config.supabase.js backend/config.js
```

## Step 5: Migrate Database Schema

### Option A: Using Supabase Migration Tool

1. Export your MySQL schema:
   ```bash
   mysqldump -u root -p --no-data bicrypto > schema.sql
   ```

2. Convert MySQL to PostgreSQL syntax (manual or use tools like pgloader)

3. Run migrations in Supabase SQL Editor

### Option B: Using Sequelize Migrations

1. Update Sequelize models to use PostgreSQL data types:
   - `TINYINT` → `SMALLINT` or `BOOLEAN`
   - `DATETIME` → `TIMESTAMP`
   - `TEXT` → `TEXT` (same)
   - `JSON` → `JSONB` (recommended for better performance)

2. Generate new migrations:
   ```bash
   cd backend
   npx sequelize-cli migration:generate --name migrate-to-postgres
   ```

3. Run migrations:
   ```bash
   npx sequelize-cli db:migrate --config ./config.js
   ```

## Step 6: Update Sequelize Models

Update all model files in `backend/models/` to use PostgreSQL-compatible data types:

```typescript
// Example: Change from MySQL to PostgreSQL types
// Before (MySQL)
@Column({
  type: DataTypes.TINYINT,
  defaultValue: 0
})
status: number;

// After (PostgreSQL)
@Column({
  type: DataTypes.SMALLINT,
  defaultValue: 0
})
status: number;
```

## Step 7: Update Package Scripts

Your root `package.json` has been updated with Turborepo commands:

```bash
# Development
pnpm turbo dev

# Build all packages
pnpm turbo build

# Run tests
pnpm turbo test

# Lint
pnpm turbo lint
```

## Step 8: Deploy to Vercel

1. Install Vercel CLI:
   ```bash
   pnpm add -g vercel
   ```

2. Link your project:
   ```bash
   vercel link
   ```

3. Add environment variables in Vercel Dashboard:
   - Go to Project Settings → Environment Variables
   - Add all variables from your `.env` file

4. Deploy:
   ```bash
   vercel --prod
   ```

## Step 9: Configure Vercel for Turborepo

The `vercel.json` file has been created with the following configuration:
- Frontend: Next.js app deployed as main application
- Backend: Node.js API deployed as serverless functions
- Build command: `pnpm turbo build`

## Step 10: Test the Migration

1. Start development servers:
   ```bash
   pnpm turbo dev
   ```

2. Test database connections:
   ```bash
   cd backend
   pnpm test
   ```

3. Verify all features work correctly

## Common Issues and Solutions

### Issue: Connection Pool Errors

**Solution**: Adjust pool settings in `backend/config.js`:
```javascript
pool: {
  max: 10,
  min: 2,
  acquire: 30000,
  idle: 10000
}
```

### Issue: SSL Certificate Errors

**Solution**: Update dialectOptions in config:
```javascript
dialectOptions: {
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
}
```

### Issue: Data Type Mismatches

**Solution**: Review and update all Sequelize models to use PostgreSQL-compatible types.

### Issue: Sequelize Seeders Failing

**Solution**: Update seeders to use PostgreSQL syntax:
- Replace MySQL-specific functions
- Update date formats
- Adjust AUTO_INCREMENT to SERIAL

## Performance Optimization

1. **Enable Connection Pooling**: Use Supabase's transaction pooler (port 6543)
2. **Add Indexes**: Review and add indexes for frequently queried columns
3. **Use JSONB**: Convert JSON columns to JSONB for better performance
4. **Enable Row Level Security (RLS)**: Add security policies in Supabase

## Rollback Plan

If you need to rollback to MySQL:

1. Restore `backend/config.mysql.js.backup` to `backend/config.js`
2. Reinstall MySQL driver: `pnpm add mysql2`
3. Update `.env` with MySQL credentials
4. Restart services

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Vercel Deployment Guide](https://vercel.com/docs)
- [Sequelize PostgreSQL Guide](https://sequelize.org/docs/v6/other-topics/dialect-specific-things/#postgresql)

## Support

For issues or questions:
1. Check Supabase logs in Dashboard → Logs
2. Review Vercel deployment logs
3. Check backend logs for database connection errors
