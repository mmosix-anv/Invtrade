# Render Setup - Step by Step

## Prerequisites

- [ ] Git repository with backend code
- [ ] Render account (free at [render.com](https://render.com))
- [ ] Database ready (or will create on Render)

## Step 1: Create Web Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** button (top right)
3. Select **"Web Service"**
4. Choose **"Build and deploy from a Git repository"**
5. Click **"Next"**

## Step 2: Connect Repository

### If First Time:
1. Click **"Connect GitHub"** or **"Connect GitLab"**
2. Authorize Render to access your repositories
3. Select your repository from the list

### If Already Connected:
1. Find your repository in the list
2. Click **"Connect"**

## Step 3: Configure Service

### Basic Settings

**Name:**
```
your-app-backend
```
(Choose a unique name - this will be part of your URL)

**Region:**
- 🇺🇸 Oregon (US West)
- 🇺🇸 Ohio (US East)
- 🇪🇺 Frankfurt (Europe)
- 🇸🇬 Singapore (Asia)

Choose closest to your users.

**Branch:**
```
main
```
(Or your production branch)

**Root Directory:** ⚠️ **CRITICAL**
```
backend
```
Click the field and type `backend`

**Runtime:**
```
Node
```

### Build Settings

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm run start:render
```

### Instance Type

Choose based on your needs:

**Free** ($0/month)
- 512 MB RAM
- Shared CPU
- Spins down after 15 min inactivity
- ✅ Good for: Testing, demos
- ❌ Not for: Production

**Starter** ($7/month) - Recommended
- 512 MB RAM
- Shared CPU
- Always on
- ✅ Good for: Small production apps
- ❌ Not for: High traffic

**Standard** ($25/month)
- 2 GB RAM
- Dedicated CPU
- Better performance
- ✅ Good for: Production apps
- ✅ Recommended for: Most use cases

### Advanced Settings (Optional)

**Auto-Deploy:**
- ✅ Enable (deploys automatically on git push)

**Health Check Path:**
```
/api/health
```
(If you have a health endpoint)

## Step 4: Environment Variables

Click **"Add Environment Variable"** for each:

### Required Variables

```bash
NODE_ENV=production
```

```bash
DATABASE_URL=postgresql://user:password@host:5432/database
```
(We'll get this in Step 5 if using Render PostgreSQL)

```bash
DIRECT_URL=postgresql://user:password@host:5432/database
```
(Same as DATABASE_URL)

```bash
APP_PUBLIC_URL=https://your-app-backend.onrender.com
```
(Replace with your actual Render URL after creation)

```bash
NEXT_PUBLIC_BACKEND_URL=https://your-app-backend.onrender.com
```

```bash
FRONTEND_URL=https://your-app.vercel.app
```
(Your Vercel frontend URL)

### Security Variables

Generate secure random strings (minimum 32 characters):

```bash
APP_ACCESS_TOKEN_SECRET=<generate-random-string>
```

```bash
APP_REFRESH_TOKEN_SECRET=<generate-different-random-string>
```

```bash
APP_ENCRYPT_SECRET=<generate-random-string>
```

```bash
SESSION_SECRET=<generate-random-string>
```

**How to generate secure strings:**
```bash
# On Mac/Linux
openssl rand -base64 32

# On Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Online
# Use: https://www.random.org/strings/
```

### Optional Variables (Add as needed)

**Email (SendGrid):**
```bash
SENDGRID_API_KEY=your-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

**SMS (Twilio):**
```bash
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890
```

**Payment (Stripe):**
```bash
STRIPE_SECRET_KEY=sk_live_...
```

**Redis:**
```bash
REDIS_URL=redis://user:password@host:6379
```

## Step 5: Create Database (PostgreSQL)

### Option A: Render PostgreSQL (Recommended)

1. Go back to Render Dashboard
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name:** `your-app-db`
   - **Database:** `your_app_db`
   - **User:** `your_app_user`
   - **Region:** Same as your web service
   - **Plan:** Free or Starter ($7/month)
4. Click **"Create Database"**
5. Wait for database to be ready (1-2 minutes)
6. Copy **"Internal Database URL"**
7. Go back to your web service
8. Edit environment variables:
   - Update `DATABASE_URL` with the internal URL
   - Update `DIRECT_URL` with the internal URL
9. Save changes

### Option B: External Database

Use Supabase, AWS RDS, or any PostgreSQL provider:
1. Get connection string from your provider
2. Add as `DATABASE_URL` environment variable

## Step 6: Deploy

1. Review all settings
2. Click **"Create Web Service"**
3. Wait for deployment (3-5 minutes)
4. Watch the logs for any errors

### Deployment Process:

```
1. Cloning repository...
2. Installing dependencies (npm install)...
3. Building application (npm run build)...
4. Starting service (npm run start:render)...
5. Service is live!
```

## Step 7: Verify Deployment

### Check Service Status

1. Go to your service dashboard
2. Status should show: **"Live"** (green)
3. Note your service URL: `https://your-app-backend.onrender.com`

### Test API Endpoints

Open in browser or use curl:
```bash
curl https://your-app-backend.onrender.com/api/health
```

Should return a success response.

### Check Logs

1. Click **"Logs"** tab
2. Look for:
   - ✅ "Server started on port..."
   - ✅ "Database connected"
   - ❌ Any error messages

## Step 8: Seed Database (If Needed)

### Option A: Using Render Shell

1. Go to your service
2. Click **"Shell"** tab (top right)
3. Wait for shell to connect
4. Run:
   ```bash
   npm run seed
   ```
5. Wait for completion
6. Exit shell

### Option B: Using Render Job

1. Click **"New +"** → **"Job"**
2. Connect same repository
3. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm run seed`
4. Click **"Create Job"**
5. Click **"Run Job"** manually
6. Wait for completion

## Step 9: Update Frontend

### Update Vercel Environment Variables

1. Go to Vercel Dashboard
2. Select your frontend project
3. Go to **Settings** → **Environment Variables**
4. Update:
   ```bash
   NEXT_PUBLIC_BACKEND_URL=https://your-app-backend.onrender.com
   NEXT_PUBLIC_BACKEND_PORT=443
   ```
5. Redeploy frontend

## Step 10: Configure CORS (In Your Code)

Ensure your backend allows requests from frontend:

```javascript
// In your backend CORS configuration
const allowedOrigins = [
  'https://your-app.vercel.app',
  'http://localhost:3000', // for development
];
```

Commit and push to trigger redeploy.

## Step 11: Custom Domain (Optional)

### Add Custom Domain

1. Go to your service
2. Click **"Settings"** → **"Custom Domains"**
3. Click **"Add Custom Domain"**
4. Enter: `api.yourdomain.com`
5. Click **"Save"**

### Configure DNS

Add CNAME record in your domain provider:
```
Type: CNAME
Name: api
Value: your-app-backend.onrender.com
TTL: 3600
```

### Wait for SSL

Render automatically provisions SSL certificate (5-10 minutes)

### Update Environment Variables

Update in both Render and Vercel:
```bash
APP_PUBLIC_URL=https://api.yourdomain.com
NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com
```

## Troubleshooting

### Build Fails

**Check:**
- Root directory is set to `backend`
- Build command is correct
- All dependencies in `package.json`

**View:**
- Build logs for specific error
- Try building locally first

### Service Won't Start

**Check:**
- Start command is `npm run start:render`
- `dist/index.js` exists after build
- Environment variables are set

**View:**
- Runtime logs for errors
- Database connection status

### Database Connection Fails

**Check:**
- `DATABASE_URL` is correct
- Database is running
- Using internal URL (not external)
- Database is in same region

### Service Keeps Crashing

**Check:**
- Logs for error messages
- Memory usage (upgrade if needed)
- Database queries (optimize if slow)

### Slow Performance

**Solutions:**
- Upgrade to Standard plan (2 GB RAM)
- Optimize database queries
- Add Redis caching
- Use CDN for static assets

## Monitoring & Maintenance

### Daily Checks

- [ ] Service status is "Live"
- [ ] No errors in logs
- [ ] API endpoints responding
- [ ] Database connected

### Weekly Checks

- [ ] Review metrics (CPU, Memory)
- [ ] Check for dependency updates
- [ ] Review error logs
- [ ] Test critical endpoints

### Monthly Checks

- [ ] Review costs
- [ ] Update dependencies
- [ ] Review security alerts
- [ ] Backup database

## Next Steps

- [ ] Set up monitoring alerts
- [ ] Configure backup strategy
- [ ] Add health check endpoint
- [ ] Set up CI/CD pipeline
- [ ] Document API endpoints
- [ ] Add rate limiting
- [ ] Implement caching
- [ ] Set up error tracking (Sentry)

## Support

**Render Support:**
- [Documentation](https://render.com/docs)
- [Community Forum](https://community.render.com/)
- [Status Page](https://status.render.com/)

**Your Backend:**
- Check logs first
- Review environment variables
- Test locally
- Check database connection

## Summary

✅ Service created and deployed
✅ Database connected
✅ Environment variables configured
✅ Frontend updated with backend URL
✅ CORS configured
✅ Ready for production!

Your backend is now live at:
`https://your-app-backend.onrender.com`
