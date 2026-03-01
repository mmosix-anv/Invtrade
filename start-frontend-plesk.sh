#!/bin/bash
# Frontend startup script for Plesk

# Change to application directory
cd /var/www/vhosts/yourdomain.com/httpdocs

# Kill any existing process
pkill -f "next start"

# Load environment variables
export NODE_ENV=production
export PORT=3000
export NEXT_PUBLIC_BACKEND_URL="https://api.httptruevaultglobalbank.com"
export NEXT_PUBLIC_BACKEND_WS_URL="api.httptruevaultglobalbank.com"
# Add other NEXT_PUBLIC_* variables here

# Start the frontend
cd frontend
nohup npm start > ../logs/frontend.log 2>&1 &

echo "Frontend started on port 3000"
