/**
 * Create all database tables by syncing each model individually
 * This handles errors more gracefully than sync all at once
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Set NODE_ENV to production to use compiled files
process.env.NODE_ENV = 'production';

// Setup module aliases before requiring any modules
require('./dist/module-alias-setup');

const { initModels } = require('./dist/models/init');
const { Sequelize } = require('sequelize');

async function createTables() {
  console.log('🚀 Creating all database tables...\n');

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
    const modelNames = Object.keys(models);
    console.log(`✅ Initialized ${modelNames.length} models\n`);

    console.log('📋 Creating tables (this may take a few minutes)...\n');
    
    let created = 0;
    let skipped = 0;
    let errors = 0;

    // Sync each model individually to handle errors better
    for (const modelName of modelNames) {
      try {
        const model = models[modelName];
        await model.sync({ force: false });
        created++;
        process.stdout.write(`\r✅ Progress: ${created + skipped + errors}/${modelNames.length} (${created} created, ${skipped} skipped, ${errors} errors)`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          skipped++;
          process.stdout.write(`\r✅ Progress: ${created + skipped + errors}/${modelNames.length} (${created} created, ${skipped} skipped, ${errors} errors)`);
        } else {
          errors++;
          console.log(`\n⚠️  Error creating table for ${modelName}: ${error.message}`);
        }
      }
    }

    console.log('\n\n✅ Table creation completed!\n');
    console.log(`📊 Summary:`);
    console.log(`   - Created: ${created} tables`);
    console.log(`   - Skipped: ${skipped} tables (already exist)`);
    console.log(`   - Errors: ${errors} tables\n`);
    
    // Get list of all tables
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log(`📊 Total tables in database: ${tables.length}\n`);
    
    console.log('✅ Database schema is ready!');
    console.log('\nNext steps:');
    console.log('1. Run seeders: cd backend && npx sequelize-cli db:seed:all');
    console.log('2. Start development: pnpm turbo dev');
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error creating tables:');
    console.error(error.message);
    process.exit(1);
  }
}

createTables();
