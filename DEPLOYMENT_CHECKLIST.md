# Full Stack Deployment Checklist

Complete checklist for deploying frontend to Vercel and backend to Render.

## Pre-Deployment

### Code Preparation

- [ ] All code committed to Git
- [ ] No sensitive data in code (use environment variables)
- [ ] Dependencies up to date
- [ ] Tests passing locally
- [ ] Build works locally (frontend and backend)

### Environment Variables Prepared

- [ ] List all required environment variables
- [ ] Generate secure secrets (32+ characters)
- [ ] Document which variables are needed where

### Database Ready

- [ ] Database provider chosen (Render PostgreSQL, Supabase, etc.)
- [ ] Database schema designed
- [ ] Seed data prepared (if needed)

## Backend Deployment (Render)

### 1. Create Service

- [ ] Go to Render Dashboard
- [ ] Create new Web Service
- [ ] Connect Git repository
- [ ] Set root directory to `backend`
- [ ] Set build command: `npm install && npm run build`
- [ ] Set start command: `npm run start:render`
- [ ] Choose instance type (Starter recommended)

### 2. Configure Environment Variables

Required:
- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` (from database)
- [ ] `DIRECT_URL` (same as DATABASE_URL)
- [ ] `APP_PUBLIC_URL` (your Render URL)
- [ ] `NEXT_PUBLIC_BACKEND_URL` (your Render URL)
- [ ] `FRONTEND_URL` (your Vercel URL)
- [ ] `APP_ACCESS_TOKEN_SECRET` (generate secure)
- [ ] `APP_REFRESH_TOKEN_SECRET` (generate secure)
- [ ] `APP_ENCRYPT_SECRET` (generate secure)
- [ ] `SESSION_SECRET` (generate secure)

Optional (as needed):
- [ ] Email service credentials (SendGrid, etc.)
- [ ] SMS service credentials (Twilio, etc.)
- [ ] Payment gateway credentials (Stripe, PayPal)
- [ ] Redis URL (if using)
- [ ] AWS credentials (if using S3)
- [ ] Firebase credentials (if using)
- [ ] API keys (OpenAI, Google, etc.)

### 3. Create Database

- [ ] Create PostgreSQL database on Render
- [ ] Copy Internal Database URL
- [ ] Add to backend environment variables
- [ ] Wait for database to be ready

### 4. Deploy Backend

- [ ] Click "Create Web Service"
- [ ] Wait for build to complete (3-5 minutes)
- [ ] Check logs for errors
- [ ] Verify service status is "Live"
- [ ] Note backend URL: `https://your-app-backend.onrender.com`

### 5. Seed Database

- [ ] Use Render Shell or Job to run `npm run seed`
- [ ] Verify data in database
- [ ] Check logs for seed completion

### 6. Test Backend

- [ ] Test health endpoint: `/api/health`
- [ ] Test authentication endpoints
- [ ] Test database queries
- [ ] Check CORS configuration
- [ ] Review logs for errors

## Frontend Deployment (Vercel)

### 1. Create Project

- [ ] Go to Vercel Dashboard
- [ ] Import Git repository
- [ ] Set root directory to `frontend`
- [ ] Framework preset: Next.js

### 2. Configure Build Settings

- [ ] Build command: `npm run build:i18n && npm run build:vercel`
- [ ] Output directory: `.next`
- [ ] Install command: `npm install --legacy-peer-deps`
- [ ] Development command: `npm run dev`

### 3. Configure Environment Variables

Required:
- [ ] `NEXT_PUBLIC_BACKEND_URL` (your Render URL)
- [ ] `NEXT_PUBLIC_BACKEND_PORT=443`
- [ ] `NEXT_PUBLIC_SITE_URL` (your Vercel URL)
- [ ] `NEXT_PUBLIC_DEFAULT_LANGUAGE=en`
- [ ] `NEXT_PUBLIC_APP_NAME` (your app name)

Optional (as needed):
- [ ] `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`
- [ ] `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- [ ] `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- [ ] Feature flags

### 4. Deploy Frontend

- [ ] Click "Deploy"
- [ ] Wait for build to complete (2-5 minutes)
- [ ] Check build logs for errors
- [ ] Verify deployment status
- [ ] Note frontend URL: `https://your-app.vercel.app`

### 5. Test Frontend

- [ ] Visit frontend URL
- [ ] Test page loading
- [ ] Test API calls to backend
- [ ] Test authentication flow
- [ ] Test image loading
- [ ] Test translations
- [ ] Test responsive design
- [ ] Check browser console for errors

## Post-Deployment

### Backend Configuration

- [ ] Update CORS to allow frontend domain
- [ ] Configure rate limiting
- [ ] Set up monitoring/alerts
- [ ] Configure backup strategy
- [ ] Review security settings

### Frontend Configuration

- [ ] Verify all API calls work
- [ ] Test all major features
- [ ] Check performance metrics
- [ ] Review Core Web Vitals
- [ ] Test on multiple devices/browsers

### DNS & Domains (Optional)

Backend:
- [ ] Add custom domain in Render
- [ ] Configure DNS CNAME record
- [ ] Wait for SSL certificate
- [ ] Update environment variables with new domain

Frontend:
- [ ] Add custom domain in Vercel
- [ ] Configure DNS records
- [ ] Wait for SSL certificate
- [ ] Update environment variables with new domain

