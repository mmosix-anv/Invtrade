#!/bin/bash

# Stop All Invtrade Applications
# This script stops both frontend and backend

echo "========================================="
echo "Stopping Invtrade Applications"
echo "========================================="
echo ""

# Stop frontend
echo "Stopping frontend..."
pm2 stop invtrade-frontend
echo "✓ Frontend stopped"
echo ""

# Stop backend
echo "Stopping backend..."
pm2 stop invtrade-backend
echo "✓ Backend stopped"
echo ""

# Show status
echo "========================================="
echo "Application Status"
echo "========================================="
pm2 list
echo ""

echo "✓ All applications stopped successfully!"
