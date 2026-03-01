#!/bin/bash

# Start Webuzo Node.js Applications
# Usage: ./webuzo-start.sh [frontend|backend|all]

APP=$1

# Create directories if they don't exist
mkdir -p /home/httptruevault/logs
mkdir -p /home/httptruevault/pids

start_frontend() {
    echo "Starting frontend..."
    
    # Check if already running
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠ Frontend is already running on port 3000"
        return 1
    fi
    
    cd /home/httptruevault/git/Invtrade/frontend
    nohup node server.js > /home/httptruevault/logs/frontend.log 2>&1 &
    echo $! > /home/httptruevault/pids/frontend.pid
    
    sleep 2
    
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
        echo "✓ Frontend started (PID: $(cat /home/httptruevault/pids/frontend.pid))"
        echo "  Port: 3000"
        echo "  Logs: /home/httptruevault/logs/frontend.log"
    else
        echo "❌ Frontend failed to start"
        echo "Check logs: tail -f /home/httptruevault/logs/frontend.log"
        return 1
    fi
}

start_backend() {
    echo "Starting backend..."
    
    # Check if already running
    if lsof -Pi :30004 -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠ Backend is already running on port 30004"
        return 1
    fi
    
    cd /home/httptruevault/git/Invtrade/backend
    nohup node server.js > /home/httptruevault/logs/backend.log 2>&1 &
    echo $! > /home/httptruevault/pids/backend.pid
    
    sleep 2
    
    if lsof -Pi :30004 -sTCP:LISTEN -t >/dev/null ; then
        echo "✓ Backend started (PID: $(cat /home/httptruevault/pids/backend.pid))"
        echo "  Port: 30004"
        echo "  Logs: /home/httptruevault/logs/backend.log"
    else
        echo "❌ Backend failed to start"
        echo "Check logs: tail -f /home/httptruevault/logs/backend.log"
        return 1
    fi
}

case "$APP" in
    frontend)
        start_frontend
        ;;
    backend)
        start_backend
        ;;
    all)
        echo "========================================="
        echo "Starting All Applications"
        echo "========================================="
        echo ""
        start_backend
        echo ""
        start_frontend
        echo ""
        echo "========================================="
        echo "Status"
        echo "========================================="
        ./webuzo-status.sh
        ;;
    *)
        echo "Usage: $0 [frontend|backend|all]"
        echo ""
        echo "Examples:"
        echo "  $0 frontend    # Start frontend only"
        echo "  $0 backend     # Start backend only"
        echo "  $0 all         # Start both applications"
        exit 1
        ;;
esac