### Cross-Service Updates

After adding custom domains:
- [ ] Update `NEXT_PUBLIC_BACKEND_URL` in Vercel
- [ ] Update `FRONTEND_URL` in Render
- [ ] Update `APP_PUBLIC_URL` in Render
- [ ] Redeploy both services

## Verification

### Functionality Tests

- [ ] User registration works
- [ ] User login works
- [ ] Password reset works
- [ ] Profile updates work
- [ ] File uploads work
- [ ] Email notifications work
- [ ] SMS notifications work (if applicable)
- [ ] Payment processing works (if applicable)
- [ ] All major features work

### Performance Tests

- [ ] Frontend loads in < 3 seconds
- [ ] API responses in < 500ms
- [ ] Images load properly
- [ ] No console errors
- [ ] No memory leaks

### Security Tests

- [ ] HTTPS enabled on both services
- [ ] CORS configured correctly
- [ ] Authentication works
- [ ] Authorization works
- [ ] Rate limiting works
- [ ] Input validation works
- [ ] No sensitive data exposed

## Monitoring Setup

### Backend Monitoring

- [ ] Enable Render notifications
- [ ] Set up log monitoring
- [ ] Configure error alerts
- [ ] Monitor resource usage
- [ ] Set up uptime monitoring (UptimeRobot, etc.)

### Frontend Monitoring

- [ ] Enable Vercel Analytics
- [ ] Enable Speed Insights
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Monitor Core Web Vitals
- [ ] Set up uptime monitoring

### Database Monitoring

- [ ] Enable database backups
- [ ] Monitor database size
- [ ] Monitor query performance
- [ ] Set up alerts for issues

## Documentation

- [ ] Document deployment process
- [ ] Document environment variables
- [ ] Document API endpoints
- [ ] Document troubleshooting steps
- [ ] Update README files

## Team Communication

- [ ] Share deployment URLs with team
- [ ] Share environment variable values (securely)
- [ ] Document access credentials
- [ ] Schedule deployment review meeting

## Continuous Deployment

### Backend (Render)

- [ ] Auto-deploy enabled for main branch
- [ ] Branch deploys configured (if needed)
- [ ] Deploy hooks configured (if needed)

### Frontend (Vercel)

- [ ] Auto-deploy enabled for main branch
- [ ] Preview deploys for pull requests
- [ ] Production branch configured

## Backup & Recovery

- [ ] Database backup strategy in place
- [ ] Code backed up in Git
- [ ] Environment variables documented
- [ ] Recovery procedure documented
- [ ] Test restore process

## Cost Management

- [ ] Review Render pricing
- [ ] Review Vercel pricing
- [ ] Review database pricing
- [ ] Set up billing alerts
- [ ] Plan for scaling costs

## Maintenance Plan

### Daily

- [ ] Check service status
- [ ] Review error logs
- [ ] Monitor performance

### Weekly

- [ ] Review metrics
- [ ] Check for updates
- [ ] Review security alerts
- [ ] Test critical features

### Monthly

- [ ] Review costs
- [ ] Update dependencies
- [ ] Review backups
- [ ] Performance optimization
- [ ] Security audit

## Rollback Plan

If deployment fails:

### Backend Rollback

1. [ ] Go to Render Dashboard
2. [ ] Find previous successful deployment
3. [ ] Click "Redeploy"
4. [ ] Verify service is working

### Frontend Rollback

1. [ ] Go to Vercel Dashboard
2. [ ] Find previous successful deployment
3. [ ] Click "Promote to Production"
4. [ ] Verify site is working

### Database Rollback

1. [ ] Restore from backup
2. [ ] Verify data integrity
3. [ ] Update application if needed

## Success Criteria

- [ ] Both services deployed successfully
- [ ] All environment variables configured
- [ ] Database connected and seeded
- [ ] All major features working
- [ ] No critical errors in logs
- [ ] Performance meets requirements
- [ ] Security measures in place
- [ ] Monitoring configured
- [ ] Team has access
- [ ] Documentation complete

## Next Steps

After successful deployment:

1. [ ] Monitor for 24 hours
2. [ ] Gather user feedback
3. [ ] Plan next iteration
4. [ ] Schedule regular maintenance
5. [ ] Optimize performance
6. [ ] Enhance security
7. [ ] Scale as needed

## Support Resources

**Vercel:**
- [Documentation](https://vercel.com/docs)
- [Support](https://vercel.com/support)
- [Status](https://www.vercel-status.com/)

**Render:**
- [Documentation](https://render.com/docs)
- [Community](https://community.render.com/)
- [Status](https://status.render.com/)

**Your Team:**
- Check internal documentation
- Contact DevOps team
- Review deployment guides

---

## Quick Reference

**Frontend (Vercel):**
- Root: `frontend`
- Build: `npm run build:i18n && npm run build:vercel`
- Install: `npm install --legacy-peer-deps`

**Backend (Render):**
- Root: `backend`
- Build: `npm install && npm run build`
- Start: `npm run start:render`

**URLs:**
- Frontend: `https://your-app.vercel.app`
- Backend: `https://your-app-backend.onrender.com`
- Database: Internal Render URL

---

✅ **Deployment Complete!**

Your full-stack application is now live and ready for users!
