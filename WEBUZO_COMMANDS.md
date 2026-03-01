# Webuzo Node.js Apps - Command Reference

Complete command reference for managing Webuzo Node.js applications.

## Start Commands

### Frontend

```bash
# Start frontend application
node /home/httptruevault/git/Invtrade/frontend/server.js

# Or with environment variables
cd /home/httptruevault/git/Invtrade/frontend
NODE_ENV=production PORT=3000 node server.js

# Background process (using nohup)
cd /home/httptruevault/git/Invtrade/frontend
nohup node server.js > /home/httptruevault/logs/frontend.log 2>&1 &

# Save the PID
echo $! > /home/httptruevault/pids/frontend.pid
```

### Backend

```bash
# Start backend application
node /home/httptruevault/git/Invtrade/backend/server.js

# Or with environment variables
cd /home/httptruevault/git/Invtrade/backend
NODE_ENV=production node server.js

# Background process (using nohup)
cd /home/httptruevault/git/Invtrade/backend
nohup node server.js > /home/httptruevault/logs/backend.log 2>&1 &

# Save the PID
echo $! > /home/httptruevault/pids/backend.pid
```

## Stop Commands

### Frontend

```bash
# Find the process
ps aux | grep "frontend/server.js"

# Kill by PID (if you saved it)
kill $(cat /home/httptruevault/pids/frontend.pid)

# Or kill by port
kill $(lsof -t -i:3000)

# Force kill if needed
kill -9 $(lsof -t -i:3000)

# Or find and kill by process name
pkill -f "frontend/server.js"
```

### Backend

```bash
# Find the process
ps aux | grep "backend/server.js"

# Kill by PID (if you saved it)
kill $(cat /home/httptruevault/pids/backend.pid)

# Or kill by port
kill $(lsof -t -i:30004)

# Force kill if needed
kill -9 $(lsof -t -i:30004)

# Or find and kill by process name
pkill -f "backend/server.js"
```

## Restart Commands

### Frontend

```bash
# Stop and start
kill $(lsof -t -i:3000)
cd /home/httptruevault/git/Invtrade/frontend
nohup node server.js > /home/httptruevault/logs/frontend.log 2>&1 &
```

### Backend

```bash
# Stop and start
kill $(lsof -t -i:30004)
cd /home/httptruevault/git/Invtrade/backend
nohup node server.js > /home/httptruevault/logs/backend.log 2>&1 &
```

## Check Status

### Frontend

```bash
# Check if running
ps aux | grep "frontend/server.js" | grep -v grep

# Check port
lsof -i :3000

# Check process
netstat -tulpn | grep 3000

# Test if responding
curl http://localhost:3000
```

### Backend

```bash
# Check if running
ps aux | grep "backend/server.js" | grep -v grep

# Check port
lsof -i :30004

# Check process
netstat -tulpn | grep 30004

# Test if responding
curl http://localhost:30004/api/health
```

## View Logs

### Frontend

```bash
# View log file
tail -f /home/httptruevault/logs/frontend.log

# Last 50 lines
tail -n 50 /home/httptruevault/logs/frontend.log

# Search for errors
grep -i error /home/httptruevault/logs/frontend.log
```

### Backend

```bash
# View log file
tail -f /home/httptruevault/logs/backend.log

# Last 50 lines
tail -n 50 /home/httptruevault/logs/backend.log

# Search for errors
grep -i error /home/httptruevault/logs/backend.log
```

---

## Webuzo-Specific Commands

If Webuzo provides a CLI tool (check your Webuzo documentation):

```bash
# Start
webuzo-nodejs start invtrade-frontend
webuzo-nodejs start invtrade-backend

# Stop
webuzo-nodejs stop invtrade-frontend
webuzo-nodejs stop invtrade-backend

# Restart
webuzo-nodejs restart invtrade-frontend
webuzo-nodejs restart invtrade-backend

# Status
webuzo-nodejs status invtrade-frontend
webuzo-nodejs status invtrade-backend

# Logs
webuzo-nodejs logs invtrade-frontend
webuzo-nodejs logs invtrade-backend
```

**Note:** The exact command may vary. Check Webuzo documentation or panel for the correct syntax.

---

## Management Scripts

I'll create helper scripts for easier management:

### Start Script

```bash
./webuzo-start.sh frontend
./webuzo-start.sh backend
./webuzo-start.sh all
```

### Stop Script

```bash
./webuzo-stop.sh frontend
./webuzo-stop.sh backend
./webuzo-stop.sh all
```

### Restart Script

```bash
./webuzo-restart.sh frontend
./webuzo-restart.sh backend
./webuzo-restart.sh all
```

### Status Script

```bash
./webuzo-status.sh
```

---

## Via Webuzo Panel (Recommended)

The easiest way to manage Webuzo Node.js apps:

1. **Login to Webuzo Panel**
2. **Go to Applications → Node.js**
3. **Find your application**
4. **Click buttons:**
   - **Start** - Start the application
   - **Stop** - Stop the application
   - **Restart** - Restart the application
   - **Logs** - View application logs
   - **Edit** - Change settings

---

## Quick Reference Table

| Action | Frontend | Backend |
|--------|----------|---------|
| **Start** | `cd frontend && nohup node server.js &` | `cd backend && nohup node server.js &` |
| **Stop** | `kill $(lsof -t -i:3000)` | `kill $(lsof -t -i:30004)` |
| **Status** | `lsof -i :3000` | `lsof -i :30004` |
| **Logs** | `tail -f ~/logs/frontend.log` | `tail -f ~/logs/backend.log` |
| **Test** | `curl http://localhost:3000` | `curl http://localhost:30004` |

---

## Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3000   # Frontend
lsof -i :30004  # Backend

# Kill the process
kill -9 $(lsof -t -i:3000)
kill -9 $(lsof -t -i:30004)
```

### Application Won't Start

```bash
# Test startup file manually
cd /home/httptruevault/git/Invtrade/frontend
node server.js

# Check for errors
# If it starts, press Ctrl+C and run in background
```

### Can't Find Process

```bash
# List all node processes
ps aux | grep node

# List all processes on ports
netstat -tulpn | grep -E '3000|30004'
```

---

## Best Practice

**Use Webuzo Panel for management** - It's the easiest and most reliable way to manage Webuzo Node.js applications.

**For command line**, use the management scripts I'll create next.
