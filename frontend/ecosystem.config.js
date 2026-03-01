// PM2 Ecosystem Configuration for Frontend (Next.js)
// This file is used by PM2 to manage the Next.js application on Webuzo

module.exports = {
  apps: [
    {
      name: "invtrade-frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: "/home/httptruevault/git/Invtrade/frontend",
      instances: 1,
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "/home/httptruevault/logs/frontend-error.log",
      out_file: "/home/httptruevault/logs/frontend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
