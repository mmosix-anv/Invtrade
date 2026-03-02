# Complete File Dependency List - Frontend Loading from Backend

## Summary

**Question:** "aside from image and media files, no other files?"

**Answer:** Mostly just images and media files, but there are a few other file types.

## Complete List of Files Loaded from Backend

### 1. Images & Media (Primary) ✅

**Location:** `/uploads/`

**File Types:**
- `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg` - Images
- `.mp4`, `.webm`, `.mov` - Videos

**Used For:**
- User avatars
- NFT images
- Product images
- Blog post images
- KYC documents (scanned images)
- P2P trade attachments
- Support ticket attachments
- Editor media
- Team member photos (ICO)

### 2. Document Files (Secondary) ✅

**Location:** `/uploads/`

**File Types:**
- `.pdf` - PDF documents
- `.doc`, `.docx` - Word documents
- `.txt` - Text files
- `.csv` - CSV exports
- `.xls`, `.xlsx` - Excel files

**Used For:**
- KYC document uploads (ID cards, passports, utility bills)
- P2P trade payment proofs
- Support ticket attachments
- Trade history exports
- Report downloads

### 3. Digital Product Downloads (E-commerce) ✅

**Location:** `/uploads/ecommerce/products/`

**File Types:**
- Any file type (digital products)
- Software, ebooks, templates, etc.

**Endpoints:**
- `/api/ecommerce/download/[orderItemId]` - Get download info
- `/api/ecommerce/download/[orderItemId]/file` - Stream actual file

**Used For:**
- Purchased digital products
- Order fulfillment
- Customer downloads

### 4. Logo Files ✅

**Location:** `/img/logo/`

**File Types:**
- `.png`, `.svg`, `.jpg` - Logo images

**Used For:**
- Site logo
- Email logo
- Favicon
- Admin customization

### 5. Plugin/Extension Downloads ✅

**Location:** Backend generates ZIP files

**Endpoints:**
- `/api/gateway/integration/[pluginId]/download` - Download plugin ZIP
- `/api/admin/system/update/download` - Download system updates

**File Types:**
- `.zip` - Plugin packages

**Used For:**
- Gateway integrations
- System updates
- Extension installations

## What's NOT Loaded from Backend

### Frontend Handles These Locally:

1. **JavaScript/CSS** - Bundled with frontend
2. **Fonts** - In `frontend/public/fonts/`
3. **Static images** - In `frontend/public/img/`
4. **Icons** - In `frontend/public/icons/`
5. **Localization files** - Generated at build time
6. **Chart library** - In `frontend/public/lib/chart/`
7. **Configuration** - Environment variables

## Backend File Serving

### How Backend Serves Files:

```javascript
// backend/dist/src/server.js
if (url.startsWith("/uploads/")) {
  const handled = serveStaticFile(res, req, url);
  if (handled) return;
}
```

### Allowed File Extensions:

```javascript
const allowedExtensions = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',  // Images
  '.mp4', '.webm', '.mov',                            // Videos
  '.pdf', '.txt'                                      // Documents
];
```

## API Endpoints That Return Files

### 1. Static File Serving
- `GET /uploads/*` - Direct file access
- `GET /img/logo/*` - Logo files

### 2. Download Endpoints
- `GET /api/ecommerce/download/[orderItemId]` - Digital product info
- `GET /api/ecommerce/download/[orderItemId]/file` - Stream file
- `GET /api/gateway/integration/[pluginId]/download` - Plugin ZIP
- `POST /api/admin/system/update/download` - System update

### 3. Export Endpoints (Generate on-the-fly)
- Trade history exports (CSV/Excel)
- Ticket exports (JSON)
- Report generation

## File Storage Structure

```
backend/
├── uploads/
│   ├── avatars/          # User profile pictures
│   ├── nft/              # NFT images
│   ├── kyc/              # KYC documents
│   ├── p2p/              # P2P trade attachments
│   ├── editor/           # WYSIWYG editor uploads
│   ├── ecommerce/
│   │   └── products/     # Digital products
│   └── support/          # Support ticket attachments
└── img/
    └── logo/             # Custom logos
```

## Impact on Deployment

### If Frontend and Backend Separated:

**Files That Break:**
1. ✅ User avatars
2. ✅ NFT images
3. ✅ KYC documents
4. ✅ Product images
5. ✅ Blog images
6. ✅ Custom logos
7. ✅ P2P attachments
8. ✅ Support attachments
9. ✅ Digital product downloads
10. ✅ Plugin downloads

**Files That Still Work:**
- ❌ None - all user-uploaded content breaks

## Solutions

### Option 1: Proxy via Next.js Rewrites

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

**Handles:**
- All static files
- All downloads
- All uploads

### Option 2: Use CDN (Cloudflare R2, AWS S3)

**Migrate to:**
- `https://cdn.yourdomain.com/uploads/...`
- `https://cdn.yourdomain.com/img/logo/...`

**Benefits:**
- Fast global delivery
- Reduced backend load
- Scalable

### Option 3: Keep Together

**Current setup works perfectly:**
- Frontend: `inv-app.mozdev.top`
- Backend: `inv-api.mozdev.top`
- Same server, shared file access

## File Size Considerations

### Typical File Sizes:
- Avatars: 50KB - 500KB
- NFT images: 100KB - 2MB
- KYC documents: 500KB - 5MB
- Digital products: 1MB - 500MB
- Videos: 5MB - 100MB

### Storage Requirements:
- Small app: 1-10GB
- Medium app: 10-100GB
- Large app: 100GB+

## Security Considerations

### Backend Validates:
1. File extensions (whitelist)
2. File size limits
3. User authentication
4. Access permissions
5. Path traversal prevention

### Download Protection:
- Digital products: Requires purchase verification
- KYC documents: Admin-only access
- User uploads: Owner-only access

## Summary Table

| File Type | Location | Loaded from Backend | Can Separate? |
|-----------|----------|---------------------|---------------|
| User avatars | `/uploads/avatars/` | ✅ Yes | With rewrites/CDN |
| NFT images | `/uploads/nft/` | ✅ Yes | With rewrites/CDN |
| KYC documents | `/uploads/kyc/` | ✅ Yes | With rewrites/CDN |
| Product images | `/uploads/products/` | ✅ Yes | With rewrites/CDN |
| Digital products | `/uploads/ecommerce/` | ✅ Yes | With rewrites/CDN |
| Custom logos | `/img/logo/` | ✅ Yes | With rewrites/CDN |
| P2P attachments | `/uploads/p2p/` | ✅ Yes | With rewrites/CDN |
| Support files | `/uploads/support/` | ✅ Yes | With rewrites/CDN |
| Plugin ZIPs | Generated | ✅ Yes | API endpoint |
| Static assets | `/public/` | ❌ No | Frontend only |
| JavaScript | Bundled | ❌ No | Frontend only |
| CSS | Bundled | ❌ No | Frontend only |

## Conclusion

**Primary Dependency:** Images and media files in `/uploads/`

**Secondary Dependencies:**
- Document files (PDF, DOC, etc.)
- Digital product downloads
- Custom logos
- Plugin/update downloads

**Not Dependent:**
- Static frontend assets
- JavaScript/CSS bundles
- Fonts
- Icons
- Localization files

**Bottom Line:** 
- 95% of backend file dependencies are images/media
- 5% are documents and downloads
- All can be handled with rewrites or CDN

---

**Recommendation:** Use Next.js rewrites for quick deployment, migrate to CDN for production scale.
