# Migration Checklist

Use this checklist to track your progress migrating from MySQL to Supabase PostgreSQL with Turborepo and Vercel.

## Phase 1: Preparation

### Prerequisites
- [ ] Node.js 18+ installed
- [ ] pnpm 8+ installed
- [ ] Git repository set up
- [ ] Backup of current MySQL database created
- [ ] Supabase account created
- [ ] Vercel account created

### Documentation Review
- [ ] Read `README_MIGRATION.md`
- [ ] Read `MIGRATION_GUIDE.md`
- [ ] Read `SUPABASE_SETUP.md`
- [ ] Read `TURBOREPO_SETUP.md`
- [ ] Read `VERCEL_DEPLOYMENT.md`

## Phase 2: Supabase Setup

### Create Supabase Project
- [ ] Created new Supabase project
- [ ] Noted project reference ID
- [ ] Saved database password securely
- [ ] Selected appropriate region

### Get Credentials
- [ ] Copied `DATABASE_URL` (connection pooler - port 6543)
- [ ] Copied `DIRECT_URL` (direct connection - port 5432)
- [ ] Copied `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Copied `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Copied `SUPABASE_SERVICE_ROLE_KEY`

### Configure Environment
- [ ] Created `.env` file from `.env.example`
- [ ] Added all Supabase credentials to `.env`
- [ ] Verified `.env` is in `.gitignore`
- [ ] Created `.env.local` for local development (if needed)

## Phase 3: Install Dependencies

### Turborepo
- [ ] Installed Turborepo: `pnpm add -D turbo`
- [ ] Verified `turbo.json` exists
- [ ] Verified `pnpm-workspace.yaml` exists

### Supabase Client
- [ ] Installed Supabase client: `pnpm add @supabase/supabase-js`
- [ ] Verified `frontend/lib/supabase.ts` exists
- [ ] Verified `backend/lib/supabase.ts` exists

### PostgreSQL Driver
- [ ] Navigated to backend: `cd backend`
- [ ] Installed pg driver: `pnpm add pg pg-hstore`
- [ ] Removed MySQL driver: `pnpm remove mysql2` (optional)
- [ ] Returned to root: `cd ..`

## Phase 4: Configuration Updates

### Database Configuration
- [ ] Backed up `backend/config.js` to `backend/config.mysql.backup.js`
- [ ] Replaced `backend/config.js` with PostgreSQL configuration
- [ ] Updated dialect from `mysql` to `postgres`
- [ ] Added SSL configuration for Supabase
- [ ] Configured connection pooling

### Package.json Scripts
- [ ] Updated root `package.json` with Turborepo commands
- [ ] Verified `dev` script uses `turbo dev`
- [ ] Verified `build` script uses `turbo build`
- [ ] Verified `test` script uses `turbo test`
- [ ] Verified `lint` script uses `turbo lint`

### Sequelize Configuration
- [ ] Created `backend/.sequelizerc` file
- [ ] Verified Sequelize CLI can find config
- [ ] Tested Sequelize CLI: `cd backend && npx sequelize-cli --version`

## Phase 5: Database Connection

### Test Connection
- [ ] Created test connection script
- [ ] Ran test: `node backend/test-connection.js`
- [ ] Verified successful connection
- [ ] Verified PostgreSQL version displayed
- [ ] Resolved any connection errors

### Connection Troubleshooting (if needed)
- [ ] Verified `DATABASE_URL` format is correct
- [ ] Checked SSL settings in config
- [ ] Confirmed Supabase project is active
- [ ] Tested with `DIRECT_URL` if pooler fails
- [ ] Checked firewall/network settings

## Phase 6: Database Migration

### Schema Migration

#### Option A: Using pgloader (Recommended)
- [ ] Installed pgloader
- [ ] Created `migration.load` configuration
- [ ] Tested connection to both databases
- [ ] Ran pgloader migration
- [ ] Verified all tables migrated
- [ ] Verified all indexes migrated
- [ ] Verified all constraints migrated

