#!/bin/bash

# Update and Restart Invtrade Applications
# This script pulls latest code, rebuilds, and restarts both applications

echo "========================================="
echo "Updating Invtrade Applications"
echo "========================================="
echo ""

# Pull latest code
echo "Pulling latest code from Git..."
cd /home/httptruevault/git/Invtrade
git pull origin main
echo "✓ Code updated"
echo ""

# Update and rebuild backend
echo "========================================="
echo "Updating Backend"
echo "========================================="
cd backend
echo "Installing dependencies..."
npm install
echo "Building backend..."
npm run build
echo "Restarting backend..."
pm2 restart invtrade-backend
echo "✓ Backend updated and restarted"
echo ""

# Update and rebuild frontend
echo "========================================="
echo "Updating Frontend"
echo "========================================="
cd ../frontend
echo "Installing dependencies..."
npm install --legacy-peer-deps --include=dev
echo "Building i18n..."
npm run build:i18n
echo "Building frontend..."
npm run build
echo "Restarting frontend..."
pm2 restart invtrade-frontend
echo "✓ Frontend updated and restarted"
echo ""

# Save PM2 configuration
echo "Saving PM2 configuration..."
pm2 save
echo ""

# Show status
echo "========================================="
echo "Application Status"
echo "========================================="
pm2 list
echo ""

echo "✓ Update complete!"
echo ""
echo "View logs: pm2 logs"
echo "Monitor: pm2 monit"
