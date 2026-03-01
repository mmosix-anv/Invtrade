#!/bin/bash

# Restart All Invtrade Applications
# This script restarts both frontend and backend

echo "========================================="
echo "Restarting Invtrade Applications"
echo "========================================="
echo ""

# Restart backend
echo "Restarting backend..."
pm2 restart invtrade-backend
echo "✓ Backend restarted"
echo ""

# Restart frontend
echo "Restarting frontend..."
pm2 restart invtrade-frontend
echo "✓ Frontend restarted"
echo ""

# Show status
echo "========================================="
echo "Application Status"
echo "========================================="
pm2 list
echo ""

echo "✓ All applications restarted successfully!"
echo ""
echo "View logs: pm2 logs"
echo "Monitor: pm2 monit"
