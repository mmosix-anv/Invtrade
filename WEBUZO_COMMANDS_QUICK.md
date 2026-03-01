# Webuzo Node.js Apps - Quick Command Reference

## Make Scripts Executable (First Time Only)

```bash
cd /home/httptruevault/git/Invtrade
chmod +x webuzo-*.sh
```

## Start Commands

```bash
# Start frontend only
./webuzo-start.sh frontend

# Start backend only
./webuzo-start.sh backend

# Start both
./webuzo-start.sh all
```

## Stop Commands

```bash
# Stop frontend only
./webuzo-stop.sh frontend

# Stop backend only
./webuzo-stop.sh backend

# Stop both
./webuzo-stop.sh all
```

## Restart Commands

```bash
# Restart frontend only
./webuzo-restart.sh frontend

# Restart backend only
./webuzo-restart.sh backend

# Restart both
./webuzo-restart.sh all
```

## Status Command

```bash
# Check status of both applications
./webuzo-status.sh
```

## View Logs

```bash
# Frontend logs
tail -f /home/httptruevault/logs/frontend.log

# Backend logs
tail -f /home/httptruevault/logs/backend.log

# Last 50 lines
tail -n 50 /home/httptruevault/logs/frontend.log
tail -n 50 /home/httptruevault/logs/backend.log
```

## Manual Commands (if scripts don't work)

### Start

```bash
# Frontend
cd /home/httptruevault/git/Invtrade/frontend
nohup node server.js > /home/httptruevault/logs/frontend.log 2>&1 &

# Backend
cd /home/httptruevault/git/Invtrade/backend
nohup node server.js > /home/httptruevault/logs/backend.log 2>&1 &
```

### Stop

```bash
# Frontend
kill $(lsof -t -i:3000)

# Backend
kill $(lsof -t -i:30004)

# Force kill if needed
kill -9 $(lsof -t -i:3000)
kill -9 $(lsof -t -i:30004)
```

### Check Status

```bash
# Check if running
lsof -i :3000   # Frontend
lsof -i :30004  # Backend

# Or
ps aux | grep server.js
```

## Quick Reference Table

| Action | Command |
|--------|---------|
| **Start All** | `./webuzo-start.sh all` |
| **Stop All** | `./webuzo-stop.sh all` |
| **Restart All** | `./webuzo-restart.sh all` |
| **Status** | `./webuzo-status.sh` |
| **Frontend Logs** | `tail -f ~/logs/frontend.log` |
| **Backend Logs** | `tail -f ~/logs/backend.log` |

## Troubleshooting

### Port Already in Use

```bash
# Find and kill process
lsof -i :3000   # Frontend
lsof -i :30004  # Backend

# Kill it
kill -9 $(lsof -t -i:3000)
kill -9 $(lsof -t -i:30004)
```

### Application Won't Start

```bash
# Test manually
cd /home/httptruevault/git/Invtrade/frontend
node server.js

# Check logs
tail -f /home/httptruevault/logs/frontend.log
```

### Check if Build Exists

```bash
# Frontend
ls -la /home/httptruevault/git/Invtrade/frontend/.next

# Backend
ls -la /home/httptruevault/git/Invtrade/backend/dist
```

## Files Created

- ✅ `webuzo-start.sh` - Start applications
- ✅ `webuzo-stop.sh` - Stop applications
- ✅ `webuzo-restart.sh` - Restart applications
- ✅ `webuzo-status.sh` - Check status
- ✅ `WEBUZO_COMMANDS.md` - Complete command reference

## Access Applications

```
Frontend: http://YOUR_SERVER_IP:3000
Backend:  http://YOUR_SERVER_IP:30004
```

Or with domains (after Nginx setup):
```
Frontend: https://httptruevaultglobalbank.com
Backend:  https://api.httptruevaultglobalbank.com
```

---

**Quick Start:**
```bash
cd /home/httptruevault/git/Invtrade
chmod +x webuzo-*.sh
./webuzo-start.sh all
./webuzo-status.sh
```
