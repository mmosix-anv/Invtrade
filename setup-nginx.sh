#!/bin/bash

# Setup Nginx for Invtrade
# This script configures Nginx to proxy requests to your applications

echo "========================================="
echo "Setting up Nginx for Invtrade"
echo "========================================="
echo ""

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "❌ Nginx is not installed"
    echo "Install it with: yum install nginx (CentOS/RHEL) or apt install nginx (Ubuntu/Debian)"
    exit 1
fi

echo "✓ Nginx is installed"
echo ""

# Copy configuration
echo "Copying Nginx configuration..."
sudo cp nginx-config.conf /etc/nginx/conf.d/invtrade.conf
echo "✓ Configuration copied to /etc/nginx/conf.d/invtrade.conf"
echo ""

# Test Nginx configuration
echo "Testing Nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✓ Nginx configuration is valid"
    echo ""
    
    # Reload Nginx
    echo "Reloading Nginx..."
    sudo systemctl reload nginx
    echo "✓ Nginx reloaded"
    echo ""
    
    echo "========================================="
    echo "Setup Complete!"
    echo "========================================="
    echo ""
    echo "Your applications are now accessible at:"
    echo "  Frontend: http://httptruevaultglobalbank.com"
    echo "  Backend:  http://api.httptruevaultglobalbank.com"
    echo ""
    echo "Next steps:"
    echo "1. Update your DNS to point to this server"
    echo "2. Install SSL certificate (see below)"
    echo ""
    echo "To install SSL certificate:"
    echo "  sudo yum install certbot python3-certbot-nginx"
    echo "  sudo certbot --nginx -d httptruevaultglobalbank.com -d www.httptruevaultglobalbank.com"
    echo "  sudo certbot --nginx -d api.httptruevaultglobalbank.com"
else
    echo "❌ Nginx configuration has errors"
    echo "Please check the configuration and try again"
    exit 1
fi
