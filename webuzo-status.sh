#!/bin/bash

# Check Status of Webuzo Node.js Applications

echo "========================================="
echo "Application Status"
echo "========================================="
echo ""

# Frontend Status
echo "Frontend (Port 3000):"
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    PID=$(lsof -t -i:3000)
    echo "  Status: ✓ Running"
    echo "  PID: $PID"
    if [ -f /home/httptruevault/pids/frontend.pid ]; then
        echo "  PID File: $(cat /home/httptruevault/pids/frontend.pid)"
    fi
    echo "  Port: 3000"
    echo "  URL: http://localhost:3000"
else
    echo "  Status: ✗ Not Running"
fi
echo ""

# Backend Status
echo "Backend (Port 30004):"
if lsof -Pi :30004 -sTCP:LISTEN -t >/dev/null ; then
    PID=$(lsof -t -i:30004)
    echo "  Status: ✓ Running"
    echo "  PID: $PID"
    if [ -f /home/httptruevault/pids/backend.pid ]; then
        echo "  PID File: $(cat /home/httptruevault/pids/backend.pid)"
    fi
    echo "  Port: 30004"
    echo "  URL: http://localhost:30004"
else
    echo "  Status: ✗ Not Running"
fi
echo ""

echo "========================================="
echo "Log Files"
echo "========================================="
echo "Frontend: /home/httptruevault/logs/frontend.log"
echo "Backend:  /home/httptruevault/logs/backend.log"
echo ""
echo "View logs:"
echo "  tail -f /home/httptruevault/logs/frontend.log"
echo "  tail -f /home/httptruevault/logs/backend.log"
