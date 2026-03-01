# Invtrade

Full-stack trading platform with independent frontend and backend applications.

## Project Structure

```
.
├── frontend/          # Next.js frontend application
├── backend/           # Node.js/TypeScript backend API
├── tools/             # Shared development tools
└── scripts/           # Deployment and utility scripts
```

## Quick Start

### Run Both Applications

```bash
# Install dependencies for all three locations
npm install                    # Root (for build scripts)
cd frontend && npm install && cd ..  # Frontend (independent)
cd backend && npm install && cd ..   # Backend (independent)

# Run both in development mode
npm run dev
```

**Note:** Frontend and backend are fully independent. Each has its own `node_modules` with all required dependencies. The root `package.json` is only for convenience scripts that orchestrate both projects.

### Run Independently

#### Frontend Only

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000`

#### Backend Only

```bash
cd backend
npm install
npm run dev
```

API available at configured port (check `.env`)

## Available Scripts

### Root Level

- `npm run dev` - Run both frontend and backend concurrently
- `npm run dev:frontend` - Run only frontend
- `npm run dev:backend` - Run only backend
- `npm run build` - Build both applications
- `npm run build:frontend` - Build frontend
- `npm run build:backend` - Build backend
- `npm start` - Start production servers with PM2

### Frontend

See [frontend/README.md](frontend/README.md)

### Backend

See [backend/README.md](backend/README.md)

## Documentation

- [README.md](README.md) - This file, project overview
- [DEPENDENCIES.md](DEPENDENCIES.md) - Detailed dependency structure explanation
- [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - Migration from Turbo monorepo
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Complete deployment checklist
- [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) - Frontend deployment to Vercel
- [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) - Backend deployment to Render
- [frontend/README.md](frontend/README.md) - Frontend-specific documentation
- [backend/README.md](backend/README.md) - Backend-specific documentation

## Environment Setup

1. Copy `.env.example` to `.env` in the root directory
2. Configure environment variables for your setup
3. Each application (frontend/backend) may have additional environment requirements

## Deployment

### Frontend

The frontend is a Next.js application and can be deployed to:
- **Vercel** (recommended) - See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) for detailed guide
- Netlify
- Any Node.js hosting platform

**Quick Vercel Setup:**
- Root Directory: `frontend`
- Build Command: `npm run build:i18n && npm run build`
- Output Directory: `.next`
- Install Command: `npm install --legacy-peer-deps`

### Backend

The backend is a Node.js API and can be deployed to:
- **Render** (recommended) - See [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) for detailed guide
- Railway
- Heroku
- Any Node.js hosting platform with database support

**Quick Render Setup:**
- Root Directory: `backend`
- Build Command: `npm install && npm run build`
- Start Command: `npm run start:render`
- Runtime: Node

## Migration from Turbo Monorepo

This project was previously configured as a Turbo monorepo. It has been decoupled to allow:
- Independent deployment of frontend and backend
- Separate dependency management
- Flexible scaling and hosting options
- Simpler CI/CD pipelines

## License

See LICENSE file for details.
