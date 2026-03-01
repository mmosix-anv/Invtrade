# How to Start the Backend

## Prerequisites

- Node.js 20.x or higher installed
- PostgreSQL database running (or connection URL)
- Environment variables configured

## Steps to Start Backend Locally

### 1. Navigate to Backend Folder

```bash
cd backend
```

### 2. Install Dependencies

```bash
npm install
```

This installs all required packages from `package.json` into `node_modules/`.

### 3. Configure Environment Variables

Create or update `.env` file in the backend folder (or use root `.env`):

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/database
DIRECT_URL=postgresql://user:password@localhost:5432/database

# Application
NODE_ENV=development
APP_PUBLIC_URL=http://localhost:30004
NEXT_PUBLIC_BACKEND_URL=http://localhost:30004
NEXT_PUBLIC_BACKEND_PORT=30004

# Security (generate secure random strings)
APP_ACCESS_TOKEN_SECRET=your-secure-secret-min-32-chars
APP_REFRESH_TOKEN_SECRET=your-different-secure-secret
APP_ENCRYPT_SECRET=your-encryption-key-32-chars
SESSION_SECRET=your-session-secret-min-32-chars

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

### 4. Build TypeScript (if not already built)

```bash
npm run build
```

This compiles TypeScript files from `src/` and root to `dist/` folder.

### 5. Start the Server

**Option A: Development Mode (with auto-reload)**
```bash
npm run dev
```

**Option B: Production Mode**
```bash
npm start
```

**Option C: Direct Node (not recommended)**
```bash
node dist/index.js
```
⚠️ Only use this if you've already run `npm install` and `npm run build`

### 6. Verify Server is Running

The server should start on port 30004 (or your configured port).

Test with:
```bash
curl http://localhost:30004/api/health
```

Or open in browser: `http://localhost:30004`

## Common Issues

### Issue: "Cannot find module 'module-alias/register'"

**Cause:** Dependencies not installed

**Solution:**
```bash
cd backend
npm install
```

### Issue: "Cannot find module './src'"

**Cause:** TypeScript not compiled

**Solution:**
```bash
npm run build
```

### Issue: Database connection errors

**Cause:** Database not running or wrong connection URL

**Solution:**
- Check PostgreSQL is running
- Verify `DATABASE_URL` in `.env`
- Test connection: `npm run test:connection` (if available)

### Issue: Port already in use

**Cause:** Another process using port 30004

**Solution:**
- Change port in `.env`: `NEXT_PUBLIC_BACKEND_PORT=30005`
- Or kill the process using the port

### Issue: Module path errors

**Cause:** `module-alias` not configured properly

**Solution:**
- Ensure `module-alias-setup.ts` is compiled
- Check `package.json` has `module-alias` dependency
- Verify `_moduleAliases` in `package.json`

## Development Workflow

### Watch Mode (Auto-reload on changes)

```bash
npm run dev
```

This uses `nodemon` to watch for file changes and automatically restart.

### Manual Restart

1. Stop server (Ctrl+C)
2. Rebuild if needed: `npm run build`
3. Start again: `npm start`

### Run Tests

```bash
npm test
```

### Lint Code

```bash
npm run lint
```

## Production Deployment

For production deployment (Render, VPS, etc.), see:
- `DEPLOYMENT_QUICK_REFERENCE.md`
- `RENDER_SETUP_STEPS.md`
- `../RENDER_DEPLOYMENT.md`

## Quick Start (All Steps)

```bash
# From project root
cd backend

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start in development mode
npm run dev
```

## Environment-Specific Commands

### Local Development
```bash
npm run dev
```

### Production (PM2)
```bash
npm start
```

### Production (Render/Cloud)
```bash
npm run start:render
```

### Production (Direct Node)
```bash
node dist/index.js
```

## Troubleshooting

If you encounter any issues:

1. **Check Node version**: `node --version` (should be 20.x+)
2. **Check dependencies installed**: `ls node_modules` (should have many folders)
3. **Check build output**: `ls dist` (should have compiled .js files)
4. **Check environment variables**: `cat .env` or `echo $DATABASE_URL`
5. **Check logs**: Look for error messages in console
6. **Check database**: Ensure PostgreSQL is running and accessible

## Port Configuration

Default port: `30004`

To change:
1. Update `.env`: `NEXT_PUBLIC_BACKEND_PORT=YOUR_PORT`
2. Restart server

## Database Setup

### First Time Setup

1. Create database:
```bash
createdb your_database_name
```

2. Run migrations (if using Sequelize):
```bash
npm run migrate
```

3. Seed database (optional):
```bash
npm run seed
```

## Logs

Logs are written to:
- Console (stdout/stderr)
- Log files (if configured in Winston)

Check logs for errors and debugging information.

---

**Quick Reference:**

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript |
| `npm run dev` | Start development server |
| `npm start` | Start production server (PM2) |
| `npm run start:render` | Start for Render deployment |
| `node dist/index.js` | Direct Node start (after install & build) |

---

**Need Help?**

Check the documentation:
- `README.md` - Project overview
- `DEPLOYMENT_QUICK_REFERENCE.md` - Deployment guide
- `../DEPLOYMENT_CHECKLIST.md` - Full deployment checklist
