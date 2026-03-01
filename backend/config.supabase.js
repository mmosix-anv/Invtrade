"use strict";

const path = require("path");
const fs = require("fs");

// Load environment variables with multiple path fallbacks - prioritize root .env file
const envPaths = [
  path.resolve(process.cwd(), "../.env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, ".env"),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const dotenvResult = require("dotenv").config({ path: envPath });
    if (!dotenvResult.error) {
      console.log(`Config: Environment loaded from: ${envPath}`);
      envLoaded = true;
      break;
    }
  }
}

if (!envLoaded) {
  console.warn(`Config: Warning: No .env file found. Tried paths: ${envPaths.join(", ")}`);
  require("dotenv").config();
}

// Determine the correct environment
const environment = process.env.NODE_ENV || 'development';
console.log(`Config: Using environment: ${environment}`);
console.log(`Config: NODE_ENV = ${process.env.NODE_ENV}`);

// Supabase uses DATABASE_URL for connection pooling and DIRECT_URL for migrations
const databaseUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!databaseUrl) {
  console.error(`Config: Error - Missing DATABASE_URL or DIRECT_URL environment variable`);
  console.error(`Config: Please ensure your .env file contains Supabase database configuration.`);
}

console.log(`Config: Database URL configured: ${databaseUrl ? 'Yes' : 'No'}`);

const dbConfig = {
  url: databaseUrl,
  dialect: "postgres",
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: environment === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

module.exports = {
  development: dbConfig,
  test: dbConfig,
  production: {
    ...dbConfig,
    logging: false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    }
  }
};
