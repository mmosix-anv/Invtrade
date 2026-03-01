#!/bin/bash
# Backend startup script for Plesk

# Change to application directory
cd /var/www/vhosts/api.httptruevaultglobalbank.com/httpdocs

# Kill any existing process
pkill -f "node backend/dist/index.js"

# Create logs directory if it doesn't exist
mkdir -p logs

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Override with production settings
export NODE_ENV=production
export NEXT_PUBLIC_BACKEND_PORT=30004

# Start the backend
cd backend
nohup node dist/index.js > ../logs/backend.log 2>&1 &

echo "Backend started on port 30004"
echo "PID: $!"
