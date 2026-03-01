# Webuzo Port Assignment

## Important: Webuzo Assigns Ports Automatically

Webuzo's Node.js application manager automatically assigns ports to your applications. You don't need to specify them.

### What You'll See

When you create a Node.js application in Webuzo, it will assign a port like:
- **Frontend:** Port 30000 (or similar)
- **Backend:** Port 30001 (or similar)

This is normal and expected!

### How It Works

1. **Webuzo assigns the port** automatically
2. **Sets `PORT` environment variable** to the assigned port
3. **Your application reads `process.env.PORT`** and uses that port
4. **Nginx/Apache proxies** your domain to that port automatically

### What You Need to Do

**Just make sure `NODE_ENV=production` is set!**

That's the key environment variable. The port will be handled automatically.

### In Webuzo Application Form

**Environment Variables to Set:**
```
NODE_ENV=production
```

**Don't set:**
- ❌ `PORT=3000` (Webuzo sets this)
- ❌ `PORT=30004` (Webuzo sets this)

**Do set:**
- ✅ `NODE_ENV=production` (Required!)
- ✅ `NEXT_PUBLIC_BACKEND_URL=https://api.httptruevaultglobalbank.com`
- ✅ `NEXT_PUBLIC_SITE_URL=https://httptruevaultglobalbank.com`
- ✅ `DATABASE_URL=your_database_url` (for backend)

### Access Your Applications

Even though the apps run on ports like 30000, 30001, you access them via your domains:

**Frontend:**
```
https://httptruevaultglobalbank.com
```

**Backend:**
```
https://api.httptruevaultglobalbank.com
```

Webuzo's reverse proxy handles the port mapping automatically!

### If You Need to Know the Port

Check in Webuzo panel:
1. Go to **Applications** → **Node.js**
2. Click on your application
3. Look for **Port** field

Or check the application logs - it will show the port it's running on.

### Summary

✅ **Webuzo assigns ports automatically** (like 30000, 30001)  
✅ **Your apps use `process.env.PORT`** to get the assigned port  
✅ **Nginx/Apache proxies** your domain to the port  
✅ **You access via domain**, not port  
✅ **Just set `NODE_ENV=production`** - that's the important one!

---

**The port 30000 is fine! Just make sure NODE_ENV=production is set.**
