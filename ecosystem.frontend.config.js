module.exports = {
  apps: [{
    name: 'invtrade-frontend',
    cwd: './frontend',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 30000',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 30000,
      NEXT_PUBLIC_BACKEND_URL: 'https://api.httptruevaultglobalbank.com',
      NEXT_PUBLIC_BACKEND_WS_URL: 'api.httptruevaultglobalbank.com',
      // Add other NEXT_PUBLIC_* variables here
    },
    error_file: './logs/frontend-error.log',
    out_file: './logs/frontend-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
  }]
};
