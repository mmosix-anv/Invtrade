/**
 * Auto-sync database using Sequelize models
 * This will create all tables based on the model definitions
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Set NODE_TLS_REJECT_UNAUTHORIZED for development
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function autoSync() {
  console.log('🚀 Auto-syncing database with Sequelize models...\n');

  try {
    // Import the compiled database module
    const { SequelizeSingleton } = require('./dist/src/db');
    
    console.log('1️⃣  Initializing Sequelize...');
    const dbInstance = SequelizeSingleton.getInstance();
    const sequelize = dbInstance.getSequelize();
    const models = dbInstance.models;
    
    console.log(`   ✅ Loaded ${Object.keys(models).length} models\n`);

    // Test connection
    console.log('2️⃣  Testing connection...');
    await sequelize.authenticate();
    console.log('   ✅ Connection successful!\n');

    // Sync database
    console.log('3️⃣  Syncing database schema...');
    console.log('   ⏳ This may take a few minutes...\n');
    
    await sequelize.sync({ alter: false, force: false });
    
    console.log('   ✅ Database synced successfully!\n');

    // Verify tables
    console.log('4️⃣  Verifying tables...');
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    console.log(`   ✅ Found ${tables.length} tables in database\n`);

    console.log('✅ Auto-sync completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Run seeders: npx sequelize-cli db:seed:all');
    console.log('   2. Start application: pnpm turbo dev\n');

    await sequelize.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Auto-sync failed!');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

autoSync();
