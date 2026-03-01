# Node.js Version Compatibility Issue

## 🚨 Issue Identified

The backend is failing to start due to a Node.js version incompatibility with `uWebSockets.js`.

### Error Details
```
Error: This version of uWS.js (v20.51.0) supports only Node.js versions 18, 20, 22 and 23
Current Node.js version: v24.13.0
Missing module: ./uws_win32_x64_137.node
```

## 🔧 Solution Options

### Option 1: Use Node.js v22 (Recommended)

Node.js v22 is the latest LTS version supported by uWebSockets.js.

#### Using NVM (Node Version Manager)

**Install NVM for Windows:**
1. Download from: https://github.com/coreybutler/nvm-windows/releases
2. Install the latest version

**Switch to Node.js v22:**
```bash
# Install Node.js v22
nvm install 22

# Use Node.js v22
nvm use 22

# Verify version
node --version
# Should show: v22.x.x

# Reinstall dependencies
pnpm install

# Start development server
pnpm turbo dev
```

### Option 2: Use Node.js v20 (Alternative)

Node.js v20 is also supported and is an LTS version.

```bash
# Install Node.js v20
nvm install 20

# Use Node.js v20
nvm use 20

# Verify version
node --version
# Should show: v20.x.x

# Reinstall dependencies
pnpm install

# Start development server
pnpm turbo dev
```

### Option 3: Update uWebSockets.js (If Available)

Check if there's a newer version that supports Node.js v24:

```bash
# Check for updates
pnpm update uWebSockets.js

# Or try the latest version
pnpm add uWebSockets.js@latest
```

**Note:** This may not work as Node.js v24 is very new and may not be supported yet.

## 📋 Step-by-Step Instructions

### 1. Install NVM for Windows

1. Go to: https://github.com/coreybutler/nvm-windows/releases
2. Download `nvm-setup.exe` from the latest release
3. Run the installer
4. Follow the installation wizard

### 2. Install Node.js v22

Open a **new** PowerShell window (as Administrator if possible):

```powershell
# List available Node.js versions
nvm list available

# Install Node.js v22 (latest LTS)
nvm install 22

# Set Node.js v22 as the active version
nvm use 22

# Verify the version
node --version
```

### 3. Reinstall Dependencies

```bash
# Navigate to project directory
cd C:\dev\Bicrypto

# Remove node_modules and reinstall
Remove-Item -Recurse -Force node_modules
Remove-Item -Recurse -Force backend/node_modules
Remove-Item -Recurse -Force frontend/node_modules

# Reinstall with correct Node.js version
pnpm install
```

### 4. Start Development Server

```bash
pnpm turbo dev
```

## ✅ Expected Result

After switching to Node.js v22 or v20, you should see:

```
✓ Backend server started on port 4000
✓ Database connected
✓ Redis connected
✓ Ready to accept requests
```

And the frontend should successfully connect to the backend.

## 🔍 Verification

### Check Node.js Version
```bash
node --version
# Should show: v22.x.x or v20.x.x
```

### Check if Backend Starts
```bash
cd backend
node -r module-alias/register dist/index.js
```

### Check Ports
```powershell
# Check if backend is listening on port 4000
Get-NetTCPConnection -LocalPort 4000
```

## 📝 Why This Happened

- **Node.js v24** was released recently (2024)
- **uWebSockets.js** is a native module that needs to be compiled for each Node.js version
- The version used in this project (v20.51.0) doesn't have pre-compiled binaries for Node.js v24 yet
- Node.js v22 is the latest LTS version and is fully supported

## 🚀 After Fixing

Once you've switched to Node.js v22 or v20:

1. ✅ Backend will start successfully
2. ✅ Frontend will connect to backend
3. ✅ You can login at http://localhost:3000
4. ✅ Full application will be functional

## 📞 Alternative: Use Different Web Server

If you can't change Node.js version, you could modify the backend to use a different web server (like Express.js instead of uWebSockets.js), but this would require code changes.

## 🎯 Recommended Action

**Use Node.js v22** - it's the latest LTS version, fully supported, and will work perfectly with this application.

```bash
nvm install 22
nvm use 22
pnpm install
pnpm turbo dev
```

---

**Current Status:**
- Node.js Version: v24.13.0 ❌
- Required Version: v18, v20, v22, or v23 ✅
- Recommended: v22 (LTS) ⭐

**Next Step:** Install NVM and switch to Node.js v22
