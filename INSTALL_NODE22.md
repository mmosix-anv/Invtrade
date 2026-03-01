# Install Node.js v22 - Quick Guide

## Option 1: Direct Download (Fastest - 5 minutes)

### Step 1: Download Node.js v22
1. Go to: https://nodejs.org/en/download
2. Click on "Other Downloads" or "Previous Releases"
3. Find Node.js v22.x.x (LTS)
4. Download the Windows Installer (.msi) for your system:
   - 64-bit: `node-v22.x.x-x64.msi`
   - 32-bit: `node-v22.x.x-x86.msi`

**Direct Link:** https://nodejs.org/dist/latest-v22.x/

### Step 2: Install Node.js v22
1. Run the downloaded `.msi` file
2. Follow the installation wizard
3. Accept the license agreement
4. Choose installation location (default is fine)
5. Click "Install"
6. Wait for installation to complete

### Step 3: Verify Installation
Open a **NEW** PowerShell window and run:
```powershell
node --version
```
Should show: `v22.x.x`

### Step 4: Reinstall Dependencies
```bash
cd C:\dev\Bicrypto
pnpm install
```

### Step 5: Start Development Server
```bash
pnpm turbo dev
```

---

## Option 2: Using NVM for Windows (Recommended for Multiple Versions)

### Step 1: Download NVM for Windows
1. Go to: https://github.com/coreybutler/nvm-windows/releases
2. Download the latest `nvm-setup.exe`
3. Run the installer

### Step 2: Install Node.js v22
Open a **NEW** PowerShell window (as Administrator):
```powershell
# List available versions
nvm list available

# Install Node.js v22
nvm install 22

# Use Node.js v22
nvm use 22

# Verify
node --version
```

### Step 3: Reinstall Dependencies
```bash
cd C:\dev\Bicrypto
pnpm install
```

### Step 4: Start Development Server
```bash
pnpm turbo dev
```

---

## Option 3: Using Chocolatey (If You Have It)

```powershell
# Install Node.js v22
choco install nodejs-lts --version=22

# Verify
node --version
```

---

## Quick Links

### Node.js Downloads
- **Official Site:** https://nodejs.org/en/download
- **v22 Direct:** https://nodejs.org/dist/latest-v22.x/
- **All Versions:** https://nodejs.org/en/download/releases

### NVM for Windows
- **Releases:** https://github.com/coreybutler/nvm-windows/releases
- **Documentation:** https://github.com/coreybutler/nvm-windows

---

## After Installation

### 1. Verify Node.js Version
```powershell
node --version
# Should show: v22.x.x
```

### 2. Verify npm/pnpm
```powershell
npm --version
pnpm --version
```

### 3. Navigate to Project
```bash
cd C:\dev\Bicrypto
```

### 4. Clean Install (Recommended)
```powershell
# Remove old node_modules
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force backend/node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force frontend/node_modules -ErrorAction SilentlyContinue

# Reinstall with Node.js v22
pnpm install
```

### 5. Start Development Server
```bash
pnpm turbo dev
```

---

## Expected Result

After starting the dev server, you should see:

```
✓ Backend server started on port 4000
✓ Database connected to Supabase PostgreSQL
✓ Redis connected
✓ Ready to accept requests

▲ Next.js 16.1.0 (Turbopack)
- Local:        http://localhost:3000
- Network:      http://0.0.0.0:3000
```

Then visit: **http://localhost:3000**

---

## Troubleshooting

### Issue: "node is not recognized"
**Solution:** Close and reopen PowerShell after installation

### Issue: Still showing v24
**Solution:** 
1. Close ALL PowerShell/terminal windows
2. Open a NEW PowerShell window
3. Run `node --version` again

### Issue: pnpm not found
**Solution:**
```powershell
npm install -g pnpm
```

### Issue: Permission denied
**Solution:** Run PowerShell as Administrator

---

## Why Node.js v22?

- ✅ Latest LTS (Long Term Support) version
- ✅ Fully supported by uWebSockets.js
- ✅ Stable and production-ready
- ✅ Best performance
- ✅ Long-term support until 2027

---

## Quick Command Reference

```powershell
# Check current Node.js version
node --version

# Check npm version
npm --version

# Check pnpm version
pnpm --version

# Navigate to project
cd C:\dev\Bicrypto

# Install dependencies
pnpm install

# Start development server
pnpm turbo dev

# Test database connection
node backend/test-connection.js
```

---

**Recommended:** Use Option 1 (Direct Download) for the fastest setup!

**Download Link:** https://nodejs.org/dist/latest-v22.x/

After installation, run:
```bash
cd C:\dev\Bicrypto
pnpm install
pnpm turbo dev
```

🎉 **You'll be up and running in 5 minutes!**
