# Invtrade: Supabase + Turborepo Migration

This project has been configured to migrate from MySQL to Supabase PostgreSQL and use Turborepo for monorepo management with Vercel deployment.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Supabase account
- Vercel account (for deployment)

### Automated Migration

**Linux/macOS:**
```bash
chmod +x scripts/migrate-to-supabase.sh
./scripts/migrate-to-supabase.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\migrate-to-supabase.ps1
```

### Manual Migration

1. **Install dependencies:**
   ```bash
   pnpm add -D turbo
   pnpm add @supabase/supabase-js
   cd backend && pnpm add pg pg-hstore
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

3. **Update database configuration:**
   ```bash
   mv backend/config.js backend/config.mysql.backup.js
   mv backend/config.supabase.js backend/config.js
   ```

4. **Test connection:**
   ```bash
   cd backend
   node -e "const {Sequelize}=require('sequelize');require('dotenv').config({path:'../.env'});new Sequelize(process.env.DATABASE_URL,{dialect:'postgres',dialectOptions:{ssl:{require:true,rejectUnauthorized:false}}}).authenticate().then(()=>console.log('✅ Connected')).catch(e=>console.error('❌',e))"
   ```

5. **Run migrations:**
   ```bash
   npx sequelize-cli db:migrate
   npx sequelize-cli db:seed:all
   ```

## 📁 New Project Structure

```
bicrypto/
├── frontend/              # Next.js application
│   ├── lib/
│   │   └── supabase.ts   # Supabase client (new)
│   └── package.json
├── backend/               # Node.js API
│   ├── lib/
│   │   └── supabase.ts   # Supabase server client (new)
│   ├── config.js         # PostgreSQL config (updated)
│   └── package.json
├── turbo.json            # Turborepo config (new)
├── vercel.json           # Vercel deployment (new)
├── pnpm-workspace.yaml   # PNPM workspace (new)
└── package.json          # Root package with Turbo scripts
```

## 🔧 Configuration Files

### New Files Created

1. **turbo.json** - Turborepo configuration for build caching and task orchestration
2. **vercel.json** - Vercel deployment configuration
3. **pnpm-workspace.yaml** - PNPM workspace definition
4. **backend/config.supabase.js** - PostgreSQL/Supabase database configuration
5. **backend/lib/supabase.ts** - Supabase server-side client
6. **frontend/lib/supabase.ts** - Supabase client-side client
7. **backend/.sequelizerc** - Sequelize CLI configuration

### Updated Files

1. **package.json** - Updated scripts to use Turborepo
2. **.env.example** - Added Supabase environment variables

## 🎯 Available Commands

### Development

```bash
# Run all packages in dev mode
pnpm turbo dev

# Run specific package
pnpm dev:frontend
pnpm dev:backend
```

### Building

```bash
# Build all packages
pnpm turbo build

# Build specific package
pnpm build:frontend
pnpm build:backend
```

### Testing

```bash
# Run all tests
pnpm turbo test

# Run specific tests
pnpm test:backend
```

### Linting

```bash
# Lint all packages
pnpm turbo lint
```

## 🗄️ Database Migration

### Data Type Conversions

When migrating from MySQL to PostgreSQL, update these data types in your Sequelize models:

| MySQL | PostgreSQL |
|-------|------------|
| `TINYINT` | `SMALLINT` or `BOOLEAN` |
| `TINYINT(1)` | `BOOLEAN` |
| `DATETIME` | `TIMESTAMP` or `TIMESTAMPTZ` |
| `JSON` | `JSONB` (recommended) |
| `TEXT` | `TEXT` |
| `DECIMAL(10,2)` | `DECIMAL(10,2)` |

### Example Model Update

**Before (MySQL):**
```typescript
@Column({
  type: DataTypes.TINYINT,
  defaultValue: 0
})
status: number;

@Column({
  type: DataTypes.DATETIME
})
createdAt: Date;
```

**After (PostgreSQL):**
```typescript
@Column({
  type: DataTypes.SMALLINT,
  defaultValue: 0
})
status: number;

