#!/bin/bash
# Backend startup script for Webuzo

# Change to project directory
cd "$(dirname "$0")"

# Load environment variables
export NODE_ENV=production

# Check if dependencies are installed
if [ ! -d "node_modules" ] && [ ! -d "backend/node_modules" ]; then
    echo "ERROR: Dependencies not installed!"
    echo "Please run one of the following commands first:"
    echo "  pnpm install --prod"
    echo "  OR"
    echo "  npm install --production"
    exit 1
fi

# Start the backend
echo "Starting backend on port 30004..."
node backend/dist/index.js
