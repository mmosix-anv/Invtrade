// PM2 Ecosystem Configuration for Backend
// This file is used by PM2 to manage the backend application on Webuzo

module.exports = {
  apps: [
    {
      name: "invtrade-backend",
      script: "dist/index.js",
      cwd: "/home/httptruevault/git/Invtrade/backend",
      instances: 1,
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_BACKEND_PORT: 30004,
      },
      error_file: "/home/httptruevault/logs/backend-error.log",
      out_file: "/home/httptruevault/logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
