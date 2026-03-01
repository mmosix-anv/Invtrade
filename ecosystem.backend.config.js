module.exports = {
  apps: [{
    name: 'invtrade-backend',
    cwd: './backend',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      NEXT_PUBLIC_BACKEND_PORT: 40000,
      
      // Database
      DATABASE_URL: 'postgres://postgres.haspwjdvxkfmsxgxofyt:IreErZa9v5i9xTpg@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
      DIRECT_URL: 'postgres://postgres.haspwjdvxkfmsxgxofyt:IreErZa9v5i9xTpg@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require',
      DB_NAME: 'postgres',
      DB_USER: 'postgres.haspwjdvxkfmsxgxofyt',
      DB_PASSWORD: 'IreErZa9v5i9xTpg',
      DB_HOST: 'aws-1-us-east-1.pooler.supabase.com',
      DB_PORT: '6543',
      DB_SYNC: 'none',
      
      // Redis
      REDIS_URL: 'redis://default:N3PrWtaZbLPV3dIRg9DPql7D8ZHJwEBN@redis-14106.c322.us-east-1-2.ec2.cloud.redislabs.com:14106',
      REDIS_HOST: 'redis-14106.c322.us-east-1-2.ec2.cloud.redislabs.com',
      REDIS_PORT: '14106',
      REDIS_PASSWORD: 'N3PrWtaZbLPV3dIRg9DPql7D8ZHJwEBN',
      REDIS_DB: '0',
      
      // Security tokens (from your .env)
      APP_ACCESS_TOKEN_SECRET: '53a9d9e298e906972060f7c159cf9f542beca86db5a26ebd333d6360b7ab34d5529bad5bd02034e0d6ab5ad2f7ea6fac54f6cb142e4d31dc26deeb0e0559e68a',
      APP_REFRESH_TOKEN_SECRET: '368775e6584f35b1d4159a2bcfdc7304724186e7f2609354ab4a7a511120e0aee1cb923b3266b32b8748388f942fe13f1478c15b7369be3af124959ccc86087e',
      APP_RESET_TOKEN_SECRET: '5f16143fb4c7fcc18e7c7508630074f3dc6a7cb0d52bfa54c2434e391a1039c10ae0149c02d51858ae07772fe31e99df566b52d1efb44282b406d9293b5c61ff',
      APP_VERIFY_TOKEN_SECRET: '28e6287b695ec54517ebca62d00742a70c17df1acd46f4ddb368138190d095c364ecbeb99b62e1b9edc2dd99237bff8791fefca1ac552b6fe9986ee776cf4055',
      
      // Add all other environment variables from your .env file here
    },
    error_file: './logs/backend-error.log',
    out_file: './logs/backend-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '2G',
    node_args: '--max-old-space-size=2048',
  }]
};
