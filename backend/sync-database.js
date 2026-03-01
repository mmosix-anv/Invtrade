/**
 * Database Sync Script for Supabase PostgreSQL
 * This script will create all tables based on Sequelize models
 */

const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Import models initialization
const { initModels } = require('./dist/models/init');

async function syncDatabase() {
  console.log('🚀 Starting database synchronization...\n');

  // Create Sequelize instance for PostgreSQL
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: (msg) => console.log('  📝', msg),
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });

  try {
    // Test connection
    console.log('1️⃣  Testing database connection...');
    await sequelize.authenticate();
    console.log('   ✅ Connection successful!\n');

    // Initialize models
    console.log('2️⃣  Initializing models...');
    const models = initModels(sequelize);
    const modelCount = Object.keys(models).length;
    console.log(`   ✅ Initialized ${modelCount} models\n`);

    // Sync database (create tables)
    console.log('3️⃣  Syncing database schema...');
    console.log('   ⚠️  This will create all tables if they don\'t exist\n');
    
    await sequelize.sync({ alter: false, force: false });
    
    console.log('   ✅ Database schema synchronized!\n');

    // List created tables
    console.log('4️⃣  Verifying tables...');
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    console.log(`   ✅ Found ${tables.length} tables in database:`);
    tables.forEach((table, index) => {
      console.log(`      ${index + 1}. ${table.table_name}`);
    });

    console.log('\n✅ Database synchronization completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Run seeders: npx sequelize-cli db:seed:all');
    console.log('   2. Start application: pnpm turbo dev\n');

    await sequelize.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Database synchronization failed!');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    
    await sequelize.close();
    process.exit(1);
  }
}

// Run the sync
syncDatabase();
