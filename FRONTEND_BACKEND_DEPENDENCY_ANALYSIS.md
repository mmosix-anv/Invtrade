# Frontend-Backend Static File Dependency Analysis

## Your Question

> "i think the frontend looks for files from the backend and then it's broken if they are not hosted alongside each other, can you analyze and confirm that. i mean the frontend using files from the backend not just as api"

## Answer: YES, CONFIRMED ✅

The frontend DOES load static files from the backend. They cannot be separated without additional configuration.

## Critical Dependencies Found

### 1. Uploads Directory (`/uploads/`)

**Backend serves static files:**
```javascript
// backend/dist/src/server.js
if (url.startsWith("/uploads/")) {
  const handled = serveStaticFile(res, req, url, () => (responseSent = true));
  if (handled) return;
}
```

**Frontend expects these files:**
```javascript
// frontend/next.config.js - Development proxy
{
  source: "/uploads/:path*",
  destination: `${backendUrl}/uploads/:path*`, // Proxy to Backend (dev only)
}
```

### 2. Logo Files (`/img/logo/`)

**Frontend proxies logo requests to backend:**
```javascript
// frontend/next.config.js
{
  source: "/img/logo/:path*",
  destination: `${backendUrl}/img/logo/:path*`, // Proxy to Backend (dev only)
}
```

### 3. User Avatars

**Stored in:** `/uploads/avatars/`
**Used in:**
- User profiles
- Chat messages
- Support tickets
- P2P trading interface
- Admin panels

### 4. NFT Images

**Stored in:** `/uploads/nft/`
```typescript
// frontend/lib/nft-utils.ts
export function getNftImageUrl(tokenId: string) {
  return `/uploads/nft/${tokenId}.jpg`;
}
```

### 5. KYC Documents

**Stored in:** `/uploads/kyc/`
**Used in:**
- KYC application forms
- Document verification
- Admin review panels

### 6. P2P Trade Attachments

**Stored in:** `/uploads/p2p/`
**Used in:**
- Trade chat messages
- Payment proof uploads
- Dispute evidence

### 7. Product Files (E-commerce)

**Stored in:** `/uploads/ecommerce/products/`
**Used in:**
- Digital product downloads
- Order fulfillment

### 8. Editor Media

**Stored in:** `/uploads/editor/`
**Used in:**
- WYSIWYG editor images
- Blog post images
- Page content

## How It Works Currently

### Development Mode
```
Frontend (localhost:3000)
  ↓ Request: /uploads/avatars/user123.jpg
  ↓ Next.js rewrites to: http://localhost:4000/uploads/avatars/user123.jpg
Backend (localhost:4000)
  ↓ Serves file from: ./uploads/avatars/user123.jpg
```

### Production Mode (Same Domain)
```
Frontend (inv-app.mozdev.top)
  ↓ Request: /uploads/avatars/user123.jpg
  ↓ Nginx routes to backend
Backend (same server)
  ↓ Serves file from: ./uploads/avatars/user123.jpg
```

## The Problem with Separation

### If Frontend on Vercel, Backend on Webuzo:

```
Frontend (your-app.vercel.app)
  ↓ Request: /uploads/avatars/user123.jpg
  ↓ Looks for: https://your-app.vercel.app/uploads/avatars/user123.jpg
  ❌ File not found! (File is on Webuzo backend)
```

**Result:** All images, avatars, uploads will be broken! ❌

## Solutions

### Solution 1: Use Backend URL for Uploads (Recommended) ✅

Configure frontend to load uploads from backend domain:

**Update Next.js config:**
```javascript
// frontend/next.config.js
async rewrites() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://inv-api.mozdev.top';
  
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
```

**Pros:**
- Simple configuration
- Works immediately
- No file migration needed

**Cons:**
- Extra HTTP request (frontend → backend)
- CORS must be configured
- Slightly slower than CDN

### Solution 2: Use CDN for Uploads (Best Performance) ✅

Upload files to a CDN (Cloudflare R2, AWS S3, etc.):

**Architecture:**
```
Frontend (Vercel) → CDN (Cloudflare R2) ← Backend (Webuzo)
                                          ↑
                                    Uploads files
```

**Implementation:**
```typescript
// Update upload functions to use CDN
const uploadToR2 = async (file: File) => {
  // Upload to Cloudflare R2
  const url = await r2.upload(file);
  return url; // https://cdn.yourdomain.com/uploads/...
};
```

**Pros:**
- Fast global delivery
- Reduced backend load
- Scalable
- Professional setup

