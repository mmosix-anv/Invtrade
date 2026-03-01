# Dependency Structure

## Overview

After disconnecting from the Turbo monorepo, the project has three separate `package.json` files:

```
.
├── package.json           # Root - orchestration scripts and shared tools
├── frontend/package.json  # Frontend - all frontend dependencies
└── backend/package.json   # Backend - all backend dependencies
```

## Are Frontend/Backend Dependent on Root?

**Short Answer: No, they are fully independent.**

### Frontend Independence

The frontend has ALL its dependencies in `frontend/package.json`. You can:

```bash
cd frontend
npm install
npm run dev
```

This works completely independently without the root `node_modules`.

### Backend Independence

The backend has ALL its dependencies in `backend/package.json`. You can:

```bash
cd backend
npm install
npm run dev
```

This works completely independently without the root `node_modules`.

## Why Does Root Have Dependencies?

The root `package.json` contains dependencies for:

1. **Build tools and scripts** - Used by orchestration scripts in `/scripts` and `/tools`
2. **Shared utilities** - Used by build processes that touch both projects
3. **Development convenience** - Allows running `npm run dev` from root to start both

### Root Dependencies Breakdown

#### Production Dependencies
These are used by scripts in `/scripts` and `/tools`:
- `@google-cloud/translate` - Translation tools
- `@reown/appkit` - Used by build scripts
- `@supabase/supabase-js` - Database utilities
- `ccxt` - Exchange integration tools
- `dotenv` - Environment loading for scripts
- `jose` - JWT utilities for scripts
- `tonweb` - Blockchain utilities
- `viem` - Web3 utilities
- `wagmi` - Web3 utilities
- `web-push` - Push notification utilities

#### Dev Dependencies
Build and development tools:
- `@babel/*` - Code transformation tools
- `@eslint/*` - Linting tools
- `@typescript-eslint/*` - TypeScript linting
- `concurrently` - Run multiple commands (used in `npm run dev`)
- `cross-env` - Cross-platform environment variables
- `eslint` - Code linting
- `prettier` - Code formatting
- `typescript` - TypeScript compiler
- `fast-glob` - File pattern matching for build scripts

## Shared Dependencies

Some dependencies appear in multiple `package.json` files:

### Frontend + Root
- `@reown/appkit`
- `@reown/appkit-adapter-wagmi`
- `@tanstack/react-query`
- `viem`
- `wagmi`

### Backend + Root
- `ccxt`
- `dotenv`
- `tonweb`
- `web-push`

**This is intentional and correct.** Each project has its own copy, ensuring independence.

## Installation Recommendations

### For Development (All Features)

Install all three:

```bash
npm install                          # Root tools
cd frontend && npm install && cd ..  # Frontend
cd backend && npm install && cd ..   # Backend
```

### For Frontend Only

```bash
cd frontend
npm install
npm run dev
```

### For Backend Only

```bash
cd backend
npm install
npm run dev
```

### For Production Deployment

Each project can be deployed independently:

**Frontend:**
```bash
cd frontend
npm install
npm run build
npm start
```

**Backend:**
```bash
cd backend
npm install
npm run build
npm start
```

## Dependency Duplication

Yes, some packages are duplicated across root/frontend/backend. This is:

1. **Intentional** - Ensures true independence
2. **Standard practice** - Common in multi-project repositories
3. **Worth it** - Enables independent deployment and development

The disk space cost is minimal compared to the benefits of independence.

## Migration Notes

If you were previously using pnpm workspace with hoisting:
- Dependencies were hoisted to root `node_modules`
- Frontend/backend used root's `node_modules`

Now:
- Each project has its own `node_modules`
- No hoisting or sharing
- True independence

## Verifying Independence

Test that frontend/backend work without root:

```bash
# Test frontend independence
rm -rf node_modules
cd frontend
npm install
npm run dev  # Should work!

# Test backend independence
cd ../backend
npm install
npm run dev  # Should work!
```

If either fails, there's a missing dependency in that project's `package.json`.

## Summary

✅ Frontend is fully independent
✅ Backend is fully independent
✅ Root dependencies are for build tools and orchestration only
✅ Shared dependencies are intentionally duplicated
✅ Each project can be deployed separately