#### Option B: Manual Export/Import
- [ ] Exported MySQL schema: `mysqldump --no-data`
- [ ] Converted MySQL syntax to PostgreSQL
- [ ] Imported schema to Supabase
- [ ] Exported MySQL data: `mysqldump --no-create-info`
- [ ] Converted data format if needed
- [ ] Imported data to Supabase

#### Option C: Sequelize Migrations
- [ ] Created new migration files
- [ ] Updated migration syntax for PostgreSQL
- [ ] Ran migrations: `npx sequelize-cli db:migrate`
- [ ] Verified migrations completed successfully

### Data Verification
- [ ] Verified all tables exist in Supabase
- [ ] Verified row counts match
- [ ] Spot-checked data integrity
- [ ] Verified foreign key relationships
- [ ] Verified indexes exist

## Phase 7: Code Updates

### Update Sequelize Models
- [ ] Listed all model files in `backend/models/`
- [ ] Updated `TINYINT` to `SMALLINT` or `BOOLEAN`
- [ ] Updated `DATETIME` to `DATE` or `TIMESTAMPTZ`
- [ ] Updated `JSON` to `JSONB` (recommended)
- [ ] Verified enum types
- [ ] Updated any MySQL-specific functions
- [ ] Tested model definitions

### Update Type Definitions
- [ ] Updated `backend/types/models/*.d.ts` files
- [ ] Verified TypeScript types match new data types
- [ ] Ran type check: `pnpm turbo type-check`
- [ ] Fixed any type errors

### Update Queries
- [ ] Searched for MySQL-specific SQL syntax
- [ ] Updated to PostgreSQL syntax
- [ ] Updated date/time functions
- [ ] Updated string functions if needed
- [ ] Updated any raw queries

### Update Seeders
- [ ] Updated seeder files for PostgreSQL
- [ ] Tested seeders: `npx sequelize-cli db:seed:all`
- [ ] Verified seeded data

## Phase 8: Testing

### Local Testing
- [ ] Started development server: `pnpm turbo dev`
- [ ] Verified frontend loads
- [ ] Verified backend API responds
- [ ] Tested database read operations
- [ ] Tested database write operations
- [ ] Tested authentication
- [ ] Tested file uploads (if applicable)
- [ ] Tested all major features

### Run Test Suite
- [ ] Ran unit tests: `pnpm turbo test`
- [ ] Fixed failing tests
- [ ] Ran integration tests
- [ ] Verified test coverage

### Performance Testing
- [ ] Tested query performance
- [ ] Compared with MySQL performance
- [ ] Added indexes if needed
- [ ] Optimized slow queries

## Phase 9: Turborepo Verification

### Build Testing
- [ ] Ran build: `pnpm turbo build`
- [ ] Verified frontend builds successfully
- [ ] Verified backend builds successfully
- [ ] Checked build output directories

### Cache Testing
- [ ] Ran build twice to test caching
- [ ] Verified cache hit on second build
- [ ] Tested cache invalidation
- [ ] Cleared cache: `rm -rf .turbo`

### Task Dependencies
- [ ] Verified task dependencies in `turbo.json`
- [ ] Tested parallel execution
- [ ] Tested filtered builds: `--filter=frontend`

## Phase 10: Vercel Setup

### Project Configuration
- [ ] Installed Vercel CLI: `pnpm add -g vercel`
- [ ] Logged in: `vercel login`
- [ ] Linked project: `vercel link`
- [ ] Verified `vercel.json` configuration

