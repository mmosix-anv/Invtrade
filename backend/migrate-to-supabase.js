/**
 * Simple migration script that creates tables using raw SQL
 * Based on the Sequelize models but simplified for PostgreSQL
 */

const { Client } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function migrate() {
  console.log('🚀 Migrating database to Supabase PostgreSQL...\n');

  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase\n');

    // Enable UUID extension
    console.log('📦 Enabling extensions...');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('✅ Extensions enabled\n');

    console.log('📋 Creating tables...');
    
    // Create tables in correct order (respecting foreign keys)
    const tables = [
      // Core auth tables
      `CREATE TABLE IF NOT EXISTS role (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      `CREATE TABLE IF NOT EXISTS permission (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      `CREATE TABLE IF NOT EXISTS role_permission (
        id SERIAL PRIMARY KEY,
        "roleId" INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
        "permissionId" INTEGER NOT NULL REFERENCES permission(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        UNIQUE("roleId", "permissionId")
      )`,
      
      `CREATE TABLE IF NOT EXISTS "user" (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        avatar VARCHAR(1000),
        "firstName" VARCHAR(255),
        "lastName" VARCHAR(255),
        "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
        phone VARCHAR(255),
        "phoneVerified" BOOLEAN NOT NULL DEFAULT FALSE,
        "roleId" INTEGER REFERENCES role(id) ON DELETE CASCADE,
        profile JSONB,
        "lastLogin" TIMESTAMP WITH TIME ZONE,
        "lastFailedLogin" TIMESTAMP WITH TIME ZONE,
        "failedLoginAttempts" INTEGER DEFAULT 0,
        "walletAddress" VARCHAR(255),
        "walletProvider" VARCHAR(255),
        status VARCHAR(50) DEFAULT 'ACTIVE',
        settings JSONB DEFAULT '{"email": true, "sms": true, "push": true}'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      `CREATE TABLE IF NOT EXISTS provider_user (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        provider VARCHAR(255) NOT NULL,
        "providerId" VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        UNIQUE(provider, "providerId")
      )`,
      
      `CREATE TABLE IF NOT EXISTS two_factor (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
        secret VARCHAR(255) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        type VARCHAR(50) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      `CREATE TABLE IF NOT EXISTS one_time_token (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        type VARCHAR(50) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      // Finance tables
      `CREATE TABLE IF NOT EXISTS currency (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        symbol VARCHAR(10) NOT NULL,
        precision SMALLINT NOT NULL DEFAULT 2,
        price DOUBLE PRECISION,
        status BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      `CREATE TABLE IF NOT EXISTS wallet (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        currency VARCHAR(191) NOT NULL,
        balance DOUBLE PRECISION NOT NULL DEFAULT 0,
        "inOrder" DOUBLE PRECISION DEFAULT 0,
        address TEXT,
        network VARCHAR(255),
        data JSONB,
        status BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        UNIQUE("userId", type, currency)
      )`,
      
      `CREATE TABLE IF NOT EXISTS transaction (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        "walletId" UUID NOT NULL REFERENCES wallet(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        amount DOUBLE PRECISION NOT NULL,
        fee DOUBLE PRECISION DEFAULT 0,
        description TEXT,
        metadata TEXT,
        "referenceId" VARCHAR(191) UNIQUE,
        "trxId" VARCHAR(191),
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      // System tables
      `CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT
      )`,
      
      `CREATE TABLE IF NOT EXISTS notification (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        link VARCHAR(255),
        "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      `CREATE TABLE IF NOT EXISTS notification_template (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        subject VARCHAR(255) NOT NULL,
        "emailBody" TEXT NOT NULL,
        "smsBody" TEXT,
        "pushBody" TEXT,
        "shortCodes" JSONB,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      `CREATE TABLE IF NOT EXISTS extension (
        id SERIAL PRIMARY KEY,
        "productId" VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        title VARCHAR(255),
        description TEXT,
        link VARCHAR(255),
        status BOOLEAN NOT NULL DEFAULT FALSE,
        version VARCHAR(50),
        image VARCHAR(1000),
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      `CREATE TABLE IF NOT EXISTS api_key (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        key VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        permissions JSONB,
        "ipWhitelist" TEXT[],
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      // Content tables
      `CREATE TABLE IF NOT EXISTS page (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        content TEXT NOT NULL,
        description TEXT,
        image VARCHAR(1000),
        status VARCHAR(50) NOT NULL DEFAULT 'PUBLISHED',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      // Support tables
      `CREATE TABLE IF NOT EXISTS support_ticket (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        "agentId" UUID REFERENCES "user"(id) ON DELETE SET NULL,
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        priority VARCHAR(50) DEFAULT 'MEDIUM',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`,
      
      `CREATE TABLE IF NOT EXISTS user_block (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        "adminId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        reason TEXT,
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )`
    ];

    for (let i = 0; i < tables.length; i++) {
      await client.query(tables[i]);
      console.log(`   ✅ Table ${i + 1}/${tables.length} created`);
    }

    console.log('\n📊 Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email)',
      'CREATE INDEX IF NOT EXISTS idx_user_roleId ON "user"("roleId")',
      'CREATE INDEX IF NOT EXISTS idx_wallet_userId ON wallet("userId")',
      'CREATE INDEX IF NOT EXISTS idx_transaction_userId ON transaction("userId")',
      'CREATE INDEX IF NOT EXISTS idx_transaction_walletId ON transaction("walletId")',
      'CREATE INDEX IF NOT EXISTS idx_notification_userId ON notification("userId")',
      'CREATE INDEX IF NOT EXISTS idx_support_ticket_userId ON support_ticket("userId")'
    ];

    for (const index of indexes) {
      await client.query(index);
    }
    console.log('✅ Indexes created\n');

    // Create updated_at trigger
    console.log('⚙️  Creating triggers...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW."updatedAt" = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    console.log('✅ Triggers created\n');

    // Verify
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`✅ Migration complete! Created ${result.rows.length} tables:\n`);
    result.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.table_name}`);
    });

    console.log('\n📋 Next steps:');
    console.log('   1. Run seeders: npx sequelize-cli db:seed:all');
    console.log('   2. Start application: pnpm turbo dev\n');

  } catch (error) {
    console.error('\n❌ Migration failed!');
    console.error('Error:', error.message);
    console.error('\nDetails:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