**Cons:**
- Requires CDN setup
- Migration of existing files
- Additional cost (usually minimal)

### Solution 3: Sync Uploads to Frontend (Not Recommended) ❌

Copy uploads to frontend's public directory:

**Cons:**
- Requires constant syncing
- Duplicate storage
- Complex deployment
- Not scalable

### Solution 4: Keep Frontend and Backend Together (Current Setup) ✅

**Current Architecture:**
```
Webuzo Server
├── Frontend (inv-app.mozdev.top)
└── Backend (inv-api.mozdev.top)
    └── /uploads/ (shared access)
```

**Pros:**
- Everything works
- No configuration needed
- Simple deployment
- Fast file access

**Cons:**
- Not using Vercel's CDN for frontend
- Single server dependency

## Recommended Architecture

### Option A: Frontend on Vercel + Backend on Webuzo + Rewrites

```
Frontend (Vercel)
  ↓ /uploads/* → Rewrite to backend
Backend (Webuzo) - Serves uploads
```

**Setup:**
```javascript
// frontend/next.config.js
async rewrites() {
  return [
    {
      source: "/uploads/:path*",
      destination: "https://inv-api.mozdev.top/uploads/:path*",
    },
    {
      source: "/img/logo/:path*",
      destination: "https://inv-api.mozdev.top/img/logo/:path*",
    },
  ];
}
```

**Backend CORS:**
```javascript
// Allow Vercel domain to access uploads
cors: {
  origin: ['https://your-app.vercel.app'],
  credentials: true
}
```

### Option B: Frontend on Vercel + Backend on Webuzo + CDN (Best)

```
Frontend (Vercel)
  ↓ /uploads/* → CDN
CDN (Cloudflare R2 / AWS S3)
  ↑ Backend uploads files
Backend (Webuzo)
```

**Benefits:**
- Fast global delivery
- Reduced backend load
- Scalable
- Professional

**Setup:**
1. Create Cloudflare R2 bucket
2. Update upload functions to use R2
3. Configure custom domain: `cdn.yourdomain.com`
4. Update image URLs to use CDN

### Option C: Keep Current Setup (Simplest)

```
Webuzo Server
├── Frontend (inv-app.mozdev.top)
└── Backend (inv-api.mozdev.top)
```

**Benefits:**
- No changes needed
- Everything works
- Simple deployment

## Files That Would Break

If you separate without fixing:

### User-Facing Features:
- ❌ User avatars (profile pictures)
- ❌ NFT images
- ❌ KYC document uploads
- ❌ P2P trade attachments
- ❌ Support ticket attachments
- ❌ Product images
- ❌ Blog post images
- ❌ Custom logos
- ❌ Payment proof uploads
- ❌ Digital product downloads

### Admin Features:
- ❌ Logo management
- ❌ KYC document review
- ❌ Media library
- ❌ Content editor images

## Implementation Guide

### Quick Fix: Add Rewrites (30 minutes)

1. **Update `frontend/next.config.js`:**
```javascript
async rewrites() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  
  if (!backendUrl) return [];
  
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
```

2. **Update backend CORS:**
```javascript
// Allow Vercel domain
cors: {
  origin: [
    'https://your-app.vercel.app',
    'https://inv-app.mozdev.top'
  ]
}
```

3. **Deploy and test**

### Better Solution: Use CDN (2-3 hours)

1. **Setup Cloudflare R2:**
   - Create R2 bucket
   - Configure custom domain
   - Get API credentials

2. **Update upload functions:**
   - Replace local file saves with R2 uploads
   - Update URL generation

3. **Migrate existing files:**
   - Copy `/uploads/` to R2
   - Update database URLs if needed

4. **Update frontend:**
   - No changes needed if URLs are correct

## Summary

**Question:** Does frontend load files from backend?  
**Answer:** YES ✅

**Files Loaded:**
- `/uploads/*` - User uploads, avatars, documents
- `/img/logo/*` - Custom logos

**Impact of Separation:**
- All images will break ❌
- Uploads won't display ❌
- User experience severely degraded ❌

**Solutions:**
1. Add rewrites to proxy uploads (Quick fix)
2. Use CDN for uploads (Best long-term)
3. Keep current setup (Simplest)

**Recommendation:**
- **Short-term:** Keep current setup on Webuzo
- **Long-term:** Move to CDN (Cloudflare R2) for uploads

---

**Bottom Line:** You CANNOT simply deploy frontend to Vercel without handling the `/uploads/` directory. You need either rewrites or a CDN.
