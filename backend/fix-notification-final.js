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
  logging: console.log,
});

async function fixNotificationTable() {
  try {
    console.log('Fixing notification table...\n');
    
    // 1. Check if idempotency_key exists
    const [idempotencyResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification' 
      AND column_name = 'idempotency_key';
    `);
    
    if (idempotencyResults.length === 0) {
      console.log('Adding idempotency_key column...');
      await sequelize.query(`
        ALTER TABLE notification 
        ADD COLUMN "idempotency_key" VARCHAR(255) NULL;
      `);
      
      // Add index
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "idempotency_key_index" 
        ON notification ("idempotency_key");
      `);
      console.log('✓ idempotency_key column added successfully');
    } else {
      console.log('✓ idempotency_key column already exists');
    }
    
    // 2. Check if isRead column exists (old column name)
    const [isReadResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification' 
      AND column_name = 'isRead';
    `);
    
    if (isReadResults.length > 0) {
      console.log('Found old isRead column, migrating data to read column...');
      
      // Copy data from isRead to read if read column exists
      const [readResults] = await sequelize.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'notification' 
        AND column_name = 'read';
      `);
      
      if (readResults.length > 0) {
        // Update read column with isRead values
        await sequelize.query(`
          UPDATE notification 
          SET "read" = "isRead" 
          WHERE "read" IS DISTINCT FROM "isRead";
        `);
        console.log('✓ Data migrated from isRead to read');
        
        // Drop the old isRead column
        await sequelize.query(`
          ALTER TABLE notification 
          DROP COLUMN IF EXISTS "isRead";
        `);
        console.log('✓ Old isRead column dropped');
      }
    } else {
      console.log('✓ No old isRead column found');
    }
    
    console.log('\n✓ All notification table fixes applied successfully!');
  } catch (error) {
    console.error('Error fixing notification table:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

fixNotificationTable();
