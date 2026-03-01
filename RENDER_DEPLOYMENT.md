# Render Deployment Guide - Backend

Complete guide for deploying the backend to Render.

## Quick Configuration

### Service Type
```
Web Service
```

### Root Directory
```
backend
```

### Build Command
```bash
npm install && npm run build
```

### Start Command
```bash
npm run start:render
```

### Environment
```
Node
```

## Detailed Setup

### 1. Create New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your Git repository (GitHub/GitLab)
4. Select your repository

### 2. Configure Service Settings

**Name:** `your-app-backend` (or your preferred name)

**Region:** Choose closest to your users (e.g., Oregon, Frankfurt, Singapore)

**Branch:** `main` (or your production branch)

**Root Directory:** `backend` ⚠️ **IMPORTANT**

**Runtime:** `Node`

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm run start:render
```

### 3. Instance Type

**Free Tier:**
- 512 MB RAM
- Shared CPU
- Spins down after 15 minutes of inactivity
- Good for testing

**Starter ($7/month):**
- 512 MB RAM
- Shared CPU
- Always on
- Recommended for small production apps

**Standard ($25/month):**
- 2 GB RAM
- Dedicated CPU
- Better performance
- Recommended for production

### 4. Environment Variables

Add these in the "Environment" section:

#### Required Variables

```bash
# Node Environment
NODE_ENV=production

# Database (PostgreSQL example)
DATABASE_URL=postgresql://user:password@host:5432/database
DIRECT_URL=postgresql://user:password@host:5432/database

# Application
APP_PUBLIC_URL=https://your-app-backend.onrender.com
NEXT_PUBLIC_BACKEND_URL=https://your-app-backend.onrender.com
NEXT_PUBLIC_BACKEND_PORT=443

# Frontend URL (for CORS)
FRONTEND_URL=https://your-app.vercel.app

# JWT Secrets
APP_ACCESS_TOKEN_SECRET=your-secure-random-string-min-32-chars
APP_REFRESH_TOKEN_SECRET=your-different-secure-random-string

# Encryption
APP_ENCRYPT_SECRET=your-encryption-key-32-chars

# Session
SESSION_SECRET=your-session-secret-min-32-chars
```

#### Optional Variables

```bash
# Email (SendGrid)
SENDGRID_API_KEY=your-sendgrid-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=YourApp

# SMS (Twilio)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890

# Payment Gateways
STRIPE_SECRET_KEY=sk_live_...
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-secret

# Redis (if using)
REDIS_URL=redis://user:password@host:6379

# AWS S3 (for file uploads)
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name

# Firebase (for push notifications)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# API Keys
OPENAI_API_KEY=sk-...
GOOGLE_TRANSLATE_API_KEY=your-key

