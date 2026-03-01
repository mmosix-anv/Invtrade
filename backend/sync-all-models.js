/**
 * Sync all Sequelize models to create database tables
 * This will create all tables based on the model definitions
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Set NODE_ENV to production to use compiled files
process.env.NODE_ENV = 'production';

// Setup module aliases before requiring any modules
require('./dist/module-alias-setup');

const { initModels } = require('./dist/models/init');
const { Sequelize } = require('sequelize');

async function syncModels() {
  console.log('🚀 Syncing all models to Supabase PostgreSQL...\n');

  try {
    // Create Sequelize instance
    const sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      },
      logging: false
    });

    console.log('📦 Testing database connection...');
    await sequelize.authenticate();
    console.log('✅ Database connection successful\n');

    console.log('📋 Initializing models...');
    const models = initModels(sequelize);
    console.log(`✅ Initialized ${Object.keys(models).length} models\n`);

    console.log('📋 Syncing models (creating tables)...');
    console.log('This may take a few minutes...\n');
    
    // Sync all models - this will create all tables
    // force: false - don't drop existing tables
    // alter: false - don't alter existing tables (just create new ones)
    await sequelize.sync({ force: false, alter: false });
    
    console.log('✅ All models synced successfully!\n');
    
    // Get list of created tables
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log(`📊 Total tables in database: ${tables.length}`);
    console.log('\nTables created:');
    tables.forEach((table, index) => {
      console.log(`  ${index + 1}. ${table.table_name}`);
    });
    
    console.log('\n✅ Database schema is ready!');
    console.log('\nNext steps:');
    console.log('1. Run seeders: cd backend && npx sequelize-cli db:seed:all');
    console.log('2. Start development: pnpm turbo dev');
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error syncing models:');
    console.error(error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

syncModels();
