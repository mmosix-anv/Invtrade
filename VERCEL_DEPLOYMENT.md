# Vercel Deployment Guide

## Prerequisites

- Vercel account (https://vercel.com)
- GitHub/GitLab/Bitbucket repository
- Supabase project set up
- Turborepo configured

## Quick Deploy

### Option 1: Deploy via Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your Git repository
3. Vercel will auto-detect Next.js and Turborepo
4. Configure environment variables (see below)
5. Click "Deploy"

### Option 2: Deploy via CLI

```bash
# Install Vercel CLI
pnpm add -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

## Environment Variables

Add these in Vercel Dashboard → Project Settings → Environment Variables:

### Database (Supabase)
```
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

### Supabase API
```
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT-REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Backend Configuration
```
NEXT_PUBLIC_BACKEND_URL=https://your-domain.vercel.app
NEXT_PUBLIC_BACKEND_PORT=4000
NODE_ENV=production
```

### Optional: Add all other environment variables from your .env file

## Project Configuration

### vercel.json

The `vercel.json` file has been created with optimal settings:

```json
{
  "version": 2,
  "buildCommand": "pnpm turbo build",
  "outputDirectory": "frontend/.next",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

### Build Settings

In Vercel Dashboard → Project Settings → Build & Development Settings:

- **Framework Preset**: Next.js
- **Build Command**: `pnpm turbo build`
- **Output Directory**: `frontend/.next`
- **Install Command**: `pnpm install`
- **Node Version**: 18.x or higher

## Monorepo Configuration

### Root Configuration

Vercel automatically detects Turborepo monorepos. Ensure you have:

1. `turbo.json` in root
2. `pnpm-workspace.yaml` in root
3. Proper package.json scripts

### Frontend as Main App

The frontend (Next.js) is deployed as the main application:

```
Root Directory: ./
Framework: Next.js
Build Command: pnpm turbo build --filter=frontend
Output Directory: frontend/.next
```

### Backend as API Routes

Two options for backend deployment:

#### Option 1: Serverless Functions (Recommended)

Convert backend to Vercel serverless functions:

Create `frontend/pages/api/[...all].ts`:

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';

// Proxy to your backend logic
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Import and use your backend routes
  const { MashServer } = await import('../../../backend/src');
  // Handle request
}
```

#### Option 2: Separate Backend Deployment

Deploy backend separately:

```bash
# Deploy backend to a separate Vercel project
cd backend
vercel --prod
```

Update frontend environment:
```
NEXT_PUBLIC_BACKEND_URL=https://your-backend.vercel.app
```

## Deployment Workflow

### Automatic Deployments

Vercel automatically deploys:
- **Production**: Pushes to `main` branch
- **Preview**: Pull requests and other branches

### Manual Deployments

```bash
# Preview deployment
vercel

# Production deployment
vercel --prod

# Deploy specific branch
vercel --prod --branch=staging
```

## Performance Optimization

### 1. Enable Edge Runtime

For API routes, use Edge Runtime:

```typescript
// frontend/pages/api/hello.ts
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  return new Response('Hello from Edge!');
}
```

### 2. Image Optimization

Configure Next.js image optimization:

```javascript
// frontend/next.config.js
module.exports = {
  images: {
    domains: ['your-supabase-project.supabase.co'],
    formats: ['image/avif', 'image/webp'],
  },
};
```

### 3. Caching Strategy

```javascript
// frontend/next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60, stale-while-revalidate=120',
          },
        ],
      },
    ];
  },
};
```

### 4. Enable Compression

Vercel automatically compresses responses, but you can optimize:

```javascript
// frontend/next.config.js
module.exports = {
  compress: true,
  poweredByHeader: false,
};
```

## Database Connection Pooling

### Use Supabase Connection Pooler

For serverless functions, always use the pooler:

```env
# Use port 6543 for connection pooling
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

### Configure Connection Pool

```typescript
// backend/config.supabase.js
module.exports = {
  production: {
    url: process.env.DATABASE_URL,
    dialect: 'postgres',
    pool: {
      max: 5,        // Lower for serverless
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
};
```

## Monitoring and Logging

### 1. Vercel Analytics

