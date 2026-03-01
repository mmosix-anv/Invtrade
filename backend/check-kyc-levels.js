const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Disable SSL certificate validation for Supabase
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false,
});

async function checkKycLevels() {
  try {
    console.log('Checking KYC levels...\n');
    
    // Check table structure
    const [columns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'kyc_level'
      ORDER BY ordinal_position;
    `);
    
    console.log('KYC Level table columns:');
    console.log('='.repeat(60));
    columns.forEach(col => {
      console.log(`${col.column_name.padEnd(20)} | ${col.data_type.padEnd(25)} | Nullable: ${col.is_nullable}`);
    });
    
    // Get all KYC levels
    const [levels] = await sequelize.query(`
      SELECT * FROM kyc_level;
    `);
    
    console.log(`\n\nFound ${levels.length} KYC levels:\n`);
    
    if (levels.length === 0) {
      console.log('❌ No KYC levels found! You need to create at least one.');
      console.log('\nYou can create a basic KYC level with:');
      console.log(`
INSERT INTO kyc_level (id, name, level, status, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'Basic Verification',
  1,
  'ACTIVE',
  NOW(),
  NOW()
);
      `);
    } else {
      levels.forEach(level => {
        console.log(`ID: ${level.id}`);
        console.log(`Name: ${level.name}`);
        console.log(`Level: ${level.level}`);
        console.log(`Status: ${level.status} (Type: ${typeof level.status})`);
        console.log(`Fields: ${level.fields ? 'Present' : 'NULL'}`);
        console.log(`Features: ${level.features ? 'Present' : 'NULL'}`);
        console.log('-'.repeat(60));
      });
      
      // Check if any are ACTIVE
      const activeLevels = levels.filter(l => l.status === 'ACTIVE' || l.status === true);
      console.log(`\n✓ Active levels: ${activeLevels.length}`);
      
      if (activeLevels.length === 0) {
        console.log('\n⚠ No ACTIVE levels found!');
        console.log('Updating all levels to ACTIVE status...');
        
        await sequelize.query(`
          UPDATE kyc_level SET status = 'ACTIVE';
        `);
        
        console.log('✓ All levels updated to ACTIVE');
      }
    }
    
  } catch (error) {
    console.error('Error checking KYC levels:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

checkKycLevels();
