#!/bin/bash

# Stop Webuzo Node.js Applications
# Usage: ./webuzo-stop.sh [frontend|backend|all]

APP=$1

stop_frontend() {
    echo "Stopping frontend..."
    
    # Check if running
    if ! lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠ Frontend is not running"
        return 1
    fi
    
    # Try graceful shutdown first
    if [ -f /home/httptruevault/pids/frontend.pid ]; then
        PID=$(cat /home/httptruevault/pids/frontend.pid)
        kill $PID 2>/dev/null
        sleep 2
    fi
    
    # Force kill if still running
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
        echo "  Forcing shutdown..."
        kill -9 $(lsof -t -i:3000) 2>/dev/null
    fi
    
    # Clean up PID file
    rm -f /home/httptruevault/pids/frontend.pid
    
    if ! lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
        echo "✓ Frontend stopped"
    else
        echo "❌ Failed to stop frontend"
        return 1
    fi
}

stop_backend() {
    echo "Stopping backend..."
    
    # Check if running
    if ! lsof -Pi :30004 -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠ Backend is not running"
        return 1
    fi
    
    # Try graceful shutdown first
    if [ -f /home/httptruevault/pids/backend.pid ]; then
        PID=$(cat /home/httptruevault/pids/backend.pid)
        kill $PID 2>/dev/null
        sleep 2
    fi
    
    # Force kill if still running
    if lsof -Pi :30004 -sTCP:LISTEN -t >/dev/null ; then
        echo "  Forcing shutdown..."
        kill -9 $(lsof -t -i:30004) 2>/dev/null
    fi
    
    # Clean up PID file
    rm -f /home/httptruevault/pids/backend.pid
    
    if ! lsof -Pi :30004 -sTCP:LISTEN -t >/dev/null ; then
        echo "✓ Backend stopped"
    else
        echo "❌ Failed to stop backend"
        return 1
    fi
}

case "$APP" in
    frontend)
        stop_frontend
        ;;
    backend)
        stop_backend
        ;;
    all)
        echo "========================================="
        echo "Stopping All Applications"
        echo "========================================="
        echo ""
        stop_frontend
        echo ""
        stop_backend
        echo ""
        echo "✓ All applications stopped"
        ;;
    *)
        echo "Usage: $0 [frontend|backend|all]"
        echo ""
        echo "Examples:"
        echo "  $0 frontend    # Stop frontend only"
        echo "  $0 backend     # Stop backend only"
        echo "  $0 all         # Stop both applications"
        exit 1
        ;;
esac
