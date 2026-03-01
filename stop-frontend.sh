#!/bin/bash
# Frontend stop script for Webuzo

echo "Stopping frontend..."
pkill -f "next start"

if [ $? -eq 0 ]; then
    echo "Frontend stopped successfully"
else
    echo "No frontend process found or failed to stop"
fi