### Environment Variables
- [ ] Added `DATABASE_URL` to Vercel
- [ ] Added `DIRECT_URL` to Vercel
- [ ] Added `NEXT_PUBLIC_SUPABASE_URL` to Vercel
- [ ] Added `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel
- [ ] Added `SUPABASE_SERVICE_ROLE_KEY` to Vercel
- [ ] Added all other required environment variables
- [ ] Set variables for all environments (Production, Preview, Development)

### Build Configuration
- [ ] Set Framework Preset to Next.js
- [ ] Set Build Command to `pnpm turbo build`
- [ ] Set Output Directory to `frontend/.next`
- [ ] Set Install Command to `pnpm install`
- [ ] Set Node.js Version to 18.x or higher

## Phase 11: Deployment

### Preview Deployment
- [ ] Deployed preview: `vercel`
- [ ] Verified preview URL works
- [ ] Tested all features on preview
- [ ] Checked preview logs for errors
- [ ] Verified database connection works

### Production Deployment
- [ ] Deployed to production: `vercel --prod`
- [ ] Verified production URL works
- [ ] Tested all features on production
- [ ] Checked production logs
- [ ] Verified database connection works
- [ ] Tested performance

### Domain Configuration (if applicable)
- [ ] Added custom domain in Vercel
- [ ] Configured DNS records
- [ ] Verified SSL certificate
- [ ] Tested custom domain

## Phase 12: Post-Deployment

### Monitoring Setup
- [ ] Enabled Vercel Analytics
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configured log monitoring
- [ ] Set up uptime monitoring
- [ ] Configured alerts

### Supabase Features
- [ ] Enabled Row Level Security (RLS)
- [ ] Created security policies
- [ ] Added database indexes
- [ ] Enabled Realtime (if needed)
- [ ] Configured Storage (if needed)

### Performance Optimization
- [ ] Analyzed query performance
- [ ] Added missing indexes
- [ ] Optimized slow queries
- [ ] Configured caching
- [ ] Enabled CDN

### Documentation
- [ ] Updated project README
- [ ] Documented new deployment process
- [ ] Documented environment variables
- [ ] Created runbook for common issues
- [ ] Updated team documentation

## Phase 13: Cleanup

### Remove Old Configuration
- [ ] Archived MySQL configuration files
- [ ] Removed MySQL-specific code
- [ ] Cleaned up unused dependencies
- [ ] Removed old deployment scripts

### Git Cleanup
- [ ] Committed all changes
- [ ] Created migration branch/tag
- [ ] Pushed to remote repository
- [ ] Created pull request (if applicable)
- [ ] Merged to main branch

### Backup
- [ ] Backed up Supabase database
- [ ] Documented backup process
- [ ] Tested restore process
- [ ] Scheduled automatic backups

## Phase 14: Team Handoff

### Documentation
- [ ] Shared migration documentation with team
- [ ] Conducted knowledge transfer session
- [ ] Updated onboarding documentation
- [ ] Created troubleshooting guide

### Access
- [ ] Granted team access to Supabase
- [ ] Granted team access to Vercel
- [ ] Shared environment variables securely
- [ ] Updated access control policies

### Training
- [ ] Trained team on Supabase
- [ ] Trained team on Turborepo
- [ ] Trained team on Vercel deployment
- [ ] Documented common workflows

## Final Verification

### Functionality
- [ ] All features working in production
- [ ] No critical errors in logs
- [ ] Performance meets requirements
- [ ] Security policies in place

### Rollback Plan
- [ ] Documented rollback procedure
- [ ] Tested rollback process
- [ ] Kept MySQL backup accessible
- [ ] Documented recovery time objective

### Success Criteria
- [ ] Zero downtime during migration
- [ ] All data migrated successfully
- [ ] Performance equal or better than before
- [ ] Team comfortable with new stack
- [ ] Documentation complete

---

## Notes

Use this section to track issues, decisions, and important information during migration:

### Issues Encountered
- 

### Decisions Made
- 

### Important Dates
- Migration Start: 
- Migration Complete: 
- Production Deployment: 

### Contacts
- Supabase Support: 
- Vercel Support: 
- Team Lead: 

---

**Migration Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

**Last Updated:** _____________

**Completed By:** _____________
