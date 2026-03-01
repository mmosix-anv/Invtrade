#!/bin/bash
# Backend stop script for Webuzo

echo "Stopping backend..."
pkill -f "node backend/dist/index.js"

if [ $? -eq 0 ]; then
    echo "Backend stopped successfully"
else
    echo "No backend process found or failed to stop"
fi
