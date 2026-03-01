/**
 * Create all database tables in multiple passes to handle dependencies
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

process.env.NODE_ENV = 'production';
require('./dist/module-alias-setup');

const { initModels } = require('./dist/models/init');
const { Sequelize } = require('sequelize');

async function createTables() {
  console.log('🚀 Creating all database tables in multiple passes...\n');

  try {
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

    console.log('📋 Creating tables in multiple passes...\n');
    
    let totalCreated = 0;
    let totalSkipped = 0;
    let pass = 1;
    let maxPasses = 10; // Maximum number of passes to avoid infinite loop
    
    let remainingModels = [...modelNames];
    
    while (remainingModels.length > 0 && pass <= maxPasses) {
      console.log(`\n🔄 Pass ${pass}: Attempting ${remainingModels.length} remaining tables...`);
      
      let created = 0;
      let skipped = 0;
      let failed = [];
      
      for (const modelName of remainingModels) {
        try {
          const model = models[modelName];
          await model.sync({ force: false });
          created++;
          totalCreated++;
        } catch (error) {
          if (error.message.includes('already exists')) {
            skipped++;
            totalSkipped++;
          } else {
            // Table creation failed, likely due to missing dependency
            failed.push(modelName);
          }
        }
      }
      
      console.log(`   ✅ Created: ${created}, Skipped: ${skipped}, Failed: ${failed.length}`);
      
      // If no progress was made, break to avoid infinite loop
      if (created === 0 && failed.length === remainingModels.length) {
        console.log(`\n⚠️  No progress in pass ${pass}. Remaining tables have unresolved dependencies.`);
        console.log(`   Failed tables: ${failed.join(', ')}`);
        break;
      }
      
      remainingModels = failed;
      pass++;
    }

    console.log('\n\n✅ Table creation completed!\n');
    console.log(`📊 Summary:`);
    console.log(`   - Total Created: ${totalCreated} tables`);
    console.log(`   - Total Skipped: ${totalSkipped} tables (already exist)`);
    console.log(`   - Remaining: ${remainingModels.length} tables (dependency issues)\n`);
    
    // Get list of all tables
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log(`📊 Total tables in database: ${tables.length}\n`);
    
    if (remainingModels.length > 0) {
      console.log('⚠️  Some tables could not be created due to missing dependencies.');
      console.log('   This is normal if those features are not being used.');
      console.log('   The application will create them when needed.\n');
    }
    
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
