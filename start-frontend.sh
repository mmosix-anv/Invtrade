#!/bin/bash
# Frontend startup script for Webuzo

# Change to project directory
cd "$(dirname "$0")"

# Load environment variables
export NODE_ENV=production
export PORT=3000

# Check if build exists
if [ ! -d "frontend/.next" ]; then
    echo "ERROR: Frontend not built!"
    echo "Please run: pnpm build:frontend"
    exit 1
fi

# Start the frontend using Next.js start (works without standalone)
echo "Starting frontend on port 3000..."
cd frontend
npm start
