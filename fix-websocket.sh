#!/bin/bash

echo "========================================="
echo "WebSocket Production Fix"
echo "========================================="
echo ""
echo "This script will:"
echo "1. Rebuild frontend with production URLs"
echo "2. Restart both applications"
echo ""
echo "Production URLs:"
echo "  Frontend: https://inv-app.mozdev.top"
echo "  Backend:  https://inv-api.mozdev.top"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Cancelled."
    exit 1
fi

echo ""
echo "========================================="
echo "Step 1: Rebuilding Frontend"
echo "========================================="

cd frontend

echo "Building frontend with production environment..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed!"
    exit 1
fi

echo "✓ Frontend build successful"

cd ..

echo ""
echo "========================================="
echo "Step 2: Restarting Applications"
echo "========================================="

if [ -f "./webuzo-restart.sh" ]; then
    echo "Using webuzo-restart.sh..."
    ./webuzo-restart.sh
else
    echo ""
    echo "Please restart applications manually via Webuzo panel:"
    echo "1. Go to Applications → Node.js"
    echo "2. Click 'Restart' on invtrade-frontend"
    echo "3. Click 'Restart' on invtrade-backend"
fi

echo ""
echo "========================================="
echo "Fix Applied Successfully!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Clear browser cache (Ctrl+Shift+Delete)"
echo "2. Hard reload page (Ctrl+Shift+R)"
echo "3. Check WebSocket in Network tab (F12)"
echo ""
echo "If issues persist, see WEBSOCKET_PRODUCTION_FIX.md"
echo ""
