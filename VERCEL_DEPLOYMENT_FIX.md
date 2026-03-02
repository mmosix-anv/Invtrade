# Vercel Deployment Fix - Handle Static Files

## Problem

Frontend loads static files from backend:
- `/uploads/*` - User avatars, documents, images
- `/img/logo/*` - Custom logos

If you deploy frontend to Vercel without fixing this, all images will be broken.

## Quick Fix: Add Rewrites (30 minutes)

### Step 1: Update `frontend/next.config.js`

Find the `rewrites()` function and update it:

```javascript
async rewrites() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  
  // Always proxy uploads and logos to backend
  if (backendUrl) {
    return [
      {
        source: "/uploads/:path*",
        destination: `${backendUrl}/uploads/:path*`,
      },
      {
        source: "/img/logo/:path*",
        destination: `${backendUrl}/img/logo/:path*`,
      },
    ];
  }
  
  // Development fallback
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || 4000;
    const localBackend = `http://127.0.0.1:${backendPort}`;
    
    return [
      {
        source: "/api/:path*",
        destination: `${localBackend}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${localBackend}/uploads/:path*`,
      },
      {
        source: "/img/logo/:path*",
        destination: `${localBackend}/img/logo/:path*`,
      },
    ];
  }
  
  return [];
}
```

### Step 2: Update Backend CORS

Backend must allow requests from Vercel domain.

**Find CORS configuration in backend** (likely in `backend/src/server.ts` or similar):

```typescript
// Add Vercel domain to allowed origins
cors: {
  origin: [
    'https://your-app.vercel.app',
    'https://inv-app.mozdev.top',
    'http://localhost:3000', // Development
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
}
```

### Step 3: Set Environment Variables on Vercel

In Vercel dashboard:

```bash
NEXT_PUBLIC_BACKEND_URL=https://inv-api.mozdev.top
NEXT_PUBLIC_BACKEND_WS_URL=inv-api.mozdev.top
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
NODE_ENV=production
```

### Step 4: Deploy and Test

1. Deploy to Vercel
2. Test image loading:
   - User avatars
   - Logos
   - Uploaded documents
3. Check browser console for CORS errors

## Better Solution: Use CDN (Recommended for Production)

### Why CDN?

**Current (with rewrites):**
```
User → Vercel (Frontend) → Webuzo (Backend) → File
      (USA)                 (Your server)
```

**With CDN:**
```
User → Cloudflare CDN → File
      (Global, cached)
```

**Benefits:**
- Faster (global CDN)
- Reduced backend load
- Better scalability
- Professional setup

### Setup Cloudflare R2 (Free tier: 10GB storage)

#### 1. Create R2 Bucket

1. Go to Cloudflare dashboard
2. Navigate to R2
3. Create bucket: `invtrade-uploads`
4. Enable public access
5. Configure custom domain: `cdn.yourdomain.com`

#### 2. Get API Credentials

```bash
# Add to backend .env
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=invtrade-uploads
R2_PUBLIC_URL=https://cdn.yourdomain.com
```

#### 3. Install R2 SDK

```bash
cd backend
npm install @aws-sdk/client-s3
```

#### 4. Create Upload Helper

```typescript
// backend/src/utils/r2-upload.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function uploadToR2(
  file: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  );

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
```

#### 5. Update Upload Endpoints

```typescript
// Example: Update avatar upload
import { uploadToR2 } from '@/utils/r2-upload';

// Instead of saving to local filesystem:
// fs.writeFileSync(`./uploads/avatars/${filename}`, buffer);

// Upload to R2:
const url = await uploadToR2(
  buffer,
  `avatars/${filename}`,
  'image/jpeg'
);

// Save URL to database
await updateUser(userId, { avatar: url });
```

#### 6. Migrate Existing Files

```bash
# Script to copy existing uploads to R2
cd backend
node scripts/migrate-to-r2.js
```

```javascript
// backend/scripts/migrate-to-r2.js
const fs = require('fs');
const path = require('path');
const { uploadToR2 } = require('../dist/utils/r2-upload');

async function migrateFiles() {
  const uploadsDir = path.join(__dirname, '../uploads');
  
  // Recursively upload all files
  // Update database URLs
  // ...
}

migrateFiles();
```

## Comparison

### Option 1: Rewrites (Quick Fix)

**Pros:**
- Quick to implement (30 minutes)
- No file migration
- Works immediately

**Cons:**
- Extra latency (Vercel → Webuzo)
- Backend serves files (more load)
- Not globally distributed

**Cost:** Free

### Option 2: CDN (Best Long-term)

**Pros:**
- Fast global delivery
- Reduced backend load
- Scalable
- Professional

**Cons:**
- Takes time to setup (2-3 hours)
- Requires file migration
- Slightly more complex

**Cost:** 
- Cloudflare R2: Free for 10GB, then $0.015/GB
- Very affordable for most apps

### Option 3: Keep Current Setup

**Pros:**
- No changes needed
- Everything works

**Cons:**
- Not using Vercel's benefits
- Single server

**Cost:** Current Webuzo cost

## Recommendation

### Phase 1: Quick Fix (Now)
1. Add rewrites to `next.config.js`
2. Update backend CORS
3. Deploy to Vercel
4. Test thoroughly

### Phase 2: Optimize (Later)
1. Setup Cloudflare R2
2. Migrate existing files
3. Update upload functions
4. Remove rewrites (files now on CDN)

## Testing Checklist

After deployment, test these features:

- [ ] User profile avatars display
- [ ] Logo displays correctly
- [ ] NFT images load
- [ ] KYC document uploads work
- [ ] P2P trade attachments work
- [ ] Support ticket attachments work
- [ ] Blog post images display
- [ ] Product images display
- [ ] Media library works
- [ ] No CORS errors in console

## Troubleshooting

### Images not loading

**Check:**
1. Browser console for errors
2. Network tab - where is it trying to load from?
3. Backend CORS configuration
4. Environment variables on Vercel

### CORS errors

**Fix:**
```typescript
// Backend CORS config
cors: {
  origin: ['https://your-app.vercel.app'],
  credentials: true,
}
```

### Slow image loading

**Solution:** Move to CDN (Cloudflare R2)

## Summary

**Problem:** Frontend loads static files from backend  
**Quick Fix:** Add rewrites (30 min)  
**Best Solution:** Use CDN (2-3 hours)  
**Current Setup:** Works but not optimal  

**Recommendation:** Start with rewrites, migrate to CDN later.

---

See `FRONTEND_BACKEND_DEPENDENCY_ANALYSIS.md` for detailed analysis.
