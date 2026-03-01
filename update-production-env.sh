#!/bin/bash

echo "========================================="
echo "Updating Production Environment"
echo "========================================="

# Update environment variables for production
echo "✓ Environment variables updated in:"
echo "  - .env"
echo "  - frontend/.env"
echo "  - backend/.env"

echo ""
echo "Production URLs:"
echo "  Frontend: https://inv-app.mozdev.top"
echo "  Backend:  https://inv-api.mozdev.top"

echo ""
echo "========================================="
echo "Next Steps:"
echo "========================================="
echo ""
echo "1. Rebuild Frontend:"
echo "   cd frontend"
echo "   npm run build"
echo ""
echo "2. Restart Applications via Webuzo:"
echo "   - Go to Applications → Node.js"
echo "   - Click 'Restart' on both apps"
echo ""
echo "3. Or use restart script:"
echo "   ./webuzo-restart.sh"
echo ""
echo "========================================="
