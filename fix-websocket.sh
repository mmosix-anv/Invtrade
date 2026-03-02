#!/bin/bash

echo "========================================="
echo "WebSocket Production Fix - ALL FILES"
echo "========================================="
echo ""
echo "Fixed 6 WebSocket files:"
echo "  1. frontend/utils/ws.ts"
echo "  2. frontend/services/nft-ws.ts"
echo "  3. frontend/services/tickers-ws.ts"
echo "  4. frontend/services/orders-ws.ts"
echo "  5. frontend/services/market-data-ws.ts"
echo "  6. frontend/store/trade/use-binary-store.ts"
echo ""
echo "Changes:"
echo "  - Removed ALL fallbacks to window.location.host"
echo "  - Now ONLY uses NEXT_PUBLIC_BACKEND_WS_URL"
echo "  - Will throw error if not configured"
echo ""
echo "Production URLs:"
echo "  Frontend: https://inv-app.mozdev.top"
echo "  Backend:  https://inv-api.mozdev.top"
echo ""
echo "WebSocket will connect to: wss://inv-api.mozdev.top"
echo ""
read -p "Continue with rebuild? (y/n) " -n 1 -r
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
    echo ""
    echo "Check if NEXT_PUBLIC_BACKEND_WS_URL is set in .env"
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
echo "   Should connect to: wss://inv-api.mozdev.top"
echo ""
echo "If you see 'NEXT_PUBLIC_BACKEND_WS_URL is not configured' error:"
echo "  - Check .env file has: NEXT_PUBLIC_BACKEND_WS_URL=\"inv-api.mozdev.top\""
echo "  - Rebuild frontend again"
echo ""
echo "See WEBSOCKET_ALL_FIXES.md for details"
echo ""
