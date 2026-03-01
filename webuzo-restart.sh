#!/bin/bash

# Restart Webuzo Node.js Applications
# Usage: ./webuzo-restart.sh [frontend|backend|all]

APP=$1

case "$APP" in
    frontend)
        echo "Restarting frontend..."
        ./webuzo-stop.sh frontend
        sleep 1
        ./webuzo-start.sh frontend
        ;;
    backend)
        echo "Restarting backend..."
        ./webuzo-stop.sh backend
        sleep 1
        ./webuzo-start.sh backend
        ;;
    all)
        echo "========================================="
        echo "Restarting All Applications"
        echo "========================================="
        echo ""
        ./webuzo-stop.sh all
        echo ""
        sleep 2
        echo ""
        ./webuzo-start.sh all
        ;;
    *)
        echo "Usage: $0 [frontend|backend|all]"
        echo ""
        echo "Examples:"
        echo "  $0 frontend    # Restart frontend only"
        echo "  $0 backend     # Restart backend only"
        echo "  $0 all         # Restart both applications"
        exit 1
        ;;
esac