Enable in Vercel Dashboard → Analytics:
- Web Vitals
- Audience insights
- Top pages

### 2. Vercel Logs

View logs:
```bash
vercel logs [deployment-url]
```

Or in Dashboard → Deployments → [Select Deployment] → Logs

### 3. Error Tracking

Integrate Sentry or similar:

```bash
pnpm add @sentry/nextjs
```

```javascript
// frontend/next.config.js
const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig({
  // Your Next.js config
});
```

## Custom Domains

### 1. Add Domain

Vercel Dashboard → Project → Settings → Domains:
1. Enter your domain
2. Follow DNS configuration instructions
3. Wait for DNS propagation

### 2. Configure DNS

Add these records to your DNS provider:

```
Type: A
Name: @
Value: 76.76.21.21

Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### 3. SSL Certificate

Vercel automatically provisions SSL certificates via Let's Encrypt.

## Environment-Specific Deployments

### Production

```bash
vercel --prod
```

Environment: `production`

### Staging

```bash
vercel --prod --branch=staging
```

Environment: `preview`

### Development

```bash
vercel
```

Environment: `development`

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      
      - name: Install Vercel CLI
        run: pnpm add -g vercel
      
      - name: Pull Vercel Environment
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      
      - name: Build Project
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
      
      - name: Deploy to Vercel
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

Add secrets in GitHub:
- `VERCEL_TOKEN`: Get from Vercel → Settings → Tokens
- `VERCEL_ORG_ID`: From `.vercel/project.json`
- `VERCEL_PROJECT_ID`: From `.vercel/project.json`

## Troubleshooting

### Build Failures

1. **Check build logs** in Vercel Dashboard
2. **Test locally**:
   ```bash
   pnpm turbo build
   ```
3. **Check environment variables** are set correctly
4. **Verify Node version** matches local development

### Database Connection Issues

1. **Use connection pooler** (port 6543)
2. **Check SSL settings**:
   ```javascript
   dialectOptions: {
     ssl: {
       require: true,
       rejectUnauthorized: false
     }
   }
   ```
3. **Verify DATABASE_URL** is correct
4. **Check Supabase project status**

### Function Timeout

Vercel has function execution limits:
- **Hobby**: 10 seconds
- **Pro**: 60 seconds
- **Enterprise**: 900 seconds

Optimize long-running tasks:
```typescript
// Use background jobs for long tasks
export const config = {
  maxDuration: 60, // Pro plan
};
```

### Memory Issues

Increase function memory:
```javascript
// vercel.json
{
  "functions": {
    "api/**/*.ts": {
      "memory": 1024
    }
  }
}
```

### Cold Starts

Minimize cold starts:
1. Use Edge Runtime when possible
2. Keep dependencies minimal
3. Use connection pooling
4. Implement warming strategies

## Cost Optimization

### 1. Optimize Build Time

- Use Turborepo caching
- Minimize dependencies
- Use incremental builds

### 2. Reduce Function Invocations

- Implement caching
- Use static generation when possible
- Batch API calls

### 3. Optimize Bandwidth

- Enable compression
- Use image optimization
- Implement CDN caching

### 4. Monitor Usage

Check Vercel Dashboard → Usage:
- Bandwidth
- Function invocations
- Build minutes

## Security Best Practices

### 1. Environment Variables

- Never commit secrets
- Use Vercel environment variables
- Rotate keys regularly

### 2. API Security

```typescript
// Implement rate limiting
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
```

### 3. CORS Configuration

```typescript
// frontend/next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://yourdomain.com' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE' },
        ],
      },
    ];
  },
};
```

### 4. Security Headers

```typescript
// frontend/next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
        ],
      },
    ];
  },
};
```

## Post-Deployment Checklist

- [ ] All environment variables set
- [ ] Database connection working
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Analytics enabled
- [ ] Error tracking configured
- [ ] Monitoring set up
- [ ] Performance optimized
- [ ] Security headers configured
- [ ] Backup strategy in place

## Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Turborepo on Vercel](https://vercel.com/docs/monorepos/turborepo)
- [Supabase + Vercel Guide](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)

## Support

- Vercel Support: https://vercel.com/support
- Vercel Discord: https://vercel.com/discord
- Documentation: https://vercel.com/docs
