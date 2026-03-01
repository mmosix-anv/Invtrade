# Backend

This is the backend API built with Node.js, TypeScript, and Express.

## Getting Started

### Prerequisites

- Node.js 18+ or 20+
- npm or pnpm
- PostgreSQL or MySQL database

### Installation

```bash
npm install
```

### Development

Run the development server with hot reload:

```bash
npm run dev
```

### Build

Build for production:

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

Or for Render deployment:

```bash
npm run start:render
```

### Database

Run database seeders:

```bash
npm run seed
```

### Other Commands

- `npm run lint` - Run ESLint
- `npm run test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run bundle` - Build and bundle for production

## Environment Variables

Copy `.env.example` to `.env` and configure the required environment variables including database connection details.

## Independent Operation

This backend can now run completely independently from the frontend. It exposes REST APIs that can be consumed by any client application.

## Deployment

### Render (Recommended)

**Quick Setup:**
- Root Directory: `backend`
- Build Command: `npm install && npm run build`
- Start Command: `npm run start:render`
- Runtime: Node

**Documentation:**
- [RENDER_SETUP_STEPS.md](RENDER_SETUP_STEPS.md) - Step-by-step visual guide
- [DEPLOYMENT_QUICK_REFERENCE.md](DEPLOYMENT_QUICK_REFERENCE.md) - Quick reference card
- [../RENDER_DEPLOYMENT.md](../RENDER_DEPLOYMENT.md) - Complete deployment guide

### Other Platforms

The backend can be deployed to any platform that supports Node.js:
- Railway
- Heroku
- AWS Elastic Beanstalk
- Google Cloud Run
- DigitalOcean App Platform
- Any VPS with Node.js

Just ensure you run `npm run build` before starting with `npm run start:render`.
