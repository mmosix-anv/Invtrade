# Migration Guide: From Turbo Monorepo to Independent Projects

This guide explains the changes made to disconnect the Turbo monorepo setup.

## What Changed

### Removed Files
- `turbo.json` - Turbo configuration
- `pnpm-workspace.yaml` - pnpm workspace configuration
- `.turbo/` - Turbo cache directories

### Updated Files
- `package.json` - Root package.json scripts updated to work without Turbo
- Removed `turbo` from devDependencies

### Added Files
- `README.md` - Root project documentation
- `frontend/README.md` - Frontend-specific documentation
- `backend/README.md` - Backend-specific documentation
- `MIGRATION_GUIDE.md` - This file

## Key Changes in Scripts

### Before (Turbo Monorepo)
```json
"dev": "turbo dev"
"build": "turbo build"
"dev:frontend": "turbo dev --filter=frontend"
```

### After (Independent)
```json
"dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\""
"build": "npm run build:backend && npm run build:frontend"
"dev:frontend": "cd frontend && npm run dev"
```

## Important: Dependency Management

### Shared Dependencies

The root `package.json` contains some dependencies that are also used by frontend and backend:

**Shared with Frontend:**
- `@reown/appkit`
- `@reown/appkit-adapter-wagmi`
- `@tanstack/react-query`
- `viem`
- `wagmi`

**Shared with Backend:**
- `ccxt`
- `dotenv`
- `tonweb`
- `web-push`

These dependencies are in the root for convenience scripts and tools. However, **frontend and backend have their own copies** in their respective `package.json` files, so they are fully independent.

### How to Use

#### First Time Setup

1. **Clean existing node_modules** (recommended):
   ```bash
   rm -rf node_modules frontend/node_modules backend/node_modules
   ```

2. **Install dependencies**:
   ```bash
   # Root dependencies (for build scripts and tools)
   npm install
   
   # Frontend dependencies (includes all frontend needs)
   cd frontend && npm install && cd ..
   
   # Backend dependencies (includes all backend needs)
   cd backend && npm install && cd ..
   ```

3. **Verify independence** (optional):
   ```bash
   # Frontend should work without root node_modules
   cd frontend && npm run dev
   
   # Backend should work without root node_modules
   cd backend && npm run dev
   ```

### Development

#### Run both applications:
```bash
npm run dev
```

#### Run independently:
```bash
# Frontend only
cd frontend
npm run dev

# Backend only (in another terminal)
cd backend
npm run dev
```

### Production Build

#### Build both:
```bash
npm run build
```

#### Build independently:
```bash
# Frontend
cd frontend
npm run build

# Backend
cd backend
npm run build
```

## Benefits of This Change

1. **Independent Deployment**: Deploy frontend and backend separately
2. **Simpler CI/CD**: Each project can have its own pipeline
3. **Flexible Scaling**: Scale frontend and backend independently
4. **Easier Onboarding**: Developers can work on one part without the other
5. **No Turbo Dependency**: One less tool to manage and configure
6. **Standard npm/pnpm**: Use standard package manager commands
7. **True Independence**: Each project has all its dependencies, no hoisting required

## Package Manager

You can now use either:
- `npm` - Standard Node package manager
- `pnpm` - Fast, disk space efficient package manager (still works without workspace config)
- `yarn` - Alternative package manager

The project no longer requires pnpm workspace features.

## Troubleshooting

### Issue: Scripts not working
**Solution**: Make sure you've installed dependencies in all three locations (root, frontend, backend)

### Issue: Port conflicts
**Solution**: Check your `.env` files and ensure frontend and backend use different ports

### Issue: Module not found errors
**Solution**: 
1. Clear node_modules: `rm -rf node_modules frontend/node_modules backend/node_modules`
2. Clear package locks if switching package managers
3. Reinstall: `npm install && cd frontend && npm install && cd ../backend && npm install`

### Issue: Build failures
**Solution**: Build backend first, then frontend: `npm run build:backend && npm run build:frontend`

## Reverting (If Needed)

If you need to revert to the Turbo monorepo setup:

1. Restore `turbo.json` from git history
2. Restore `pnpm-workspace.yaml` from git history
3. Add `turbo` back to devDependencies
4. Restore original scripts in `package.json`
5. Run `pnpm install`

## Questions?

Check the README files:
- Root: `README.md`
- Frontend: `frontend/README.md`
- Backend: `backend/README.md`
