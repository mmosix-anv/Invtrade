# Frontend

This is the frontend application built with Next.js.

## Getting Started

### Prerequisites

- Node.js 18+ or 20+
- npm or pnpm

### Installation

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Build

Build for production:

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

### Other Commands

- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking
- `npm run test` - Run tests
- `npm run build:i18n` - Generate i18n manifest

## Environment Variables

Copy `.env.example` to `.env` and configure the required environment variables.

## Independent Operation

This frontend can now run completely independently from the backend. Just ensure your backend API URL is correctly configured in your environment variables.

## Deployment

### Vercel (Recommended)

**Quick Setup:**
- Root Directory: `frontend`
- Build Command: `npm run build:i18n && npm run build`
- Output Directory: `.next`
- Install Command: `npm install`

See [DEPLOYMENT_QUICK_REFERENCE.md](DEPLOYMENT_QUICK_REFERENCE.md) for quick reference or [../VERCEL_DEPLOYMENT.md](../VERCEL_DEPLOYMENT.md) for complete guide.

### Other Platforms

The frontend can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- Render
- AWS Amplify
- Any Node.js hosting

Just ensure you run `npm run build:i18n` before `npm run build`.