# Feature Flags
ENABLE_WEBSOCKETS=true
ENABLE_CRON_JOBS=true
```

### 5. Advanced Settings

#### Auto-Deploy
- ✅ Enable "Auto-Deploy" for automatic deployments on git push

#### Health Check Path
```
/api/health
```
(If you have a health check endpoint)

#### Docker Command
Leave empty (using Node runtime)

### 6. Database Setup

#### Option A: Render PostgreSQL (Recommended)

1. Click "New +" → "PostgreSQL"
2. Name: `your-app-db`
3. Database: `your_app_db`
4. User: `your_app_user`
5. Region: Same as your web service
6. Plan: Free or Starter
7. After creation, copy the "Internal Database URL"
8. Add to your web service environment variables:
   ```bash
   DATABASE_URL=<internal-database-url>
   DIRECT_URL=<internal-database-url>
   ```

#### Option B: External Database

Use Supabase, AWS RDS, or any PostgreSQL provider:
```bash
DATABASE_URL=postgresql://user:password@host:5432/database
```

### 7. Redis Setup (Optional)

#### Option A: Render Redis

1. Click "New +" → "Redis"
2. Name: `your-app-redis`
3. Plan: Free or Starter
4. After creation, copy the "Internal Redis URL"
5. Add to environment variables:
   ```bash
   REDIS_URL=<internal-redis-url>
   ```

#### Option B: External Redis

Use Upstash, Redis Cloud, or any Redis provider.

## Build Process Explained

### Build Command: `npm install && npm run build`

1. **`npm install`** - Installs all dependencies
   - Includes native modules (sharp, argon2, bcrypt)
   - May take 2-5 minutes on first build

2. **`npm run build`** - Compiles TypeScript
   - Runs `tsc -p tsconfig.json --noEmit false`
   - Outputs to `dist/` folder
   - Takes 30-60 seconds

### Start Command: `npm run start:render`

Runs `node dist/index.js` - starts the compiled application.

## Post-Deployment Setup

### 1. Run Database Migrations/Seeds

After first deployment, you may need to seed the database:

**Option A: Using Render Shell**
1. Go to your service → "Shell" tab
2. Run:
   ```bash
   npm run seed
   ```

**Option B: Using Render Jobs**
1. Create a new "Job"
2. Use same repository and root directory
3. Command: `npm install && npm run seed`
4. Run manually

### 2. Configure CORS

Ensure your backend allows requests from your frontend:

In your backend code, add your Vercel URL to CORS origins:
```javascript
const allowedOrigins = [
  'https://your-app.vercel.app',
  'http://localhost:3000', // for local development
];
```

### 3. Update Frontend Environment Variables

In Vercel, update:
```bash
NEXT_PUBLIC_BACKEND_URL=https://your-app-backend.onrender.com
NEXT_PUBLIC_BACKEND_PORT=443
```

## Common Issues & Solutions

### Issue: Build fails with "Cannot find module"

**Solution:** Ensure root directory is set to `backend`

### Issue: Native module build errors (sharp, argon2, bcrypt)

**Solution:** These are automatically rebuilt by Render. If issues persist:
1. Check Node version (should be 20.x)
2. Ensure `package.json` has correct versions
3. Try clearing build cache (Settings → "Clear build cache & deploy")

### Issue: Database connection fails

**Solution:**
- Verify `DATABASE_URL` is correct
- Check database is in same region (use internal URL)
- Ensure database is running
- Check firewall rules (Render services can connect by default)

### Issue: Service keeps spinning down (Free tier)

**Solution:**
- Upgrade to Starter plan ($7/month) for always-on
- Or use a service like UptimeRobot to ping your service every 5 minutes

### Issue: Out of memory errors

**Solution:**
- Upgrade to Standard plan (2 GB RAM)
- Optimize your code to use less memory
- Check for memory leaks

### Issue: Slow cold starts (Free tier)

**Solution:**
- Free tier spins down after 15 minutes
- First request after spin-down takes 30-60 seconds
- Upgrade to Starter for always-on service

### Issue: Environment variables not working

**Solution:**
- Redeploy after adding environment variables
- Check variable names (case-sensitive)
- Ensure no quotes around values in Render dashboard

## Performance Optimization

### 1. Enable HTTP/2
Automatically enabled on Render

### 2. Use Internal URLs
For database and Redis, use internal URLs (faster, no egress charges)

### 3. Enable Compression
Ensure your backend sends compressed responses (gzip/brotli)

### 4. Optimize Build Time
Add `.renderignore` file:
```
node_modules
.git
*.md
tests
```

### 5. Use Build Cache
Render automatically caches `node_modules` between builds

## Monitoring

### View Logs

1. Go to your service
2. Click "Logs" tab
3. View real-time logs
4. Filter by severity (info, warn, error)

### Metrics

1. Go to "Metrics" tab
2. View:
   - CPU usage
   - Memory usage
   - Request count
   - Response time

### Alerts

1. Go to "Settings" → "Notifications"
2. Add email or Slack webhook
3. Get notified of:
   - Deploy failures
   - Service crashes
   - High resource usage

## Scaling

### Horizontal Scaling

Render doesn't support horizontal scaling on Starter plan.

For high traffic:
1. Upgrade to Team plan
2. Enable horizontal scaling
3. Add load balancer

### Vertical Scaling

Upgrade instance type:
- Starter: 512 MB RAM
- Standard: 2 GB RAM
- Pro: 4 GB RAM
- Pro Plus: 8 GB RAM

## Custom Domain

### 1. Add Custom Domain

1. Go to "Settings" → "Custom Domains"
2. Click "Add Custom Domain"
3. Enter your domain: `api.yourdomain.com`

### 2. Configure DNS

Add CNAME record:
```
Type: CNAME
Name: api
Value: your-app-backend.onrender.com
```

### 3. SSL Certificate

Render automatically provisions SSL certificate (Let's Encrypt)

### 4. Update Environment Variables

```bash
APP_PUBLIC_URL=https://api.yourdomain.com
NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com
```

Update in Vercel too!

## Continuous Deployment

### Automatic Deploys

With auto-deploy enabled:
1. Push to `main` branch
2. Render automatically builds and deploys
3. Takes 3-5 minutes

### Manual Deploys

1. Go to your service
2. Click "Manual Deploy" → "Deploy latest commit"

### Deploy Hooks

Create webhook for external triggers:
1. Go to "Settings" → "Deploy Hook"
2. Copy webhook URL
3. Use in CI/CD or external services

## Backup Strategy

### Database Backups

**Render PostgreSQL:**
- Free tier: No automatic backups
- Paid tiers: Daily backups, 7-day retention

**External Database:**
- Configure backups with your provider

### Application Backups

Your code is in Git - that's your backup!

## Cost Estimation

### Free Tier
- Web Service: Free (spins down)
- PostgreSQL: Free (limited)
- Redis: Free (limited)
- **Total: $0/month**

### Starter Setup
- Web Service: $7/month
- PostgreSQL: $7/month
- Redis: $7/month (optional)
- **Total: $14-21/month**

### Production Setup
- Web Service: $25/month (Standard)
- PostgreSQL: $20/month
- Redis: $10/month
- **Total: $55/month**

## Security Best Practices

1. **Use Environment Variables** - Never commit secrets
2. **Enable HTTPS** - Automatic on Render
3. **Restrict CORS** - Only allow your frontend domain
4. **Use Strong Secrets** - Minimum 32 characters
5. **Regular Updates** - Keep dependencies updated
6. **Database Security** - Use internal URLs, strong passwords
7. **Rate Limiting** - Implement in your backend code
8. **Input Validation** - Sanitize all user inputs

## Render.yaml (Optional)

Create `render.yaml` in repository root for Infrastructure as Code:

```yaml
services:
  - type: web
    name: your-app-backend
    runtime: node
    rootDir: backend
    buildCommand: npm install && npm run build
    startCommand: npm run start:render
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: your-app-db
          property: connectionString
    
databases:
  - name: your-app-db
    databaseName: your_app_db
    user: your_app_user
```

## Summary

**Quick Setup:**
1. Root Directory: `backend`
2. Build Command: `npm install && npm run build`
3. Start Command: `npm run start:render`
4. Add environment variables
5. Connect database
6. Deploy!

The backend is fully independent and ready to deploy to Render!

## Additional Resources

- [Render Documentation](https://render.com/docs)
- [Node.js on Render](https://render.com/docs/deploy-node-express-app)
- [PostgreSQL on Render](https://render.com/docs/databases)
