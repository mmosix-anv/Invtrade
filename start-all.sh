#!/bin/bash

# Start All Invtrade Applications
# This script starts both frontend and backend using PM2

echo "========================================="
echo "Starting Invtrade Applications"
echo "========================================="
echo ""

# Start backend
echo "Starting backend..."
cd /home/httptruevault/git/Invtrade/backend
pm2 start ecosystem.config.js
echo "✓ Backend started"
echo ""

# Start frontend
echo "Starting frontend..."
cd /home/httptruevault/git/Invtrade/frontend
pm2 start ecosystem.config.js
echo "✓ Frontend started"
echo ""

# Save PM2 configuration
echo "Saving PM2 configuration..."
pm2 save
echo "✓ Configuration saved"
echo ""

# Show status
echo "========================================="
echo "Application Status"
echo "========================================="
pm2 list
echo ""

echo "✓ All applications started successfully!"
echo ""
echo "View logs: pm2 logs"
echo "Monitor: pm2 monit"