@Column({
  type: DataTypes.DATE
})
createdAt: Date;
```

## 🌐 Environment Variables

### Required Supabase Variables

```env
# Database Connection
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Supabase API
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### Get Your Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. **Database credentials:** Settings → Database → Connection string
4. **API credentials:** Settings → API → Project URL and API Keys

## 🚢 Deployment

### Deploy to Vercel

1. **Install Vercel CLI:**
   ```bash
   pnpm add -g vercel
   ```

2. **Login:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   vercel --prod
   ```

4. **Add environment variables** in Vercel Dashboard → Settings → Environment Variables

### Automatic Deployments

Once connected to Git:
- **Production:** Pushes to `main` branch
- **Preview:** Pull requests and other branches

## 📚 Documentation

Comprehensive guides have been created:

1. **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Complete step-by-step migration guide
2. **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** - Supabase project setup and configuration
3. **[TURBOREPO_SETUP.md](./TURBOREPO_SETUP.md)** - Turborepo usage and optimization
4. **[VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)** - Vercel deployment guide

## 🔍 Troubleshooting

### Database Connection Issues

**Problem:** Cannot connect to Supabase
**Solution:**
1. Verify `DATABASE_URL` in `.env`
2. Check SSL settings in `backend/config.js`
3. Ensure Supabase project is active

### Build Failures

**Problem:** Turborepo build fails
**Solution:**
```bash
# Clear cache and rebuild
rm -rf .turbo
pnpm turbo build --force
```

### Type Errors After Migration

**Problem:** TypeScript errors in models
**Solution:**
1. Update data types in model files
2. Run type check: `pnpm turbo type-check`
3. Update `backend/types/models/*.d.ts` files

### Sequelize Migration Errors

**Problem:** Migrations fail with syntax errors
**Solution:**
1. Check for MySQL-specific syntax
2. Update to PostgreSQL syntax
3. Test migrations on local Supabase instance first

## 🎓 Learning Resources

### Supabase
- [Official Documentation](https://supabase.com/docs)
- [PostgreSQL Guide](https://supabase.com/docs/guides/database)
- [Auth Guide](https://supabase.com/docs/guides/auth)

### Turborepo
- [Official Documentation](https://turbo.build/repo/docs)
- [Handbook](https://turbo.build/repo/docs/handbook)
- [Examples](https://github.com/vercel/turbo/tree/main/examples)

### Vercel
- [Deployment Documentation](https://vercel.com/docs)
- [Monorepo Guide](https://vercel.com/docs/monorepos)
- [Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

## 🤝 Support

If you encounter issues:

1. Check the documentation files in this repository
2. Review [Supabase Community](https://github.com/supabase/supabase/discussions)
3. Check [Turborepo Discord](https://turbo.build/discord)
4. Review [Vercel Support](https://vercel.com/support)

## ✅ Migration Checklist

- [ ] Supabase project created
- [ ] Environment variables configured
- [ ] Dependencies installed
- [ ] Database configuration updated
- [ ] Database connection tested
- [ ] Sequelize models updated for PostgreSQL
- [ ] Migrations run successfully
- [ ] Seeders run successfully
- [ ] Application tested locally
- [ ] Turborepo commands working
- [ ] Vercel project created
- [ ] Environment variables set in Vercel
- [ ] Deployed to Vercel
- [ ] Production deployment tested

## 🎉 What's Next?

After successful migration:

1. **Enable Supabase features:**
   - Row Level Security (RLS)
   - Realtime subscriptions
   - Storage for file uploads
   - Edge Functions

2. **Optimize performance:**
   - Add database indexes
   - Enable Turborepo remote caching
   - Configure CDN caching

3. **Set up monitoring:**
   - Vercel Analytics
   - Supabase Dashboard monitoring
   - Error tracking (Sentry)

4. **Implement CI/CD:**
   - GitHub Actions
   - Automated testing
   - Preview deployments

---

**Need help?** Check the detailed guides in the documentation files or reach out to the community!
